import AsyncStorage from "@react-native-async-storage/async-storage";

import { AppConfig } from "@/constants/Config";
import { GeminiRateLimiter } from "@/lib/gemini/rate-limiter";
import type { GeminiIdentifyResponse } from "@/lib/gemini/types";

const DISCOGS_API_BASE = "https://api.discogs.com";
const DISCOGS_USER_AGENT = "VaultScope/1.0 +https://vaultscope.app";
const DISCOGS_PRICING_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const DISCOGS_PRICING_CACHE_KEY_PREFIX = "discogs_release_";
const DISCOGS_REQUEST_TIMEOUT_MS = 8_000;
const discogsRateLimiter = new GeminiRateLimiter(60, 60_000);

type CachedValue<T> = {
  value: T;
  expiresAt: string;
};

type DiscogsSearchResponse = {
  results?: DiscogsSearchResult[];
};

type DiscogsSearchResult = {
  id?: number;
  title?: string;
  year?: number;
  country?: string;
  label?: string[];
  catno?: string;
  format?: string[];
  type?: string;
};

type DiscogsStatsResponse = {
  lowest_price?: {
    value?: number;
    currency?: string;
  };
};

type DiscogsPriceSuggestionsResponse = Record<
  string,
  {
    currency?: string;
    value?: number;
  }
>;

export interface DiscogsRelease {
  id: number;
  title: string;
  artist: string;
  year: number;
  country: string;
  label: string;
  catno: string;
  format: string;
}

export interface DiscogsPricing {
  byCondition: Record<string, { value: number; currency: string }>;
  releaseId: number;
  source: "discogs";
  fetchedAt: string;
}

export interface VinylPriceResult {
  release: DiscogsRelease;
  pricing: DiscogsPricing;
  recommendedLow: number;
  recommendedHigh: number;
  source: "discogs";
  confidenceLevel: "high" | "medium";
}

function normalizeCatalogNumber(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeString(value: string | null | undefined, fallback = ""): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function normalizePrice(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value * 100) / 100;
  }

  return null;
}

function parseArtistFromTitle(title: string): { artist: string; title: string } {
  const [artist, ...rest] = title.split(" - ");

  if (rest.length === 0) {
    return {
      artist: "",
      title,
    };
  }

  return {
    artist: artist.trim(),
    title: rest.join(" - ").trim(),
  };
}

function extractCatalogNumber(identification: GeminiIdentifyResponse): string | null {
  const explicit = normalizeCatalogNumber(identification.catalogNumber);
  if (explicit) {
    return explicit;
  }

  const haystack = [
    identification.name,
    identification.historySummary,
    ...(identification.searchKeywords ?? []),
    ...(identification.distinguishingFeatures ?? []),
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ");

  const match = haystack.match(/\b[A-Z]{1,6}[ -]?\d{2,6}[A-Z]?\b/i);
  return match ? match[0].trim() : null;
}

function buildHeaders(token: string): HeadersInit {
  return {
    Accept: "application/json",
    Authorization: `Discogs token=${token}`,
    "User-Agent": DISCOGS_USER_AGENT,
  };
}

async function readCachedPricing(releaseId: number): Promise<DiscogsPricing | null> {
  const raw = await AsyncStorage.getItem(`${DISCOGS_PRICING_CACHE_KEY_PREFIX}${releaseId}`);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as CachedValue<DiscogsPricing>;
    if (!parsed?.value || !parsed?.expiresAt) {
      await AsyncStorage.removeItem(`${DISCOGS_PRICING_CACHE_KEY_PREFIX}${releaseId}`);
      return null;
    }

    if (Date.parse(parsed.expiresAt) <= Date.now()) {
      await AsyncStorage.removeItem(`${DISCOGS_PRICING_CACHE_KEY_PREFIX}${releaseId}`);
      return null;
    }

    return parsed.value;
  } catch {
    await AsyncStorage.removeItem(`${DISCOGS_PRICING_CACHE_KEY_PREFIX}${releaseId}`);
    return null;
  }
}

