const mockGetVaultScopeAuth = jest.fn();
const mockEnsureAnonymousSession = jest.fn();
const mockSaveScanResult = jest.fn();
const mockUploadScanImage = jest.fn();
const mockSearchComparableAuctions = jest.fn();
const mockIdentifyItem = jest.fn();
const mockProcessImage = jest.fn();

jest.mock("@/lib/firebase/config", () => ({
  getVaultScopeAuth: () => mockGetVaultScopeAuth(),
}));

jest.mock("@/lib/firebase/auth", () => ({
  ensureAnonymousSession: () => mockEnsureAnonymousSession(),
}));

jest.mock("@/lib/firebase/firestore", () => ({
  saveScanResult: (...args: unknown[]) => mockSaveScanResult(...args),
}));

jest.mock("@/lib/firebase/storage", () => ({
  uploadScanImage: (...args: unknown[]) => mockUploadScanImage(...args),
}));

jest.mock("@/lib/firebase/search", () => ({
  AntiqueSearchEngine: class {
    searchComparableAuctions(...args: unknown[]) {
      return mockSearchComparableAuctions(...args);
    }
  },
}));

jest.mock("@/lib/firebase/utils", () => ({
  extractSearchKeywords: (value: string) =>
    Array.from(
      new Set(
        value
          .toLowerCase()
          .split(/[^a-z0-9]+/i)
          .map((keyword) => keyword.trim())
          .filter((keyword) => keyword.length > 2),
      ),
    ).slice(0, 10),
}));

jest.mock("@/lib/gemini/client", () => ({
  GeminiClient: class {
    identifyItem(...args: unknown[]) {
      return mockIdentifyItem(...args);
    }
  },
}));

jest.mock("@/lib/vision/processor", () => ({
  VisionProcessor: class {
    processImage(...args: unknown[]) {
      return mockProcessImage(...args);
    }
  },
}));

jest.mock("@/lib/performance/monitoring", () => ({
  performanceMonitor: {
    measureAsync: async <T>(_: string, operation: () => Promise<T>) => operation(),
    trackGeminiLatency: jest.fn(),
    trackFirestoreRead: jest.fn(),
    trackFirestoreWrite: jest.fn(),
    logSearchQuery: jest.fn(),
    captureError: jest.fn(),
  },
}));

function seededIdentification(overrides: Record<string, unknown> = {}) {
  return {
    category: "coin",
    name: "1909-S VDB Lincoln Wheat Cent",
    year: 1909,
    origin: "United States",
    objectType: "coin",
    material: "copper",
    makerOrBrand: null,
    condition: "fine",
    conditionRange: ["good", "mint"],
    historySummary: "Historic key-date wheat cent.",
    confidence: 0.98,
    searchKeywords: ["1909", "vdb", "lincoln", "wheat", "cent"],
    distinguishingFeatures: ["vdb initials", "s mint mark"],
    requiresMeasurements: false,
    requiresMorePhotos: false,
    isLikelyMassProduced: false,
    isLikelyReproduction: false,
    valuationWarnings: [],
    marketTier: "collector",
    pricingEvidenceStrength: "strong",
    likelyRetailContext: "auction",
    likelyValueCeiling: 1500,
    valuationConfidence: 0.86,
    descriptionTone: "collector",
    estimatedValueLow: 900,
    estimatedValueHigh: 1300,
    estimatedValueCurrency: "USD",
    estimatedValueRationale: "Based on rarity, date, mint mark, and visible wear.",
    ...overrides,
  };
}

