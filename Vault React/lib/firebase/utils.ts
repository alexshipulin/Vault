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
import type { AntiqueAuction, SearchFilters } from "@/lib/firebase/types";

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

  return Array.from(
    new Set(
      normalized
        .split(/[^a-z0-9]+/i)
        .map((keyword) => keyword.trim())
        .filter((keyword) => keyword.length > 2)
        .filter((keyword) => !STOP_WORDS.has(keyword)),
    ),
  ).slice(0, 10);
}

export function buildFirestoreQuery(
  keywords: string[],
  filters: SearchFilters = {},
): Query<DocumentData> {
  const constraints: QueryConstraint[] = [];

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

  constraints.push(orderBy("priceRealized", "desc"));

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
