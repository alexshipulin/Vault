import {
  collection,
  getDocs,
  limit as limitConstraint,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  where,
  type DocumentData,
  type FirestoreError,
  type Query,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

import {
  buildSearchCacheKey,
  getCachedSearchResult,
  setCachedSearchResult,
} from "@/lib/firebase/cache";
import { getVaultScopeAuth, getVaultScopeDb } from "@/lib/firebase/config";
import { LruCache } from "@/lib/performance/cache";
import { debouncePromise, type DebouncedFunction } from "@/lib/performance/debounce";
import { performanceMonitor } from "@/lib/performance/monitoring";
import type {
  AntiqueAuction,
  ListenerRegistration,
  SearchFilters,
  SearchResult,
} from "@/lib/firebase/types";
import { SearchAuthRequiredError } from "@/lib/firebase/types";
import {
  buildFirestoreQuery,
  extractSearchKeywords,
  normalizeResults,
} from "@/lib/firebase/utils";
import type { CollectionItem } from "@/lib/types";

const DEFAULT_LIMIT = 20;
const PREFETCH_PAGE_NUMBER = 2;
const MEMORY_CACHE_TTL_MS = 5 * 60 * 1000;

const inMemorySearchCache = new LruCache<string, SearchResult>({
  maxSize: 50,
  ttlMs: MEMORY_CACHE_TTL_MS,
});

function isPermissionError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ((error as FirestoreError).code === "permission-denied" ||
      (error as FirestoreError).code === "unauthenticated")
  );
}

function isNetworkError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }

  const code = (error as FirestoreError).code;
  return (
    code === "unavailable" ||
    code === "deadline-exceeded" ||
    code === "aborted" ||
    code === "cancelled" ||
    code === "resource-exhausted"
  );
}

function normalizeCollectionItems(snapshotDocs: Array<QueryDocumentSnapshot<DocumentData>>): CollectionItem[] {
  return snapshotDocs.map((itemDoc) => {
    const data = itemDoc.data() ?? {};

    return {
      id: itemDoc.id,
      scanResultId: typeof data.scanResultId === "string" ? data.scanResultId : "",
      title: typeof data.title === "string" ? data.title : "Untitled item",
      imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : "",
      priceEstimate:
        typeof data.priceEstimate === "object" && data.priceEstimate
          ? {
              low:
                typeof data.priceEstimate.estimateLow === "number"
                  ? data.priceEstimate.estimateLow
                  : null,
              high:
                typeof data.priceEstimate.estimateHigh === "number"
                  ? data.priceEstimate.estimateHigh
                  : null,
              currency:
                typeof data.priceEstimate.currency === "string"
                  ? data.priceEstimate.currency
                  : "USD",
              confidence:
                typeof data.priceEstimate.confidenceScore === "number"
                  ? data.priceEstimate.confidenceScore
                  : 0,
            }
          : {
              low: null,
              high: null,
              currency: "USD",
              confidence: 0,
            },
      addedAt:
        typeof data.addedAt?.toDate === "function"
          ? data.addedAt.toDate().toISOString()
          : typeof data.addedAt === "string"
            ? data.addedAt
            : new Date().toISOString(),
      customNotes: typeof data.customNotes === "string" ? data.customNotes : "",
    };
  });
}

export class AntiqueSearchEngine {
  private readonly defaultLimit: number;

  private readonly prefetchedPages = new Map<string, SearchResult>();

  private readonly prefetchingKeys = new Set<string>();

  constructor(options?: { defaultLimit?: number }) {
    this.defaultLimit = Math.min(Math.max(options?.defaultLimit ?? DEFAULT_LIMIT, 1), 20);
  }

  async searchByKeywords(
    queryText: string,
    filters: SearchFilters = {},
    limit = this.defaultLimit,
  ): Promise<SearchResult> {
    const keywords = extractSearchKeywords(queryText);

    if (keywords.length === 0) {
      return [];
    }

    const normalizedLimit = Math.min(Math.max(limit, 1), 20);
    const searchKey = buildSearchCacheKey("keywords", {
      keywords,
      filters,
      page: 1,
      limit: normalizedLimit,
    });

    return this.executeSearch(
      searchKey,
      buildFirestoreQuery(keywords, filters),
      normalizedLimit,
    );
  }

  createDebouncedKeywordSearch(
    waitMs = 300,
  ): DebouncedFunction<[string, SearchFilters | undefined, number | undefined], SearchResult> {
    return debouncePromise(
      (queryText, filters, limit) => this.searchByKeywords(queryText, filters, limit),
      waitMs,
    );
  }

  async searchByCategory(category: string, limit = this.defaultLimit): Promise<SearchResult> {
    const normalizedCategory = category.trim().toLowerCase();

    if (!normalizedCategory) {
      return [];
    }

    const normalizedLimit = Math.min(Math.max(limit, 1), 20);
    const searchKey = buildSearchCacheKey("category", {
      category: normalizedCategory,
      page: 1,
      limit: normalizedLimit,
    });

    const baseQuery = query(
      collection(getVaultScopeDb(), "antique_auctions"),
      where("category", "==", normalizedCategory),
      orderBy("priceRealized", "desc"),
    );

    return this.executeSearch(searchKey, baseQuery, normalizedLimit);
  }

  async searchByPriceRange(
    min: number,
    max: number,
    category?: string,
  ): Promise<SearchResult> {
    if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
      return [];
    }

    const filters: SearchFilters = {
      priceMin: min,
      priceMax: max,
      category: category?.trim().toLowerCase() || undefined,
    };
    const searchKey = buildSearchCacheKey("price-range", {
      filters,
      page: 1,
      limit: this.defaultLimit,
    });

