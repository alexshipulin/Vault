import AsyncStorage from "@react-native-async-storage/async-storage";

import { AppConfig } from "@/constants/Config";
import type { GeminiIdentifyResponse } from "@/lib/gemini/types";

const PCGS_API_BASE = "https://api.pcgs.com/publicapi";
const PCGS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PCGS_REQUEST_DELAY_MS = 200;
const PCGS_RETRY_DELAY_MS = 350;
const PCGS_REQUEST_TIMEOUT_MS = 8_000;

type CachedLookup<T> = {
  value: T;
  expiresAt: string;
};

type CoinFactsPayload = {
  PCGSNo?: number | string;
  CertNo?: string;
  Name?: string;
  Year?: number | string;
  Denomination?: string;
  MintMark?: string;
  Grade?: string;
  PriceGuideValue?: number | string | null;
  PriceGuideValues?: unknown;
  IsValidRequest?: boolean;
  ServerMessage?: string;
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
  certNo?: string;
  barcode?: string;
  gradingService?: "PCGS" | "NGC";
  pcgsNo?: string | number;
  gradeNo?: number;
  plusGrade?: boolean;
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

function buildPriceGuideValues(payload: CoinFactsPayload): Record<string, number> {
  const nestedValues = extractGradePricePairs(payload.PriceGuideValues);
  if (Object.keys(nestedValues).length > 0) {
    return nestedValues;
  }

  const guideValue = normalizeNumber(payload.PriceGuideValue);
  const grade = typeof payload.Grade === "string" && payload.Grade.trim() ? payload.Grade.trim() : "GUIDE";
  return guideValue != null ? { [grade]: Math.round(guideValue) } : {};
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

function buildLookupCacheKey(params: LookupParams): string | null {
  if (params.certNo) {
    return `pcgs_cert_${params.certNo}`;
  }

  if (params.barcode) {
    return `pcgs_barcode_${params.barcode}_${params.gradingService ?? "PCGS"}`;
  }

  if (params.pcgsNo != null && params.gradeNo != null) {
    return `pcgs_grade_${params.pcgsNo}_${params.gradeNo}_${params.plusGrade === true ? "plus" : "base"}`;
  }

  return null;
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

function extractCoinFactsPayload(payload: unknown): CoinFactsPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as CoinFactsPayload;

  if (record.IsValidRequest === false) {
    return null;
  }

  if (typeof record.ServerMessage === "string" && /no data found/i.test(record.ServerMessage)) {
    return null;
  }

  if (
    typeof record.Name === "string" ||
    typeof record.PCGSNo === "string" ||
    typeof record.PCGSNo === "number"
  ) {
    return record;
  }

  return null;
}

function buildCoinPrice(payload: CoinFactsPayload): PCGSCoinPrice | null {
  const pcgsNo = normalizeNumber(payload.PCGSNo);
  if (pcgsNo == null) {
    return null;
  }

  const priceGuideValues = buildPriceGuideValues(payload);
  const { averageCirculatedValue, averageUncirculatedValue } = summarizePriceGuideValues(priceGuideValues);

  return {
    coinName: normalizeWhitespace(payload.Name ?? "Unknown PCGS Coin"),
    pcgsNo,
    priceGuideValues,
    averageCirculatedValue,
    averageUncirculatedValue,
    source: "pcgs",
    fetchedAt: new Date().toISOString(),
  };
}

function collectTextSignals(identification: GeminiIdentifyResponse): string {
  return [
    identification.name,
    identification.historySummary,
    ...(identification.searchKeywords ?? []),
    ...(identification.distinguishingFeatures ?? []),
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ");
}

function deriveCertNo(identification: GeminiIdentifyResponse): string | undefined {
  const text = collectTextSignals(identification);
  const explicitMatch = text.match(/\bcert(?:ificate)?(?:\s*(?:no|number|#))?\s*[:#-]?\s*([0-9]{6,12})\b/i);
  if (explicitMatch?.[1]) {
    return explicitMatch[1];
  }

  return undefined;
}

function deriveBarcode(identification: GeminiIdentifyResponse): string | undefined {
  const text = collectTextSignals(identification);
  const barcodeMatch = text.match(/\bbarcode(?:\s*(?:no|number|#))?\s*[:#-]?\s*([a-z0-9-]{8,48})\b/i);
  if (barcodeMatch?.[1]) {
    return barcodeMatch[1].toUpperCase();
  }

  return undefined;
}

function derivePcgsNo(identification: GeminiIdentifyResponse): string | undefined {
  const text = collectTextSignals(identification);
  const explicit = text.match(/\bpcgs(?:\s*(?:no|number|#))?\s*[:#-]?\s*([0-9]{3,8})\b/i);
  if (explicit?.[1]) {
    return explicit[1];
  }

  return undefined;
}

function deriveGradeInfo(identification: GeminiIdentifyResponse): { gradeNo: number; plusGrade: boolean } | null {
  const text = collectTextSignals(identification);
  const compactGrade = text.match(/\b(?:MS|PR|PF|AU|XF|EF|VF|F|VG|G|AG)\s*([1-7]?[0-9])(\+)?\b/i);
  if (compactGrade?.[1]) {
    const gradeNo = Number.parseInt(compactGrade[1], 10);
    if (Number.isFinite(gradeNo) && gradeNo > 0 && gradeNo <= 70) {
      return {
        gradeNo,
        plusGrade: Boolean(compactGrade[2]),
      };
    }
  }

  const explicitGrade = text.match(/\bgrade\s*[:#-]?\s*([1-7]?[0-9])(\+)?\b/i);
  if (explicitGrade?.[1]) {
    const gradeNo = Number.parseInt(explicitGrade[1], 10);
    if (Number.isFinite(gradeNo) && gradeNo > 0 && gradeNo <= 70) {
      return {
        gradeNo,
        plusGrade: Boolean(explicitGrade[2]),
      };
    }
  }

  return null;
}

function looksLikeCoinCategory(identification: GeminiIdentifyResponse): boolean {
  const haystack = [identification.category, identification.objectType, identification.name]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  return haystack.includes("coin") || haystack.includes("dollar") || haystack.includes("cent");
}

function buildLegacyCredentialToken(): string | null {
  if (AppConfig.pcgs.email && AppConfig.pcgs.password) {
    return `${AppConfig.pcgs.email}:${AppConfig.pcgs.password}`;
  }

  if (AppConfig.pcgs.username && AppConfig.pcgs.password) {
    return `${AppConfig.pcgs.username}:${AppConfig.pcgs.password}`;
  }

  return null;
}

export class PCGSClient {
  private async fetchWithTimeout(path: string, bearerToken: string): Promise<Response> {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId = setTimeout(() => {
      controller?.abort();
    }, PCGS_REQUEST_TIMEOUT_MS);

    try {
      return await fetch(`${PCGS_API_BASE}${path}`, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${bearerToken}`,
        },
        signal: controller?.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`PCGS request timed out after ${PCGS_REQUEST_TIMEOUT_MS}ms.`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private resolveBearerToken(): string | null {
    return AppConfig.pcgs.apiKey ?? buildLegacyCredentialToken();
  }

  private async getJson<T>(path: string, attempts = 2): Promise<T> {
    const bearerToken = this.resolveBearerToken();
    if (!bearerToken) {
      throw new Error("PCGS API key is not configured.");
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      await throttlePcgsRequests();

      const response = await this.fetchWithTimeout(path, bearerToken);

      if (response.ok) {
        return (await response.json()) as T;
      }

      const text = await response.text();
      lastError = new Error(`PCGS request failed (${response.status}): ${text.slice(0, 240)}`);
      const shouldRetry = [401, 429, 500, 502, 503, 504].includes(response.status);

      if (!shouldRetry || attempt >= attempts) {
        throw lastError;
      }

      await delay(PCGS_RETRY_DELAY_MS * attempt);
    }

    throw lastError ?? new Error("Unknown PCGS request failure.");
  }

  private async lookupByCertNo(certNo: string): Promise<PCGSCoinPrice | null> {
    const path = `/coindetail/GetCoinFactsByCertNo/${encodeURIComponent(certNo)}?retrieveAllData=true`;
    const payload = await this.getJson<unknown>(path);
    const normalized = extractCoinFactsPayload(payload);
    return normalized ? buildCoinPrice(normalized) : null;
  }

  private async lookupByBarcode(
    barcode: string,
    gradingService: "PCGS" | "NGC" = "PCGS",
  ): Promise<PCGSCoinPrice | null> {
    const query = new URLSearchParams({
      barcode,
      gradingService,
    });
    const payload = await this.getJson<unknown>(`/coindetail/GetCoinFactsByBarcode?${query.toString()}`);
    const normalized = extractCoinFactsPayload(payload);
    return normalized ? buildCoinPrice(normalized) : null;
  }

  private async lookupByGrade(
    pcgsNo: string | number,
    gradeNo: number,
    plusGrade = false,
  ): Promise<PCGSCoinPrice | null> {
    const query = new URLSearchParams({
      PCGSNo: String(pcgsNo),
      GradeNo: String(gradeNo),
      PlusGrade: plusGrade ? "true" : "false",
    });
    const payload = await this.getJson<unknown>(`/coindetail/GetCoinFactsByGrade?${query.toString()}`);
    const normalized = extractCoinFactsPayload(payload);
    return normalized ? buildCoinPrice(normalized) : null;
  }

  async lookupCoin(params: LookupParams): Promise<PCGSCoinPrice | null> {
    const cacheKey = buildLookupCacheKey(params);
    if (cacheKey) {
      const cached = await readCachedLookup(cacheKey);
      if (cached) {
        return cached;
      }
    }

    let result: PCGSCoinPrice | null = null;

    if (params.certNo) {
      result = await this.lookupByCertNo(params.certNo);
    } else if (params.barcode) {
      result = await this.lookupByBarcode(params.barcode, params.gradingService ?? "PCGS");
    } else if (params.pcgsNo != null && params.gradeNo != null) {
      result = await this.lookupByGrade(params.pcgsNo, params.gradeNo, params.plusGrade === true);
    } else {
      return null;
    }

    if (result && cacheKey) {
      await writeCachedLookup(cacheKey, result);
    }

    return result;
  }

  async safeLookup(identification: GeminiIdentifyResponse): Promise<PCGSCoinPrice | null> {
    try {
      if (!looksLikeCoinCategory(identification)) {
        return null;
      }

      const certNo = deriveCertNo(identification);
      if (certNo) {
        return await this.lookupCoin({ certNo });
      }

      const barcode = deriveBarcode(identification);
      if (barcode) {
        return await this.lookupCoin({ barcode, gradingService: "PCGS" });
      }

      const pcgsNo = derivePcgsNo(identification);
      const grade = deriveGradeInfo(identification);
      if (pcgsNo && grade) {
        return await this.lookupCoin({
          pcgsNo,
          gradeNo: grade.gradeNo,
          plusGrade: grade.plusGrade,
        });
      }

      return null;
    } catch (error) {
      console.warn("[PCGS] Coin lookup failed.", error);
      return null;
    }
  }
}

export const pcgsClient = new PCGSClient();
