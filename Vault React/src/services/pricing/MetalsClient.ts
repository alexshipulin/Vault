import AsyncStorage from "@react-native-async-storage/async-storage";

import { AppConfig } from "@/constants/Config";
import type { GeminiIdentifyResponse } from "@/lib/gemini/types";

const METALS_API_BASE = "https://api.metalpriceapi.com/v1";
const METALS_CACHE_KEY = "metals_spot_prices";
const METALS_CACHE_TTL_MS = 60 * 60 * 1000;
const METALS_REQUEST_TIMEOUT_MS = 7_000;

export interface SpotPrices {
  XAU: number;
  XAG: number;
  XPT: number;
  XPD: number;
  fetchedAt: string;
}

export interface BullionEstimate {
  metalContent: { metal: "gold" | "silver" | "platinum"; troyOz: number };
  spotValue: number;
  estimatedLow: number;
  estimatedHigh: number;
  spotPrice: number;
  source: "metals_api";
}

type CachedSpotPrices = {
  value: SpotPrices;
  expiresAt: string;
};

type BullionMetal = "gold" | "silver" | "platinum";

type BullionWeight = {
  metal: BullionMetal;
  troyOz: number;
};

type MetalsApiResponse = {
  success?: boolean;
  rates?: Record<string, number>;
  timestamp?: number;
  date?: string;
  error?: {
    code?: string;
    message?: string;
  };
};

const BULLION_COIN_WEIGHTS: Record<string, BullionWeight> = {
  "american silver eagle": { metal: "silver", troyOz: 1.0 },
  "american gold eagle 1oz": { metal: "gold", troyOz: 1.0 },
  "american gold eagle 1/2oz": { metal: "gold", troyOz: 0.5 },
  "american gold eagle 1/4oz": { metal: "gold", troyOz: 0.25 },
  "american gold eagle 1/10oz": { metal: "gold", troyOz: 0.1 },
  "american gold buffalo": { metal: "gold", troyOz: 1.0 },
  "american platinum eagle": { metal: "platinum", troyOz: 1.0 },
  "canadian maple leaf silver": { metal: "silver", troyOz: 1.0 },
  "canadian maple leaf gold": { metal: "gold", troyOz: 1.0 },
  "britannia silver": { metal: "silver", troyOz: 1.0 },
  "britannia gold": { metal: "gold", troyOz: 1.0 },
  "sovereign gold": { metal: "gold", troyOz: 0.2354 },
  "half sovereign": { metal: "gold", troyOz: 0.1177 },
  krugerrand: { metal: "gold", troyOz: 1.0 },
  "vienna philharmonic silver": { metal: "silver", troyOz: 1.0 },
  "vienna philharmonic gold": { metal: "gold", troyOz: 1.0 },
  "morgan dollar": { metal: "silver", troyOz: 0.7736 },
  "peace dollar": { metal: "silver", troyOz: 0.7736 },
  "walking liberty half dollar": { metal: "silver", troyOz: 0.3617 },
  "kennedy half dollar 1964": { metal: "silver", troyOz: 0.3617 },
  "washington quarter pre-1965": { metal: "silver", troyOz: 0.1808 },
  "roosevelt dime pre-1965": { metal: "silver", troyOz: 0.0723 },
  "mercury dime": { metal: "silver", troyOz: 0.0723 },
};

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizePositiveNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return value;
}

function resolveUsdMetalRate(
  symbol: keyof Omit<SpotPrices, "fetchedAt">,
  rates?: Record<string, number>,
): number | null {
  if (!rates) {
    return null;
  }

  const direct = normalizePositiveNumber(rates[`USD${symbol}`]);
  if (direct != null) {
    return roundCurrency(direct);
  }

  const inverse = normalizePositiveNumber(rates[symbol]);
  if (inverse != null) {
    return roundCurrency(1 / inverse);
  }

  return null;
}

function buildCachePayload(value: SpotPrices): CachedSpotPrices {
  return {
    value,
    expiresAt: new Date(Date.now() + METALS_CACHE_TTL_MS).toISOString(),
  };
}

