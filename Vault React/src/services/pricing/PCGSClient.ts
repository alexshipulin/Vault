import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppConfig } from "@/constants/Config";
import type { GeminiIdentifyResponse } from "@/lib/gemini/types";

const PCGS_API_BASE = "https://api.pcgs.com/publicapi";
const PCGS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PCGS_REQUEST_DELAY_MS = 200;

type CachedLookup<T> = {
  value: T;
  expiresAt: string;
};

type CoinFactsCandidate = {
  PCGSNo?: number | string;
  Name?: string;
  Denomination?: string;
  Year?: number | string;
  MintMark?: string;
  PriceGuideValue?: number | string | null;
  PriceGuideValues?: unknown;
  PriceGuide?: unknown;
  GradeValues?: unknown;
  Prices?: unknown;
};

type PCGSAuthResponse = {
  token?: string;
  Token?: string;
  accessToken?: string;
};

export interface PCGSCoinPrice {
  coinName: string;
  pcgsNo: number;
  priceGuideValues: Record<string, number>;
  averageCirculatedValue: number | null;
  averageUncirculatedValue: number | null;
  source: "pcgs";
  fetchedAt: string;
}

type LookupParams = {
  year: number;
  denomination: string;
  mintMark?: string;
  variety?: string;
};

let lastPcgsRequestAt = 0;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function throttlePcgsRequests(): Promise<void> {
  const elapsed = Date.now() - lastPcgsRequestAt;
  if (elapsed < PCGS_REQUEST_DELAY_MS) {
    await delay(PCGS_REQUEST_DELAY_MS - elapsed);
  }
  lastPcgsRequestAt = Date.now();
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeDenominationInput(value: string): string {
  const normalized = normalizeWhitespace(value).toLowerCase();

  if (normalized.includes("morgan")) return "Morgan Dollar";
  if (normalized.includes("peace")) return "Peace Dollar";
  if (normalized.includes("silver eagle") || normalized.includes("american eagle")) return "Silver Eagle";
  if (normalized.includes("gold eagle")) return "Gold Eagle";
  if (normalized.includes("quarter")) return "25C";
  if (normalized.includes("dime")) return "10C";
  if (normalized.includes("nickel")) return "5C";
  if (normalized.includes("half dollar")) return "50C";
  if (normalized.includes("cent") || normalized.includes("penny")) return "1C";
  if (normalized.includes("dollar")) return "1$";

  return value.trim();
}

function normalizeMintMark(value?: string): string {
  if (!value) {
    return "";
  }

  const normalized = value.trim().toUpperCase();
  return normalized === "NO MINT" ? "" : normalized;
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function isCirculatedGrade(grade: string): boolean {
  return /^(AG|G|VG|F|VF|XF|EF|AU)\d*/i.test(grade.trim());
}

function isUncirculatedGrade(grade: string): boolean {
  return /^(MS|PR|PF|SP)/i.test(grade.trim());
}

function extractGradePricePairs(input: unknown): Record<string, number> {
  if (!input) {
    return {};
  }

  if (!Array.isArray(input) && typeof input === "object") {
    const objectEntries = Object.entries(input as Record<string, unknown>)
      .map(([grade, value]) => [grade, normalizeNumber(value)] as const)
      .filter((entry): entry is readonly [string, number] => typeof entry[1] === "number");

    if (objectEntries.length > 0) {
      return Object.fromEntries(objectEntries);
    }
  }

  if (!Array.isArray(input)) {
    return {};
  }

  const entries = input.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const record = entry as Record<string, unknown>;
    const grade =
      typeof record.grade === "string"
        ? record.grade
        : typeof record.Grade === "string"
          ? record.Grade
          : typeof record.label === "string"
            ? record.label
            : typeof record.Label === "string"
              ? record.Label
              : null;
    const value =
      normalizeNumber(record.value) ??
      normalizeNumber(record.Value) ??
      normalizeNumber(record.price) ??
      normalizeNumber(record.Price) ??
      normalizeNumber(record.priceGuideValue) ??
      normalizeNumber(record.PriceGuideValue);

    if (!grade || typeof value !== "number") {
      return [];
    }

    return [[normalizeWhitespace(grade), value] as const];
  });

  return Object.fromEntries(entries);
}

