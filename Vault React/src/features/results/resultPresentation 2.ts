import type { CollectibleCategory, CollectibleItem, PreferredCurrency, ScanResult } from "@src/domain/models";
import { t } from "@src/shared/i18n/strings";
import {
  categoryDisplayName,
  conditionDisplayLabel,
  formatCurrency,
  formatDate,
  priceSourceDisplayName,
} from "@src/shared/utils/formatters";

export interface ResultPresentationModel {
  imageUri?: string;
  fallbackText: string;
  title: string;
  subtitle: string;
  originText: string;
  eraText: string;
  conditionText: string;
  confidence?: number | null;
  confidenceLabel?: string;
  valueText: string;
  sourceText: string;
  updatedText?: string;
  diagnostics: string[];
  summaryText: string;
  disclaimerText: string;
}

function humanizeSourceName(source: string): string {
  const normalized = source.trim().toLowerCase();

  if (normalized === "ebay") {
    return "eBay";
  }
  if (normalized === "heritage") {
    return "Heritage";
  }
  if (normalized === "liveauctioneers") {
    return "LiveAuctioneers";
  }
  if (normalized === "pcgs") {
    return "PCGS";
  }
  if (normalized === "discogs") {
    return "Discogs";
  }

  return source;
}

function formatValuationWarning(warning: string): string {
  switch (warning) {
    case "Not enough close market matches were found.":
      return "Only a few close sold matches were found.";
    case "Comparable matches came from too few independent sources.":
      return "Matches came from too few independent sources.";
    case "Comparable items only weakly matched the detected object.":
      return "The closest sold items were not a strong match.";
    case "Dimensions are required for a reliable appraisal.":
      return "Add dimensions for a tighter estimate.";
    case "Additional photos are required for a reliable appraisal.":
      return "Add base and side photos for a tighter estimate.";
    case "The item may be a common mass-produced object rather than a rare antique.":
      return "This may be a common decorative object rather than a rare antique.";
    case "The item may be a later reproduction or decorative copy.":
      return "This may be a later reproduction.";
    case "Generic unmarked decorative vessels are difficult to price from a single angle.":
      return "Unmarked vessels need more evidence, especially the base.";
    default:
      return warning;
  }
}

