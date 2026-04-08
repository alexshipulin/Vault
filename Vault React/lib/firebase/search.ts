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
const COMPARABLE_CANDIDATE_LIMIT = 20;
const MAX_FALLBACK_FETCH_LIMIT = 80;

const inMemorySearchCache = new LruCache<string, SearchResult>({
  maxSize: 50,
  ttlMs: MEMORY_CACHE_TTL_MS,
});

type SearchSortDirection = "asc" | "desc";

type SearchAttempt = {
  label: string;
  baseQuery: Query<DocumentData>;
  fetchLimit?: number;
  supportsPrefetch?: boolean;
  transformResults?: (results: SearchResult) => SearchResult;
};

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

function isIndexError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const maybeFirestoreError = error as FirestoreError;
  return (
    maybeFirestoreError.code === "failed-precondition" ||
    error.message.toLowerCase().includes("requires an index")
  );
}

function buildFallbackFetchLimit(pageSize: number): number {
  return Math.min(MAX_FALLBACK_FETCH_LIMIT, Math.max(pageSize * 4, pageSize));
}

function buildKeywordOnlyQuery(keywords: string[]): Query<DocumentData> {
  return query(
    collection(getVaultScopeDb(), "antique_auctions"),
    where("keywords", "array-contains-any", keywords.slice(0, 10)),
  );
}

function buildKeywordSortedQuery(
  keywords: string[],
  sortDirection: SearchSortDirection,
): Query<DocumentData> {
  return query(
    collection(getVaultScopeDb(), "antique_auctions"),
    where("keywords", "array-contains-any", keywords.slice(0, 10)),
    orderBy("priceRealized", sortDirection),
  );
}

function buildCategoryOnlyQuery(category: string): Query<DocumentData> {
  return query(
    collection(getVaultScopeDb(), "antique_auctions"),
    where("category", "==", category),
  );
}

function buildCategorySortedQuery(
  category: string,
  sortDirection: SearchSortDirection,
): Query<DocumentData> {
  return query(
    collection(getVaultScopeDb(), "antique_auctions"),
    where("category", "==", category),
    orderBy("priceRealized", sortDirection),
  );
}

function buildPriceSortedQuery(sortDirection: SearchSortDirection): Query<DocumentData> {
  return query(
    collection(getVaultScopeDb(), "antique_auctions"),
    orderBy("priceRealized", sortDirection),
  );
}

function buildTopDealsQuery(
  sortDirection: SearchSortDirection,
  category?: string,
): Query<DocumentData> {
  const constraints = [
    where("priceRealized", ">", 0),
    ...(category ? [where("category", "==", category)] : []),
    orderBy("priceRealized", sortDirection),
  ];

  return query(
    collection(getVaultScopeDb(), "antique_auctions"),
    ...constraints,
  );
}