async function writeCachedPricing(value: DiscogsPricing): Promise<void> {
  const payload: CachedValue<DiscogsPricing> = {
    value,
    expiresAt: new Date(Date.now() + DISCOGS_PRICING_CACHE_TTL_MS).toISOString(),
  };

  await AsyncStorage.setItem(
    `${DISCOGS_PRICING_CACHE_KEY_PREFIX}${value.releaseId}`,
    JSON.stringify(payload),
  );
}

function chooseReleaseByYear(results: DiscogsRelease[], year: number | null): DiscogsRelease | null {
  if (results.length === 0) {
    return null;
  }

  if (year == null) {
    return results[0];
  }

  const sorted = [...results].sort((left, right) => Math.abs(left.year - year) - Math.abs(right.year - year));
  return sorted[0] ?? null;
}

function normalizeRelease(result: DiscogsSearchResult): DiscogsRelease | null {
  if (typeof result.id !== "number") {
    return null;
  }

  const rawTitle = normalizeString(result.title, "Unknown Release");
  const parsedTitle = parseArtistFromTitle(rawTitle);

  return {
    id: result.id,
    title: parsedTitle.title || rawTitle,
    artist: parsedTitle.artist,
    year: typeof result.year === "number" && Number.isFinite(result.year) ? result.year : 0,
    country: normalizeString(result.country, "Unknown"),
    label: Array.isArray(result.label) ? normalizeString(result.label[0], "Unknown") : "Unknown",
    catno: normalizeString(result.catno, ""),
    format: Array.isArray(result.format) ? normalizeString(result.format.join(", "), "Vinyl") : "Vinyl",
  };
}

function buildFallbackPricingFromStats(releaseId: number, payload: DiscogsStatsResponse): DiscogsPricing | null {
  const lowestValue = normalizePrice(payload.lowest_price?.value);
  if (lowestValue == null) {
    return null;
  }

  const currency = normalizeString(payload.lowest_price?.currency, "USD");

  return {
    byCondition: {
      "Good Plus (G+)": { value: lowestValue, currency },
      "Very Good Plus (VG+)": { value: lowestValue, currency },
    },
    releaseId,
    source: "discogs",
    fetchedAt: new Date().toISOString(),
  };
}

export class DiscogsClient {
  private readonly token = AppConfig.discogsToken;