function buildPriceGuideValues(candidate: CoinFactsCandidate): Record<string, number> {
  const nestedSources = [
    candidate.PriceGuideValues,
    candidate.PriceGuide,
    candidate.GradeValues,
    candidate.Prices,
  ];

  for (const source of nestedSources) {
    const extracted = extractGradePricePairs(source);
    if (Object.keys(extracted).length > 0) {
      return extracted;
    }
  }

  const guideValue = normalizeNumber(candidate.PriceGuideValue);
  if (guideValue != null) {
    return { GUIDE: Math.round(guideValue) };
  }

  return {};
}

function summarizePriceGuideValues(priceGuideValues: Record<string, number>): {
  averageCirculatedValue: number | null;
  averageUncirculatedValue: number | null;
} {
  const entries = Object.entries(priceGuideValues);
  const circulated = entries
    .filter(([grade]) => isCirculatedGrade(grade))
    .map(([, value]) => value);
  const uncirculated = entries
    .filter(([grade]) => isUncirculatedGrade(grade))
    .map(([, value]) => value);
  const allValues = entries.map(([, value]) => value);

  return {
    averageCirculatedValue: average(circulated.length > 0 ? circulated : allValues),
    averageUncirculatedValue: average(uncirculated.length > 0 ? uncirculated : allValues),
  };
}

function extractCoinCandidates(payload: unknown): CoinFactsCandidate[] {
  if (Array.isArray(payload)) {
    return payload.filter((entry): entry is CoinFactsCandidate => Boolean(entry && typeof entry === "object"));
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const collectionKeys = ["Coins", "CoinFacts", "Listings", "Items", "Results", "Data"];

  for (const key of collectionKeys) {
    if (Array.isArray(record[key])) {
      return record[key].filter((entry): entry is CoinFactsCandidate => Boolean(entry && typeof entry === "object"));
    }
  }

  if (
    typeof record.Name === "string" ||
    typeof record.PCGSNo === "string" ||
    typeof record.PCGSNo === "number"
  ) {
    return [record as CoinFactsCandidate];
  }

  return [];
}

function buildLookupCacheKey(params: LookupParams): string {
  const mintMark = normalizeMintMark(params.mintMark);
  const variety = params.variety?.trim().toUpperCase() ?? "";
  return `pcgs_${params.year}_${normalizeDenominationInput(params.denomination)}_${mintMark}_${variety}`;
}

async function readCachedLookup(cacheKey: string): Promise<PCGSCoinPrice | null> {
  const raw = await AsyncStorage.getItem(cacheKey);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as CachedLookup<PCGSCoinPrice>;
    if (!parsed?.value || !parsed?.expiresAt) {
      await AsyncStorage.removeItem(cacheKey);
      return null;
    }

    if (Date.parse(parsed.expiresAt) <= Date.now()) {
      await AsyncStorage.removeItem(cacheKey);
      return null;
    }

    return parsed.value;
  } catch {
    await AsyncStorage.removeItem(cacheKey);
    return null;
  }
}

async function writeCachedLookup(cacheKey: string, value: PCGSCoinPrice): Promise<void> {
  const payload: CachedLookup<PCGSCoinPrice> = {
    value,
    expiresAt: new Date(Date.now() + PCGS_CACHE_TTL_MS).toISOString(),
  };

  await AsyncStorage.setItem(cacheKey, JSON.stringify(payload));
}