function toTimestamp(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function applyLocalResultTransform(
  results: SearchResult,
  {
    filters = {},
    sortDirection = "desc",
    limit,
    requirePositivePrice = false,
  }: {
    filters?: SearchFilters;
    sortDirection?: SearchSortDirection;
    limit: number;
    requirePositivePrice?: boolean;
  },
): SearchResult {
  const filtered = results.filter((item) => {
    if (filters.category && item.category.trim().toLowerCase() !== filters.category.trim().toLowerCase()) {
      return false;
    }

    if (
      filters.period &&
      (item.period?.trim().toLowerCase() ?? "") !== filters.period.trim().toLowerCase()
    ) {
      return false;
    }

    if (typeof filters.priceMin === "number" && (item.priceRealized ?? Number.NEGATIVE_INFINITY) < filters.priceMin) {
      return false;
    }

    if (typeof filters.priceMax === "number" && (item.priceRealized ?? Number.POSITIVE_INFINITY) > filters.priceMax) {
      return false;
    }

    const saleDateTimestamp = toTimestamp(item.saleDate);
    if (filters.dateFrom && saleDateTimestamp != null && saleDateTimestamp < filters.dateFrom.getTime()) {
      return false;
    }

    if (filters.dateTo && saleDateTimestamp != null && saleDateTimestamp > filters.dateTo.getTime()) {
      return false;
    }

    if (filters.dateFrom && saleDateTimestamp == null) {
      return false;
    }

    if (filters.dateTo && saleDateTimestamp == null) {
      return false;
    }

    if (requirePositivePrice && !(typeof item.priceRealized === "number" && item.priceRealized > 0)) {
      return false;
    }

    return true;
  });

  const sorted = [...filtered].sort((left, right) => {
    const leftPrice = typeof left.priceRealized === "number" ? left.priceRealized : null;
    const rightPrice = typeof right.priceRealized === "number" ? right.priceRealized : null;

    if (leftPrice == null && rightPrice == null) {
      return 0;
    }

    if (leftPrice == null) {
      return 1;
    }

    if (rightPrice == null) {
      return -1;
    }

    return sortDirection === "asc" ? leftPrice - rightPrice : rightPrice - leftPrice;
  });

  return sorted.slice(0, limit);
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

function mergeUniqueResults(resultSets: SearchResult[]): SearchResult {
  const seenIds = new Set<string>();
  const merged: SearchResult = [];

  for (const resultSet of resultSets) {
    for (const item of resultSet) {
      if (seenIds.has(item.id)) {
        continue;
      }

      seenIds.add(item.id);
      merged.push(item);
    }
  }

  return merged;
}

function resolveSearchKeywords(queryInput: string | string[]): string[] {
  if (Array.isArray(queryInput)) {
    return Array.from(
      new Set(
        queryInput
          .map((keyword) => keyword.trim().toLowerCase())
          .filter(Boolean),
      ),
    ).slice(0, 10);
  }

  return extractSearchKeywords(queryInput);
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

    return this.executeSearch(searchKey, [
      {
        label: "keywords-primary",
        baseQuery: buildFirestoreQuery(keywords, filters),
        supportsPrefetch: true,
      },
      {
        label: "keywords-sorted-fallback",
        baseQuery: buildKeywordSortedQuery(keywords, "desc"),
        transformResults: (results) =>
          applyLocalResultTransform(results, {
            filters,
            sortDirection: "desc",
            limit: normalizedLimit,
          }),
      },
      {
        label: "keywords-basic-fallback",
        baseQuery: buildKeywordOnlyQuery(keywords),
        fetchLimit: buildFallbackFetchLimit(normalizedLimit),
        transformResults: (results) =>
          applyLocalResultTransform(results, {
            filters,
            sortDirection: "desc",
            limit: normalizedLimit,
          }),
      },
    ], normalizedLimit);
  }

  async searchComparableAuctions(
    queryText: string | string[],
    filters: SearchFilters = {},
    limit = this.defaultLimit,
  ): Promise<SearchResult> {
    const keywords = resolveSearchKeywords(queryText);

    if (keywords.length === 0) {
      return [];
    }

    const normalizedLimit = Math.min(Math.max(limit, 1), COMPARABLE_CANDIDATE_LIMIT);
    const candidateLimit = Math.min(
      COMPARABLE_CANDIDATE_LIMIT,
      Math.max(normalizedLimit * 2, normalizedLimit),
    );

    const highToLow = await this.executeSearch(
      buildSearchCacheKey("comparables-desc", {
        keywords,
        filters,
        page: 1,
        limit: candidateLimit,
      }),
      [
        {
          label: "comparables-desc-primary",
          baseQuery: buildFirestoreQuery(keywords, filters, { sortDirection: "desc" }),
        },
        {
          label: "comparables-desc-sorted-fallback",
          baseQuery: buildKeywordSortedQuery(keywords, "desc"),
          transformResults: (results) =>
            applyLocalResultTransform(results, {
              filters,
              sortDirection: "desc",
              limit: candidateLimit,
            }),
        },
        {
          label: "comparables-desc-basic-fallback",
          baseQuery: buildKeywordOnlyQuery(keywords),
          fetchLimit: buildFallbackFetchLimit(candidateLimit),
          transformResults: (results) =>
            applyLocalResultTransform(results, {
              filters,
              sortDirection: "desc",
              limit: candidateLimit,
            }),
        },
      ],
      candidateLimit,
    );
    const lowToHigh = await this.executeSearch(
      buildSearchCacheKey("comparables-asc", {
        keywords,
        filters,
        page: 1,
        limit: candidateLimit,
      }),
      [
        {
          label: "comparables-asc-primary",
          baseQuery: buildFirestoreQuery(keywords, filters, { sortDirection: "asc" }),
        },
        {
          label: "comparables-asc-sorted-fallback",
          baseQuery: buildKeywordSortedQuery(keywords, "asc"),
          transformResults: (results) =>
            applyLocalResultTransform(results, {
              filters,
              sortDirection: "asc",
              limit: candidateLimit,
            }),
        },
        {
          label: "comparables-asc-basic-fallback",
          baseQuery: buildKeywordOnlyQuery(keywords),
          fetchLimit: buildFallbackFetchLimit(candidateLimit),
          transformResults: (results) =>
            applyLocalResultTransform(results, {
              filters,
              sortDirection: "asc",
              limit: candidateLimit,
            }),
        },
      ],
      candidateLimit,
    );

    return mergeUniqueResults([highToLow, lowToHigh]).slice(0, COMPARABLE_CANDIDATE_LIMIT);
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

    return this.executeSearch(searchKey, [
      {
        label: "category-primary",
        baseQuery: buildCategorySortedQuery(normalizedCategory, "desc"),
        supportsPrefetch: true,
      },
      {
        label: "category-basic-fallback",
        baseQuery: buildCategoryOnlyQuery(normalizedCategory),
        fetchLimit: buildFallbackFetchLimit(normalizedLimit),
        transformResults: (results) =>
          applyLocalResultTransform(results, {
            filters: { category: normalizedCategory },
            sortDirection: "desc",
            limit: normalizedLimit,
          }),
      },
    ], normalizedLimit);
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

    const attempts: SearchAttempt[] = [
      {
        label: "price-range-primary",
        baseQuery: buildFirestoreQuery([], filters),
        supportsPrefetch: true,
      },
    ];

    if (filters.category) {
      attempts.push(
        {
          label: "price-range-category-sorted-fallback",
          baseQuery: buildCategorySortedQuery(filters.category, "desc"),
          transformResults: (results) =>
            applyLocalResultTransform(results, {
              filters,
              sortDirection: "desc",
              limit: this.defaultLimit,
            }),
        },
        {
          label: "price-range-category-basic-fallback",
          baseQuery: buildCategoryOnlyQuery(filters.category),
          fetchLimit: buildFallbackFetchLimit(this.defaultLimit),
          transformResults: (results) =>
            applyLocalResultTransform(results, {
              filters,
              sortDirection: "desc",
              limit: this.defaultLimit,
            }),
        },
      );
    } else {
      attempts.push({
        label: "price-range-sorted-fallback",
        baseQuery: buildPriceSortedQuery("desc"),
        fetchLimit: buildFallbackFetchLimit(this.defaultLimit),
        transformResults: (results) =>
          applyLocalResultTransform(results, {
            filters,
            sortDirection: "desc",
            limit: this.defaultLimit,
          }),
      });
    }

    return this.executeSearch(searchKey, attempts, this.defaultLimit);
  }

  async getTopDeals(category?: string, limit = this.defaultLimit): Promise<SearchResult> {
    const normalizedCategory = category?.trim().toLowerCase() || undefined;
    const normalizedLimit = Math.min(Math.max(limit, 1), 20);
    const searchKey = buildSearchCacheKey("top-deals", {
      category: normalizedCategory,
      page: 1,
      limit: normalizedLimit,
    });

    const attempts: SearchAttempt[] = [
      {
        label: "top-deals-primary",
        baseQuery: buildTopDealsQuery("asc", normalizedCategory),
        supportsPrefetch: true,
      },
    ];

    if (normalizedCategory) {
      attempts.push({
        label: "top-deals-category-basic-fallback",
        baseQuery: buildCategoryOnlyQuery(normalizedCategory),
        fetchLimit: buildFallbackFetchLimit(normalizedLimit),
        transformResults: (results) =>
          applyLocalResultTransform(results, {
            filters: { category: normalizedCategory },
            sortDirection: "asc",
            limit: normalizedLimit,
            requirePositivePrice: true,
          }),
      });
    } else {
      attempts.push({
        label: "top-deals-sorted-fallback",
        baseQuery: buildPriceSortedQuery("asc"),
        fetchLimit: buildFallbackFetchLimit(normalizedLimit),
        transformResults: (results) =>
          applyLocalResultTransform(results, {
            sortDirection: "asc",
            limit: normalizedLimit,
            requirePositivePrice: true,
          }),
      });
    }

    return this.executeSearch(searchKey, attempts, normalizedLimit);
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

        performanceMonitor.captureError(error, {
          area: "search.observe-collection",
          userId,
        });
        console.warn("[VaultScope] Failed to observe collection. Returning empty state.", error);
        onChange([]);
      },
    );
  }

  private async executeSearch(
    cacheKey: string,
    attempts: SearchAttempt[],
    pageSize: number,
  ): Promise<SearchResult> {
    const memoryCachedResults = inMemorySearchCache.get(cacheKey);
    if (memoryCachedResults) {
      if (attempts[0]) {
        void this.refreshCachedSearch(cacheKey, attempts[0], pageSize);
      }
      return memoryCachedResults;
    }

    const cachedResults = await getCachedSearchResult(cacheKey);

    if (cachedResults) {
      inMemorySearchCache.set(cacheKey, cachedResults);
      if (attempts[0]) {
        void this.refreshCachedSearch(cacheKey, attempts[0], pageSize);
      }
      return cachedResults;
    }

    for (let index = 0; index < attempts.length; index += 1) {
      const attempt = attempts[index];

      try {
        const { results, snapshotDocs } = await this.fetchSearchAttempt(cacheKey, attempt, pageSize);

        inMemorySearchCache.set(cacheKey, results);
        await setCachedSearchResult(cacheKey, results);

        const lastDoc = snapshotDocs[snapshotDocs.length - 1] ?? null;
        if (attempt.supportsPrefetch && lastDoc) {
          void this.prefetchNextPage(cacheKey, attempt.baseQuery, pageSize, lastDoc);
        }

        return results;
      } catch (error) {
        if (isPermissionError(error)) {
          throw new SearchAuthRequiredError();
        }

        if (isNetworkError(error) && cachedResults) {
          return cachedResults;
        }

        if (isIndexError(error) && index < attempts.length - 1) {
          performanceMonitor.captureError(error, {
            area: "search.execute",
            cacheKey,
            attempt: attempt.label,
            fallback: true,
          });
          console.warn(
            `[VaultScope] Search plan "${attempt.label}" requires a Firestore index. Trying a lighter fallback query.`,
            error,
          );
          continue;
        }

        performanceMonitor.captureError(error, {
          area: "search.execute",
          cacheKey,
          attempt: attempt.label,
        });
        console.warn("[VaultScope] Search request failed. Returning cached or empty results.", error);
        return cachedResults ?? [];
      }
    }

    return cachedResults ?? [];
  }

  private async refreshCachedSearch(
    cacheKey: string,
    attempt: SearchAttempt,
    pageSize: number,
  ): Promise<void> {
    try {
      const { results, snapshotDocs } = await this.fetchSearchAttempt(cacheKey, attempt, pageSize);

      inMemorySearchCache.set(cacheKey, results);
      await setCachedSearchResult(cacheKey, results);

      const lastDoc = snapshotDocs[snapshotDocs.length - 1] ?? null;
      if (attempt.supportsPrefetch && lastDoc) {
        void this.prefetchNextPage(cacheKey, attempt.baseQuery, pageSize, lastDoc);
      }
    } catch (error) {
      if (!isNetworkError(error)) {
        console.warn("[VaultScope] Background refresh failed.", error);
      }
    }
  }

  private async fetchSearchAttempt(
    cacheKey: string,
    attempt: SearchAttempt,
    pageSize: number,
  ): Promise<{
    results: SearchResult;
    snapshotDocs: Array<QueryDocumentSnapshot<DocumentData>>;
  }> {
    const startedAt = Date.now();
    const fetchLimit = attempt.fetchLimit ?? pageSize;
    const snapshot = await performanceMonitor.measureAsync(
      "search.execute",
      () => getDocs(query(attempt.baseQuery, limitConstraint(fetchLimit))),
      {
        cacheKey,
        pageSize,
        attempt: attempt.label,
      },
    );

    const normalized = normalizeResults(snapshot.docs);
    const results = attempt.transformResults ? attempt.transformResults(normalized) : normalized;

    performanceMonitor.logSearchQuery(Date.now() - startedAt, {
      cacheKey,
      pageSize,
      attempt: attempt.label,
      resultCount: results.length,
    });
    performanceMonitor.trackFirestoreRead(snapshot.docs.length, {
      cacheKey,
      attempt: attempt.label,
    });

    return {
      results,
      snapshotDocs: snapshot.docs,
    };
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
