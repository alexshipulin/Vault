import type { GeminiIdentifyResponse } from "@/lib/gemini/types";
import { AppConfig } from "@/constants/Config";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface EBaySearchParams {
  keywords: string;
  category?: string;
  limit?: number;
}

export interface EBayListing {
  itemId: string;
  title: string;
  price: number;
  currency: string;
  itemUrl: string;
  imageUrl?: string;
  condition?: string;
}

export interface EBayPriceResult {
  recommendedLow: number | null;
  recommendedHigh: number | null;
  listings: EBayListing[];
  confidenceLevel: "high" | "medium" | "low";
  fetchedAt: string;
}

type EBayOAuthResponse = {
  access_token?: string;
  expires_in?: number;
};

type EBaySearchResponse = {
  itemSummaries?: Array<{
    itemId?: string;
    title?: string;
    itemWebUrl?: string;
    condition?: string;
    image?: {
      imageUrl?: string;
    };
    price?: {
      value?: string | number;
      currency?: string;
    };
  }>;
};

const EBAY_OAUTH_SCOPE = "https://api.ebay.com/oauth/api_scope";
const EBAY_OAUTH_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const EBAY_MARKETPLACE_ID = "EBAY_US";
const EBAY_OAUTH_TIMEOUT_MS = 12_000;
const EBAY_SEARCH_TIMEOUT_MS = 12_000;
const EBAY_NETWORK_RETRY_ATTEMPTS = 3;
const EBAY_NETWORK_RETRY_DELAY_MS = 450;
const EBAY_TOKEN_CACHE_KEY = "vaultscope:ebay:oauth-token";
const EBAY_STALE_TOKEN_GRACE_MS = 12 * 60 * 60 * 1000;

function parseNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function toBase64Ascii(value: string): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  let index = 0;

  while (index < value.length) {
    const byte1 = value.charCodeAt(index++) & 0xff;
    const byte2 = index < value.length ? value.charCodeAt(index++) & 0xff : Number.NaN;
    const byte3 = index < value.length ? value.charCodeAt(index++) & 0xff : Number.NaN;

    const enc1 = byte1 >> 2;
    const enc2 = ((byte1 & 3) << 4) | (Number.isNaN(byte2) ? 0 : (byte2 >> 4));
    const enc3 = Number.isNaN(byte2) ? 64 : (((byte2 & 15) << 2) | (Number.isNaN(byte3) ? 0 : (byte3 >> 6)));
    const enc4 = Number.isNaN(byte3) ? 64 : (byte3 & 63);

    output += chars.charAt(enc1);
    output += chars.charAt(enc2);
    output += enc3 === 64 ? "=" : chars.charAt(enc3);
    output += enc4 === 64 ? "=" : chars.charAt(enc4);
  }

  return output;
}

