jest.mock("@/constants/Config", () => ({
  AppConfig: {
    geminiApiKey: "test-gemini-key",
    geminiModel: undefined,
  },
}));

jest.mock("@/lib/gemini/cache", () => ({
  getCachedIdentification: jest.fn(async () => null),
  setCachedIdentification: jest.fn(async () => undefined),
}));

const mockFetch = jest.fn();

function makeIdentifyPayload(overrides: Record<string, unknown> = {}) {
  return {
    category: "decorative vase",
    name: "Decorative Vase",
    year: null,
    origin: null,
    objectType: "vase",
    material: "ceramic",
    makerOrBrand: null,
    condition: "good",
    conditionRange: ["good", "very_good"],
    historySummary: "Likely a common decorative household vase. Missing base mark detail.",
    confidence: 0.61,
    searchKeywords: ["decorative", "vase"],
    distinguishingFeatures: ["glazed ceramic body"],
    requiresMeasurements: true,
    requiresMorePhotos: false,
    isLikelyMassProduced: true,
    isLikelyReproduction: false,
    valuationWarnings: ["No maker mark was visible."],
    marketTier: "decor",
    pricingEvidenceStrength: "weak",
    likelyRetailContext: "flea_market",
    likelyValueCeiling: 80,
    valuationConfidence: 0.24,
    descriptionTone: "skeptical",
    estimatedValueLow: 15,
    estimatedValueHigh: 35,
    pricingBasis: "Common decor item without clear maker evidence.",
    pricingConfidence: 0.24,
    isBullion: false,
    estimatedValueCurrency: "USD",
    estimatedValueRationale: "Common decor item without clear maker evidence.",
    ...overrides,
  };
}

function makeFetchResponse(text: string, ok = true, status = 200) {
  return {
    ok,
    status,
    text: async () => text,
  };
}

function makeGeminiEnvelope(payload: Record<string, unknown>) {
  return JSON.stringify({
    candidates: [
      {
        content: {
          parts: [
            {
              text: JSON.stringify(payload),
            },
          ],
        },
      },
    ],
    usageMetadata: {
      promptTokenCount: 10,
      candidatesTokenCount: 20,
      totalTokenCount: 30,
    },
  });
}

function makeInvalidEnvelope(partialText: string) {
  return JSON.stringify({
    candidates: [
      {
        content: {
          parts: [
            {
              text: partialText,
            },
          ],
        },
      },
    ],
    usageMetadata: {
      promptTokenCount: 10,
      candidatesTokenCount: 20,
      totalTokenCount: 30,
    },
  });
}