function capitalizeParagraph(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function singularCategory(category: CollectibleCategory | string): string {
  switch (category) {
    case "coin":
      return "Coin";
    case "vinyl":
      return "Record";
    case "antique":
      return "Antique";
    case "card":
      return "Card";
    default:
      return categoryDisplayName(category);
  }
}

function resultEraLabel(year?: number | null): string {
  if (!year) {
    return t("common.unknown");
  }

  if (year >= 1837 && year <= 1901) {
    return "Victorian";
  }

  if (year >= 1901 && year <= 1910) {
    return "Edwardian";
  }

  if (year >= 1919 && year <= 1939) {
    return "Art Deco";
  }

  if (year >= 1945 && year <= 1969) {
    return "Mid-Century";
  }

  if (year >= 1970 && year <= 1999) {
    return "Late 20th Century";
  }

  return String(year);
}

function buildSubtitle(category: CollectibleCategory | string, origin?: string | null, year?: number | null): string {
  const segments = [singularCategory(category), origin ?? t("common.unknown"), year ? String(year) : null].filter(Boolean);
  return segments.join(" · ");
}

function buildValueText(
  values: { low?: number | null; mid?: number | null; high?: number | null },
  currency: PreferredCurrency,
): string {
  if (typeof values.low === "number" && typeof values.high === "number") {
    return `${formatCurrency(values.low, currency)} — ${formatCurrency(values.high, currency)}`;
  }

  if (typeof values.mid === "number") {
    return formatCurrency(values.mid, currency);
  }

  if (typeof values.low === "number") {
    return formatCurrency(values.low, currency);
  }

  if (typeof values.high === "number") {
    return formatCurrency(values.high, currency);
  }

  return t("details.market.unavailable");
}

function buildSourceText({
  source,
  sourceLabel,
  emptyLabel,
}: {
  source?: string | null;
  sourceLabel?: string | null;
  emptyLabel: string;
}): string {
  if (!source) {
    return emptyLabel;
  }

  const sourceText = priceSourceDisplayName(source);
  if (source === "aiEstimate" && sourceLabel?.toLowerCase().includes("no market matches")) {
    return `${sourceText} · no matches`;
  }

  return sourceText;
}

function buildUpdatedText(fetchedAt?: string | null): string {
  if (!fetchedAt) {
    return "";
  }

  return `Updated ${formatDate(fetchedAt)}`;
}

function buildDiagnostics({
  low,
  mid,
  high,
  valuationMode,
  matchedSources,
  needsReview,
  valuationWarnings,
}: {
  low?: number | null;
  mid?: number | null;
  high?: number | null;
  valuationMode?: "standard" | "mystery" | null;
  matchedSources?: string[] | null;
  needsReview?: boolean | null;
  valuationWarnings?: string[] | null;
}): string[] {
  const items: string[] = [];
  const hasNumericValue =
    typeof low === "number" ||
    typeof mid === "number" ||
    typeof high === "number";

  if (needsReview) {
    items.push(
      hasNumericValue
        ? t("result.diagnostics.needs_review")
        : t("result.diagnostics.needs_evidence"),
    );
  }

  if (matchedSources?.length) {
    items.push(
      t("result.diagnostics.sources_prefix").replace(
        "%s",
        matchedSources.map(humanizeSourceName).join(", "),
      ),
    );
  }

  const warnings = (valuationWarnings ?? [])
    .map((warning) => formatValuationWarning(warning))
    .map((warning) => capitalizeParagraph(warning))
    .filter(Boolean)
    .slice(0, 3);

  for (const warning of warnings) {
    if (!items.includes(warning)) {
      items.push(warning);
    }
  }

  if (
    valuationMode === "mystery" &&
    !items.includes(t("result.diagnostics.conservative"))
  ) {
    items.unshift(t("result.diagnostics.conservative"));
  }

  return items.slice(0, 4);
}

export function buildResultPresentationFromScanResult(
  result: ScanResult,
  preferredCurrency: PreferredCurrency,
  imageUri?: string,
): ResultPresentationModel {
  const valuationMode = result.priceData?.valuationMode ?? "standard";
  const displayConfidence =
    valuationMode === "mystery"
      ? result.priceData?.valuationConfidence ?? result.confidence
      : result.confidence;

  return {
    imageUri,
    fallbackText: result.name.slice(0, 2).toUpperCase(),
    title: result.name,
    subtitle: buildSubtitle(result.category, result.origin, result.year),
    originText: result.origin ?? t("common.unknown"),
    eraText: resultEraLabel(result.year),
    conditionText: conditionDisplayLabel(result.condition),
    confidence: displayConfidence,
    confidenceLabel:
      valuationMode === "mystery" ? t("result.valuation_confidence") : t("result.confidence"),
    valueText: buildValueText(
      {
        low: result.priceData?.low,
        mid: result.priceData?.mid,
        high: result.priceData?.high,
      },
      preferredCurrency,
    ),
    sourceText: buildSourceText({
      source: result.priceData?.source,
      sourceLabel: result.priceData?.sourceLabel,
      emptyLabel: t("result.source.pending"),
    }),
    updatedText: buildUpdatedText(result.priceData?.fetchedAt),
    diagnostics: buildDiagnostics({
      low: result.priceData?.low,
      mid: result.priceData?.mid,
      high: result.priceData?.high,
      valuationMode,
      matchedSources: result.priceData?.matchedSources,
      needsReview: result.priceData?.needsReview,
      valuationWarnings: result.priceData?.valuationWarnings,
    }),
    summaryText: result.historySummary
      .split(/\n+/)
      .map((paragraph) => capitalizeParagraph(paragraph))
      .join("\n\n"),
    disclaimerText: t("result.disclaimer"),
  };
}

export function buildResultPresentationFromCollectionItem(
  item: CollectibleItem,
  preferredCurrency: PreferredCurrency,
): ResultPresentationModel {
  const title = item.name.trim() || categoryDisplayName(item.category);
  const imageUri = item.photoUris.find((uri) => Boolean(uri));
  const valuationMode = item.valuationMode ?? "standard";
  const displayConfidence =
    valuationMode === "mystery" ? item.valuationConfidence ?? item.confidence ?? null : item.confidence ?? null;

  return {
    imageUri,
    fallbackText: title.slice(0, 2).toUpperCase(),
    title,
    subtitle: buildSubtitle(item.category, item.origin, item.year),
    originText: item.origin ?? t("common.unknown"),
    eraText: resultEraLabel(item.year),
    conditionText: conditionDisplayLabel(item.conditionRaw),
    confidence: displayConfidence,
    confidenceLabel:
      valuationMode === "mystery" ? t("result.valuation_confidence") : t("result.confidence"),
    valueText: buildValueText(
      {
        low: item.priceLow,
        mid: item.priceMid,
        high: item.priceHigh,
      },
      preferredCurrency,
    ),
    sourceText: buildSourceText({
      source: item.priceSource,
      sourceLabel: item.sourceLabel,
      emptyLabel: t("details.market.saved"),
    }),
    updatedText: buildUpdatedText(item.priceFetchedAt),
    diagnostics: buildDiagnostics({
      low: item.priceLow,
      mid: item.priceMid,
      high: item.priceHigh,
      valuationMode,
      matchedSources: item.matchedSources,
      needsReview: item.needsReview,
      valuationWarnings: item.valuationWarnings,
    }),
    summaryText: (item.historySummary || item.notes || t("details.description.empty"))
      .split(/\n+/)
      .map((paragraph) => capitalizeParagraph(paragraph))
      .join("\n\n"),
    disclaimerText: t("result.disclaimer"),
  };
}