  private async fetchWithTimeout(path: string, headers: HeadersInit): Promise<Response> {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId = setTimeout(() => {
      controller?.abort();
    }, DISCOGS_REQUEST_TIMEOUT_MS);

    try {
      return await fetch(`${DISCOGS_API_BASE}${path}`, {
        headers,
        signal: controller?.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Discogs request timed out after ${DISCOGS_REQUEST_TIMEOUT_MS}ms.`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async getJson<T>(path: string): Promise<{ status: number; body: T }> {
    const token = this.token;
    if (!token) {
      throw new Error("Discogs token is not configured.");
    }

    return discogsRateLimiter.schedule(async () => {
      const response = await this.fetchWithTimeout(path, buildHeaders(token));

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Discogs request failed (${response.status}): ${text.slice(0, 240)}`);
      }

      return {
        status: response.status,
        body: (await response.json()) as T,
      };
    });
  }

  async searchRelease(query: string, catno?: string): Promise<DiscogsRelease | null> {
    if (!this.token) {
      return null;
    }

    try {
      const params = new URLSearchParams({
        type: "release",
      });

      if (catno) {
        params.set("catno", catno);
      } else {
        params.set("q", query);
        params.set("format", "vinyl");
      }

      const response = await this.getJson<DiscogsSearchResponse>(`/database/search?${params.toString()}`);
      const releases = (response.body.results ?? [])
        .filter((result) => result.type === "release" || typeof result.type !== "string")
        .map((result) => normalizeRelease(result))
        .filter((result): result is DiscogsRelease => result != null);

      return releases[0] ?? null;
    } catch (error) {
      console.warn("[Discogs] Release search failed.", error);
      return null;
    }
  }

  async getPriceSuggestions(releaseId: number): Promise<DiscogsPricing | null> {
    const cached = await readCachedPricing(releaseId);
    if (cached) {
      return cached;
    }

    if (!this.token) {
      return null;
    }

    try {
      const response = await this.getJson<DiscogsPriceSuggestionsResponse>(
        `/marketplace/price_suggestions/${releaseId}`,
      );
      const byCondition = Object.fromEntries(
        Object.entries(response.body)
          .map(([condition, entry]) => {
            const value = normalizePrice(entry?.value);
            const currency = normalizeString(entry?.currency, "USD");

            if (value == null) {
              return null;
            }

            return [condition, { value, currency }] as const;
          })
          .filter((entry): entry is readonly [string, { value: number; currency: string }] => entry != null),
      );

      if (Object.keys(byCondition).length === 0) {
        return null;
      }

      const pricing: DiscogsPricing = {
        byCondition,
        releaseId,
        source: "discogs",
        fetchedAt: new Date().toISOString(),
      };

      await writeCachedPricing(pricing);
      return pricing;
    } catch (error) {
      if (
        error instanceof Error &&
        (/\((401|403|404)\)/.test(error.message) || /seller settings/i.test(error.message))
      ) {
        try {
          const statsResponse = await this.getJson<DiscogsStatsResponse>(`/marketplace/stats/${releaseId}`);
          const fallbackPricing = buildFallbackPricingFromStats(releaseId, statsResponse.body);
          if (fallbackPricing) {
            await writeCachedPricing(fallbackPricing);
          }
          return fallbackPricing;
        } catch (statsError) {
          console.warn("[Discogs] Marketplace stats fallback failed.", statsError);
          return null;
        }
      }

      console.warn("[Discogs] Price suggestions lookup failed.", error);
      return null;
    }
  }

  async lookupVinyl(identification: GeminiIdentifyResponse): Promise<VinylPriceResult | null> {
    if (!this.token || identification.category !== "vinyl") {
      return null;
    }

    const catalogNumber = extractCatalogNumber(identification);
    const artistAlbum = identification.name.trim();
    let release: DiscogsRelease | null = null;

    if (catalogNumber) {
      release = await this.searchRelease(artistAlbum, catalogNumber);
    }

    if (!release && artistAlbum) {
      try {
        const params = new URLSearchParams({
          q: artistAlbum,
          type: "release",
          format: "vinyl",
        });
        const response = await this.getJson<DiscogsSearchResponse>(`/database/search?${params.toString()}`);
        const releases = (response.body.results ?? [])
          .filter((result) => result.type === "release" || typeof result.type !== "string")
          .map((result) => normalizeRelease(result))
          .filter((result): result is DiscogsRelease => result != null);
        release = chooseReleaseByYear(releases, identification.year ?? null);
      } catch (error) {
        console.warn("[Discogs] Fallback text search failed.", error);
        return null;
      }
    }

    if (!release) {
      return null;
    }

    const pricing = await this.getPriceSuggestions(release.id);
    if (!pricing) {
      return null;
    }

    const recommendedLow = normalizePrice(pricing.byCondition["Good Plus (G+)"]?.value);
    const recommendedHigh = normalizePrice(pricing.byCondition["Very Good Plus (VG+)"]?.value);

    if (recommendedLow == null && recommendedHigh == null) {
      return null;
    }

    return {
      release,
      pricing,
      recommendedLow: recommendedLow ?? recommendedHigh ?? 0,
      recommendedHigh: recommendedHigh ?? recommendedLow ?? 0,
      source: "discogs",
      confidenceLevel: catalogNumber ? "high" : "medium",
    };
  }
}

export const discogsClient = new DiscogsClient();