function normalizeCategoryKey(value: string): string {
  return value.trim().toLowerCase();
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
  requestLabel: string,
): Promise<Response> {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = setTimeout(() => {
    controller?.abort();
  }, timeoutMs);

  try {
    const response = await fetch(input, {
      ...init,
      signal: controller?.signal,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`${requestLabel} timed out after ${timeoutMs}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function shouldRetryNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("timed out") ||
    message.includes("network request failed") ||
    message.includes("network error") ||
    error.name === "TypeError"
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function retryOnTransientNetworkError<T>(
  operation: () => Promise<T>,
  attempts: number,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const canRetry = attempt < attempts && shouldRetryNetworkError(error);
      if (!canRetry) {
        throw error;
      }
      await delay(EBAY_NETWORK_RETRY_DELAY_MS * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unknown eBay network error.");
}

export class EBayClient {
  private readonly baseURL = "https://api.ebay.com/buy/browse/v1";
  private token: string | null = null;
  private tokenExpiry = 0;
  private staleToken: string | null = null;
  private staleTokenExpiry = 0;
  private loadedTokenFromStorage = false;
  private lastFailureReason: string | null = null;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly campaignId?: string,
  ) {}

  private async hydrateTokenFromStorage(): Promise<void> {
    if (this.loadedTokenFromStorage) {
      return;
    }

    this.loadedTokenFromStorage = true;
    try {
      const raw = await AsyncStorage.getItem(EBAY_TOKEN_CACHE_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as { token?: unknown; expiresAt?: unknown };
      if (typeof parsed.token !== "string" || typeof parsed.expiresAt !== "number") {
        await AsyncStorage.removeItem(EBAY_TOKEN_CACHE_KEY);
        return;
      }

      if (parsed.expiresAt <= Date.now()) {
        const staleAgeMs = Date.now() - parsed.expiresAt;
        if (staleAgeMs <= EBAY_STALE_TOKEN_GRACE_MS) {
          this.staleToken = parsed.token;
          this.staleTokenExpiry = parsed.expiresAt;
        } else {
          await AsyncStorage.removeItem(EBAY_TOKEN_CACHE_KEY);
        }
        return;
      }

      this.token = parsed.token;
      this.tokenExpiry = parsed.expiresAt;
      this.staleToken = parsed.token;
      this.staleTokenExpiry = parsed.expiresAt;
    } catch {
      await AsyncStorage.removeItem(EBAY_TOKEN_CACHE_KEY);
    }
  }

  private async persistToken(token: string, expiresAt: number): Promise<void> {
    try {
      await AsyncStorage.setItem(
        EBAY_TOKEN_CACHE_KEY,
        JSON.stringify({
          token,
          expiresAt,
        }),
      );
    } catch {
      // Ignore cache persistence errors; runtime token is still available.
    }
  }

  private async clearTokenCache(): Promise<void> {
    this.token = null;
    this.tokenExpiry = 0;
    this.staleToken = null;
    this.staleTokenExpiry = 0;
    try {
      await AsyncStorage.removeItem(EBAY_TOKEN_CACHE_KEY);
    } catch {
      // Ignore cache cleanup failures.
    }
  }

  private async getAccessToken(): Promise<string> {
    await this.hydrateTokenFromStorage();

    if (this.token && Date.now() < this.tokenExpiry) {
      return this.token;
    }

    if (!this.clientId.trim() || !this.clientSecret.trim()) {
      throw new Error("eBay client credentials are missing.");
    }

    const credentials = toBase64Ascii(`${this.clientId}:${this.clientSecret}`);
    let response: Response;
    try {
      response = await retryOnTransientNetworkError(
        () =>
          fetchWithTimeout(EBAY_OAUTH_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Authorization: `Basic ${credentials}`,
            },
            body: `grant_type=client_credentials&scope=${encodeURIComponent(EBAY_OAUTH_SCOPE)}`,
          }, EBAY_OAUTH_TIMEOUT_MS, "eBay OAuth request"),
        EBAY_NETWORK_RETRY_ATTEMPTS,
      );
    } catch (error) {
      if (this.staleToken && Date.now() - this.staleTokenExpiry <= EBAY_STALE_TOKEN_GRACE_MS) {
        console.warn(
          "[eBay] OAuth is temporarily unavailable. Falling back to cached token for this attempt.",
        );
        this.token = this.staleToken;
        return this.staleToken;
      }

      throw error;
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`eBay OAuth failed: ${response.status} - ${errorText.slice(0, 300)}`);
    }

    const data = (await response.json()) as EBayOAuthResponse;
    if (!data.access_token || typeof data.expires_in !== "number") {
      throw new Error("eBay OAuth response is missing access token.");
    }

    this.token = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60_000;
    this.staleToken = this.token;
    this.staleTokenExpiry = this.tokenExpiry;
    await this.persistToken(this.token, this.tokenExpiry);

    return this.token;
  }

  private async runSearchRequest(
    token: string,
    params: EBaySearchParams,
    includeCategoryFilter: boolean,
  ): Promise<Response> {
    const queryParams = new URLSearchParams({
      q: params.keywords,
      limit: String(Math.max(1, Math.min(params.limit ?? 20, 200))),
      filter: "buyingOptions:{FIXED_PRICE|AUCTION},itemLocationCountry:US",
    });

    if (includeCategoryFilter && params.category) {
      queryParams.append("category_ids", this.getCategoryId(params.category));
    }

    return retryOnTransientNetworkError(
      () =>
        fetchWithTimeout(`${this.baseURL}/item_summary/search?${queryParams.toString()}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "X-EBAY-C-MARKETPLACE-ID": EBAY_MARKETPLACE_ID,
          },
        }, EBAY_SEARCH_TIMEOUT_MS, "eBay search request"),
      EBAY_NETWORK_RETRY_ATTEMPTS,
    );
  }

  private parseSearchResponse(data: EBaySearchResponse): EBayListing[] {
    const summaries = data.itemSummaries ?? [];

    return summaries
      .map((item): EBayListing | null => {
        if (!item.itemId || !item.title || !item.itemWebUrl) {
          return null;
        }

        return {
          itemId: item.itemId,
          title: item.title,
          price: parseNumber(item.price?.value),
          currency: item.price?.currency ?? "USD",
          itemUrl: this.addAffiliateParams(item.itemWebUrl),
          imageUrl: item.image?.imageUrl,
          condition: item.condition,
        };
      })
      .filter((item): item is EBayListing => item !== null);
  }

  async searchItems(params: EBaySearchParams): Promise<EBayListing[]> {
    try {
      this.lastFailureReason = null;
      let token = await this.getAccessToken();
      let response = await this.runSearchRequest(token, params, true);

      if (response.status === 401) {
        await this.clearTokenCache();
        token = await this.getAccessToken();
        response = await this.runSearchRequest(token, params, true);
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`eBay search unavailable: status=${response.status} body=${errorText.slice(0, 240)}`);
        this.lastFailureReason = `eBay search failed (${response.status})`;
        return [];
      }

      const primaryData = (await response.json()) as EBaySearchResponse;
      let items = this.parseSearchResponse(primaryData);

      if (items.length === 0 && params.category) {
        const broadResponse = await this.runSearchRequest(token, params, false);
        if (broadResponse.ok) {
          const broadData = (await broadResponse.json()) as EBaySearchResponse;
          items = this.parseSearchResponse(broadData);
        }
      }

      return items;
    } catch (error) {
      console.warn("eBay searchItems fallback to empty results:", error);
      this.lastFailureReason = error instanceof Error ? error.message : "Unknown eBay lookup failure.";
      return [];
    }
  }

  private getCategoryId(category: string): string {
    const normalized = normalizeCategoryKey(category);
    const map: Record<string, string> = {
      coin: "11116",
      coins: "11116",
      vinyl: "176985",
      record: "176985",
      records: "176985",
      antique: "20081",
      antiques: "20081",
      card: "212",
      cards: "212",
    };

    return map[normalized] ?? "20081";
  }

  private addAffiliateParams(url: string): string {
    if (!this.campaignId) {
      return url;
    }

    try {
      const parsed = new URL(url);
      parsed.searchParams.set("campid", this.campaignId);
      parsed.searchParams.set("toolid", "10001");
      return parsed.toString();
    } catch {
      return url;
    }
  }

  async getPriceRange(identification: GeminiIdentifyResponse): Promise<EBayPriceResult | null> {
    const keywords = [identification.name, identification.year, identification.category]
      .filter((value): value is string | number => value != null && String(value).trim().length > 0)
      .join(" ")
      .slice(0, 100);

    if (!keywords) {
      return null;
    }

    const items = await this.searchItems({
      keywords,
      category: identification.category ?? undefined,
      limit: 50,
    });

    if (items.length === 0) {
      return null;
    }

    const prices = items
      .map((item) => item.price)
      .filter((price) => Number.isFinite(price) && price > 0)
      .sort((left, right) => left - right);

    if (prices.length === 0) {
      return null;
    }

    const q1Index = Math.floor(prices.length * 0.25);
    const q3Index = Math.floor(prices.length * 0.75);
    const q1 = prices[q1Index] ?? prices[0];
    const q3 = prices[q3Index] ?? prices[prices.length - 1];
    const iqr = q3 - q1;
    const lowerBound = q1 - (1.5 * iqr);
    const upperBound = q3 + (1.5 * iqr);

    const filtered = prices.filter((price) => price >= lowerBound && price <= upperBound);
    if (filtered.length === 0) {
      return null;
    }

    const confidenceLevel: EBayPriceResult["confidenceLevel"] =
      filtered.length >= 20 ? "high" : filtered.length >= 10 ? "medium" : "low";

    return {
      recommendedLow: filtered[0] ?? null,
      recommendedHigh: filtered[filtered.length - 1] ?? null,
      listings: items.slice(0, 10),
      confidenceLevel,
      fetchedAt: new Date().toISOString(),
    };
  }

  async safeLookup(identification: GeminiIdentifyResponse): Promise<EBayPriceResult | null> {
    try {
      this.lastFailureReason = null;
      return await this.getPriceRange(identification);
    } catch (error) {
      console.warn("eBay safeLookup fallback to null:", error);
      this.lastFailureReason = error instanceof Error ? error.message : "Unknown eBay lookup failure.";
      return null;
    }
  }

  consumeLastFailureReason(): string | null {
    const reason = this.lastFailureReason;
    this.lastFailureReason = null;
    return reason;
  }
}

let ebayClientInstance: EBayClient | null = null;

export let ebayClient: EBayClient | null =
  AppConfig.ebay?.clientId && AppConfig.ebay?.clientSecret
    ? getEBayClient(AppConfig.ebay.clientId, AppConfig.ebay.clientSecret, AppConfig.ebay.campaignId)
    : null;

export function getEBayClient(clientId: string, clientSecret: string, campaignId?: string): EBayClient {
  if (!ebayClientInstance) {
    ebayClientInstance = new EBayClient(clientId, clientSecret, campaignId);
  }

  ebayClient = ebayClientInstance;
  return ebayClientInstance;
}

export function resetEBayClientForTests(): void {
  ebayClientInstance = null;
  ebayClient = null;
}

export function getCachedEBayClient(): EBayClient | null {
  return ebayClientInstance;
}