function deriveMintMark(identification: GeminiIdentifyResponse): string | undefined {
  const haystack = [
    identification.name,
    identification.objectType,
    ...(identification.distinguishingFeatures ?? []),
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ");

  const directMatch = haystack.match(/\b(CC|O|S|D|P|W)\s+mint mark\b/i);
  if (directMatch?.[1]) {
    return directMatch[1].toUpperCase();
  }

  const compactMatch = haystack.match(/\b(18\d{2}|19\d{2}|20\d{2})[- ]?(CC|O|S|D|P|W)\b/i);
  if (compactMatch?.[2]) {
    return compactMatch[2].toUpperCase();
  }

  return undefined;
}

function deriveVariety(identification: GeminiIdentifyResponse): string | undefined {
  const haystack = [
    identification.name,
    ...(identification.distinguishingFeatures ?? []),
    ...(identification.searchKeywords ?? []),
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ");

  const supportedVarieties = ["VDB", "DMPL", "PL", "CAM", "DCAM", "FS"];

  for (const variety of supportedVarieties) {
    const pattern = new RegExp(`\\b${variety}\\b`, "i");
    if (pattern.test(haystack)) {
      return variety;
    }
  }

  return undefined;
}

function deriveDenomination(identification: GeminiIdentifyResponse): string | null {
  const haystack = [
    identification.name,
    identification.objectType,
    ...(identification.searchKeywords ?? []),
    ...(identification.distinguishingFeatures ?? []),
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ");

  if (!haystack) {
    return null;
  }

  const normalized = haystack.toLowerCase();
  if (normalized.includes("morgan")) return "Morgan Dollar";
  if (normalized.includes("peace dollar")) return "Peace Dollar";
  if (normalized.includes("silver eagle")) return "Silver Eagle";
  if (normalized.includes("quarter")) return "25C";
  if (normalized.includes("dime")) return "10C";
  if (normalized.includes("nickel")) return "5C";
  if (normalized.includes("half dollar")) return "50C";
  if (normalized.includes("cent") || normalized.includes("penny")) return "1C";
  if (normalized.includes("dollar")) return "1$";

  return null;
}

function looksLikeCoinCategory(identification: GeminiIdentifyResponse): boolean {
  const haystack = [identification.category, identification.objectType, identification.name]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  return haystack.includes("coin") || haystack.includes("dollar") || haystack.includes("cent");
}

export class PCGSClient {
  private token: string | null = null;

  private authUnavailable = false;

  private async request(path: string, init: RequestInit = {}, retryOnUnauthorized = true): Promise<Response> {
    await throttlePcgsRequests();
    const token = await this.getToken();
    const response = await fetch(`${PCGS_API_BASE}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        token,
        ...(init.headers ?? {}),
      },
    });

    if (response.status === 401 && retryOnUnauthorized) {
      this.token = null;
      const refreshedToken = await this.getToken();
      await throttlePcgsRequests();
      return fetch(`${PCGS_API_BASE}${path}`, {
        ...init,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${refreshedToken}`,
          token: refreshedToken,
          ...(init.headers ?? {}),
        },
      });
    }

    return response;
  }

  private pickBestCandidate(candidates: CoinFactsCandidate[], params: LookupParams): CoinFactsCandidate | null {
    if (candidates.length === 0) {
      return null;
    }

    const targetDenomination = normalizeDenominationInput(params.denomination).toLowerCase();
    const targetMintMark = normalizeMintMark(params.mintMark).toLowerCase();
    const targetVariety = params.variety?.trim().toLowerCase() ?? "";

    const scored = candidates.map((candidate) => {
      let score = 0;
      const candidateName = normalizeWhitespace(candidate.Name ?? "").toLowerCase();
      const candidateDenomination = normalizeWhitespace(candidate.Denomination ?? "").toLowerCase();
      const candidateMintMark = normalizeMintMark(candidate.MintMark).toLowerCase();
      const candidateYear = normalizeNumber(candidate.Year);

      if (candidateYear === params.year) {
        score += 4;
      }
      if (candidateDenomination === targetDenomination || candidateName.includes(targetDenomination)) {
        score += 3;
      }
      if (targetMintMark && candidateMintMark === targetMintMark) {
        score += 2;
      }
      if (targetVariety && candidateName.includes(targetVariety)) {
        score += 1;
      }

      return { candidate, score };
    });

    scored.sort((left, right) => right.score - left.score);
    return scored[0]?.candidate ?? null;
  }

  private buildCoinPrice(candidate: CoinFactsCandidate): PCGSCoinPrice | null {
    const pcgsNo = normalizeNumber(candidate.PCGSNo);
    const priceGuideValues = buildPriceGuideValues(candidate);
    const { averageCirculatedValue, averageUncirculatedValue } = summarizePriceGuideValues(priceGuideValues);
    const fallbackGuideValue = normalizeNumber(candidate.PriceGuideValue);

    if (pcgsNo == null) {
      return null;
    }

    return {
      coinName: normalizeWhitespace(candidate.Name ?? "Unknown PCGS Coin"),
      pcgsNo,
      priceGuideValues:
        Object.keys(priceGuideValues).length > 0
          ? priceGuideValues
          : fallbackGuideValue != null
            ? { GUIDE: fallbackGuideValue }
            : {},
      averageCirculatedValue,
      averageUncirculatedValue,
      source: "pcgs",
      fetchedAt: new Date().toISOString(),
    };
  }

  private async getJson<T>(path: string): Promise<T> {
    const response = await this.request(path);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`PCGS request failed (${response.status}): ${text.slice(0, 240)}`);
    }

    return (await response.json()) as T;
  }

  private async getToken(): Promise<string> {
    if (this.authUnavailable) {
      throw new Error("PCGS authentication endpoint is unavailable.");
    }

    if (this.token) {
      return this.token;
    }

    const username = AppConfig.pcgs.username;
    const password = AppConfig.pcgs.password;

    if (!username || !password) {
      throw new Error("PCGS credentials are not configured.");
    }

    await throttlePcgsRequests();
    const response = await fetch(`${PCGS_API_BASE}/account/authenticate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        userName: username,
        password,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      if (response.status === 404) {
        this.authUnavailable = true;
      }
      throw new Error(`PCGS authentication failed (${response.status}): ${text.slice(0, 240)}`);
    }

    const payload = (await response.json()) as PCGSAuthResponse;
    const token = payload.token ?? payload.Token ?? payload.accessToken ?? null;

    if (!token) {
      throw new Error("PCGS authentication returned no token.");
    }

    this.token = token;
    return token;
  }

  async lookupCoin(params: LookupParams): Promise<PCGSCoinPrice | null> {
    const denomination = normalizeDenominationInput(params.denomination);
    if (!params.year || !denomination) {
      return null;
    }

    const normalizedParams: LookupParams = {
      year: params.year,
      denomination,
      mintMark: normalizeMintMark(params.mintMark),
      variety: params.variety?.trim() || undefined,
    };

    const cacheKey = buildLookupCacheKey(normalizedParams);
    const cached = await readCachedLookup(cacheKey);
    if (cached) {
      return cached;
    }

    const query = new URLSearchParams({
      coinYear: String(normalizedParams.year),
      denomination: normalizedParams.denomination,
      mintMark: normalizedParams.mintMark ?? "",
    });

    if (normalizedParams.variety) {
      query.set("variety", normalizedParams.variety);
    }

    const payload = await this.getJson<unknown>(`/coindetail/GetCoinFactsListing?${query.toString()}`);
    const candidate = this.pickBestCandidate(extractCoinCandidates(payload), normalizedParams);
    const coinPrice = candidate ? this.buildCoinPrice(candidate) : null;

    if (coinPrice) {
      await writeCachedLookup(cacheKey, coinPrice);
    }

    return coinPrice;
  }

  async safeLookup(identification: GeminiIdentifyResponse): Promise<PCGSCoinPrice | null> {
    try {
      if (!looksLikeCoinCategory(identification) || identification.year == null) {
        return null;
      }

      const denomination = deriveDenomination(identification);
      if (!denomination) {
        return null;
      }

      return await this.lookupCoin({
        year: identification.year,
        denomination,
        mintMark: deriveMintMark(identification),
        variety: deriveVariety(identification),
      });
    } catch (error) {
      console.warn("[PCGS] Coin lookup failed.", error);
      return null;
    }
  }
}

export const pcgsClient = new PCGSClient();