async function readCachedSpotPrices(): Promise<SpotPrices | null> {
  const raw = await AsyncStorage.getItem(METALS_CACHE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as CachedSpotPrices;
    if (!parsed?.value || !parsed?.expiresAt) {
      await AsyncStorage.removeItem(METALS_CACHE_KEY);
      return null;
    }

    if (Date.parse(parsed.expiresAt) <= Date.now()) {
      await AsyncStorage.removeItem(METALS_CACHE_KEY);
      return null;
    }

    return parsed.value;
  } catch {
    await AsyncStorage.removeItem(METALS_CACHE_KEY);
    return null;
  }
}

async function writeCachedSpotPrices(value: SpotPrices): Promise<void> {
  await AsyncStorage.setItem(METALS_CACHE_KEY, JSON.stringify(buildCachePayload(value)));
}

function matchBullionWeight(identification: GeminiIdentifyResponse): BullionWeight | null {
  const normalizedName = identification.name.trim().toLowerCase();

  for (const [key, value] of Object.entries(BULLION_COIN_WEIGHTS)) {
    if (normalizedName.includes(key)) {
      return value;
    }
  }

  return null;
}

function symbolForMetal(metal: BullionMetal): keyof Omit<SpotPrices, "fetchedAt"> {
  switch (metal) {
    case "gold":
      return "XAU";
    case "silver":
      return "XAG";
    case "platinum":
      return "XPT";
  }
}

export class MetalsClient {
  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId = setTimeout(() => {
      controller?.abort();
    }, METALS_REQUEST_TIMEOUT_MS);

    try {
      return await fetch(url, {
        headers: {
          Accept: "application/json",
        },
        signal: controller?.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Metals API request timed out after ${METALS_REQUEST_TIMEOUT_MS}ms.`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async getSpotPrices(): Promise<SpotPrices> {
    const cached = await readCachedSpotPrices();
    if (cached) {
      return cached;
    }

    const apiKey = AppConfig.metalsApiKey;
    if (!apiKey) {
      throw new Error("Metals API key is not configured.");
    }

    const query = new URLSearchParams({
      api_key: apiKey,
      base: "USD",
      currencies: "EUR,XAU,XAG,XPT,XPD",
    });

    const response = await this.fetchWithTimeout(`${METALS_API_BASE}/latest?${query.toString()}`);

    if (!response.ok) {
      throw new Error(`Metals API request failed (${response.status}).`);
    }

    const payload = (await response.json()) as MetalsApiResponse;

    if (payload.success === false) {
      const message = payload.error?.message ?? payload.error?.code ?? "unknown provider error";
      throw new Error(`Metals API responded with success=false: ${message}`);
    }

    const XAU = resolveUsdMetalRate("XAU", payload.rates);
    const XAG = resolveUsdMetalRate("XAG", payload.rates);
    const XPT = resolveUsdMetalRate("XPT", payload.rates);
    const XPD = resolveUsdMetalRate("XPD", payload.rates);

    if (XAU == null || XAG == null || XPT == null || XPD == null) {
      throw new Error("Metals API response is missing one or more spot rates.");
    }

    const spotPrices: SpotPrices = {
      XAU,
      XAG,
      XPT,
      XPD,
      fetchedAt:
        typeof payload.timestamp === "number"
          ? new Date(payload.timestamp * 1000).toISOString()
          : payload.date
            ? `${payload.date}T00:00:00.000Z`
            : new Date().toISOString(),
    };

    await writeCachedSpotPrices(spotPrices);
    return spotPrices;
  }

  async estimateBullionValue(identification: GeminiIdentifyResponse): Promise<BullionEstimate | null> {
    if (identification.isBullion !== true) {
      return null;
    }

    const match = matchBullionWeight(identification);
    if (!match) {
      return null;
    }

    let spotPrices: SpotPrices;
    try {
      spotPrices = await this.getSpotPrices();
    } catch (error) {
      console.warn("[Metals] Spot price lookup failed. Skipping bullion pricing.", error);
      return null;
    }

    const symbol = symbolForMetal(match.metal);
    const spotPrice = spotPrices[symbol];
    const spotValue = roundCurrency(spotPrice * match.troyOz);

    return {
      metalContent: {
        metal: match.metal,
        troyOz: match.troyOz,
      },
      spotValue,
      estimatedLow: roundCurrency(spotValue * 0.95),
      estimatedHigh: roundCurrency(spotValue * 1.15),
      spotPrice,
      source: "metals_api",
    };
  }
}

export const metalsClient = new MetalsClient();
