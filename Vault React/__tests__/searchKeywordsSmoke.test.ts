jest.mock("firebase/firestore", () => ({
  collection: jest.fn(),
  orderBy: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
}));

jest.mock("@/lib/firebase/config", () => ({
  getVaultScopeDb: () => ({ projectId: "vault-93a7b" }),
}));

import { buildEnhancedSearchQuery } from "@/lib/firebase/utils";
import type { GeminiIdentifyResponse } from "@/lib/gemini/types";

const SHORT_MINT_MARK_EXCEPTIONS = new Set(["s", "d", "p", "o"]);
const GENERIC_FILLER_TERMS = new Set(["old", "rare", "antique", "nice", "vintage"]);

function makeBaseIdentification(
  overrides: Partial<GeminiIdentifyResponse>,
): GeminiIdentifyResponse {
  return {
    category: "general",
    name: "Unknown item",
    year: null,
    origin: null,
    objectType: null,
    material: null,
    makerOrBrand: null,
    catalogNumber: null,
    condition: "good",
    conditionRange: ["good", "good"],
    historySummary: "Smoke test item.",
    confidence: 0.5,
    searchKeywords: [],
    distinguishingFeatures: [],
    requiresMeasurements: false,
    requiresMorePhotos: false,
    isLikelyMassProduced: false,
    isLikelyReproduction: false,
    valuationWarnings: [],
    marketTier: "secondary",
    pricingEvidenceStrength: "weak",
    likelyRetailContext: "auction",
    likelyValueCeiling: null,
    valuationConfidence: 0.4,
    descriptionTone: "neutral",
    estimatedValueLow: null,
    estimatedValueHigh: null,
    estimatedValueCurrency: "USD",
    estimatedValueRationale: null,
    pricingBasis: null,
    pricingConfidence: null,
    isBullion: false,
    ...overrides,
  };
}

describe("buildEnhancedSearchQuery smoke test", () => {
  it.each([
    [
      "coin",
      makeBaseIdentification({
        category: "coin",
        name: "Morgan Dollar",
        year: 1921,
        objectType: "coin",
        material: "silver",
        searchKeywords: ["morgan", "dollar", "1921", "silver"],
        distinguishingFeatures: ["s mint mark", "cartwheel luster"],
      }),
    ],
    [
      "bullion coin",
      makeBaseIdentification({
        category: "coin",
        name: "American Silver Eagle",
        year: 2020,
        objectType: "coin",
        material: "silver",
        searchKeywords: ["american", "silver", "eagle", "2020", "1oz"],
        isBullion: true,
      }),
    ],
    [
      "vinyl",
      makeBaseIdentification({
        category: "vinyl",
        name: "Miles Davis - Kind of Blue",
        year: 1959,
        objectType: "record",
        material: "vinyl",
        makerOrBrand: "Columbia",
        catalogNumber: "CL 1355",
        searchKeywords: ["miles", "davis", "kind", "blue", "columbia", "lp"],
      }),
    ],
  ])("generates bounded unique keywords for %s", (label, identification) => {
    const keywords = buildEnhancedSearchQuery(identification);
    console.log(`[smoke:${label}]`, keywords);

    expect(keywords.length).toBeLessThanOrEqual(10);
    expect(new Set(keywords).size).toBe(keywords.length);
    expect(
      keywords.every((keyword) => keyword.length >= 2 || SHORT_MINT_MARK_EXCEPTIONS.has(keyword)),
    ).toBe(true);
    expect(keywords.some((keyword) => GENERIC_FILLER_TERMS.has(keyword))).toBe(false);
  });
});
