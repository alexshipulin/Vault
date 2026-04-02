const mockGetDocs = jest.fn();
const mockOnSnapshot = jest.fn();
const mockQuery = jest.fn((target, ...constraints) => ({ target, constraints }));
const mockWhere = jest.fn((field, op, value) => ({ type: "where", field, op, value }));
const mockOrderBy = jest.fn((field, direction) => ({ type: "orderBy", field, direction }));
const mockCollection = jest.fn((_db, name, ...path) => ({ type: "collection", name, path }));
const mockLimitConstraint = jest.fn((value) => ({ type: "limit", value }));
const mockStartAfter = jest.fn((cursor) => ({ type: "startAfter", cursor }));

const mockBuildSearchCacheKey = jest.fn((prefix, payload) => `${prefix}:${JSON.stringify(payload)}`);
const mockGetCachedSearchResult = jest.fn(async () => null);
const mockSetCachedSearchResult = jest.fn(async () => undefined);
const mockCaptureError = jest.fn();
const mockLogSearchQuery = jest.fn();
const mockTrackFirestoreRead = jest.fn();
const mockMeasureAsync = jest.fn(async (_name, operation) => operation());

jest.mock("firebase/firestore", () => ({
  collection: (...args: unknown[]) => mockCollection(...args),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  limit: (...args: unknown[]) => mockLimitConstraint(...args),
  onSnapshot: (...args: unknown[]) => mockOnSnapshot(...args),
  orderBy: (...args: unknown[]) => mockOrderBy(...args),
  query: (...args: unknown[]) => mockQuery(...args),
  startAfter: (...args: unknown[]) => mockStartAfter(...args),
  where: (...args: unknown[]) => mockWhere(...args),
}));

jest.mock("@/lib/firebase/config", () => ({
  getVaultScopeDb: () => ({ projectId: "vault-93a7b" }),
  getVaultScopeAuth: () => ({ currentUser: null }),
}));

jest.mock("@/lib/firebase/cache", () => ({
  buildSearchCacheKey: (...args: unknown[]) => mockBuildSearchCacheKey(...args),
  getCachedSearchResult: (...args: unknown[]) => mockGetCachedSearchResult(...args),
  setCachedSearchResult: (...args: unknown[]) => mockSetCachedSearchResult(...args),
}));

jest.mock("@/lib/performance/monitoring", () => ({
  performanceMonitor: {
    measureAsync: (...args: unknown[]) => mockMeasureAsync(...args),
    logSearchQuery: (...args: unknown[]) => mockLogSearchQuery(...args),
    trackFirestoreRead: (...args: unknown[]) => mockTrackFirestoreRead(...args),
    captureError: (...args: unknown[]) => mockCaptureError(...args),
  },
}));

import { AntiqueSearchEngine } from "@/lib/firebase/search";

function makeDoc(id: string, data: Record<string, unknown>) {
  return {
    id,
    exists: () => true,
    data: () => data,
  };
}

function makeSnapshot(...docs: ReturnType<typeof makeDoc>[]) {
  return { docs };
}

function makeIndexError() {
  const error = new Error("The query requires an index.");
  (error as Error & { code?: string }).code = "failed-precondition";
  return error;
}

describe("AntiqueSearchEngine missing-index fallbacks", () => {
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it("falls back to a lightweight keyword query when the indexed search path is unavailable", async () => {
    mockGetDocs
      .mockRejectedValueOnce(makeIndexError())
      .mockRejectedValueOnce(makeIndexError())
      .mockResolvedValueOnce(
        makeSnapshot(
          makeDoc("jar-1", {
            title: "Brown pottery storage jar",
            category: "ceramics",
            priceRealized: 20,
            source: "ebay",
            keywords: ["pottery", "jar"],
          }),
          makeDoc("jar-2", {
            title: "Decorative vase",
            category: "ceramics",
            priceRealized: 12,
            source: "ebay",
            keywords: ["decorative", "vase"],
          }),
          makeDoc("painting-1", {
            title: "Large oil painting",
            category: "art",
            priceRealized: 500,
            source: "heritage",
            keywords: ["painting"],
          }),
        ),
      );

    const engine = new AntiqueSearchEngine();
    const results = await engine.searchByKeywords(
      "brown pottery jar",
      { category: "ceramics", priceMax: 100 },
      3,
    );

    expect(results.map((item) => item.id)).toEqual(["jar-1", "jar-2"]);
    expect(results.map((item) => item.priceRealized)).toEqual([20, 12]);
    expect(mockGetDocs).toHaveBeenCalledTimes(3);
    expect(mockCaptureError).toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("keeps comparable auction search working when ascending index-backed queries are missing", async () => {
    mockGetDocs
      .mockResolvedValueOnce(
        makeSnapshot(
          makeDoc("high-1", {
            title: "Rare ceramic jar",
            category: "ceramics",
            priceRealized: 200,
            source: "liveauctioneers",
            keywords: ["ceramic", "jar"],
          }),
          makeDoc("high-2", {
            title: "Vintage pottery vessel",
            category: "ceramics",
            priceRealized: 150,
            source: "ebay",
            keywords: ["pottery", "vessel"],
          }),
        ),
      )
      .mockRejectedValueOnce(makeIndexError())
      .mockRejectedValueOnce(makeIndexError())
      .mockResolvedValueOnce(
        makeSnapshot(
          makeDoc("low-1", {
            title: "Common flea market vase",
            category: "ceramics",
            priceRealized: 20,
            source: "ebay",
            keywords: ["vase"],
          }),
          makeDoc("low-2", {
            title: "Small decorative jar",
            category: "ceramics",
            priceRealized: 50,
            source: "ebay",
            keywords: ["jar"],
          }),
          makeDoc("high-1", {
            title: "Rare ceramic jar",
            category: "ceramics",
            priceRealized: 200,
            source: "liveauctioneers",
            keywords: ["ceramic", "jar"],
          }),
        ),
      );

    const engine = new AntiqueSearchEngine();
    const results = await engine.searchComparableAuctions(
      "ceramic jar",
      { category: "ceramics" },
      4,
    );

    expect(results.map((item) => item.id)).toEqual(["high-1", "high-2", "low-1", "low-2"]);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalled();
  });
});
