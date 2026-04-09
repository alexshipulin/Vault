import {
  CATEGORY_DISPLAY_NAMES,
  CONDITION_GRADES,
  PREFERRED_CURRENCIES,
  PRICE_SOURCE_LABELS,
  type CollectibleCategory,
  type CollectibleItem,
  type CollectibleListItem,
  type PreferredCurrency,
  type PriceSource,
  type ScanResult
} from "@src/domain/models";
import { t } from "@src/shared/i18n/strings";

const CURRENCY_RATES: Record<PreferredCurrency, number> = {
  usd: 1,
  eur: 0.92,
  gbp: 0.79,
  jpy: 151
};

export function formatCurrency(amount: number, currency: PreferredCurrency = "usd"): string {
  const converted = amount * CURRENCY_RATES[currency];
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: currency === "jpy" ? 0 : 0
  }).format(converted);
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

export function formatShortTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function categoryDisplayName(category: CollectibleCategory | string): string {
  if (category in CATEGORY_DISPLAY_NAMES) {
    return CATEGORY_DISPLAY_NAMES[category as CollectibleCategory];
  }

  return t("common.unknown_category");
}

export function conditionDisplayLabel(rawValue?: number | null): string {
  const match = CONDITION_GRADES.find((item) => item.rawValue === rawValue);
  return match?.displayLabel ?? t("details.condition.unknown");
}

export function conditionShortLabel(rawValue?: number | null): string {
  const match = CONDITION_GRADES.find((item) => item.rawValue === rawValue);
  return match?.shortLabel ?? "--";
}

export function priceSourceDisplayName(source?: string | null): string {
  if (!source) {
    return "";
  }

  return PRICE_SOURCE_LABELS[source as PriceSource] ?? source;
}

function buildValueTextFromRange(
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

  return formatCurrency(0, currency);
}

export function valueRangeText(
  item: Pick<CollectibleItem, "priceLow" | "priceMid" | "priceHigh">,
  currency: PreferredCurrency = "usd",
): string {
  return buildValueTextFromRange(
    {
      low: item.priceLow,
      mid: item.priceMid,
      high: item.priceHigh,
    },
    currency,
  );
}

export function scanResultValueRangeText(
  result: Pick<ScanResult, "priceData">,
  currency: PreferredCurrency = "usd",
): string {
  return buildValueTextFromRange(
    {
      low: result.priceData?.low ?? null,
      mid: result.priceData?.mid ?? null,
      high: result.priceData?.high ?? null,
    },
    currency,
  );
}

export function collectibleListItemFromResult(
  result: ScanResult,
  currency: PreferredCurrency = "usd"
): CollectibleListItem {
  return {
    id: result.id,
    title: result.name,
    subtitle: result.origin ?? t("common.unknown"),
    categoryText: categoryDisplayName(result.category),
    valueText: scanResultValueRangeText(result, currency),
    timestampText: formatDate(result.scannedAt),
    noteText: result.historySummary,
    thumbnailText: result.name.slice(0, 2).toUpperCase()
  };
}

export function collectibleListItemFromItem(
  item: CollectibleItem,
  currency: PreferredCurrency = "usd"
): CollectibleListItem {
  const titleSource = item.name.trim() || categoryDisplayName(item.category);
  const primaryPhotoUri = item.photoUris.find((uri) => Boolean(uri));

  return {
    id: item.id,
    title: titleSource,
    subtitle: item.origin ?? t("common.unknown"),
    categoryText: categoryDisplayName(item.category),
    valueText: valueRangeText(item, currency),
    timestampText: formatDate(item.updatedAt),
    noteText: item.historySummary,
    thumbnailText: titleSource.slice(0, 2).toUpperCase(),
    photoUri: primaryPhotoUri
  };
}

export function eraText(year?: number | null): string {
  if (!year) {
    return t("result.era.unknown");
  }

  const decade = Math.floor(year / 10) * 10;
  return `${decade}s`;
}

export function scansThisMonth(items: CollectibleItem[], now = new Date()): number {
  return items.filter((item) => {
    const date = new Date(item.addedAt);
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }).length;
}

export function totalCollectionValue(items: CollectibleItem[]): number {
  return items.reduce((sum, item) => sum + (item.priceMid ?? item.priceHigh ?? item.priceLow ?? 0), 0);
}

export function supportedCurrencies(): PreferredCurrency[] {
  return [...PREFERRED_CURRENCIES];
}
