const mockGetVaultScopeAuth = jest.fn();
const mockEnsureAnonymousSession = jest.fn();
const mockSaveScanResult = jest.fn();
const mockUploadScanImage = jest.fn();
const mockSearchComparableAuctions = jest.fn();
const mockIdentifyItem = jest.fn();
const mockProcessImage = jest.fn();
const mockPcgsSafeLookup = jest.fn();
const mockDiscogsLookupVinyl = jest.fn();
const mockMetalsEstimateBullionValue = jest.fn();
const mockEbaySafeLookup = jest.fn();

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
  buildEnhancedSearchQuery: (identification: { searchKeywords?: string[]; year?: number | null }) =>
    Array.from(
      new Set(
        [
          ...(identification.searchKeywords ?? []),
          identification.year ? String(identification.year) : null,
        ].filter((keyword): keyword is string => typeof keyword === "string" && keyword.length > 0),
      ),
    ).slice(0, 10),
}));

jest.mock("@/lib/gemini/client", () => ({
  GeminiClient: class {
    identifyItem(...args: unknown[]) {
      return mockIdentifyItem(...args);
    }
  },
  GeminiInvalidJsonError: class extends Error {},
}));

jest.mock("@/lib/vision/processor", () => ({
  VisionProcessor: class {
    processImage(...args: unknown[]) {
      return mockProcessImage(...args);
    }
  },
}));

jest.mock("@/src/services/pricing/PCGSClient", () => ({
  pcgsClient: {
    safeLookup: (...args: unknown[]) => mockPcgsSafeLookup(...args),
  },
}));

jest.mock("@/src/services/pricing/DiscogsClient", () => ({
  discogsClient: {
    lookupVinyl: (...args: unknown[]) => mockDiscogsLookupVinyl(...args),
  },
}));

jest.mock("@/src/services/pricing/MetalsClient", () => ({
  metalsClient: {
    estimateBullionValue: (...args: unknown[]) => mockMetalsEstimateBullionValue(...args),
  },
}));

