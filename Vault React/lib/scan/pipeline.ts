import { attachScanIdToAnalysisLog, createAnalysisLogBuilder } from "@/lib/analysis/logs";
import { ensureAnonymousSession } from "@/lib/firebase/auth";
import { getVaultScopeAuth } from "@/lib/firebase/config";
import { saveFailedScanLog, saveScanResult } from "@/lib/firebase/firestore";
import { AntiqueSearchEngine } from "@/lib/firebase/search";
import { uploadScanImage } from "@/lib/firebase/storage";
import type { AntiqueAuction } from "@/lib/firebase/types";
import { buildEnhancedSearchQuery, extractSearchKeywords } from "@/lib/firebase/utils";
import { GeminiClient, GeminiInvalidJsonError } from "@/lib/gemini/client";
import type { GeminiIdentifyResponse, GeminiMarketTier } from "@/lib/gemini/types";
import { performanceMonitor } from "@/lib/performance/monitoring";
import type { ScanLookupProgress, ScanProgressState, ScanResult, VisionResult } from "@/lib/scan/types";
import { ScanPipelineError } from "@/lib/scan/types";
import type {
  AppraisalMode,
  PriceEstimate,
  PriceSourceBreakdown,
  ValuationEvidenceStrength,
} from "@/lib/types";
import { VisionProcessor } from "@/lib/vision/processor";
import { getPricingForItem } from "@src/services/pricing/priceRouter";
import { t } from "@src/shared/i18n/strings";

const STEP_LABELS: Record<ScanProgressState["step"], string> = {
  processing: "Processing image...",
  identifying: "Identifying item...",
  pricing: "Finding prices...",
  saving: "Almost done...",
  done: "Scan complete",
};

const SEARCH_CATEGORY_HINTS: Array<{ category: string; keywords: string[] }> = [
  {
    category: "ceramics",
    keywords: ["ceramic", "ceramics", "porcelain", "pottery", "vase", "jar", "stoneware", "earthenware", "urn", "glaze"],
  },
  {
    category: "furniture",
    keywords: ["furniture", "chair", "table", "cabinet", "desk", "stool", "bench", "dresser"],
  },
  {
    category: "art",
    keywords: ["painting", "art", "print", "canvas", "watercolor", "etching", "drawing", "sculpture"],
  },
  {
    category: "jewelry",
    keywords: ["jewelry", "ring", "necklace", "bracelet", "brooch", "pendant", "earring"],
  },
];

const GENERIC_DECORATIVE_TERMS = [
  "vase",
  "jar",
  "storage jar",
  "stoneware",
  "pottery",
  "ceramic",
  "urn",
  "bowl",
];

const PREMIUM_AUCTION_SOURCES = new Set(["heritage", "liveauctioneers"]);
const PRACTICAL_MARKET_SOURCES = new Set(["ebay"]);
const MYSTERY_DEFAULT_CEILINGS: Record<GeminiMarketTier, number> = {
  junk: 40,
  decor: 100,
  secondary: 150,
  collector: 250,
  premium_antique: 250,
};

const LOOKUP_PROGRESS: Record<ScanLookupProgress["sourceKey"], { sourceLabel: string; message: string }> = {
  image_preparation: {
    sourceLabel: "Image preparation",
    message: t("processing.detail.image_preparation"),
  },
  gemini: {
    sourceLabel: "Gemini AI",
    message: t("processing.detail.gemini"),
  },
  condition: {
    sourceLabel: "Condition review",
    message: t("processing.detail.condition"),
  },
  marketplace: {
    sourceLabel: "Marketplace sales",
    message: t("processing.detail.marketplace"),
  },
  auction_records: {
    sourceLabel: "Auction records",
    message: t("processing.detail.auction_records"),
  },
  pcgs: {
    sourceLabel: "PCGS Price Guide",
    message: t("processing.detail.pcgs"),
  },
  discogs: {
    sourceLabel: "Discogs Marketplace",
    message: t("processing.detail.discogs"),
  },
  metals: {
    sourceLabel: "Metals API",
    message: t("processing.detail.metals"),
  },
  final_estimate: {
    sourceLabel: "Final estimate",
    message: t("processing.detail.final_estimate"),
  },
  saving: {
    sourceLabel: "Result storage",
    message: t("processing.detail.saving"),
  },
};

type ScanPipelineOptions = {
  onProgress?: (progress: ScanProgressState) => void;
  visionProcessor?: VisionProcessor;
  geminiClient?: GeminiClient;
  searchEngine?: AntiqueSearchEngine;
};

type RankedComparable = {
  item: AntiqueAuction;
  price: number | null;
  score: number;
  matchedTokens: string[];
};

type ValuationAssessment = {
  matchedSources: string[];
  sourceBreakdown: PriceSourceBreakdown;
  warnings: string[];
  needsReview: boolean;
  suppressDatabaseEstimate: boolean;
  suppressAiFallback: boolean;
  evidenceStrength: ValuationEvidenceStrength;
  comparableCount: number;
  topScore: number;
  strongComparableCount: number;
  practicalSourceCount: number;
  premiumOnly: boolean;
  exactLikeCluster: boolean;
  hasMarkEvidence: boolean;
};

function extractCombinedText(results: VisionResult[]): string {
  return results
    .map((result) => result.text.trim())
    .filter(Boolean)
    .join("\n");
}

function normalizeSourceName(source: string | null | undefined): string {
  const normalized = source?.trim().toLowerCase();
  if (!normalized) {
    return "unknown";
  }

  return normalized;
}

function quantile(sortedNumbers: number[], percentile: number): number | null {
  if (sortedNumbers.length === 0) {
    return null;
  }

  const position = (sortedNumbers.length - 1) * percentile;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sortedNumbers[lowerIndex] ?? sortedNumbers[0];
  const upper = sortedNumbers[upperIndex] ?? sortedNumbers[sortedNumbers.length - 1];

  if (lowerIndex === upperIndex) {
    return lower;
  }

  const weight = position - lowerIndex;
  return lower + (upper - lower) * weight;
}

function buildTokenSet(values: Array<string | null | undefined>): Set<string> {
  return new Set(
    extractSearchKeywords(
      values
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .join(" "),
    ),
  );
}

