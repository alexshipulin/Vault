import type { GeminiIdentifyResponse } from "@/lib/gemini/types";

export interface PriceEstimate {
  low: number | null;
  high: number | null;
  currency: string;
  confidence: number;
}

export interface ScanResult {
  id: string;
  userId: string;
  category: string;
  images: string[];
  identification: GeminiIdentifyResponse;
  priceEstimate: PriceEstimate;
  scannedAt: string;
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
