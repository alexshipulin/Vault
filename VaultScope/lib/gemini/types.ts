export type GeminiCondition =
  | "mint"
  | "near_mint"
  | "fine"
  | "very_good"
  | "good"
  | "poor";

export type GeminiConditionRange = [GeminiCondition, GeminiCondition];

export interface GeminiIdentifyResponse {
  category: string;
  name: string;
  year: number | null;
  origin: string | null;
  condition: GeminiCondition;
  conditionRange: GeminiConditionRange;
  historySummary: string;
  confidence: number;
  searchKeywords: string[];
  distinguishingFeatures: string[];
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
