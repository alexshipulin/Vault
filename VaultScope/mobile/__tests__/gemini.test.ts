const mockGetCachedIdentification = jest.fn();
const mockSetCachedIdentification = jest.fn();

jest.mock("@/lib/gemini/cache", () => ({
  getCachedIdentification: (...args: unknown[]) => mockGetCachedIdentification(...args),
  setCachedIdentification: (...args: unknown[]) => mockSetCachedIdentification(...args),
}));

import { GeminiClient } from "@/lib/gemini/client";

describe("GeminiClient", () => {
  beforeEach(() => {
    mockGetCachedIdentification.mockResolvedValue(null);
    mockSetCachedIdentification.mockResolvedValue(undefined);
    (global.fetch as jest.Mock).mockReset();
  });

  it("returns cached identification results without hitting the network", async () => {
    mockGetCachedIdentification.mockResolvedValue({
      category: "antique",
      name: "Cached item",
      year: 1900,
      origin: "France",
      condition: "good",
      conditionRange: ["good", "fine"],
      historySummary: "Cached response.",
      confidence: 0.72,
      searchKeywords: ["cached item"],
      distinguishingFeatures: ["patina"],
    });

    const client = new GeminiClient({ apiKey: "test-key" });
    const result = await client.identifyItem(["data:image/jpeg;base64,abc"], "antique");

    expect(result.name).toBe("Cached item");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("retries failed identify calls and parses the structured response", async () => {
    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error("network-down"))
      .mockRejectedValueOnce(new Error("still-down"))
      .mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        category: "antique",
                        name: "Victorian side chair",
                        year: 1880,
                        origin: "England",
                        condition: "very_good",
                        conditionRange: ["good", "fine"],
                        historySummary: "Likely part of a late Victorian dining suite.",
                        confidence: 0.88,
                        searchKeywords: ["victorian chair", "mahogany side chair"],
                        distinguishingFeatures: ["balloon back", "turned legs"],
                      }),
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
          }),
      });

    const client = new GeminiClient({ apiKey: "test-key" });
    const result = await client.identifyItem(["data:image/jpeg;base64,abc"], "antique");

    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(result.name).toBe("Victorian side chair");
    expect(result.searchKeywords).toEqual(["victorian chair", "mahogany side chair"]);
    expect(mockSetCachedIdentification).toHaveBeenCalled();
  });

  it("generates embeddings from text content", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          embedding: {
            values: [0.1, 0.2, 0.3],
          },
        }),
    });

    const client = new GeminiClient({ apiKey: "test-key" });
    const result = await client.generateEmbedding("victorian side chair");

    expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
  });
});
