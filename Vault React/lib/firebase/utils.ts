import {
  collection,
  orderBy,
  query,
  where,
  type DocumentData,
  type DocumentSnapshot,
  type Query,
  type QueryConstraint,
} from "firebase/firestore";

import { getVaultScopeDb } from "@/lib/firebase/config";
import type { GeminiIdentifyResponse } from "@/lib/gemini/types";
import type { AntiqueAuction, SearchFilters } from "@/lib/firebase/types";

export interface FirestoreSearchQueryOptions {
  sortDirection?: "asc" | "desc";
}

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "from",
  "into",
  "over",
  "under",
]);

const GENERIC_SEARCH_NOISE = new Set([
  "vintage",
  "antique",
  "old",
  "nice",
  "rare",
  "collectible",
  "collectibles",
  "item",
  "items",
  "piece",
  "pieces",
  "estate",
]);

const SHORT_SEARCH_IDENTIFIERS = new Set([
  "1c",
  "2c",
  "3c",
  "5c",
  "10c",
  "20c",
  "25c",
  "50c",
  "cc",
  "lp",
  "ep",
  "45",
  "78",
  "nm",
  "vg",
  "xf",
  "au",
  "ms",
  "pr",
]);

const COIN_DENOMINATION_TERMS = new Set([
  "cent",
  "nickel",
  "dime",
  "quarter",
  "half",
  "dollar",
  "eagle",
  "sovereign",
  "krugerrand",
  "maple",
]);

const COIN_VARIETY_TERMS = new Set([
  "vdb",
  "ddo",
  "ddr",
  "proof",
  "cameo",
  "dmpl",
  "pl",
]);

const METAL_TERMS = new Set(["silver", "gold", "platinum", "palladium", "copper", "bronze", "nickel"]);

function isUsefulSearchToken(token: string): boolean {
  if (!token) {
    return false;
  }

  if (STOP_WORDS.has(token) || GENERIC_SEARCH_NOISE.has(token)) {
    return false;
  }

  if (/^\d{4}$/.test(token) || /^\d{4}s$/.test(token)) {
    return true;
  }

  if (SHORT_SEARCH_IDENTIFIERS.has(token)) {
    return true;
  }

  if (/^[a-z]{1,3}\d{2,}$/.test(token) || /^\d+[a-z]{1,4}$/.test(token)) {
    return true;
  }

  if (token.length >= 3) {
    return true;
  }

  return false;
}

function tokenizeKeywordValue(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .split(/[^a-z0-9]+/i)
    .map((keyword) => keyword.trim())
    .filter(isUsefulSearchToken);
}

function addUniqueKeywords(target: string[], candidates: Array<string | null | undefined>): void {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const keywords = tokenizeKeywordValue(candidate);
    for (const keyword of keywords) {
      if (!target.includes(keyword)) {
        target.push(keyword);
      }
    }
  }
}

function addVerifiedKeywords(target: string[], candidates: Array<string | null | undefined>): void {
  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      continue;
    }

    const normalized = candidate.trim().toLowerCase();
    if (!normalized || target.includes(normalized)) {
      continue;
    }

    target.push(normalized);
  }
}

function extractCoinMintMarks(values: Array<string | null | undefined>): string[] {
  const haystack = values
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");

  return Array.from(new Set(haystack.match(/\b(?:cc|s|d|p|o)\b/g) ?? []));
}

function extractCoinDenominationTerms(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .flatMap((value) => (typeof value === "string" ? tokenizeKeywordValue(value) : []))
        .filter((token) => COIN_DENOMINATION_TERMS.has(token) || /^\d{1,2}c$/.test(token)),
    ),
  );
}

function extractCoinSpecificTerms(identification: GeminiIdentifyResponse): string[] {
  const rawValues = [
    identification.name,
    identification.objectType,
    identification.material,
    ...(identification.searchKeywords ?? []),
    ...(identification.distinguishingFeatures ?? []),
  ];

  const normalizedTokens = rawValues.flatMap((value) =>
    typeof value === "string" ? tokenizeKeywordValue(value) : [],
  );
  const varieties = normalizedTokens.filter(
    (token) => COIN_VARIETY_TERMS.has(token) || /^(?:ms|pr|pf|vf|xf|au)\d{2}$/i.test(token),
  );
  const metals = normalizedTokens.filter((token) => METAL_TERMS.has(token));

  return Array.from(
    new Set([
      ...extractCoinMintMarks(rawValues),
      ...extractCoinDenominationTerms(rawValues),
      ...metals,
      ...varieties,
    ]),
  );
}

function extractVinylSpecificTerms(identification: GeminiIdentifyResponse): string[] {
  const vinylKeywords: string[] = [];

  if (identification.catalogNumber) {
    addVerifiedKeywords(
      vinylKeywords,
      identification.catalogNumber
        .toLowerCase()
        .split(/[\s-]+/)
        .filter((part) => part.length > 1),
    );
  }

  if (identification.year) {
    vinylKeywords.push(`${Math.floor(identification.year / 10) * 10}s`);
  }

  addUniqueKeywords(vinylKeywords, [
    identification.name,
    identification.makerOrBrand,
    ...(identification.searchKeywords ?? []),
  ]);

  return vinylKeywords;
}