describe("GeminiClient", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it("retries once on the same model when the response contains truncated JSON", async () => {
    mockFetch
      .mockResolvedValueOnce(
        makeFetchResponse(
          makeInvalidEnvelope('{"category":"decorative vase","name":"Decorative Vase"'),
        ),
      )
      .mockResolvedValueOnce(
        makeFetchResponse(
          makeGeminiEnvelope(
            makeIdentifyPayload({
              historySummary:
                "Likely a common decorative household vase. The shape suggests a later decorative piece.",
            }),
          ),
        ),
      );

    const { GeminiClient } = require("@/lib/gemini/client") as typeof import("@/lib/gemini/client");
    const client = new GeminiClient({
      apiKey: "test-gemini-key",
      identifyModels: ["gemini-2.0-flash"],
      rateLimiter: { schedule: (task: () => Promise<unknown>) => task() } as never,
    });

    const result = await client.identifyItem(["ZmFrZS1pbWFnZQ=="], "general", undefined, "mystery");

    expect(result.name).toBe("Decorative Vase");
    expect(result.historySummary).toBe(
      "Likely a common decorative household vase. The shape suggests a later decorative piece.",
    );
    expect(result.pricingBasis).toBe("Common decor item without clear maker evidence.");
    expect(result.pricingConfidence).toBe(0.24);
    expect(result.isBullion).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0]?.[0]).toContain("/models/gemini-2.0-flash:generateContent");
    expect(mockFetch.mock.calls[1]?.[0]).toContain("/models/gemini-2.0-flash:generateContent");
  });

  it("falls back to the next supported model when the preferred model is unavailable", async () => {
    mockFetch
      .mockResolvedValueOnce(
        makeFetchResponse(
          JSON.stringify({
            error: {
              code: 404,
              message:
                "models/bad-model is not found for API version v1beta, or is not supported for generateContent.",
              status: "NOT_FOUND",
            },
          }),
          false,
          404,
        ),
      )
      .mockResolvedValueOnce(makeFetchResponse(makeGeminiEnvelope(makeIdentifyPayload())));

    const { GeminiClient } = require("@/lib/gemini/client") as typeof import("@/lib/gemini/client");
    const client = new GeminiClient({
      apiKey: "test-gemini-key",
      identifyModels: ["bad-model", "gemini-2.0-flash"],
      rateLimiter: { schedule: (task: () => Promise<unknown>) => task() } as never,
    });

    const result = await client.identifyItem(["ZmFrZS1pbWFnZQ=="], "general", undefined, "mystery");

    expect(result.name).toBe("Decorative Vase");
    expect(result.marketTier).toBe("decor");
    expect(result.valuationConfidence).toBe(0.24);
    expect(result.pricingConfidence).toBe(0.24);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0]?.[0]).toContain("/models/bad-model:generateContent");
    expect(mockFetch.mock.calls[1]?.[0]).toContain("/models/gemini-2.0-flash:generateContent");
  });

  it("falls back to the next model when repair on the primary model still returns invalid JSON", async () => {
    mockFetch
      .mockResolvedValueOnce(
        makeFetchResponse(
          makeInvalidEnvelope('{"category":"decorative vase","name":"Decorative Vase"'),
        ),
      )
      .mockResolvedValueOnce(
        makeFetchResponse(
          makeInvalidEnvelope('{"category":"decorative vase","name":"Decorative Vase","year":'),
        ),
      )
      .mockResolvedValueOnce(makeFetchResponse(makeGeminiEnvelope(makeIdentifyPayload())));

    const { GeminiClient } = require("@/lib/gemini/client") as typeof import("@/lib/gemini/client");
    const client = new GeminiClient({
      apiKey: "test-gemini-key",
      identifyModels: ["gemini-2.0-flash", "gemini-1.5-flash"],
      rateLimiter: { schedule: (task: () => Promise<unknown>) => task() } as never,
    });

    const result = await client.identifyItem(["ZmFrZS1pbWFnZQ=="], "general", undefined, "mystery");

    expect(result.name).toBe("Decorative Vase");
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch.mock.calls[2]?.[0]).toContain("/models/gemini-1.5-flash:generateContent");
  });

  it("throws a typed invalid-json error when all models fail to return valid JSON", async () => {
    mockFetch
      .mockResolvedValueOnce(
        makeFetchResponse(
          makeInvalidEnvelope('{"category":"decorative vase","name":"Decorative Vase"'),
        ),
      )
      .mockResolvedValueOnce(
        makeFetchResponse(
          makeInvalidEnvelope('{"category":"decorative vase","name":"Decorative Vase","year":'),
        ),
      )
      .mockResolvedValueOnce(
        makeFetchResponse(
          makeInvalidEnvelope('{"category":"decorative vase","name":"Decorative Vase"'),
        ),
      )
      .mockResolvedValueOnce(
        makeFetchResponse(
          makeInvalidEnvelope('{"category":"decorative vase","name":"Decorative Vase","year":'),
        ),
      );

    const { GeminiClient, GeminiInvalidJsonError } = require("@/lib/gemini/client") as typeof import("@/lib/gemini/client");
    const client = new GeminiClient({
      apiKey: "test-gemini-key",
      identifyModels: ["gemini-2.0-flash", "gemini-1.5-flash"],
      rateLimiter: { schedule: (task: () => Promise<unknown>) => task() } as never,
    });

    await expect(
      client.identifyItem(["ZmFrZS1pbWFnZQ=="], "general", undefined, "mystery"),
    ).rejects.toBeInstanceOf(GeminiInvalidJsonError);
  });
});
