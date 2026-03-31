export interface PriceRange {
  min?: number;
  max?: number;
}

export interface AntiqueAuctionData {
  title: string;
  description: string;
  priceRealized: number | null;
  estimateLow: number | null;
  estimateHigh: number | null;
  auctionHouse: string;
  saleDate: Date;
  category: string;
  period: string | null;
  material: string | null;
  originCountry: string | null;
  imageUrl: string | null;
  source: string;
  keywords: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AntiqueAuctionDocument extends AntiqueAuctionData {
  id: string;
}

export interface ScanIdentification {
  title: string;
  description: string | null;
  confidence: number;
  period: string | null;
  material: string | null;
  originCountry: string | null;
  matchedAuctionIds: string[];
}

export interface ScanPriceData {
  estimateLow: number | null;
  estimateHigh: number | null;
  estimatedMarketValue: number | null;
  currency: string;
  confidenceScore: number | null;
  comparableAuctionIds: string[];
  generatedAt: Date;
}

export interface ScanResultData {
  userId: string;
  category: string;
  images: string[];
  identification: ScanIdentification;
  priceData: ScanPriceData | null;
  scannedAt: Date;
}

export interface ScanResultDocument extends ScanResultData {
  id: string;
}

export interface PriceEstimateSnapshot {
  estimateLow: number | null;
  estimateHigh: number | null;
  estimatedMarketValue: number | null;
  currency: string;
  confidenceScore: number | null;
  capturedAt: Date;
}

export interface UserCollectionItemData {
  scanResultId: string;
  title: string;
  imageUrl: string | null;
  priceEstimate: PriceEstimateSnapshot;
  addedAt: Date;
  customNotes: string | null;
}

export interface UserCollectionItemDocument extends UserCollectionItemData {
  id: string;
  userId: string;
}

export type SubscriptionPlan = "free" | "pro" | "premium";
export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "canceled"
  | "past_due"
  | "expired";

export interface UserSubscription {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  renewalDate: Date | null;
  scanCreditsRemaining: number | null;
}

export interface UserPreferences {
  preferredCurrency: string;
  locale: string;
  notificationsEnabled: boolean;
  favoriteCategories: string[];
}

export interface UserProfileData {
  email: string;
  displayName: string | null;
  subscription: UserSubscription;
  preferences: UserPreferences;
  createdAt: Date;
}

export interface UserProfileDocument extends UserProfileData {
  id: string;
}

export interface SearchAntiquesOptions {
  category?: string;
  priceRange?: PriceRange;
  limit?: number;
}

export interface GetUserCollectionOptions {
  limit?: number;
  beforeAddedAt?: Date;
}

export interface SaveScanResultInput extends ScanResultData {
  id?: string;
}

export interface AddToCollectionInput extends UserCollectionItemData {
  id?: string;
}