function extractGenericSpecificTerms(identification: GeminiIdentifyResponse): string[] {
  const keywords: string[] = [];
  addUniqueKeywords(keywords, [
    identification.objectType,
    identification.material,
    identification.origin,
    identification.makerOrBrand,
    ...(identification.distinguishingFeatures ?? []),
  ]);
  return keywords;
}

const CATEGORY_KEYWORDS: Array<{ category: AntiqueAuction["category"]; keywords: string[] }> = [
  { category: "furniture", keywords: ["furniture", "chair", "table", "cabinet", "desk", "stool"] },
  { category: "ceramics", keywords: ["ceramic", "porcelain", "pottery", "vase", "china", "stoneware"] },
  { category: "art", keywords: ["painting", "art", "print", "canvas", "watercolor", "etching"] },
  { category: "jewelry", keywords: ["jewelry", "ring", "necklace", "bracelet", "brooch", "pendant"] },
];

function toIsoString(value: unknown): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }

  return null;
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parsePriceText(value: string): number | null {
  const normalized = value.replace(/[^0-9.,-]/g, "").trim();

  if (!normalized) {
    return null;
  }

  const sanitized = normalized.includes(".")
    ? normalized.replace(/,/g, "")
    : normalized.replace(/,/g, ".");
  const parsed = Number(sanitized);

  return Number.isFinite(parsed) ? parsed : null;
}

export function detectAuctionCategory(title: string): AntiqueAuction["category"] {
  const normalized = title.toLowerCase();

  for (const rule of CATEGORY_KEYWORDS) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return rule.category;
    }
  }

  return "general";
}

export function extractSearchKeywords(queryText: string): string[] {
  const normalized = queryText.toLowerCase().trim();

  if (!normalized) {
    return [];
  }

  return Array.from(new Set(tokenizeKeywordValue(normalized))).slice(0, 10);
}

export function buildEnhancedSearchQuery(
  identification: GeminiIdentifyResponse,
): string[] {
  const keywords: string[] = [];
  addUniqueKeywords(keywords, identification.searchKeywords ?? []);

  if (identification.year && !keywords.includes(String(identification.year))) {
    keywords.push(String(identification.year));
  }

  const normalizedCategory = identification.category?.trim().toLowerCase() ?? "general";

  if (normalizedCategory === "coin") {
    addVerifiedKeywords(keywords, extractCoinSpecificTerms(identification));
  } else if (normalizedCategory === "vinyl") {
    addVerifiedKeywords(keywords, extractVinylSpecificTerms(identification));
  } else {
    addUniqueKeywords(keywords, extractGenericSpecificTerms(identification));
  }

  addUniqueKeywords(keywords, [
    identification.name,
    identification.objectType,
    identification.material,
    identification.makerOrBrand,
    identification.origin,
  ]);

  return Array.from(new Set(keywords.map((keyword) => keyword.toLowerCase()))).slice(0, 10);
}

export function buildFirestoreQuery(
  keywords: string[],
  filters: SearchFilters = {},
  options: FirestoreSearchQueryOptions = {},
): Query<DocumentData> {
  const constraints: QueryConstraint[] = [];
  const sortDirection = options.sortDirection ?? "desc";

  if (keywords.length > 0) {
    constraints.push(where("keywords", "array-contains-any", keywords.slice(0, 10)));
  }

  if (filters.category) {
    constraints.push(where("category", "==", filters.category.trim().toLowerCase()));
  }

  if (filters.period) {
    constraints.push(where("period", "==", filters.period.trim()));
  }

  if (typeof filters.priceMin === "number") {
    constraints.push(where("priceRealized", ">=", filters.priceMin));
  }

  if (typeof filters.priceMax === "number") {
    constraints.push(where("priceRealized", "<=", filters.priceMax));
  }

  if (filters.dateFrom) {
    constraints.push(where("saleDate", ">=", filters.dateFrom));
  }

  if (filters.dateTo) {
    constraints.push(where("saleDate", "<=", filters.dateTo));
  }

  constraints.push(orderBy("priceRealized", sortDirection));

  return query(collection(getVaultScopeDb(), "antique_auctions"), ...constraints);
}

export function normalizeResults(
  docs: Array<DocumentSnapshot<DocumentData>>,
): AntiqueAuction[] {
  return docs
    .filter((doc) => doc.exists())
    .map((doc) => {
      const data = doc.data() ?? {};

      return {
        id: doc.id,
        title: normalizeString(data.title) ?? "Untitled item",
        description: normalizeString(data.description) ?? "",
        priceRealized: normalizeNumber(data.priceRealized),
        estimateLow: normalizeNumber(data.estimateLow),
        estimateHigh: normalizeNumber(data.estimateHigh),
        auctionHouse: normalizeString(data.auctionHouse),
        saleDate: toIsoString(data.saleDate),
        category: normalizeString(data.category) ?? detectAuctionCategory(String(data.title ?? "")),
        period: normalizeString(data.period),
        material: normalizeString(data.material),
        originCountry: normalizeString(data.originCountry),
        imageUrl: normalizeString(data.imageUrl),
        source: normalizeString(data.source) ?? "unknown",
        keywords: Array.isArray(data.keywords)
          ? Array.from(
              new Set(
                data.keywords
                  .filter((keyword): keyword is string => typeof keyword === "string")
                  .map((keyword) => keyword.trim().toLowerCase())
                  .filter(Boolean),
              ),
            )
          : [],
        createdAt: toIsoString(data.createdAt),
        updatedAt: toIsoString(data.updatedAt),
      };
    });
}
