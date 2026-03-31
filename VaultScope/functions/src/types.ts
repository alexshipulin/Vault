export type AuctionCategory =
  | "furniture"
  | "ceramics"
  | "art"
  | "jewelry"
  | "general";

export interface ScrapedItemInput {
  title: string;
  description?: string | null;
  price?: number | string | null;
  priceRealized?: number | string | null;
  auctionHouse?: string | null;
  saleDate?: string | null;
  date?: string | null;
  category?: string | null;
  imageUrl?: string | null;
  source: string;
  keywords?: string[];
  scrapedAt?: string | null;
  [key: string]: unknown;
}

export interface NormalizedScrapedItem {
  title: string;
  description: string;
  priceRealized: number | null;
  auctionHouse: string | null;
  saleDate: Date | null;
  category: AuctionCategory;
  imageUrl: string | null;
  source: string;
  keywords: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ProcessScrapedDataResponse {
  success: boolean;
  count: number;
  error?: string;
}

export interface ScraperRunnerPayload {
  job: "weeklyScraping";
  sources: string[];
}

export interface ScraperRunnerResponse {
  success: boolean;
  items: ScrapedItemInput[];
  count: number;
}

export interface PriceRangeBucketStats {
  label: string;
  min: number | null;
  max: number | null;
  count: number;
}

export interface DailyStatsDocument {
  date: string;
  generatedAt: Date;
  totalItems: number;
  itemsByCategory: Record<AuctionCategory, number>;
  priceRanges: PriceRangeBucketStats[];
  notes?: string;
}

export interface CleanupSummary {
  executedAt: Date;
  cutoffDate: Date;
  totalBefore: number;
  totalAfter: number;
  deletedCount: number;
  retainedMinimum: number;
}
