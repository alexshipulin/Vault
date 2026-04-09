const mockSafeLookup = jest.fn();
const mockEstimateBullionValue = jest.fn();
const mockLookupVinyl = jest.fn();
const mockEbaySafeLookup = jest.fn();
const mockConsumeEbayFailureReason = jest.fn();

jest.mock("@/src/services/pricing/PCGSClient", () => ({
  pcgsClient: {
    safeLookup: (...args: unknown[]) => mockSafeLookup(...args),
  },
}));

jest.mock("@/src/services/pricing/MetalsClient", () => ({
  metalsClient: {
    estimateBullionValue: (...args: unknown[]) => mockEstimateBullionValue(...args),
  },
}));

jest.mock("@/src/services/pricing/DiscogsClient", () => ({
  discogsClient: {
    lookupVinyl: (...args: unknown[]) => mockLookupVinyl(...args),
  },
}));

jest.mock("@/src/services/pricing/EBayClient", () => ({
  ebayClient: {
    safeLookup: (...args: unknown[]) => mockEbaySafeLookup(...args),
    consumeLastFailureReason: () => mockConsumeEbayFailureReason(),
  },
}));

function makeIdentification(overrides: Record<string, unknown> = {}) {
  return {
    category: "coin",
    name: "1909-S VDB Lincoln Wheat Cent",
    year: 1909,
    origin: "United States",
    objectType: "coin",
    material: "copper",
    makerOrBrand: null,
    condition: "fine",
    conditionRange: ["good", "fine"],
    historySummary: "Historic key-date wheat cent.",
    confidence: 0.92,
    searchKeywords: ["1909", "vdb", "lincoln", "cent"],
    distinguishingFeatures: ["s mint mark", "vdb initials"],
    estimatedValueLow: 900,
    estimatedValueHigh: 1300,
    estimatedValueCurrency: "USD",
    estimatedValueRationale: "Collector demand remains strong.",
    pricingBasis: "Collector demand remains strong.",
    pricingConfidence: 0.86,
    isBullion: false,
    ...overrides,
  };
}

