jest.mock("firebase/firestore", () => ({
  collection: jest.fn(),
  orderBy: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
}));

jest.mock("@/lib/firebase/config", () => ({
  getVaultScopeDb: () => ({ projectId: "vault-93a7b" }),
}));

import { buildEnhancedSearchQuery, extractSearchKeywords } from "@/lib/firebase/utils";
import type { GeminiIdentifyResponse } from "@/lib/gemini/types";

function makeIdentification(overrides: Partial<GeminiIdentifyResponse> = {}): GeminiIdentifyResponse {
  return {
    category: "coin",
    name: "1921 Morgan Dollar",
    year: 1921,
    origin: "United States",
    objectType: "coin",
    material: "silver",
    makerOrBrand: null,
    catalogNumber: null,
    condition: "very_good",
    conditionRange: ["good", "fine"],
    historySummary: "Test summary.",
    confidence: 0.8,
    searchKeywords: ["morgan", "dollar", "1921", "silver", "ms63"],
    distinguishingFeatures: ["s mint mark", "cartwheel luster"],
    requiresMeasurements: false,
    requiresMorePhotos: false,
    isLikelyMassProduced: false,
    isLikelyReproduction: false,
    valuationWarnings: [],
    marketTier: "collector",
    pricingEvidenceStrength: "moderate",
    likelyRetailContext: "auction",
    likelyValueCeiling: 500,
    valuationConfidence: 0.7,
    descriptionTone: "neutral",
    estimatedValueLow: 100,
    estimatedValueHigh: 200,
    estimatedValueCurrency: "USD",
    estimatedValueRationale: "Test rationale.",
    pricingBasis: "Test rationale.",
    pricingConfidence: 0.7,
    isBullion: false,
    ...overrides,
  };
}

describe("search keyword generation", () => {
  it("keeps useful short identifiers while filtering generic marketplace noise", () => {
    expect(
      extractSearchKeywords("Old rare 1921 silver 1c ms63 nice collectible"),
    ).toEqual(["1921", "silver", "1c", "ms63"]);
  });

  it("builds enhanced coin keywords with specific identifiers", () => {
    const identification = makeIdentification();

    expect(buildEnhancedSearchQuery(identification)).toEqual(
      expect.arrayContaining(["morgan", "dollar", "1921", "silver", "ms63", "s"]),
    );
  });

  it("splits vinyl catalog numbers and preserves decade-style search terms", () => {
    const identification = makeIdentification({
      category: "vinyl",
      name: "Miles Davis - Kind of Blue",
      year: 1959,
      objectType: "record",
      material: "vinyl",
      makerOrBrand: "Columbia",
      catalogNumber: "CS 8163",
      searchKeywords: ["miles", "davis", "kind", "blue", "columbia", "lp"],
      distinguishingFeatures: ["6-eye columbia label"],
    });

    expect(buildEnhancedSearchQuery(identification)).toEqual(
      expect.arrayContaining(["miles", "davis", "columbia", "lp", "cs", "8163", "1959", "1950s"]),
    );
  });
});
