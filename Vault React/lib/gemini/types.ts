export type GeminiCondition =
  | "mint"
  | "near_mint"
  | "fine"
  | "very_good"
  | "good"
  | "poor";

export type GeminiConditionRange = [GeminiCondition, GeminiCondition];
export type GeminiMarketTier =
  | "junk"
  | "decor"
  | "secondary"
  | "collector"
  | "premium_antique";
export type GeminiPricingEvidenceStrength = "weak" | "moderate" | "strong";
export type GeminiRetailContext = "flea_market" | "thrift" | "estate_sale" | "auction";
export type GeminiDescriptionTone = "skeptical" | "neutral" | "collector";

export interface GeminiIdentifyResponse {
  category: string;
  name: string;
  year: number | null;
  origin: string | null;
  objectType?: string | null;
  material?: string | null;
  makerOrBrand?: string | null;
  condition: GeminiCondition;
  conditionRange: GeminiConditionRange;
  historySummary: string;
  confidence: number;
  searchKeywords: string[];
  distinguishingFeatures: string[];
  requiresMeasurements?: boolean;
  requiresMorePhotos?: boolean;
  isLikelyMassProduced?: boolean;
  isLikelyReproduction?: boolean;
  valuationWarnings?: string[];
  marketTier?: GeminiMarketTier;
  pricingEvidenceStrength?: GeminiPricingEvidenceStrength;
  likelyRetailContext?: GeminiRetailContext;
  likelyValueCeiling?: number | null;
  valuationConfidence?: number;
  descriptionTone?: GeminiDescriptionTone;
  estimatedValueLow: number | null;
  estimatedValueHigh: number | null;
  estimatedValueCurrency: string | null;
  estimatedValueRationale: string | null;
}

export interface GeminiEmbeddingResponse {
  embedding: number[];
}

export interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

export interface GeminiCacheEntry<T> {
  value: T;
  createdAt: string;
  expiresAt: string;
}

export interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    finishReason?: string;
  }>;
  usageMetadata?: GeminiUsageMetadata;
  promptFeedback?: {
    blockReason?: string;
  };
}

export interface GeminiEmbedContentResponse {
  embedding?: {
    values?: number[];
  };
}
