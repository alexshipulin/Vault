import type { MarketTrendProvider } from "@src/domain/contracts";
import type { CollectibleItem } from "@src/domain/models";

export class LocalMarketTrendProvider implements MarketTrendProvider {
  trendFor(item: CollectibleItem): { percentage: number; comparisonMonths: number } | null {
    const seed = item.name.length + (item.year ?? 0);
    const percentage = (seed % 19) - 6;

    return {
      percentage,
      comparisonMonths: 6
    };
  }
}
