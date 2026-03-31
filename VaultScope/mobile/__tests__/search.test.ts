const mockCollection = jest.fn((...args) => ({ type: "collection", args }));
const mockWhere = jest.fn((...args) => ({ type: "where", args }));
const mockOrderBy = jest.fn((...args) => ({ type: "orderBy", args }));
const mockQuery = jest.fn((...args) => ({ type: "query", args }));
const mockGetDocs = jest.fn();
const mockLimit = jest.fn((value) => ({ type: "limit", value }));
const mockStartAfter = jest.fn((cursor) => ({ type: "startAfter", cursor }));
const mockOnSnapshot = jest.fn();
const mockGetCachedSearchResult = jest.fn();
const mockSetCachedSearchResult = jest.fn();
const mockMeasureAsync = jest.fn(
  async (_name: string, operation: () => Promise<unknown>) => operation(),
);
const mockLogSearchQuery = jest.fn();
const mockTrackFirestoreRead = jest.fn();
const mockCaptureError = jest.fn();

jest.mock("firebase/firestore", () => ({
  collection: (...args: unknown[]) => mockCollection(...args),
  where: (...args: unknown[]) => mockWhere(...args),
  orderBy: (...args: unknown[]) => mockOrderBy(...args),
  query: (...args: unknown[]) => mockQuery(...args),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  limit: (...args: unknown[]) => mockLimit(...args),
  startAfter: (...args: unknown[]) => mockStartAfter(...args),
  onSnapshot: (...args: unknown[]) => mockOnSnapshot(...args),
}));

jest.mock("@/lib/firebase/config", () => ({
  getVaultScopeDb: jest.fn(() => "db"),
  getVaultScopeAuth: jest.fn(() => ({
    currentUser: {
      uid: "user-123",
    },
  })),
}));

jest.mock("@/lib/firebase/cache", () => {
  const actual = jest.requireActual("@/lib/firebase/cache");

  return {
    ...actual,
    getCachedSearchResult: (...args: unknown[]) => mockGetCachedSearchResult(...args),
    setCachedSearchResult: (...args: unknown[]) => mockSetCachedSearchResult(...args),
  };
});

jest.mock("@/lib/performance/monitoring", () => ({
  performanceMonitor: {
    measureAsync: (...args: unknown[]) => mockMeasureAsync(...args),
    logSearchQuery: (...args: unknown[]) => mockLogSearchQuery(...args),
    trackFirestoreRead: (...args: unknown[]) => mockTrackFirestoreRead(...args),
    captureError: (...args: unknown[]) => mockCaptureError(...args),
  },
}));

import { AntiqueSearchEngine } from "@/lib/firebase/search";
import {
  detectAuctionCategory,
  extractSearchKeywords,
  parsePriceText,
} from "@/lib/firebase/utils";
import { LruCache } from "@/lib/performance/cache";

describe("Search utilities", () => {
  beforeEach(() => {
    mockGetCachedSearchResult.mockResolvedValue(null);
    mockSetCachedSearchResult.mockResolvedValue(undefined);
    mockGetDocs.mockResolvedValue({
      docs: [
        {
          id: "auction-1",
          exists: () => true,
          data: () => ({
            title: "Victorian mahogany chair",
            description: "Carved side chair",
            priceRealized: 640,
            category: "furniture",
            source: "liveauctioneers",
            keywords: ["victorian", "chair"],
          }),
        },
      ],
    });
  });

  it("extracts normalized search keywords without stop words", () => {
    expect(extractSearchKeywords("The Victorian chair and the mahogany table")).toEqual([
      "victorian",
      "chair",
      "mahogany",
      "table",
    ]);
  });

  it("detects auction categories from titles", () => {
    expect(detectAuctionCategory("Sterling ring with enamel detail")).toBe("jewelry");
    expect(detectAuctionCategory("Hand-painted pottery vase")).toBe("ceramics");
  });

  it("parses formatted prices into numbers", () => {
    expect(parsePriceText("$1,234.56")).toBe(1234.56);
    expect(parsePriceText("EUR 980")).toBe(980);
    expect(parsePriceText("not-a-price")).toBeNull();
  });

  it("returns normalized results for category searches", async () => {
    const engine = new AntiqueSearchEngine();

    const results = await engine.searchByCategory("furniture");

    expect(results).toHaveLength(1);
    expect(results[0]?.title).toBe("Victorian mahogany chair");
    expect(mockLogSearchQuery).toHaveBeenCalled();
    expect(mockTrackFirestoreRead).toHaveBeenCalledWith(1, expect.any(Object));
  });

  it("evicts old entries when the LRU cache reaches capacity", () => {
    const cache = new LruCache<string, number>({ maxSize: 2 });

    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a");
    cache.set("c", 3);

    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
    expect(cache.has("c")).toBe(true);
  });

  it("debounces repeated keyword searches to a single execution", async () => {
    jest.useFakeTimers();
    const engine = new AntiqueSearchEngine();
    const searchSpy = jest
      .spyOn(engine, "searchByKeywords")
      .mockResolvedValue([{ id: "auction-2" }] as never);

    const debouncedSearch = engine.createDebouncedKeywordSearch(300);
    const firstPromise = debouncedSearch("chair");
    const secondPromise = debouncedSearch("mahogany chair");

    jest.advanceTimersByTime(300);

    await expect(secondPromise).resolves.toEqual([{ id: "auction-2" }]);
    await expect(firstPromise).rejects.toThrow("superseded");
    expect(searchSpy).toHaveBeenCalledTimes(1);
    expect(searchSpy).toHaveBeenCalledWith("mahogany chair", undefined, undefined);

    jest.useRealTimers();
  });
});