describe("ScanPipeline", () => {
  beforeEach(() => {
    jest.resetModules();
    mockGetVaultScopeAuth.mockReturnValue({ currentUser: null });
    mockEnsureAnonymousSession.mockRejectedValue(new Error("Anonymous auth disabled"));
    mockSaveScanResult.mockResolvedValue("remote-scan-id");
    mockUploadScanImage.mockResolvedValue("https://example.com/image.jpg");
    mockSearchComparableAuctions.mockResolvedValue([]);
    mockIdentifyItem.mockResolvedValue(seededIdentification());
    mockProcessImage.mockResolvedValue({
      originalUri: "file:///tmp/test.jpg",
      croppedUri: "file:///tmp/test-crop.jpg",
      optimizedUri: "file:///tmp/test-optimized.jpg",
      text: "1909-S VDB",
      barcodes: [],
      base64: "ZmFrZS1pbWFnZQ==",
    });
  });

  it("returns anonymous-local result when Firebase auth is unavailable", async () => {
    const { ScanPipeline } = require("@/lib/scan/pipeline") as typeof import("@/lib/scan/pipeline");
    const pipeline = new ScanPipeline();

    const result = await pipeline.executeScan(["file:///tmp/test.jpg"], "coin", "mystery");

    expect(result.userId).toBe("anonymous-local");
    expect(result.id).toMatch(/^scan-/);
    expect(mockSaveScanResult).not.toHaveBeenCalled();
    expect(mockUploadScanImage).not.toHaveBeenCalled();
    expect(mockIdentifyItem).toHaveBeenCalledWith(
      expect.any(Array),
      "coin",
      "1909-S VDB",
      "mystery",
    );
  });

  it("uses database-derived pricing when close comparables contain valid prices", async () => {
    mockSearchComparableAuctions.mockResolvedValue([
      {
        id: "a",
        title: "1909-S VDB Lincoln Wheat Cent graded fine",
        description: "United States copper cent with VDB initials and S mint mark.",
        priceRealized: 1000,
        saleDate: "2026-01-01",
        imageUrl: null,
        source: "ebay",
        category: "general",
        material: "copper",
        originCountry: "United States",
        auctionHouse: "Marketplace",
        keywords: ["1909", "vdb", "lincoln", "wheat", "cent", "copper"],
      },
      {
        id: "b",
        title: "1909-S VDB Lincoln Wheat Cent collector example",
        description: "Rare key-date cent from the United States.",
        priceRealized: 1200,
        saleDate: "2026-01-02",
        imageUrl: null,
        source: "heritage",
        category: "general",
        material: "copper",
        originCountry: "United States",
        auctionHouse: "Heritage",
        keywords: ["1909", "vdb", "lincoln", "wheat", "cent"],
      },
      {
        id: "c",
        title: "1909-S VDB Lincoln Wheat Cent problem-free coin",
        description: "Good eye appeal with visible mint mark and initials.",
        priceRealized: 1400,
        saleDate: "2026-01-03",
        imageUrl: null,
        source: "ebay",
        category: "general",
        material: "copper",
        originCountry: "United States",
        auctionHouse: "Marketplace",
        keywords: ["1909", "vdb", "lincoln", "wheat", "cent"],
      },
    ]);

    const { ScanPipeline } = require("@/lib/scan/pipeline") as typeof import("@/lib/scan/pipeline");
    const pipeline = new ScanPipeline();
    const result = await pipeline.executeScan(["file:///tmp/test.jpg"], "coin");

    expect(result.priceEstimate.source).toBe("database");
    expect(result.priceEstimate.low).toBe(1100);
    expect(result.priceEstimate.high).toBe(1300);
    expect(result.priceEstimate.needsReview).toBe(false);
    expect(result.priceEstimate.matchedSources).toEqual(expect.arrayContaining(["ebay", "heritage"]));
  });

  it("suppresses expensive outliers when cheaper close matches exist", async () => {
    mockIdentifyItem.mockResolvedValue(
      seededIdentification({
        category: "ceramics",
        name: "Southeast Asian Stoneware Storage Jar",
        origin: "Southeast Asia",
        objectType: "storage jar",
        material: "stoneware",
        makerOrBrand: null,
        searchKeywords: ["southeast", "asian", "stoneware", "storage", "jar"],
        distinguishingFeatures: ["ribbed shoulder", "olive glaze"],
        estimatedValueLow: 50,
        estimatedValueHigh: 90,
      }),
    );
    mockSearchComparableAuctions.mockResolvedValue([
      {
        id: "cheap-a",
        title: "Southeast Asian stoneware storage jar",
        description: "Unmarked olive-glazed storage jar.",
        priceRealized: 20,
        saleDate: "2026-01-01",
        imageUrl: null,
        source: "ebay",
        category: "ceramics",
        material: "stoneware",
        originCountry: "Southeast Asia",
        auctionHouse: "Marketplace",
        keywords: ["southeast", "asian", "stoneware", "storage", "jar"],
      },
      {
        id: "cheap-b",
        title: "Southeast Asian stoneware storage jar with ribbed shoulder",
        description: "Decorative vessel.",
        priceRealized: 25,
        saleDate: "2026-01-02",
        imageUrl: null,
        source: "ebay",
        category: "ceramics",
        material: "stoneware",
        originCountry: "Southeast Asia",
        auctionHouse: "Marketplace",
        keywords: ["southeast", "asian", "stoneware", "storage", "jar", "ribbed"],
      },
      {
        id: "cheap-c",
        title: "Stoneware jar from Southeast Asia",
        description: "Common utilitarian jar.",
        priceRealized: 30,
        saleDate: "2026-01-03",
        imageUrl: null,
        source: "ebay",
        category: "ceramics",
        material: "stoneware",
        originCountry: "Southeast Asia",
        auctionHouse: "Marketplace",
        keywords: ["southeast", "asian", "stoneware", "jar"],
      },
      {
        id: "high-a",
        title: "Antique Southeast Asian ceremonial vessel",
        description: "Museum-style ceremonial vessel.",
        priceRealized: 1200,
        saleDate: "2026-01-04",
        imageUrl: null,
        source: "heritage",
        category: "ceramics",
        material: "stoneware",
        originCountry: "Southeast Asia",
        auctionHouse: "Heritage",
        keywords: ["southeast", "asian", "vessel"],
      },
      {
        id: "high-b",
        title: "Rare Martaban ceremonial jar",
        description: "Premium antique example.",
        priceRealized: 1400,
        saleDate: "2026-01-05",
        imageUrl: null,
        source: "liveauctioneers",
        category: "ceramics",
        material: "stoneware",
        originCountry: "Southeast Asia",
        auctionHouse: "LiveAuctioneers",
        keywords: ["martaban", "ceremonial", "jar"],
      },
    ]);

    const { ScanPipeline } = require("@/lib/scan/pipeline") as typeof import("@/lib/scan/pipeline");
    const pipeline = new ScanPipeline();
    const result = await pipeline.executeScan(["file:///tmp/test.jpg"], "general");

    expect(result.priceEstimate.source).toBe("database");
    expect(result.priceEstimate.high).toBeLessThan(100);
    expect(result.priceEstimate.low).toBeLessThanOrEqual(30);
  });

  it("uses AI fallback pricing with warnings when database matches are weak", async () => {
    mockIdentifyItem.mockResolvedValue(
      seededIdentification({
        category: "ceramics",
        name: "Unmarked Decorative Vase",
        origin: "Unknown",
        objectType: "vase",
        material: "ceramic",
        makerOrBrand: null,
        confidence: 0.82,
        searchKeywords: ["decorative", "vase", "ceramic"],
        distinguishingFeatures: ["single front photo"],
        marketTier: "decor",
        pricingEvidenceStrength: "weak",
        likelyRetailContext: "flea_market",
        likelyValueCeiling: 90,
        valuationConfidence: 0.28,
        descriptionTone: "skeptical",
        estimatedValueLow: 40,
        estimatedValueHigh: 80,
        estimatedValueRationale: "Broad decorative pottery estimate.",
      }),
    );
    mockSearchComparableAuctions.mockResolvedValue([
      {
        id: "weak-a",
        title: "Decorative ceramic vessel",
        description: "General decorative object.",
        priceRealized: 650,
        saleDate: "2026-01-01",
        imageUrl: null,
        source: "heritage",
        category: "ceramics",
        material: "ceramic",
        originCountry: "Unknown",
        auctionHouse: "Heritage",
        keywords: ["decorative", "ceramic", "vessel"],
      },
    ]);

    const { ScanPipeline } = require("@/lib/scan/pipeline") as typeof import("@/lib/scan/pipeline");
    const pipeline = new ScanPipeline();
    const result = await pipeline.executeScan(["file:///tmp/test.jpg"], "general", "mystery");

    expect(result.priceEstimate.source).toBe("aiFallback");
    expect(result.priceEstimate.low).toBe(40);
    expect(result.priceEstimate.high).toBe(80);
    expect(result.priceEstimate.needsReview).toBe(true);
    expect(result.priceEstimate.valuationMode).toBe("mystery");
    expect(result.priceEstimate.valuationConfidence).toBeLessThanOrEqual(0.42);
    expect(result.priceEstimate.valuationWarnings).toEqual(
      expect.arrayContaining([
        "Not enough close market matches were found.",
        "Estimate is conservative because flea-market items are usually low-value unless proven otherwise.",
        "This appears to be a common decorative object.",
      ]),
    );
  });

  it("does not let premium-auction-only mystery comps inflate a cheap decorative item", async () => {
    mockIdentifyItem.mockResolvedValue(
      seededIdentification({
        category: "ceramics",
        name: "Decorative Pottery Vase",
        origin: "Unknown",
        objectType: "vase",
        material: "ceramic",
        makerOrBrand: null,
        confidence: 0.75,
        searchKeywords: ["decorative", "pottery", "vase"],
        distinguishingFeatures: ["single angle"],
        marketTier: "decor",
        pricingEvidenceStrength: "weak",
        likelyRetailContext: "flea_market",
        likelyValueCeiling: 100,
        valuationConfidence: 0.24,
        descriptionTone: "skeptical",
        estimatedValueLow: 25,
        estimatedValueHigh: 60,
        estimatedValueRationale: "Likely a common decorative vase with low resale value.",
      }),
    );
    mockSearchComparableAuctions.mockResolvedValue([
      {
        id: "premium-a",
        title: "Decorative ceramic vessel",
        description: "Auction catalog decorative vessel.",
        priceRealized: 480,
        saleDate: "2026-01-01",
        imageUrl: null,
        source: "heritage",
        category: "ceramics",
        material: "ceramic",
        originCountry: "Unknown",
        auctionHouse: "Heritage",
        keywords: ["decorative", "ceramic", "vessel"],
      },
      {
        id: "premium-b",
        title: "Decorative pottery vase",
        description: "Auction example.",
        priceRealized: 620,
        saleDate: "2026-01-02",
        imageUrl: null,
        source: "liveauctioneers",
        category: "ceramics",
        material: "ceramic",
        originCountry: "Unknown",
        auctionHouse: "LiveAuctioneers",
        keywords: ["decorative", "pottery", "vase"],
      },
    ]);

    const { ScanPipeline } = require("@/lib/scan/pipeline") as typeof import("@/lib/scan/pipeline");
    const pipeline = new ScanPipeline();
    const result = await pipeline.executeScan(["file:///tmp/test.jpg"], "general", "mystery");

    expect(result.priceEstimate.source).toBe("aiFallback");
    expect(result.priceEstimate.high).toBeLessThanOrEqual(100);
    expect(result.priceEstimate.valuationWarnings).toEqual(
      expect.arrayContaining([
        "Premium auction examples were found, but your item lacks evidence for that attribution.",
      ]),
    );
  });

  it("can unlock a higher mystery valuation only when maker evidence and strong comps agree", async () => {
    mockIdentifyItem.mockResolvedValue(
      seededIdentification({
        category: "jewelry",
        name: "Signed Sterling Bracelet",
        origin: "United States",
        objectType: "bracelet",
        material: "sterling silver",
        makerOrBrand: "Taxco",
        confidence: 0.91,
        searchKeywords: ["signed", "sterling", "bracelet", "taxco"],
        distinguishingFeatures: ["taxco mark", "sterling stamp"],
        marketTier: "collector",
        pricingEvidenceStrength: "strong",
        likelyRetailContext: "estate_sale",
        likelyValueCeiling: 420,
        valuationConfidence: 0.84,
        descriptionTone: "collector",
        estimatedValueLow: 180,
        estimatedValueHigh: 260,
        estimatedValueRationale: "Signed sterling jewelry with visible maker marks and secondary-market demand.",
      }),
    );
    mockSearchComparableAuctions.mockResolvedValue([
      {
        id: "unlock-a",
        title: "Signed Taxco sterling bracelet",
        description: "Visible Taxco and sterling marks.",
        priceRealized: 190,
        saleDate: "2026-01-01",
        imageUrl: null,
        source: "ebay",
        category: "jewelry",
        material: "sterling silver",
        originCountry: "United States",
        auctionHouse: "Marketplace",
        keywords: ["signed", "taxco", "sterling", "bracelet"],
      },
      {
        id: "unlock-b",
        title: "Taxco sterling silver bracelet signed",
        description: "Collector example with matching marks.",
        priceRealized: 230,
        saleDate: "2026-01-02",
        imageUrl: null,
        source: "heritage",
        category: "jewelry",
        material: "sterling silver",
        originCountry: "United States",
        auctionHouse: "Heritage",
        keywords: ["signed", "taxco", "sterling", "bracelet"],
      },
      {
        id: "unlock-c",
        title: "Signed sterling bracelet Taxco Mexico",
        description: "Near exact match with visible maker mark.",
        priceRealized: 260,
        saleDate: "2026-01-03",
        imageUrl: null,
        source: "ebay",
        category: "jewelry",
        material: "sterling silver",
        originCountry: "United States",
        auctionHouse: "Marketplace",
        keywords: ["signed", "taxco", "sterling", "bracelet"],
      },
    ]);

    const { ScanPipeline } = require("@/lib/scan/pipeline") as typeof import("@/lib/scan/pipeline");
    const pipeline = new ScanPipeline();
    const result = await pipeline.executeScan(["file:///tmp/test.jpg"], "general", "mystery");

    expect(result.priceEstimate.high).toBeGreaterThan(150);
    expect(result.priceEstimate.appliedValueCeiling).toBeGreaterThanOrEqual(250);
    expect(result.priceEstimate.evidenceStrength).toBe("strong");
  });

  it("keeps the estimate empty and flags review when neither database nor AI can price confidently", async () => {
    mockIdentifyItem.mockResolvedValue(
      seededIdentification({
        category: "ceramics",
        name: "Unmarked Stoneware Jar",
        origin: null,
        objectType: "jar",
        material: "stoneware",
        makerOrBrand: null,
        confidence: 0.48,
        searchKeywords: ["stoneware", "jar"],
        distinguishingFeatures: ["single angle"],
        requiresMeasurements: true,
        requiresMorePhotos: true,
        estimatedValueLow: null,
        estimatedValueHigh: null,
        estimatedValueCurrency: null,
        estimatedValueRationale: null,
      }),
    );
    mockSearchComparableAuctions.mockResolvedValue([]);

    const { ScanPipeline } = require("@/lib/scan/pipeline") as typeof import("@/lib/scan/pipeline");
    const pipeline = new ScanPipeline();
    const result = await pipeline.executeScan(["file:///tmp/test.jpg"], "general");

    expect(result.priceEstimate.low).toBeNull();
    expect(result.priceEstimate.high).toBeNull();
    expect(result.priceEstimate.needsReview).toBe(true);
    expect(result.priceEstimate.source).toBe("database");
    expect(result.priceEstimate.valuationWarnings).toEqual(
      expect.arrayContaining([
        "Not enough close market matches were found.",
        "Dimensions are required for a reliable appraisal.",
        "Additional photos are required for a reliable appraisal.",
      ]),
    );
  });
});
