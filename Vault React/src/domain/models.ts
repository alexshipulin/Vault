import type { AnalysisLogDocument } from "@/lib/analysis/logs";

export type CollectibleCategory = "coin" | "vinyl" | "antique" | "card";
export type ValuationMode = "standard" | "mystery";
export type ValuationEvidenceStrength = "weak" | "moderate" | "strong";
export type OverlayShape = "circle" | "rectangle" | "square";
export type PriceSource = "pcgs" | "discogs" | "ebay" | "antiqueDB" | "aiEstimate" | "metals";
export type VaultEnvironment = "production" | "mock";
export type ScanMode = "standard" | "mystery";
export type ChatRole = "user" | "assistant";
export type PreferredCurrency = "usd" | "eur" | "gbp" | "jpy";
export type ProcessingStageKind =
  | "objectRecognition"
  | "conditionAssessment"
  | "priceLookup"
  | "historicalRecords";
export type ProcessingStageStatus = "pending" | "active" | "complete";
export type VaultTabKey = "home" | "scan" | "vault" | "profile";

export interface ComparableSale {
  id: string;
  title: string;
  price: number;
  soldAt: string;
  source?: string | null;
  sourceURL?: string | null;
  isActive?: boolean;
}

export interface PriceData {
  low: number;
  mid: number;
  high: number;
  currency: string;
  source: PriceSource;
  sourceLabel: string;
  fetchedAt: string;
  valuationConfidence?: number | null;
  valuationMode?: ValuationMode | null;
  evidenceStrength?: ValuationEvidenceStrength | null;
  appliedValueCeiling?: number | null;
  sourceBreakdown?: {
    ebay?: number;
    liveauctioneers?: number;
    heritage?: number;
  } | null;
  matchedSources?: string[];
  comparableCount?: number;
  needsReview?: boolean;
  valuationWarnings?: string[] | null;
  comparables?: ComparableSale[] | null;
}

export interface ScanResult {
  id: string;
  category: CollectibleCategory;
  name: string;
  year?: number | null;
  origin?: string | null;
  condition: number;
  conditionRangeLow: number;
  conditionRangeHigh: number;
  historySummary: string;
  confidence: number;
  priceData?: PriceData | null;
  rawAIResponse: string;
  scannedAt: string;
  inputImageHashes: string[];
  analysisLog?: AnalysisLogDocument | null;
}

export interface CollectibleItem {
  id: string;
  name: string;
  category: CollectibleCategory | string;
  conditionRaw: number;
  year?: number | null;
  origin?: string | null;
  notes: string;
  photoUris: string[];
  priceLow?: number | null;
  priceMid?: number | null;
  priceHigh?: number | null;
  priceSource?: PriceSource | string | null;
  sourceLabel?: string | null;
  priceFetchedAt?: string | null;
  confidence?: number | null;
  valuationConfidence?: number | null;
  valuationMode?: ValuationMode | null;
  evidenceStrength?: ValuationEvidenceStrength | null;
  appliedValueCeiling?: number | null;
  sourceBreakdown?: {
    ebay?: number;
    liveauctioneers?: number;
    heritage?: number;
  } | null;
  matchedSources?: string[] | null;
  comparableCount?: number | null;
  needsReview?: boolean | null;
  valuationWarnings?: string[] | null;
  analysisLogCopyText?: string | null;
  historySummary: string;
  addedAt: string;
  updatedAt: string;
  isSyncedToCloud: boolean;
}

export interface ScanImage {
  id: string;
  uri: string;
  mimeType: string;
  base64?: string;
}

export interface TemporaryScanSession {
  id: string;
  mode: ScanMode;
  capturedImages: ScanImage[];
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
}

export interface VaultUserPreferences {
  categoriesOfInterest: CollectibleCategory[];
  preferredCurrency: PreferredCurrency;
  notificationsEnabled: boolean;
}

export interface ItemChatContext {
  itemID: string;
  titleText: string;
  subtitleText: string;
  category?: CollectibleCategory;
  priceText: string;
  originText: string;
  conditionText?: string | null;
  year?: number | null;
  noteText: string;
  thumbnailText: string;
}

export interface ProcessingStageSnapshot {
  kind: ProcessingStageKind;
  status: ProcessingStageStatus;
}

export interface ProcessingUpdate {
  snapshots?: ProcessingStageSnapshot[];
  searchingSource?: string;
  completedResult?: ScanResult;
}

export interface MarketTrend {
  percentage: number;
  comparisonMonths: number;
}

export interface CollectibleListItem {
  id: string;
  title: string;
  subtitle: string;
  categoryText: string;
  valueText: string;
  timestampText: string;
  noteText: string;
  thumbnailText: string;
  photoUri?: string;
}

export interface AppReadinessReport {
  firebaseConfigured: boolean;
  firebaseProjectReady: boolean;
  functionsConfigured: boolean;
  searchIndexReady: boolean;
  geminiConfigured: boolean;
  remoteAnalysisReady: boolean;
  verifiedAt: string;
  checks: AppReadinessCheck[];
  messages: string[];
}

export type AppReadinessCheckStatus = "verified" | "failed" | "missing" | "configured" | "skipped";

export interface AppReadinessCheck {
  key: "firebase" | "firestore" | "gemini" | "pcgs" | "discogs" | "metals" | "ebay" | "persistence";
  label: string;
  status: AppReadinessCheckStatus;
  message: string;
}

export const COLLECTIBLE_CATEGORIES: CollectibleCategory[] = ["coin", "vinyl", "antique", "card"];

export const CONDITION_GRADES = [
  { rawValue: 1, displayLabel: "Poor", shortLabel: "PR", colorHex: "#D64545" },
  { rawValue: 2, displayLabel: "Good", shortLabel: "G", colorHex: "#E67E22" },
  { rawValue: 3, displayLabel: "Very Good", shortLabel: "VG", colorHex: "#F39C12" },
  { rawValue: 4, displayLabel: "Fine", shortLabel: "F", colorHex: "#F1C40F" },
  { rawValue: 5, displayLabel: "Very Fine", shortLabel: "VF", colorHex: "#B7CC43" },
  { rawValue: 6, displayLabel: "Extremely Fine", shortLabel: "XF", colorHex: "#7CB342" },
  { rawValue: 7, displayLabel: "About Uncirculated", shortLabel: "AU", colorHex: "#43A047" },
  { rawValue: 8, displayLabel: "Mint", shortLabel: "M", colorHex: "#2E7D32" },
  { rawValue: 9, displayLabel: "Gem Mint", shortLabel: "GM", colorHex: "#1B5E20" }
] as const;

export const PREFERRED_CURRENCIES: PreferredCurrency[] = ["usd", "eur", "gbp", "jpy"];

export const DEFAULT_PREFERENCES: VaultUserPreferences = {
  categoriesOfInterest: [...COLLECTIBLE_CATEGORIES],
  preferredCurrency: "usd",
  notificationsEnabled: true
};

export const PRICE_SOURCE_LABELS: Record<PriceSource, string> = {
  pcgs: "PCGS",
  discogs: "Discogs",
  ebay: "eBay",
  antiqueDB: "Antique Database",
  aiEstimate: "AI Estimate",
  metals: "Metals API"
};

export const CATEGORY_DISPLAY_NAMES: Record<CollectibleCategory, string> = {
  coin: "Coins",
  vinyl: "Vinyl Records",
  antique: "Antiques",
  card: "Sports Cards"
};

export const CATEGORY_OVERLAY_SHAPES: Record<CollectibleCategory, OverlayShape> = {
  coin: "circle",
  vinyl: "rectangle",
  antique: "square",
  card: "rectangle"
};
