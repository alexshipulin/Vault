import type { AnalysisLogDocument } from "@/lib/analysis/logs";
import type { GeminiIdentifyResponse } from "@/lib/gemini/types";

export type AppraisalMode = "standard" | "mystery";
export type ValuationEvidenceStrength = "weak" | "moderate" | "strong";

export interface PriceSourceBreakdown {
  ebay: number;
  liveauctioneers: number;
  heritage: number;
}

export interface PriceEstimate {
  low: number | null;
  high: number | null;
  currency: string;
  confidence: number;
  valuationConfidence?: number;
  source?: "database" | "ai_estimate" | "pcgs" | "discogs" | "ebay" | "metals";
  sourceLabel?: string | null;
  matchedSources?: string[];
  comparableCount?: number;
  needsReview?: boolean;
  valuationWarnings?: string[];
  valuationMode?: AppraisalMode;
  evidenceStrength?: ValuationEvidenceStrength;
  appliedValueCeiling?: number | null;
  sourceBreakdown?: PriceSourceBreakdown;
}

export interface ScanResult {
  id: string;
  userId: string;
  category: string;
  images: string[];
  identification: GeminiIdentifyResponse;
  priceEstimate: PriceEstimate;
  scannedAt: string;
  analysisLog?: AnalysisLogDocument | null;
}

export interface CollectionItem {
  id: string;
  scanResultId: string;
  title: string;
  imageUrl: string;
  priceEstimate: PriceEstimate;
  addedAt: string;
  customNotes: string;
}

export interface Subscription {
  tier: "free" | "pro";
  status: "active" | "trial" | "expired";
  renewalDate: string | null;
}

export interface Preferences {
  defaultCategory: string;
  preferredCurrency: string;
  notificationsEnabled: boolean;
}

export interface UserProfile {
  id: string;
  email: string | null;
  displayName: string | null;
  subscription: Subscription;
  preferences: Preferences;
  createdAt: string;
}