function deriveSearchCategory(
  identification: GeminiIdentifyResponse,
  requestedCategory: string,
): string | undefined {
  const normalizedContext = [
    identification.category,
    identification.objectType,
    identification.material,
    identification.name,
    identification.origin,
    requestedCategory,
    ...identification.searchKeywords,
    ...(identification.distinguishingFeatures ?? []),
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .toLowerCase();

  for (const hint of SEARCH_CATEGORY_HINTS) {
    if (hint.keywords.some((keyword) => normalizedContext.includes(keyword))) {
      return hint.category;
    }
  }

  return undefined;
}

function buildComparableQueryKeywords(
  identification: GeminiIdentifyResponse,
  visionResults: VisionResult[],
): string[] {
  const keywords = buildEnhancedSearchQuery(identification);
  const barcodeTerms = visionResults.flatMap((result) =>
    result.barcodes.flatMap((barcode) => extractSearchKeywords(barcode.data)),
  );

  return Array.from(new Set([...keywords, ...barcodeTerms])).slice(0, 10);
}

function resolveIdentificationCategory(identification: GeminiIdentifyResponse): string {
  const normalized = identification.category?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : "general";
}

function buildLookupProgress(
  sourceKey: ScanLookupProgress["sourceKey"],
  message?: string,
): ScanLookupProgress {
  const defaults = LOOKUP_PROGRESS[sourceKey];
  return {
    sourceKey,
    sourceLabel: defaults.sourceLabel,
    message: message?.trim() || defaults.message,
  };
}

function createScanResultID(): string {
  return `scan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function appendUniqueWarning(
  warnings: string[] | undefined,
  warning: string | null | undefined,
): string[] | undefined {
  const normalizedWarning = warning?.trim();
  if (!normalizedWarning) {
    return warnings;
  }

  const nextWarnings = [...(warnings ?? [])];
  if (!nextWarnings.includes(normalizedWarning)) {
    nextWarnings.push(normalizedWarning);
  }

  return nextWarnings;
}

function scoreComparableRelevance(
  comparable: Pick<AntiqueAuction, "keywords" | "saleDate" | "category">,
  queryKeywords: string[],
  itemCategory: string,
): number {
  if (!comparable.keywords?.length) {
    return 0;
  }

  const normalizedComparableKeywords = comparable.keywords.map((keyword) => keyword.toLowerCase());
  const matched = normalizedComparableKeywords.filter((keyword) => queryKeywords.includes(keyword)).length;
  const keywordScore = matched / Math.max(queryKeywords.length, 1);
  const categoryBonus =
    itemCategory !== "general" && comparable.category === itemCategory ? 0.25 : 0;

  let recencyScore = 0.1;
  if (comparable.saleDate) {
    const saleDate = Date.parse(comparable.saleDate);
    if (Number.isFinite(saleDate)) {
      const ageMonths = (Date.now() - saleDate) / (1000 * 60 * 60 * 24 * 30);
      recencyScore = ageMonths < 6 ? 0.25 : ageMonths < 12 ? 0.15 : ageMonths < 24 ? 0.1 : 0.05;
    }
  }

  return keywordScore * 0.5 + categoryBonus + recencyScore;
}

function rankComparableAuctions(
  results: AntiqueAuction[],
  identification: GeminiIdentifyResponse,
  requestedCategory: string,
  appraisalMode: AppraisalMode,
): RankedComparable[] {
  const queryKeywords = buildEnhancedSearchQuery(identification);
  const identificationTokens = buildTokenSet([
    identification.name,
    identification.objectType,
    identification.material,
    identification.makerOrBrand,
    identification.origin,
    ...identification.searchKeywords,
    ...(identification.distinguishingFeatures ?? []).slice(0, 8),
  ]);
  const normalizedName = identification.name.trim().toLowerCase();
  const requestedSearchCategory =
    deriveSearchCategory(identification, requestedCategory) ?? resolveIdentificationCategory(identification);
  const normalizedOrigin = identification.origin?.trim().toLowerCase() ?? "";
  const normalizedMaterial = identification.material?.trim().toLowerCase() ?? "";
  const normalizedObjectType = identification.objectType?.trim().toLowerCase() ?? "";

  return results
    .map((item) => {
      const candidateTokens = buildTokenSet([
        item.title,
        item.description,
        item.category,
        item.material,
        item.originCountry,
        item.auctionHouse,
        ...(item.keywords ?? []),
      ]);
      const matchedTokens = Array.from(identificationTokens).filter((token) => candidateTokens.has(token));
      const normalizedTitle = item.title.trim().toLowerCase();
      const normalizedDescription = item.description.trim().toLowerCase();

      let score = scoreComparableRelevance(item, queryKeywords, requestedSearchCategory);

      if (normalizedName && normalizedTitle.includes(normalizedName)) {
        score += 0.08;
      }
      if (normalizedObjectType && `${normalizedTitle} ${normalizedDescription}`.includes(normalizedObjectType)) {
        score += 0.06;
      }
      if (normalizedMaterial && `${normalizedTitle} ${normalizedDescription}`.includes(normalizedMaterial)) {
        score += 0.06;
      }
      if (normalizedOrigin && (item.originCountry ?? "").trim().toLowerCase().includes(normalizedOrigin)) {
        score += 0.04;
      }
      if (
        requestedSearchCategory &&
        item.category &&
        item.category !== "general" &&
        item.category !== requestedSearchCategory
      ) {
        score -= 0.08;
      }

      if (appraisalMode === "mystery") {
        const normalizedSource = normalizeSourceName(item.source);

        if (normalizedSource === "ebay") {
          score += 0.12;
        } else if (normalizedSource === "liveauctioneers") {
          score -= 0.05;
        } else if (normalizedSource === "heritage") {
          score -= 0.1;
        }

        if (
          PREMIUM_AUCTION_SOURCES.has(normalizedSource) &&
          !identification.makerOrBrand &&
          score < 0.78
        ) {
          score -= 0.08;
        }
      }

      return {
        item,
        price: typeof item.priceRealized === "number" && Number.isFinite(item.priceRealized) ? item.priceRealized : null,
        score: Math.max(0, Math.min(score, 1)),
        matchedTokens,
      };
    })
    .filter((candidate) => candidate.price != null)
    .filter((candidate) => candidate.score >= 0.3)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      const leftDate = left.item.saleDate ? Date.parse(left.item.saleDate) : 0;
      const rightDate = right.item.saleDate ? Date.parse(right.item.saleDate) : 0;
      return rightDate - leftDate;
    });
}

function filterComparableOutliers(candidates: RankedComparable[]): RankedComparable[] {
  if (candidates.length <= 3) {
    return candidates;
  }

  const prices = candidates
    .map((candidate) => candidate.price)
    .filter((price): price is number => typeof price === "number" && Number.isFinite(price))
    .sort((left, right) => left - right);
  const median = quantile(prices, 0.5);

  if (!median || median <= 0) {
    return candidates;
  }

  return candidates.filter((candidate) => {
    if (candidate.price == null) {
      return false;
    }

    const ratio = candidate.price / median;
    if (ratio >= 0.25 && ratio <= 4) {
      return true;
    }

    return candidate.score >= 0.72;
  });
}

function sourceList(results: Array<RankedComparable | AntiqueAuction>): string[] {
  return Array.from(
    new Set(
      results
        .map((result) => ("item" in result ? result.item.source : result.source))
        .map((source) => normalizeSourceName(source))
        .filter((source) => source !== "unknown"),
    ),
  );
}

function buildSourceBreakdown(results: RankedComparable[]): PriceSourceBreakdown {
  return results.reduce<PriceSourceBreakdown>(
    (accumulator, result) => {
      const normalized = normalizeSourceName(result.item.source);

      if (normalized === "ebay") {
        accumulator.ebay += 1;
      } else if (normalized === "liveauctioneers") {
        accumulator.liveauctioneers += 1;
      } else if (normalized === "heritage") {
        accumulator.heritage += 1;
      }

      return accumulator;
    },
    { ebay: 0, liveauctioneers: 0, heritage: 0 },
  );
}

function hasMeaningfulOcrEvidence(ocrText: string): boolean {
  return extractSearchKeywords(ocrText).length >= 2;
}

function hasNumericEstimate(estimate: Pick<PriceEstimate, "low" | "high"> | null | undefined): boolean {
  return typeof estimate?.low === "number" || typeof estimate?.high === "number";
}

function getEstimateConfidence(
  estimate: Pick<PriceEstimate, "confidence" | "valuationConfidence"> | null | undefined,
): number {
  if (!estimate) {
    return 0;
  }

  return typeof estimate.valuationConfidence === "number"
    ? estimate.valuationConfidence
    : estimate.confidence;
}

function normalizeEstimateRange(low: number | null, high: number | null): { low: number | null; high: number | null } {
  if (typeof low === "number" && typeof high === "number") {
    return {
      low: Math.min(low, high),
      high: Math.max(low, high),
    };
  }

  return {
    low,
    high,
  };
}

function isGenericDecorativeObject(identification: GeminiIdentifyResponse): boolean {
  const haystack = [
    identification.name,
    identification.objectType,
    identification.material,
    ...identification.searchKeywords,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .toLowerCase();

  return GENERIC_DECORATIVE_TERMS.some((term) => haystack.includes(term));
}

function resolveEvidenceStrength(
  identification: GeminiIdentifyResponse,
  comparables: RankedComparable[],
  sourceBreakdown: PriceSourceBreakdown,
  hasMarkEvidence: boolean,
  appraisalMode: AppraisalMode,
): ValuationEvidenceStrength {
  let score = 0;
  const topScore = comparables[0]?.score ?? 0;
  const strongComparableCount = comparables.filter((candidate) => candidate.score >= 0.72).length;

  if (identification.pricingEvidenceStrength === "strong") {
    score += 2;
  } else if (identification.pricingEvidenceStrength === "moderate") {
    score += 1;
  }

  if (topScore >= 0.78) {
    score += 2;
  } else if (topScore >= 0.55) {
    score += 1;
  }

  if (strongComparableCount >= 3) {
    score += 2;
  } else if (comparables.length >= 2) {
    score += 1;
  }

  if (sourceBreakdown.ebay > 0) {
    score += 1;
  }

  if (hasMarkEvidence) {
    score += 1;
  }

  if (identification.requiresMeasurements || identification.requiresMorePhotos) {
    score -= 1;
  }

  if (identification.isLikelyMassProduced) {
    score -= 1;
  }

  if (identification.isLikelyReproduction) {
    score -= 2;
  }

  if (
    appraisalMode === "mystery" &&
    sourceBreakdown.ebay === 0 &&
    (sourceBreakdown.heritage > 0 || sourceBreakdown.liveauctioneers > 0)
  ) {
    score -= 1;
  }

  if (score >= 4) {
    return "strong";
  }

  if (score >= 2) {
    return "moderate";
  }

  return "weak";
}

function determineMysteryValueCeiling(
  identification: GeminiIdentifyResponse,
  assessment: Pick<
    ValuationAssessment,
    | "evidenceStrength"
    | "exactLikeCluster"
    | "hasMarkEvidence"
    | "matchedSources"
    | "practicalSourceCount"
    | "strongComparableCount"
    | "topScore"
  >,
): number {
  const tier = identification.marketTier ?? "decor";
  const defaultCeiling = MYSTERY_DEFAULT_CEILINGS[tier];
  const aiCeiling = typeof identification.likelyValueCeiling === "number" ? identification.likelyValueCeiling : null;
  let ceiling = aiCeiling != null ? Math.min(aiCeiling, defaultCeiling) : defaultCeiling;

  if (identification.isLikelyReproduction) {
    ceiling = Math.min(ceiling, 75);
  }

  if (
    identification.isLikelyMassProduced ||
    tier === "junk" ||
    tier === "decor"
  ) {
    ceiling = Math.min(ceiling, 100);
  }

  const blockersResolved = !identification.requiresMeasurements && !identification.requiresMorePhotos;
  const canUnlockAbove150 =
    assessment.hasMarkEvidence &&
    blockersResolved &&
    !identification.isLikelyMassProduced &&
    !identification.isLikelyReproduction &&
    assessment.strongComparableCount >= 3 &&
    assessment.matchedSources.length >= 2;

  const canUnlockAbove250 =
    canUnlockAbove150 &&
    assessment.topScore >= 0.78 &&
    (assessment.practicalSourceCount >= 1 || assessment.exactLikeCluster);

  if (canUnlockAbove150) {
    ceiling = Math.max(ceiling, 150);
  }

  if (canUnlockAbove250) {
    ceiling = Math.max(ceiling, aiCeiling && aiCeiling > 250 ? aiCeiling : 500);
  } else {
    ceiling = Math.min(ceiling, 250);
  }

  if (!assessment.hasMarkEvidence && ceiling > 150) {
    ceiling = 150;
  }

  return Math.max(Math.round(ceiling), 15);
}

function clampEstimateToCeiling(estimate: PriceEstimate | null, ceiling: number | null): PriceEstimate | null {
  if (!estimate || ceiling == null || !hasNumericEstimate(estimate)) {
    return estimate
      ? {
          ...estimate,
          appliedValueCeiling: ceiling,
        }
      : null;
  }

  const normalized = normalizeEstimateRange(
    typeof estimate.low === "number" ? Math.min(estimate.low, ceiling) : estimate.low,
    typeof estimate.high === "number" ? Math.min(estimate.high, ceiling) : estimate.high,
  );
  const fallbackLow =
    normalized.low == null && normalized.high != null
      ? normalized.high
      : normalized.low;
  const fallbackHigh =
    normalized.high == null && normalized.low != null
      ? normalized.low
      : normalized.high;

  return {
    ...estimate,
    low: fallbackLow,
    high: fallbackHigh,
    appliedValueCeiling: ceiling,
  };
}

function tightenMysteryFallbackEstimate(
  estimate: PriceEstimate | null,
  assessment: ValuationAssessment,
): PriceEstimate | null {
  if (!estimate || !hasNumericEstimate(estimate)) {
    return estimate;
  }

  const normalized = normalizeEstimateRange(estimate.low, estimate.high);
  const low = normalized.low ?? normalized.high;
  const high = normalized.high ?? normalized.low;

  if (low == null || high == null || high <= low || high > 150 || assessment.evidenceStrength === "strong") {
    return estimate;
  }

  const ratioCap = high <= 60 ? 1.5 : high <= 100 ? 1.75 : 2;
  const spreadCap = high <= 40 ? 10 : high <= 60 ? 12 : high <= 100 ? 15 : 22;
  const tightenedHigh = Math.min(
    high,
    Math.round(low * ratioCap),
    low + spreadCap,
  );

  if (tightenedHigh <= low) {
    return {
      ...estimate,
      low,
      high: low,
    };
  }

  return {
    ...estimate,
    low,
    high: tightenedHigh,
  };
}

function buildMysterySourceLabel(
  source: "database" | "ai_estimate",
  assessment: ValuationAssessment,
  ceiling: number,
): string {
  const sourceSummary =
    assessment.matchedSources.length > 0 ? assessment.matchedSources.join(", ") : "market databases";
  const prefix =
    source === "ai_estimate"
      ? "AI-led conservative estimate cross-checked against market databases."
      : "Database-supported estimate filtered for mystery mode.";

  return `${prefix} Checked sources: ${sourceSummary}. Ceiling applied at $${ceiling}.${assessment.warnings.length ? ` Checks: ${assessment.warnings.join(" ")}` : ""}`;
}

function mergeMysteryEstimates(
  aiEstimate: PriceEstimate | null,
  databaseEstimate: PriceEstimate | null,
  assessment: ValuationAssessment,
  ceiling: number,
): PriceEstimate | null {
  if (!aiEstimate && !databaseEstimate) {
    return null;
  }

  if (!databaseEstimate || !hasNumericEstimate(databaseEstimate)) {
    return aiEstimate
      ? {
          ...aiEstimate,
          sourceLabel: buildMysterySourceLabel("ai_estimate", assessment, ceiling),
        }
      : null;
  }

  if (!aiEstimate || !hasNumericEstimate(aiEstimate)) {
    return {
      ...databaseEstimate,
      source: "database",
      sourceLabel: buildMysterySourceLabel("database", assessment, ceiling),
    };
  }

  const lowCandidates = [aiEstimate.low, databaseEstimate.low].filter(
    (value): value is number => typeof value === "number",
  );
  const highCandidates = [aiEstimate.high, databaseEstimate.high].filter(
    (value): value is number => typeof value === "number",
  );
  const low = lowCandidates.length ? Math.min(...lowCandidates) : null;
  const high = highCandidates.length ? Math.min(Math.max(...highCandidates), ceiling) : ceiling;
  const valuationConfidence = Math.min(
    0.46,
    Math.max(aiEstimate.valuationConfidence ?? aiEstimate.confidence, databaseEstimate.valuationConfidence ?? databaseEstimate.confidence),
  );

  return {
    ...aiEstimate,
    low,
    high,
    confidence: valuationConfidence,
    valuationConfidence,
    source: "ai_estimate",
    sourceLabel: buildMysterySourceLabel("ai_estimate", assessment, ceiling),
  };
}

function assessValuation(
  identification: GeminiIdentifyResponse,
  comparables: RankedComparable[],
  appraisalMode: AppraisalMode,
  ocrText: string,
): ValuationAssessment {
  const matchedSources = sourceList(comparables);
  const sourceBreakdown = buildSourceBreakdown(comparables);
  const warnings = Array.from(new Set(identification.valuationWarnings ?? []));
  const topScore = comparables[0]?.score ?? 0;
  const comparableCount = comparables.length;
  const genericDecorative = isGenericDecorativeObject(identification);
  const hasMarkEvidence = Boolean(identification.makerOrBrand) || hasMeaningfulOcrEvidence(ocrText);
  const strongComparableCount = comparables.filter((candidate) => candidate.score >= 0.72).length;
  const exactLikeCluster =
    comparables.length >= 3 &&
    comparables
      .slice(0, 3)
      .reduce((sum, candidate) => sum + candidate.score, 0) /
      3 >=
      0.82;
  const practicalSourceCount = sourceBreakdown.ebay;
  const premiumOnly =
    practicalSourceCount === 0 &&
    (sourceBreakdown.heritage > 0 || sourceBreakdown.liveauctioneers > 0);
  const evidenceStrength = resolveEvidenceStrength(
    identification,
    comparables,
    sourceBreakdown,
    hasMarkEvidence,
    appraisalMode,
  );

  if (comparableCount < 3) {
    warnings.push("Not enough close market matches were found.");
  }
  if (matchedSources.length < 2 && comparableCount > 0) {
    warnings.push("Comparable matches came from too few independent sources.");
  }
  if (topScore < 0.35 && comparableCount > 0) {
    warnings.push("Comparable items only weakly matched the detected object.");
  }
  if (identification.requiresMeasurements) {
    warnings.push("Dimensions are required for a reliable appraisal.");
  }
  if (identification.requiresMorePhotos) {
    warnings.push("Additional photos are required for a reliable appraisal.");
  }
  if (identification.isLikelyMassProduced) {
    warnings.push("The item may be a common mass-produced object rather than a rare antique.");
  }
  if (identification.isLikelyReproduction) {
    warnings.push("The item may be a later reproduction or decorative copy.");
  }
  if (genericDecorative && !identification.makerOrBrand) {
    warnings.push("Generic unmarked decorative vessels are difficult to price from a single angle.");
  }

  if (appraisalMode === "mystery") {
    warnings.push("Estimate is conservative because flea-market items are usually low-value unless proven otherwise.");

    if (
      identification.isLikelyMassProduced ||
      identification.marketTier === "junk" ||
      identification.marketTier === "decor" ||
      genericDecorative
    ) {
      warnings.push("This appears to be a common decorative object.");
    }

    if (!hasMarkEvidence) {
      warnings.push("No maker mark or provenance was visible.");
    }

    if (premiumOnly && (!hasMarkEvidence || evidenceStrength !== "strong")) {
      warnings.push("Premium auction examples were found, but your item lacks evidence for that attribution.");
    }
  }

  const valuationConfidence = identification.valuationConfidence ?? identification.confidence;
  const needsReview =
    appraisalMode === "mystery"
      ? warnings.length > 0 || evidenceStrength !== "strong" || valuationConfidence < 0.72
      : warnings.length > 0 || identification.confidence < 0.6 || topScore < 0.5;
  const suppressDatabaseEstimate =
    appraisalMode === "mystery"
      ? comparableCount < 2 ||
        evidenceStrength === "weak" ||
        topScore < 0.32 ||
        (premiumOnly && (!hasMarkEvidence || !exactLikeCluster)) ||
        ((identification.requiresMeasurements || identification.requiresMorePhotos) && topScore < 0.82) ||
        identification.isLikelyReproduction === true ||
        ((identification.isLikelyMassProduced || genericDecorative) && practicalSourceCount === 0)
      : comparableCount < 2 ||
        topScore < 0.28 ||
        ((identification.requiresMeasurements || identification.requiresMorePhotos) && topScore < 0.7) ||
        ((identification.isLikelyMassProduced || identification.isLikelyReproduction) && matchedSources.length < 2) ||
        (genericDecorative && !identification.makerOrBrand && matchedSources.length < 2 && topScore < 0.78);
  const suppressAiFallback =
    appraisalMode === "mystery"
      ? valuationConfidence < 0.18
      : identification.confidence < 0.55 ||
        identification.requiresMeasurements === true ||
        identification.requiresMorePhotos === true ||
        identification.isLikelyReproduction === true;

  return {
    matchedSources,
    sourceBreakdown,
    warnings,
    needsReview,
    suppressDatabaseEstimate,
    suppressAiFallback,
    evidenceStrength,
    comparableCount,
    topScore,
    strongComparableCount,
    practicalSourceCount,
    premiumOnly,
    exactLikeCluster,
    hasMarkEvidence,
  };
}

function derivePriceEstimate(
  results: RankedComparable[],
  assessment: ValuationAssessment,
  appraisalMode: AppraisalMode,
): PriceEstimate {
  let filteredResults = results.filter(
    (result): result is RankedComparable & { price: number } =>
      typeof result.price === "number" && Number.isFinite(result.price),
  );
  let prices = filteredResults.map((result) => result.price).sort((left, right) => left - right);

  if (prices.length >= 4) {
    const q1 = prices[Math.floor(prices.length * 0.25)] ?? prices[0];
    const q3 = prices[Math.floor(prices.length * 0.75)] ?? prices[prices.length - 1];
    const iqr = q3 - q1;
    const nextFilteredResults = filteredResults.filter(
      (result) => result.price >= q1 - 1.5 * iqr && result.price <= q3 + 1.5 * iqr,
    );

    if (nextFilteredResults.length >= 2) {
      filteredResults = nextFilteredResults;
      prices = filteredResults.map((result) => result.price).sort((left, right) => left - right);
    }
  }

  if (prices.length === 0) {
    return {
      low: null,
      high: null,
      currency: "USD",
      confidence: 0.2,
      valuationConfidence: 0.2,
      matchedSources: assessment.matchedSources,
      comparableCount: 0,
      needsReview: true,
      valuationWarnings: assessment.warnings,
      valuationMode: appraisalMode,
      evidenceStrength: assessment.evidenceStrength,
      sourceBreakdown: assessment.sourceBreakdown,
    };
  }

  const low = quantile(prices, prices.length <= 2 ? 0 : 0.25) ?? prices[0];
  const high = quantile(prices, prices.length <= 2 ? 1 : 0.75) ?? prices[prices.length - 1];
  const relevanceScores = filteredResults.map((result) => result.score);
  const avgRelevance =
    relevanceScores.length > 0
      ? relevanceScores.reduce((sum, score) => sum + score, 0) / relevanceScores.length
      : 0;
  const countFactor = Math.min(filteredResults.length / 8, 1) * 0.4;
  const relevanceFactor = avgRelevance * 0.4;
  const freshness = 0.2;
  const sourceSummary =
    assessment.matchedSources.length > 0
      ? assessment.matchedSources.join(", ")
      : "market database";
  const confidence = Math.min(0.92, countFactor + relevanceFactor + freshness);

  return {
    low: Math.round(low),
    high: Math.round(high),
    currency: "USD",
    confidence,
    valuationConfidence: confidence,
    source: "database",
    sourceLabel: `Based on ${prices.length} comparable sale${prices.length === 1 ? "" : "s"} from ${sourceSummary}.${assessment.warnings.length ? ` Checks: ${assessment.warnings.join(" ")}` : ""}`,
    matchedSources: assessment.matchedSources,
    comparableCount: filteredResults.length,
    needsReview: assessment.needsReview,
    valuationWarnings: assessment.warnings,
    valuationMode: appraisalMode,
    evidenceStrength: assessment.evidenceStrength,
    sourceBreakdown: assessment.sourceBreakdown,
  };
}

function deriveGeminiFallbackPriceEstimate(
  identification: GeminiIdentifyResponse,
  assessment: ValuationAssessment,
  appraisalMode: AppraisalMode,
): PriceEstimate | null {
  const low = identification.estimatedValueLow ?? null;
  const high = identification.estimatedValueHigh ?? null;
  const pricingConfidence =
    identification.pricingConfidence ?? identification.valuationConfidence ?? identification.confidence;

  if ((low == null && high == null) || assessment.suppressAiFallback) {
    return null;
  }

  const fallbackEstimate: PriceEstimate = {
    low: low ?? high,
    high: high ?? low,
    currency: identification.estimatedValueCurrency ?? "USD",
    confidence:
      appraisalMode === "mystery"
        ? Math.min(0.42, Math.max(0.12, pricingConfidence * 0.75))
        : Math.min(0.6, Math.max(0.15, pricingConfidence)),
    valuationConfidence:
      appraisalMode === "mystery"
        ? Math.min(0.42, Math.max(0.12, pricingConfidence * 0.75))
        : Math.min(0.6, Math.max(0.15, pricingConfidence)),
    source: "ai_estimate",
    sourceLabel: `${
      appraisalMode === "mystery"
        ? identification.pricingBasis ??
          identification.estimatedValueRationale ??
          "AI-led conservative estimate for a likely flea-market item."
        : identification.pricingBasis ??
          identification.estimatedValueRationale ??
          "AI approximation used because no reliable market matches were found."
    }${assessment.warnings.length ? ` Checks: ${assessment.warnings.join(" ")}` : ""}`,
    matchedSources: assessment.matchedSources,
    comparableCount: 0,
    needsReview: true,
    valuationWarnings: assessment.warnings,
    valuationMode: appraisalMode,
    evidenceStrength: assessment.evidenceStrength,
    sourceBreakdown: assessment.sourceBreakdown,
  };

  return appraisalMode === "mystery"
    ? tightenMysteryFallbackEstimate(fallbackEstimate, assessment)
    : fallbackEstimate;
}

function buildSuppressedDatabaseEstimate(
  assessment: ValuationAssessment,
  appraisalMode: AppraisalMode,
): PriceEstimate {
  const confidence = appraisalMode === "mystery" ? 0.12 : 0.15;

  return {
    low: null,
    high: null,
    currency: "USD",
    confidence,
    valuationConfidence: confidence,
    source: "database",
    sourceLabel: `Comparable sales were found, but the match quality was too weak for a trustworthy estimate.${assessment.warnings.length ? ` Checks: ${assessment.warnings.join(" ")}` : ""}`,
    matchedSources: assessment.matchedSources,
    comparableCount: assessment.comparableCount,
    needsReview: true,
    valuationWarnings: assessment.warnings,
    valuationMode: appraisalMode,
    evidenceStrength: assessment.evidenceStrength,
    sourceBreakdown: assessment.sourceBreakdown,
  };
}

function finalizeMysteryPriceEstimate(
  identification: GeminiIdentifyResponse,
  assessment: ValuationAssessment,
  databasePriceEstimate: PriceEstimate,
  aiFallbackPriceEstimate: PriceEstimate | null,
): PriceEstimate {
  const ceiling = determineMysteryValueCeiling(identification, assessment);
  const databaseClamped = clampEstimateToCeiling(databasePriceEstimate, ceiling);
  const aiClamped = clampEstimateToCeiling(aiFallbackPriceEstimate, ceiling);
  const hasDatabaseEstimate = hasNumericEstimate(databaseClamped);
  const hasAiEstimate = hasNumericEstimate(aiClamped);

  if (!hasDatabaseEstimate && !hasAiEstimate) {
    return {
      ...buildSuppressedDatabaseEstimate(assessment, "mystery"),
      sourceLabel: buildMysterySourceLabel("database", assessment, ceiling),
      appliedValueCeiling: ceiling,
    };
  }

  if (assessment.evidenceStrength === "strong" && hasDatabaseEstimate) {
    return {
      ...databaseClamped!,
      source: "database",
      sourceLabel: buildMysterySourceLabel("database", assessment, ceiling),
      appliedValueCeiling: ceiling,
    };
  }

  if (hasAiEstimate) {
    if (!hasDatabaseEstimate || assessment.evidenceStrength === "weak" || assessment.premiumOnly) {
      return {
        ...aiClamped!,
        source: "ai_estimate",
        sourceLabel: buildMysterySourceLabel("ai_estimate", assessment, ceiling),
        appliedValueCeiling: ceiling,
      };
    }

    const merged = mergeMysteryEstimates(aiClamped, databaseClamped, assessment, ceiling);
    if (merged) {
      return {
        ...merged,
        appliedValueCeiling: ceiling,
      };
    }
  }

  return {
    ...databaseClamped!,
    source: "database",
    sourceLabel: buildMysterySourceLabel("database", assessment, ceiling),
    appliedValueCeiling: ceiling,
  };
}

function selectStandardPriceEstimate(
  databasePriceEstimate: PriceEstimate,
  aiPriceEstimate: PriceEstimate | null,
  comparableCount: number,
): PriceEstimate {
  const comparableConfidence = getEstimateConfidence(databasePriceEstimate);
  const hasDatabaseEstimate = hasNumericEstimate(databasePriceEstimate);
  const hasAiEstimate = hasNumericEstimate(aiPriceEstimate);

  if ((comparableCount === 0 || comparableConfidence < 0.4) && hasAiEstimate) {
    return aiPriceEstimate!;
  }

  if (hasDatabaseEstimate && hasAiEstimate) {
    return comparableConfidence >= 0.5 ? databasePriceEstimate : aiPriceEstimate!;
  }

  if (hasDatabaseEstimate) {
    return databasePriceEstimate;
  }

  return aiPriceEstimate ?? databasePriceEstimate;
}

function buildRoutedStandardPriceEstimate(
  routedPriceResult: {
    low: number | null;
    high: number | null;
    source: "pcgs" | "discogs" | "metals" | "firestore" | "ai_estimate";
    sourceLabel: string;
    confidenceLevel: "high" | "medium" | "low";
  },
  identification: GeminiIdentifyResponse,
  databasePriceEstimate: PriceEstimate,
  aiPriceEstimate: PriceEstimate | null,
  valuationAssessment: ValuationAssessment,
): PriceEstimate {
  const sourceConfidenceMap: Record<"high" | "medium" | "low", number> = {
    high: 0.85,
    medium: 0.6,
    low: 0.35,
  };
  const referenceEstimate =
    routedPriceResult.source === "firestore"
      ? databasePriceEstimate
      : routedPriceResult.source === "ai_estimate"
        ? aiPriceEstimate ?? databasePriceEstimate
        : undefined;
  const low =
    routedPriceResult.low == null && routedPriceResult.high != null
      ? routedPriceResult.high
      : routedPriceResult.low;
  const high =
    routedPriceResult.high == null && routedPriceResult.low != null
      ? routedPriceResult.low
      : routedPriceResult.high;
  const valuationConfidence =
    routedPriceResult.source === "firestore"
      ? getEstimateConfidence(databasePriceEstimate)
      : routedPriceResult.source === "ai_estimate"
        ? getEstimateConfidence(aiPriceEstimate) ||
          identification.pricingConfidence ||
          identification.valuationConfidence ||
          identification.confidence
        : sourceConfidenceMap[routedPriceResult.confidenceLevel];
  const source =
    routedPriceResult.source === "firestore"
      ? "database"
      : routedPriceResult.source === "pcgs"
        ? "pcgs"
        : routedPriceResult.source === "discogs"
          ? "discogs"
          : routedPriceResult.source === "metals"
            ? "metals"
          : "ai_estimate";

  return {
    low,
    high,
    currency: identification.estimatedValueCurrency ?? referenceEstimate?.currency ?? "USD",
    confidence: valuationConfidence,
    valuationConfidence,
    source,
    sourceLabel: routedPriceResult.sourceLabel,
    matchedSources: referenceEstimate?.matchedSources ?? valuationAssessment.matchedSources,
    comparableCount: referenceEstimate?.comparableCount ?? valuationAssessment.comparableCount,
    needsReview:
      source === "ai_estimate"
        ? referenceEstimate?.needsReview ?? true
        : referenceEstimate?.needsReview ?? false,
    valuationWarnings: referenceEstimate?.valuationWarnings ?? valuationAssessment.warnings,
    valuationMode: "standard",
    evidenceStrength: referenceEstimate?.evidenceStrength ?? valuationAssessment.evidenceStrength,
    appliedValueCeiling: referenceEstimate?.appliedValueCeiling ?? null,
    sourceBreakdown: referenceEstimate?.sourceBreakdown ?? valuationAssessment.sourceBreakdown,
  };
}

export class ScanPipeline {
  private readonly visionProcessor: VisionProcessor;

  private readonly geminiClient: GeminiClient;

  private readonly searchEngine: AntiqueSearchEngine;

  private readonly onProgress?: (progress: ScanProgressState) => void;

  private lastLookupProgress: ScanLookupProgress | null = null;

  constructor(options: ScanPipelineOptions = {}) {
    this.visionProcessor = options.visionProcessor ?? new VisionProcessor();
    this.geminiClient = options.geminiClient ?? new GeminiClient();
    this.searchEngine = options.searchEngine ?? new AntiqueSearchEngine();
    this.onProgress = options.onProgress;
  }

  async executeScan(
    images: string[],
    category: string,
    appraisalMode: AppraisalMode = "standard",
  ): Promise<ScanResult> {
    const currentUser = await this.resolveCurrentUser();
    const pipelineStartedAt = Date.now();
    const scanResultID = createScanResultID();
    const logBuilder = createAnalysisLogBuilder({
      appraisalMode,
      categoryHint: category,
    });
    logBuilder.add("stage", "Scan started", "Started the live analysis pipeline.", {
      details: [`images=${images.length}`, `mode=${appraisalMode}`],
    });

    let uploadedImageUrls: string[] = [];
    let identification: GeminiIdentifyResponse | null = null;

    try {
      logBuilder.add("stage", "Image preparation", "Preparing captured images for OCR and upload.", {
        details: [`images=${images.length}`],
      });
      this.emitProgress("processing", "active", buildLookupProgress("image_preparation"));
      const visionResults = await performanceMonitor.measureAsync(
        "scan.process-images",
        () =>
          Promise.all(images.map((imageUri) => this.visionProcessor.processImage(imageUri))),
        {
          imageCount: images.length,
        },
      );
      const combinedVisionText = extractCombinedText(visionResults);
      logBuilder.add("response", "Image preparation", "Prepared image payloads for analysis.", {
        details: [
          `processed images=${visionResults.length}`,
          `ocr chars=${combinedVisionText.length}`,
          `barcodes=${visionResults.reduce((count, result) => count + result.barcodes.length, 0)}`,
        ],
      });
      this.emitProgress("processing", "complete", buildLookupProgress("image_preparation"));

      uploadedImageUrls = await this.uploadImagesSafely(
        currentUser?.uid ?? null,
        visionResults,
      );

      this.emitProgress("identifying", "active", buildLookupProgress("gemini"));
      const identifyStartedAt = Date.now();
      logBuilder.add("request", "Gemini AI identification", "Sent the item to Gemini for identification.", {
        details: [
          `appraisal mode=${appraisalMode}`,
          `category hint=${category}`,
          `image payloads=${visionResults.length}`,
          `ocr preview=${combinedVisionText.slice(0, 120) || "none"}`,
        ],
      });
      identification = await performanceMonitor.measureAsync(
        "scan.identify-item",
        () =>
          this.geminiClient.identifyItem(
            visionResults.map((result) => `data:image/jpeg;base64,${result.base64}`),
            category,
            combinedVisionText,
            appraisalMode,
          ),
        {
          category,
          appraisalMode,
        },
      );
      performanceMonitor.trackGeminiLatency(Date.now() - identifyStartedAt, {
        category,
        appraisalMode,
      });
      logBuilder.add("response", "Gemini AI identification", "Received Gemini identification output.", {
        details: [
          `name=${identification.name}`,
          `category=${resolveIdentificationCategory(identification)}`,
          `year=${identification.year ?? "unknown"}`,
          `confidence=${identification.confidence.toFixed(2)}`,
          `pricing confidence=${(identification.pricingConfidence ?? identification.valuationConfidence ?? 0).toFixed(2)}`,
          `bullion=${identification.isBullion === true ? "yes" : "no"}`,
        ],
      });
      this.emitProgress("identifying", "active", buildLookupProgress("condition"));
      this.emitProgress("identifying", "complete", buildLookupProgress("condition"));

      this.emitProgress("pricing", "active", buildLookupProgress("marketplace"));
      const searchCategory = deriveSearchCategory(identification, category);
      const comparableQueryKeywords = buildComparableQueryKeywords(identification, visionResults);
      logBuilder.add("request", "Marketplace comparable search", "Queried Firestore comparables for similar sales.", {
        details: [
          `keywords=${comparableQueryKeywords.join(", ") || "none"}`,
          `category filter=${searchCategory ?? "none"}`,
        ],
      });
      const rawComparableAuctions = await performanceMonitor.measureAsync(
        "scan.find-prices",
        () =>
          this.searchEngine.searchComparableAuctions(
            comparableQueryKeywords,
            searchCategory ? { category: searchCategory } : {},
            16,
          ),
        {
          category: searchCategory ?? "unfiltered",
          appraisalMode,
        },
      );
      const rankedComparableAuctions = filterComparableOutliers(
        rankComparableAuctions(rawComparableAuctions, identification, category, appraisalMode).slice(0, 12),
      );
      const comparableAuctions = rankedComparableAuctions.map((candidate) => candidate.item);
      logBuilder.add("response", "Marketplace comparable search", "Received candidate sales from Firestore.", {
        details: [
          `raw candidates=${rawComparableAuctions.length}`,
          `ranked candidates=${rankedComparableAuctions.length}`,
          `sources=${Array.from(new Set(comparableAuctions.map((item) => normalizeSourceName(item.source)))).join(", ") || "none"}`,
        ],
      });
      if (
        comparableAuctions.some((item) => {
          const normalizedSource = normalizeSourceName(item.source);
          return PREMIUM_AUCTION_SOURCES.has(normalizedSource);
        })
      ) {
        this.emitProgress("pricing", "active", buildLookupProgress("auction_records"));
        logBuilder.add("stage", "Auction cross-check", "Cross-checking premium auction records found among comparables.");
      }
      const valuationAssessment = assessValuation(
        identification,
        rankedComparableAuctions,
        appraisalMode,
        combinedVisionText,
      );
      const databasePriceEstimate = valuationAssessment.suppressDatabaseEstimate
        ? buildSuppressedDatabaseEstimate(valuationAssessment, appraisalMode)
        : derivePriceEstimate(rankedComparableAuctions, valuationAssessment, appraisalMode);
      const aiFallbackPriceEstimate = deriveGeminiFallbackPriceEstimate(
        identification,
        valuationAssessment,
        appraisalMode,
      );
      const priceEstimate =
        appraisalMode === "mystery"
          ? finalizeMysteryPriceEstimate(
              identification,
              valuationAssessment,
              databasePriceEstimate,
              aiFallbackPriceEstimate,
            )
          : buildRoutedStandardPriceEstimate(
              await getPricingForItem(
                identification,
                {
                  low: aiFallbackPriceEstimate?.low ?? identification.estimatedValueLow ?? null,
                  high: aiFallbackPriceEstimate?.high ?? identification.estimatedValueHigh ?? null,
                  confidence:
                    aiFallbackPriceEstimate?.valuationConfidence ??
                    aiFallbackPriceEstimate?.confidence ??
                    identification.pricingConfidence ??
                    identification.valuationConfidence ??
                    identification.confidence,
                },
                {
                  firestoreEstimate: databasePriceEstimate,
                  onProgress: (event) => {
                    this.emitProgress(
                      "pricing",
                      "active",
                      buildLookupProgress(event.sourceKey, event.message),
                    );
                  },
                  onLog: (event) => {
                    logBuilder.add(event.kind, event.title, event.message, {
                      details: event.details,
                    });
                  },
                },
              ),
              identification,
              databasePriceEstimate,
              aiFallbackPriceEstimate,
              valuationAssessment,
            );
      logBuilder.add("decision", "Final price estimate", "Built the final estimate for the result screen.", {
        details: [
          `source=${priceEstimate.sourceLabel ?? priceEstimate.source ?? "unknown"}`,
          `range=${priceEstimate.low ?? "n/a"}-${priceEstimate.high ?? "n/a"}`,
          `confidence=${(priceEstimate.valuationConfidence ?? priceEstimate.confidence).toFixed(2)}`,
        ],
      });
      this.emitProgress("pricing", "complete", buildLookupProgress("marketplace"));

      this.emitProgress("saving", "active", buildLookupProgress("final_estimate"));
      const scannedAt = new Date().toISOString();
      logBuilder.add("save", "Scan result persistence", "Preparing to save the scan result and analysis log.", {
        source: "Firebase",
        details: [`scan id=${scanResultID}`],
      });
      const analysisLog = logBuilder.build({
        scanId: scanResultID,
        detectedCategory: resolveIdentificationCategory(identification),
        itemName: identification.name,
        finalSource: priceEstimate.sourceLabel ?? priceEstimate.source ?? null,
      });
      const saveOutcome = await this.saveResultSafely({
        id: scanResultID,
        userId: currentUser?.uid ?? "anonymous-local",
        category,
        images: uploadedImageUrls,
        identification,
        priceEstimate,
        scannedAt,
        analysisLog,
      });
      const persistedPriceEstimate = saveOutcome.persisted
        ? priceEstimate
        : {
            ...priceEstimate,
            valuationWarnings: appendUniqueWarning(
              priceEstimate.valuationWarnings,
              saveOutcome.warning,
            ),
          };
      if (saveOutcome.persisted) {
        logBuilder.add("save", "Scan result persistence", "Saved the scan result and analysis log to Firebase.", {
          source: "Firebase",
          details: [`scan id=${scanResultID}`],
        });
      } else {
        logBuilder.add(
          "warning",
          "Scan result persistence",
          saveOutcome.warning ??
            "Cloud save was unavailable, so this scan and its log were kept on device only.",
          {
            source: "Firebase",
          },
        );
      }
      const persistedAnalysisLog = attachScanIdToAnalysisLog(
        logBuilder.build({
          scanId: scanResultID,
          detectedCategory: resolveIdentificationCategory(identification),
          itemName: identification.name,
          finalSource: persistedPriceEstimate.sourceLabel ?? persistedPriceEstimate.source ?? null,
        }),
        scanResultID,
      );
      if (saveOutcome.persisted) {
        await this.persistFinalAnalysisLog({
          id: scanResultID,
          userId: currentUser?.uid ?? "anonymous-local",
          category,
          images: uploadedImageUrls,
          identification,
          priceEstimate: persistedPriceEstimate,
          scannedAt,
          analysisLog: persistedAnalysisLog,
        });
      }
      this.emitProgress("saving", "active", buildLookupProgress("saving"));
      this.emitProgress("saving", "complete", buildLookupProgress("saving"));
      this.emitProgress("done", "complete");
      performanceMonitor.logSearchQuery(Date.now() - pipelineStartedAt, {
        metric: "scan.total",
        category,
      });

      return {
        id: scanResultID,
        userId: currentUser?.uid ?? "anonymous-local",
        category,
        images,
        uploadedImageUrls,
        vision: visionResults,
        identification,
        priceEstimate: persistedPriceEstimate,
        comparableAuctions,
        scannedAt,
        analysisLog: persistedAnalysisLog,
      };
    } catch (error) {
      const failureMessage =
        error instanceof ScanPipelineError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unknown scan pipeline failure.";
      const lastStepMessage = this.lastLookupProgress?.message ?? "Analysis did not reach a traceable source step.";
      logBuilder.add("warning", "Analysis failed", failureMessage, {
        source: this.lastLookupProgress?.sourceLabel ?? null,
        details: [`last step=${lastStepMessage}`],
      });
      const failureLog = logBuilder.build({
        scanId: scanResultID,
        detectedCategory: identification ? resolveIdentificationCategory(identification) : null,
        itemName: identification?.name ?? null,
        finalSource: this.lastLookupProgress?.sourceLabel ?? null,
      });
      await this.saveFailureLogSafely({
        id: scanResultID,
        userId: currentUser?.uid ?? "anonymous-local",
        category,
        images: uploadedImageUrls,
        analysisLog: failureLog,
        scannedAt: new Date().toISOString(),
        errorSummary: failureMessage,
        failedStep: lastStepMessage,
      });
      this.emitProgress("done", "error");

      if (error instanceof ScanPipelineError) {
        performanceMonitor.captureError(error, {
          area: "scan.pipeline",
          category,
          appraisalMode,
          ...(error instanceof GeminiInvalidJsonError
            ? {
                model: error.model,
                payloadPreview: error.payloadPreview,
              }
            : {}),
        });
        throw error;
      }

      if (error instanceof Error) {
        performanceMonitor.captureError(error, {
          area: "scan.pipeline",
          category,
          appraisalMode,
          ...(error instanceof GeminiInvalidJsonError
            ? {
                model: error.model,
                payloadPreview: error.payloadPreview,
              }
            : {}),
        });
        throw new ScanPipelineError(
          error.message,
          "We couldn't finish analyzing this item. Try a clearer photo or switch to gallery import.",
        );
      }

      throw new ScanPipelineError(
        "Unknown scan pipeline failure.",
        "We couldn't finish analyzing this item. Please try again.",
      );
    }
  }

  private emitProgress(
    step: ScanProgressState["step"],
    status: ScanProgressState["status"],
    lookupProgress?: ScanLookupProgress | null,
  ): void {
    this.lastLookupProgress = lookupProgress ?? null;
    this.onProgress?.({
      step,
      label: STEP_LABELS[step],
      status,
      currentSearchSource: lookupProgress?.message,
      lookupProgress: lookupProgress ?? null,
    });
  }

  private async resolveCurrentUser() {
    const auth = getVaultScopeAuth();
    if (auth.currentUser) {
      return auth.currentUser;
    }

    try {
      return await ensureAnonymousSession();
    } catch (error) {
      console.warn("[VaultScope] Proceeding without authenticated Firebase session.", error);
      return null;
    }
  }

  private async uploadImagesSafely(
    userId: string | null,
    visionResults: VisionResult[],
  ): Promise<string[]> {
    if (!userId) {
      return [];
    }

    try {
      const uploadedImageUrls = await performanceMonitor.measureAsync(
        "scan.upload-images",
        () =>
          Promise.all(
            visionResults.map((result) =>
              uploadScanImage(userId, `data:image/jpeg;base64,${result.base64}`),
            ),
          ),
        {
          imageCount: visionResults.length,
        },
      );
      performanceMonitor.trackFirestoreWrite(uploadedImageUrls.length, {
        area: "storage.uploads",
      });
      return uploadedImageUrls;
    } catch (error) {
      console.warn("[VaultScope] Image upload failed. Continuing without remote image storage.", error);
      return [];
    }
  }

  private async saveResultSafely(
    payload: Omit<ScanResult, "uploadedImageUrls" | "vision"> & { images: string[] },
  ): Promise<{ persisted: boolean; warning?: string | null }> {
    if (!payload.userId || payload.userId === "anonymous-local") {
      return {
        persisted: false,
        warning: "Cloud save was unavailable because Firebase anonymous auth did not complete. This scan and its log were kept on device only.",
      };
    }

    try {
      await performanceMonitor.measureAsync(
        "scan.save-result",
        () => saveScanResult(payload),
        {
          category: payload.category,
        },
      );
      performanceMonitor.trackFirestoreWrite(1, {
        area: "scan_results",
      });
      return { persisted: true };
    } catch (error) {
      console.warn("[VaultScope] Scan result save failed. Continuing with local result only.", error);
      return {
        persisted: false,
        warning: "Cloud save failed, so this scan and its log were kept on device only.",
      };
    }
  }

  private async persistFinalAnalysisLog(
    payload: Omit<ScanResult, "uploadedImageUrls" | "vision"> & { images: string[] },
  ): Promise<void> {
    try {
      await saveScanResult(payload);
    } catch (error) {
      console.warn("[VaultScope] Final analysis log sync failed.", error);
    }
  }

  private async saveFailureLogSafely(payload: {
    id: string;
    userId: string;
    category: string;
    images: string[];
    analysisLog: NonNullable<ScanResult["analysisLog"]>;
    scannedAt: string;
    errorSummary: string;
    failedStep: string;
  }): Promise<void> {
    if (!payload.userId || payload.userId === "anonymous-local") {
      return;
    }

    try {
      await saveFailedScanLog(payload);
      performanceMonitor.trackFirestoreWrite(1, {
        area: "scan_results.failure_log",
      });
    } catch (error) {
      console.warn("[VaultScope] Failed analysis log could not be saved.", error);
    }
  }
}