describe("priceRouter", () => {
  beforeEach(() => {
    mockSafeLookup.mockReset();
    mockEstimateBullionValue.mockReset();
    mockLookupVinyl.mockReset();
    mockEbaySafeLookup.mockReset();
    mockConsumeEbayFailureReason.mockReset();
    mockConsumeEbayFailureReason.mockReturnValue(null);
  });

  it("returns PCGS pricing for coin identifications when PCGS lookup succeeds", async () => {
    mockSafeLookup.mockResolvedValue({
      coinName: "1909-S VDB Lincoln Cent",
      pcgsNo: 2426,
      priceGuideValues: { F12: 950, VF20: 1250, MS63: 4200 },
      averageCirculatedValue: 1100,
      averageUncirculatedValue: 4200,
      source: "pcgs",
      fetchedAt: "2026-04-03T00:00:00.000Z",
    });

    const { getPricingForItem } = require("@/src/services/pricing/priceRouter") as typeof import("@/src/services/pricing/priceRouter");
    const result = await getPricingForItem(
      makeIdentification(),
      { low: 900, high: 1300, confidence: 0.86 },
      {
        firestoreEstimate: {
          low: 1000,
          high: 1400,
          currency: "USD",
          confidence: 0.82,
          source: "database",
        },
      },
    );

    expect(result.source).toBe("pcgs");
    expect(result.low).toBe(1100);
    expect(result.high).toBe(4200);
    expect(result.sourceLabel).toBe("PCGS Price Guide");
  });

  it("falls back to AI estimate for coins when PCGS returns null", async () => {
    mockSafeLookup.mockResolvedValue(null);
    mockEstimateBullionValue.mockResolvedValue(null);

    const { getPricingForItem } = require("@/src/services/pricing/priceRouter") as typeof import("@/src/services/pricing/priceRouter");
    const result = await getPricingForItem(
      makeIdentification(),
      { low: 45, high: 80, confidence: 0.42 },
      {
        firestoreEstimate: {
          low: 1000,
          high: 1400,
          currency: "USD",
          confidence: 0.82,
          source: "database",
        },
      },
    );

    expect(result.source).toBe("ai_estimate");
    expect(result.low).toBe(45);
    expect(result.high).toBe(80);
  });

  it("prefers Firestore comparables for antique/general items when confidence is high", async () => {
    const { getPricingForItem } = require("@/src/services/pricing/priceRouter") as typeof import("@/src/services/pricing/priceRouter");
    const result = await getPricingForItem(
      makeIdentification({
        category: "antique",
        name: "Stoneware Vase",
        year: null,
        objectType: "vase",
        estimatedValueLow: 15,
        estimatedValueHigh: 30,
        pricingConfidence: 0.28,
      }),
      { low: 15, high: 30, confidence: 0.28 },
      {
        firestoreEstimate: {
          low: 80,
          high: 120,
          currency: "USD",
          confidence: 0.66,
          valuationConfidence: 0.66,
          source: "database",
          sourceLabel: "Firestore Market Comparables",
        },
      },
    );

    expect(result.source).toBe("firestore");
    expect(result.low).toBe(80);
    expect(result.high).toBe(120);
  });

  it("falls back to AI estimate for antique/general items when Firestore confidence is weak", async () => {
    mockEbaySafeLookup.mockResolvedValue(null);
    mockConsumeEbayFailureReason.mockReturnValue("eBay OAuth request timed out after 12000ms");

    const { getPricingForItem } = require("@/src/services/pricing/priceRouter") as typeof import("@/src/services/pricing/priceRouter");
    const result = await getPricingForItem(
      makeIdentification({
        category: "general",
        name: "Decorative Trinket Box",
        year: null,
        objectType: "box",
      }),
      { low: 18, high: 35, confidence: 0.39 },
      {
        firestoreEstimate: {
          low: 120,
          high: 240,
          currency: "USD",
          confidence: 0.32,
          valuationConfidence: 0.32,
          source: "database",
          sourceLabel: "Weak Firestore Comparables",
        },
      },
    );

    expect(result.source).toBe("ai_estimate");
    expect(result.low).toBe(18);
    expect(result.high).toBe(35);
    expect(mockEbaySafeLookup).toHaveBeenCalled();
    expect(result.warnings).toContain(
      "eBay lookup unavailable: eBay OAuth request timed out after 12000ms",
    );
  });

  it("uses Discogs pricing for vinyl when a release match is found", async () => {
    mockLookupVinyl.mockResolvedValue({
      release: {
        id: 123,
        title: "Blue Train",
        artist: "John Coltrane",
        year: 1957,
        country: "US",
        label: "Blue Note",
        catno: "BLP 1577",
        format: "Vinyl, LP, Album, Mono",
      },
      pricing: {
        byCondition: {
          "Good Plus (G+)": { value: 180, currency: "USD" },
          "Very Good Plus (VG+)": { value: 390, currency: "USD" },
        },
        releaseId: 123,
        source: "discogs",
        fetchedAt: "2026-04-03T00:00:00.000Z",
      },
      recommendedLow: 180,
      recommendedHigh: 390,
      source: "discogs",
      confidenceLevel: "high",
    });

    const { getPricingForItem } = require("@/src/services/pricing/priceRouter") as typeof import("@/src/services/pricing/priceRouter");
    const result = await getPricingForItem(
      makeIdentification({
        category: "vinyl",
        name: "John Coltrane - Blue Train",
        year: 1957,
        catalogNumber: "BLP 1577",
      }),
      { low: 120, high: 240, confidence: 0.56 },
    );

    expect(result.source).toBe("discogs");
    expect(result.low).toBe(180);
    expect(result.high).toBe(390);
    expect(result.sourceLabel).toContain("Discogs Marketplace");
  });

  it("falls back to AI estimate for vinyl when Discogs returns null", async () => {
    mockLookupVinyl.mockResolvedValue(null);
    mockEbaySafeLookup.mockResolvedValue(null);

    const { getPricingForItem } = require("@/src/services/pricing/priceRouter") as typeof import("@/src/services/pricing/priceRouter");
    const result = await getPricingForItem(
      makeIdentification({
        category: "vinyl",
        name: "Unknown Jazz LP",
        year: 1962,
        catalogNumber: null,
      }),
      { low: 22, high: 45, confidence: 0.34 },
    );

    expect(result.source).toBe("ai_estimate");
    expect(result.low).toBe(22);
    expect(result.high).toBe(45);
    expect(mockEbaySafeLookup).toHaveBeenCalled();
  });

  it("uses eBay pricing for antique/general items when Firestore is weak and eBay returns listings", async () => {
    mockEbaySafeLookup.mockResolvedValue({
      recommendedLow: 34,
      recommendedHigh: 52,
      confidenceLevel: "medium",
      fetchedAt: "2026-04-08T00:00:00.000Z",
      listings: [
        {
          itemId: "ebay-1",
          title: "Carved dragon trinket box",
          price: 44,
          currency: "USD",
          itemUrl: "https://www.ebay.com/itm/ebay-1",
        },
      ],
    });

    const { getPricingForItem } = require("@/src/services/pricing/priceRouter") as typeof import("@/src/services/pricing/priceRouter");
    const result = await getPricingForItem(
      makeIdentification({
        category: "antique",
        name: "Dragon Carving Box",
        year: null,
      }),
      { low: 20, high: 40, confidence: 0.3 },
      {
        firestoreEstimate: {
          low: 90,
          high: 180,
          currency: "USD",
          confidence: 0.2,
          valuationConfidence: 0.2,
          source: "database",
        },
      },
    );

    expect(result.source).toBe("ebay");
    expect(result.low).toBe(34);
    expect(result.high).toBe(52);
    expect(result.sourceLabel).toBe("eBay Active Listings");
  });

  it("uses bullion spot pricing when Gemini flags the coin as bullion and PCGS does not exceed melt-based value", async () => {
    mockSafeLookup.mockResolvedValue({
      coinName: "American Silver Eagle",
      pcgsNo: 9807,
      priceGuideValues: { MS69: 38, MS70: 45 },
      averageCirculatedValue: 35,
      averageUncirculatedValue: 45,
      source: "pcgs",
      fetchedAt: "2026-04-03T00:00:00.000Z",
    });
    mockEstimateBullionValue.mockResolvedValue({
      metalContent: { metal: "silver", troyOz: 1 },
      spotValue: 42,
      estimatedLow: 39.9,
      estimatedHigh: 48.3,
      spotPrice: 42,
      source: "metals_api",
    });

    const { getPricingForItem } = require("@/src/services/pricing/priceRouter") as typeof import("@/src/services/pricing/priceRouter");
    const result = await getPricingForItem(
      makeIdentification({
        name: "American Silver Eagle",
        isBullion: true,
      }),
      { low: 36, high: 50, confidence: 0.62 },
    );

    expect(result.source).toBe("metals");
    expect(result.sourceLabel).toContain("silver spot price ($42/oz)");
    expect(result.low).toBe(39.9);
    expect(result.high).toBe(48.3);
  });

  it("prefers PCGS over bullion spot pricing when collector premium is higher", async () => {
    mockSafeLookup.mockResolvedValue({
      coinName: "American Gold Eagle",
      pcgsNo: 9800,
      priceGuideValues: { MS69: 3300, MS70: 3600 },
      averageCirculatedValue: 3200,
      averageUncirculatedValue: 3600,
      source: "pcgs",
      fetchedAt: "2026-04-03T00:00:00.000Z",
    });
    mockEstimateBullionValue.mockResolvedValue({
      metalContent: { metal: "gold", troyOz: 1 },
      spotValue: 2900,
      estimatedLow: 2755,
      estimatedHigh: 3335,
      spotPrice: 2900,
      source: "metals_api",
    });

    const { getPricingForItem } = require("@/src/services/pricing/priceRouter") as typeof import("@/src/services/pricing/priceRouter");
    const result = await getPricingForItem(
      makeIdentification({
        name: "American Gold Eagle 1oz",
        isBullion: true,
      }),
      { low: 2800, high: 3200, confidence: 0.75 },
    );

    expect(result.source).toBe("pcgs");
    expect(result.sourceLabel).toBe("PCGS Price Guide");
  });
});