    return this.executeSearch(searchKey, buildFirestoreQuery([], filters), this.defaultLimit);
  }

  async getTopDeals(category?: string, limit = this.defaultLimit): Promise<SearchResult> {
    const normalizedCategory = category?.trim().toLowerCase() || undefined;
    const normalizedLimit = Math.min(Math.max(limit, 1), 20);
    const searchKey = buildSearchCacheKey("top-deals", {
      category: normalizedCategory,
      page: 1,
      limit: normalizedLimit,
    });

    const constraints = [
      where("priceRealized", ">", 0),
      ...(normalizedCategory ? [where("category", "==", normalizedCategory)] : []),
      orderBy("priceRealized", "asc"),
    ];
    const baseQuery = query(
      collection(getVaultScopeDb(), "antique_auctions"),
      ...constraints,
    );

    return this.executeSearch(searchKey, baseQuery, normalizedLimit);
  }

  observeUserCollection(
    userId: string,
    onChange: (items: CollectionItem[]) => void,
  ): ListenerRegistration {
    const currentUser = getVaultScopeAuth().currentUser;

    if (!currentUser || currentUser.uid !== userId) {
      throw new SearchAuthRequiredError();
    }

    const collectionQuery = query(
      collection(getVaultScopeDb(), "user_collections", userId, "items"),
      orderBy("addedAt", "desc"),
    );

    return onSnapshot(
      collectionQuery,
      (snapshot) => {
        onChange(normalizeCollectionItems(snapshot.docs));
      },
      (error) => {
        if (isPermissionError(error)) {
          console.warn("[VaultScope] Collection listener requires login.");
          return;
        }

        console.error("[VaultScope] Failed to observe collection.", error);
        onChange([]);
      },
    );
  }

  private async executeSearch(
    cacheKey: string,
    baseQuery: Query<DocumentData>,
    pageSize: number,
  ): Promise<SearchResult> {
    const memoryCachedResults = inMemorySearchCache.get(cacheKey);
    if (memoryCachedResults) {
      void this.refreshCachedSearch(cacheKey, baseQuery, pageSize);
      return memoryCachedResults;
    }

    const cachedResults = await getCachedSearchResult(cacheKey);

    if (cachedResults) {
      inMemorySearchCache.set(cacheKey, cachedResults);
      void this.refreshCachedSearch(cacheKey, baseQuery, pageSize);
      return cachedResults;
    }

    try {
      const startedAt = Date.now();
      const snapshot = await performanceMonitor.measureAsync(
        "search.execute",
        () => getDocs(query(baseQuery, limitConstraint(pageSize))),
        {
          cacheKey,
          pageSize,
        },
      );
      const results = normalizeResults(snapshot.docs);
      performanceMonitor.logSearchQuery(Date.now() - startedAt, {
        cacheKey,
        pageSize,
        resultCount: results.length,
      });
      performanceMonitor.trackFirestoreRead(snapshot.docs.length, {
        cacheKey,
      });

      inMemorySearchCache.set(cacheKey, results);
      await setCachedSearchResult(cacheKey, results);

      const lastDoc = snapshot.docs[snapshot.docs.length - 1] ?? null;
      if (lastDoc) {
        void this.prefetchNextPage(cacheKey, baseQuery, pageSize, lastDoc);
      }

      return results;
    } catch (error) {
      if (isPermissionError(error)) {
        throw new SearchAuthRequiredError();
      }

      if (isNetworkError(error) && cachedResults) {
        return cachedResults;
      }

      performanceMonitor.captureError(error, {
        area: "search.execute",
        cacheKey,
      });
      console.error("[VaultScope] Search request failed.", error);
      return cachedResults ?? [];
    }
  }

  private async refreshCachedSearch(
    cacheKey: string,
    baseQuery: Query<DocumentData>,
    pageSize: number,
  ): Promise<void> {
    try {
      const snapshot = await getDocs(query(baseQuery, limitConstraint(pageSize)));
      const results = normalizeResults(snapshot.docs);

      inMemorySearchCache.set(cacheKey, results);
      await setCachedSearchResult(cacheKey, results);

      const lastDoc = snapshot.docs[snapshot.docs.length - 1] ?? null;
      if (lastDoc) {
        void this.prefetchNextPage(cacheKey, baseQuery, pageSize, lastDoc);
      }
    } catch (error) {
      if (!isNetworkError(error)) {
        console.warn("[VaultScope] Background refresh failed.", error);
      }
    }
  }

  private async prefetchNextPage(
    cacheKey: string,
    baseQuery: Query<DocumentData>,
    pageSize: number,
    cursor: QueryDocumentSnapshot<DocumentData>,
  ): Promise<void> {
    const nextPageCacheKey = buildSearchCacheKey("prefetch", {
      cacheKey,
      page: PREFETCH_PAGE_NUMBER,
      limit: pageSize,
    });

    if (this.prefetchingKeys.has(nextPageCacheKey) || this.prefetchedPages.has(nextPageCacheKey)) {
      return;
    }

    this.prefetchingKeys.add(nextPageCacheKey);

    try {
      const snapshot = await getDocs(
        query(baseQuery, startAfter(cursor), limitConstraint(pageSize)),
      );
      const results: AntiqueAuction[] = normalizeResults(snapshot.docs);

      this.prefetchedPages.set(nextPageCacheKey, results);
      inMemorySearchCache.set(nextPageCacheKey, results);
      await setCachedSearchResult(nextPageCacheKey, results);
    } catch (error) {
      console.warn("[VaultScope] Failed to prefetch next search page.", error);
    } finally {
      this.prefetchingKeys.delete(nextPageCacheKey);
    }
  }
}