jest.mock("@/src/services/pricing/EBayClient", () => ({
  ebayClient: {
    safeLookup: (...args: unknown[]) => mockEbaySafeLookup(...args),
    consumeLastFailureReason: jest.fn(() => null),
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
    pricingBasis: "Based on rarity, date, mint mark, and visible wear.",
    pricingConfidence: 0.86,
    isBullion: false,
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
    mockPcgsSafeLookup.mockResolvedValue(null);
    mockDiscogsLookupVinyl.mockResolvedValue(null);
    mockMetalsEstimateBullionValue.mockResolvedValue(null);
    mockEbaySafeLookup.mockResolvedValue(null);
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
    expect(mockSaveScanResult).toHaveBeenCalled();
    expect(mockSaveScanResult).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "anonymous-local",
      }),
    );
    expect(mockUploadScanImage).not.toHaveBeenCalled();
    expect(mockIdentifyItem).toHaveBeenCalledWith(
      expect.any(Array),
      "coin",
      "1909-S VDB",
      "mystery",
    );
  });

  it("uses PCGS pricing for coins when CoinFacts returns a match", async () => {
    mockPcgsSafeLookup.mockResolvedValue({
      coinName: "1909-S VDB Lincoln Cent",
      pcgsNo: 2426,
      priceGuideValues: { F12: 950, VF20: 1250, MS63: 1300 },
      averageCirculatedValue: 1100,
      averageUncirculatedValue: 1300,
      source: "pcgs",
      fetchedAt: "2026-04-03T00:00:00.000Z",
    });
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

    expect(result.priceEstimate.source).toBe("pcgs");
    expect(result.priceEstimate.low).toBe(1100);
    expect(result.priceEstimate.high).toBe(1300);
    expect(result.priceEstimate.sourceLabel).toBe("PCGS Price Guide");
  });

  it("falls back to the AI estimate in standard mode when Firestore comparables return no results", async () => {
    mockIdentifyItem.mockResolvedValue(
      seededIdentification({
        category: "general",
        name: "Unknown Brass Trinket Box",
        objectType: "trinket box",
        material: "brass",
        confidence: 0.66,
        valuationConfidence: 0.58,
        pricingConfidence: 0.58,
        estimatedValueLow: 18,
        estimatedValueHigh: 32,
        pricingBasis: "Common decorative brass trinket boxes usually trade in a low resale band.",
        estimatedValueRationale: "Common decorative brass trinket boxes usually trade in a low resale band.",
      }),
    );
    mockSearchComparableAuctions.mockResolvedValue([]);

    const { ScanPipeline } = require("@/lib/scan/pipeline") as typeof import("@/lib/scan/pipeline");
    const pipeline = new ScanPipeline();
    const result = await pipeline.executeScan(["file:///tmp/test.jpg"], "general");

    expect(result.priceEstimate.source).toBe("ai_estimate");
    expect(result.priceEstimate.low).toBe(18);
    expect(result.priceEstimate.high).toBe(32);
  });

  it("tightens weak mystery AI fallback ranges for cheap flea-market items", async () => {
    mockIdentifyItem.mockResolvedValue(
      seededIdentification({
        category: "general",
        name: "Carved Red Dragon Motif Box",
        year: null,
        origin: null,
        objectType: "box",
        material: "lacquer",
        confidence: 0.41,
        valuationConfidence: 0.3,
        pricingConfidence: 0.3,
        estimatedValueLow: 20,
        estimatedValueHigh: 60,
        pricingBasis: "Likely a decorative secondary-market trinket box without strong maker evidence.",
        estimatedValueRationale: "Likely a decorative secondary-market trinket box without strong maker evidence.",
        marketTier: "decor",
        pricingEvidenceStrength: "weak",
        likelyRetailContext: "flea_market",
        likelyValueCeiling: 100,
        requiresMeasurements: true,
        requiresMorePhotos: true,
        isLikelyMassProduced: true,
        valuationWarnings: [
          "Estimate is conservative because flea-market items are usually low-value unless proven otherwise.",
        ],
        searchKeywords: ["carved", "red", "dragon", "box"],
        distinguishingFeatures: ["dragon motif", "red carved exterior"],
      }),
    );
    mockSearchComparableAuctions.mockResolvedValue([]);

    const { ScanPipeline } = require("@/lib/scan/pipeline") as typeof import("@/lib/scan/pipeline");
    const pipeline = new ScanPipeline();
    const result = await pipeline.executeScan(["file:///tmp/test.jpg"], "general", "mystery");

    expect(result.priceEstimate.source).toBe("ai_estimate");
    expect(result.priceEstimate.low).toBe(20);
    expect(result.priceEstimate.high).toBe(30);
    expect(result.priceEstimate.valuationMode).toBe("mystery");
  });

  it("prefers the AI estimate in standard mode when comparable confidence stays below 0.5", async () => {
    mockIdentifyItem.mockResolvedValue(
      seededIdentification({
        category: "general",
        name: "Decorative Brass Trinket Box",
        objectType: "trinket box",
        material: "brass",
        confidence: 0.72,
        valuationConfidence: 0.57,
        pricingConfidence: 0.57,
        estimatedValueLow: 20,
        estimatedValueHigh: 35,
        pricingBasis: "Typical decorative brass trinket boxes sell in a modest secondary-market range.",
        estimatedValueRationale: "Typical decorative brass trinket boxes sell in a modest secondary-market range.",
      }),
    );
    mockSearchComparableAuctions.mockResolvedValue([
      {
        id: "weak-standard-a",
        title: "Decorative brass box",
        description: "General brass decor box.",
        priceRealized: 140,
        saleDate: "2026-01-01",
        imageUrl: null,
        source: "heritage",
        category: "general",
        material: "brass",
        originCountry: "Unknown",
        auctionHouse: "Heritage",
        keywords: ["decorative", "brass", "box"],
      },
      {
        id: "weak-standard-b",
        title: "Decorative metal keepsake box",
        description: "Unmarked keepsake box.",
        priceRealized: 210,
        saleDate: "2026-01-02",
        imageUrl: null,
        source: "liveauctioneers",
        category: "general",
        material: "brass",
        originCountry: "Unknown",
        auctionHouse: "LiveAuctioneers",
        keywords: ["decorative", "metal", "box"],
      },
    ]);

    const { ScanPipeline } = require("@/lib/scan/pipeline") as typeof import("@/lib/scan/pipeline");
    const pipeline = new ScanPipeline();
    const result = await pipeline.executeScan(["file:///tmp/test.jpg"], "general");

    expect(result.priceEstimate.source).toBe("ai_estimate");
    expect(result.priceEstimate.low).toBe(20);
    expect(result.priceEstimate.high).toBe(35);
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

    expect(result.priceEstimate.source).toBe("ai_estimate");
    expect(result.priceEstimate.high).toBeLessThanOrEqual(90);
    expect(result.priceEstimate.low).toBeLessThanOrEqual(50);
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

    expect(result.priceEstimate.source).toBe("ai_estimate");
    expect(result.priceEstimate.low).toBe(40);
    expect(result.priceEstimate.high).toBe(55);
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

  it("caps mystery confidence for routed eBay fallback when evidence is weak", async () => {
    mockIdentifyItem.mockResolvedValue(
      seededIdentification({
        category: "general",
        name: "Cinnabar Lacquer Box",
        objectType: "box",
        material: "lacquer",
        makerOrBrand: null,
        confidence: 0.78,
        valuationConfidence: 0.44,
        pricingConfidence: 0.44,
        marketTier: "decor",
        pricingEvidenceStrength: "weak",
        likelyRetailContext: "flea_market",
        searchKeywords: ["cinnabar", "lacquer", "box", "dragon"],
        estimatedValueLow: 30,
        estimatedValueHigh: 45,
      }),
    );
    mockSearchComparableAuctions.mockResolvedValue([]);
    mockEbaySafeLookup.mockResolvedValue({
      recommendedLow: 20,
      recommendedHigh: 75,
      listings: [],
      confidenceLevel: "high",
      fetchedAt: "2026-04-09T00:00:00.000Z",
    });

    const { ScanPipeline } = require("@/lib/scan/pipeline") as typeof import("@/lib/scan/pipeline");
    const pipeline = new ScanPipeline();
    const result = await pipeline.executeScan(["file:///tmp/test.jpg"], "general", "mystery");

    expect(result.priceEstimate.source).toBe("ebay");
    expect(result.priceEstimate.valuationConfidence).toBeLessThanOrEqual(0.45);
    expect(result.priceEstimate.high ?? 0).toBeLessThanOrEqual(35);
    expect((result.priceEstimate.high ?? 0) / Math.max(result.priceEstimate.low ?? 1, 1)).toBeLessThanOrEqual(2);
    expect(result.priceEstimate.needsReview).toBe(true);
    expect(result.priceEstimate.valuationWarnings?.length ?? 0).toBeGreaterThan(0);
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

    expect(result.priceEstimate.source).toBe("ai_estimate");
    expect(result.priceEstimate.low).toBe(25);
    expect(result.priceEstimate.high).toBeLessThanOrEqual(40);
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

  it("emits friendly source progress for a standard coin scan", async () => {
    mockSearchComparableAuctions.mockResolvedValue([]);
    mockPcgsSafeLookup.mockResolvedValue(null);

    const { ScanPipeline } = require("@/lib/scan/pipeline") as typeof import("@/lib/scan/pipeline");
    const sourceLines: string[] = [];
    const pipeline = new ScanPipeline({
      onProgress: (progress) => {
        if (progress.currentSearchSource) {
          sourceLines.push(progress.currentSearchSource);
        }
      },
    });

    await pipeline.executeScan(["file:///tmp/test.jpg"], "coin");

    expect(sourceLines).toEqual(
      expect.arrayContaining([
        "Preparing scan images",
        "Checking Gemini AI identification",
        "Assessing visible wear and overall condition",
        "Searching recent marketplace sales",
        "Checking PCGS price guide",
        "Building final estimate",
        "Saving scan result",
      ]),
    );
  });

  it("emits bullion-specific source progress when Gemini flags a bullion coin", async () => {
    mockIdentifyItem.mockResolvedValue(
      seededIdentification({
        name: "American Silver Eagle",
        year: 2020,
        searchKeywords: ["american", "silver", "eagle", "2020", "1oz"],
        isBullion: true,
      }),
    );
    mockMetalsEstimateBullionValue.mockResolvedValue({
      metalContent: { metal: "silver", troyOz: 1 },
      spotValue: 34,
      estimatedLow: 32.3,
      estimatedHigh: 39.1,
      spotPrice: 34,
      source: "metals_api",
    });

    const { ScanPipeline } = require("@/lib/scan/pipeline") as typeof import("@/lib/scan/pipeline");
    const sourceLines: string[] = [];
    const pipeline = new ScanPipeline({
      onProgress: (progress) => {
        if (progress.currentSearchSource) {
          sourceLines.push(progress.currentSearchSource);
        }
      },
    });

    await pipeline.executeScan(["file:///tmp/test.jpg"], "coin");

    expect(sourceLines).toContain("Checking live metals spot prices");
  });

  it("emits Discogs marketplace progress for vinyl scans", async () => {
    mockIdentifyItem.mockResolvedValue(
      seededIdentification({
        category: "vinyl",
        name: "Miles Davis - Kind of Blue",
        year: 1959,
        objectType: "record",
        material: "vinyl",
        makerOrBrand: "Columbia",
        catalogNumber: "CL 1355",
        searchKeywords: ["miles", "davis", "kind", "blue", "columbia", "lp"],
      }),
    );

    const { ScanPipeline } = require("@/lib/scan/pipeline") as typeof import("@/lib/scan/pipeline");
    const sourceLines: string[] = [];
    const pipeline = new ScanPipeline({
      onProgress: (progress) => {
        if (progress.currentSearchSource) {
          sourceLines.push(progress.currentSearchSource);
        }
      },
    });

    await pipeline.executeScan(["file:///tmp/test.jpg"], "general");

    expect(sourceLines).toContain("Checking Discogs marketplace history");
  });

  it("keeps mystery scans on AI plus marketplace and auction cross-check messaging", async () => {
    mockIdentifyItem.mockResolvedValue(
      seededIdentification({
        category: "general",
        name: "Decorative Red Carved Box",
        year: null,
        objectType: "box",
        material: "lacquer",
        searchKeywords: ["decorative", "carved", "box"],
      }),
    );
    mockSearchComparableAuctions.mockResolvedValue([
      {
        id: "mystery-auction",
        title: "Decorative carved box",
        description: "Auction listing for a carved decorative box.",
        priceRealized: 42,
        saleDate: "2026-01-03",
        imageUrl: null,
        source: "heritage",
        category: "general",
        material: "lacquer",
        originCountry: "Unknown",
        auctionHouse: "Heritage",
        keywords: ["decorative", "carved", "box"],
      },
    ]);

    const { ScanPipeline } = require("@/lib/scan/pipeline") as typeof import("@/lib/scan/pipeline");
    const sourceLines: string[] = [];
    const pipeline = new ScanPipeline({
      onProgress: (progress) => {
        if (progress.currentSearchSource) {
          sourceLines.push(progress.currentSearchSource);
        }
      },
    });

    await pipeline.executeScan(["file:///tmp/test.jpg"], "general", "mystery");

    expect(sourceLines).toEqual(
      expect.arrayContaining([
        "Checking Gemini AI identification",
        "Searching recent marketplace sales",
        "Cross-checking auction records",
      ]),
    );
    expect(sourceLines).not.toContain("Checking PCGS price guide");
    expect(sourceLines).not.toContain("Checking Discogs marketplace history");
  });
});
