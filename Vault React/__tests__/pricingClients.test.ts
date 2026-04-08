import AsyncStorage from "@react-native-async-storage/async-storage";
import type { GeminiIdentifyResponse } from "@/lib/gemini/types";

const mockFetch = jest.fn();

function baseIdentification(overrides: Partial<GeminiIdentifyResponse> = {}): GeminiIdentifyResponse {
  return {
    category: "coin",
    name: "1921 Morgan Dollar",
    year: 1921,
    origin: "United States",
    objectType: "coin",
    material: "silver",
    makerOrBrand: null,
    catalogNumber: null,
    condition: "good",
    conditionRange: ["good", "very_good"],
    historySummary: "Verification fixture.",
    confidence: 0.6,
    searchKeywords: ["morgan", "dollar", "1921", "silver"],
    distinguishingFeatures: ["s mint mark"],
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

describe("pricing clients", () => {
  beforeEach(() => {
    jest.resetModules();
    mockFetch.mockReset();
    (AsyncStorage.clear as jest.Mock).mockClear?.();
    void AsyncStorage.clear();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  function mockConfig() {
    jest.doMock("@/constants/Config", () => ({
      AppConfig: {
        discogsToken: "discogs-token",
        metalsApiKey: "metals-key",
        pcgs: {
          username: "pcgs-user",
          password: "pcgs-pass",
          email: "pcgs@example.com",
        },
      },
    }));
  }

  it("falls back from Discogs price suggestions to marketplace stats on 404 seller-settings errors and returns null if stats also fail", async () => {
    mockConfig();
    const { DiscogsClient } = require("@/src/services/pricing/DiscogsClient") as typeof import("@/src/services/pricing/DiscogsClient");
    const client = new DiscogsClient();

    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => '{"message":"You must fill out your seller settings first."}',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          lowest_price: {
            value: 210,
            currency: "USD",
          },
        }),
      });

    const pricing = await client.getPriceSuggestions(1577);

    expect(pricing?.byCondition["Good Plus (G+)"]?.value).toBe(210);
    expect(mockFetch.mock.calls[0][0]).toContain("/marketplace/price_suggestions/1577");
    expect(mockFetch.mock.calls[1][0]).toContain("/marketplace/stats/1577");

    mockFetch
      .mockReset()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => '{"message":"You must fill out your seller settings first."}',
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "No stats",
      });
    await AsyncStorage.removeItem("discogs_release_1578");

    await expect(client.getPriceSuggestions(1578)).resolves.toBeNull();
  });

  it("caches PCGS tokens and retries once on 401 before succeeding", async () => {
    mockConfig();
    const { PCGSClient } = require("@/src/services/pricing/PCGSClient") as typeof import("@/src/services/pricing/PCGSClient");
    const client = new PCGSClient();

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ token: "token-1" }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ token: "token-2" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          Results: [
            {
              PCGSNo: 7296,
              Name: "1921-S Morgan Dollar",
              Denomination: "Morgan Dollar",
              Year: 1921,
              MintMark: "S",
              PriceGuideValues: { F12: 35, VF20: 45, MS63: 95 },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          Results: [
            {
              PCGSNo: 7300,
              Name: "1922 Peace Dollar",
              Denomination: "Peace Dollar",
              Year: 1922,
              MintMark: "",
              PriceGuideValues: { F12: 30, VF20: 40, MS63: 80 },
            },
          ],
        }),
      });

    const first = await client.lookupCoin({
      year: 1921,
      denomination: "Morgan Dollar",
      mintMark: "S",
    });
    const second = await client.lookupCoin({
      year: 1922,
      denomination: "Peace Dollar",
    });

    expect(first?.coinName).toContain("1921-S Morgan Dollar");
    expect(second?.coinName).toContain("1922 Peace Dollar");
    expect(mockFetch.mock.calls[0][0]).toContain("/account/authenticate");
    expect(mockFetch.mock.calls[2][0]).toContain("/account/authenticate");
    expect(mockFetch.mock.calls[4][0]).toContain("/coindetail/GetCoinFactsListing");
    expect(mockFetch).toHaveBeenCalledTimes(5);
  });

  it("caches metal spot prices for one hour under metals_spot_prices", async () => {
    mockConfig();
    const { MetalsClient } = require("@/src/services/pricing/MetalsClient") as typeof import("@/src/services/pricing/MetalsClient");
    const client = new MetalsClient();

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        rates: {
          XAU: 0.00045,
          XAG: 0.032,
          XPT: 0.0009,
          XPD: 0.0007,
        },
        timestamp: 1_774_000_000,
      }),
    });

    const first = await client.getSpotPrices();
    const second = await client.getSpotPrices();
    const cachedRaw = await AsyncStorage.getItem("metals_spot_prices");

    expect(first.XAG).toBeGreaterThan(0);
    expect(second).toEqual(first);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(cachedRaw).toContain("XAU");
  });
});
