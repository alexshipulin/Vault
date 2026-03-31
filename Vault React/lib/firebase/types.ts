import type { CollectionItem } from "@/lib/types";

export interface AntiqueAuction {
  id: string;
  title: string;
  description: string;
  priceRealized: number | null;
  estimateLow: number | null;
  estimateHigh: number | null;
  auctionHouse: string | null;
  saleDate: string | null;
  category: string;
  period: string | null;
  material: string | null;
  originCountry: string | null;
  imageUrl: string | null;
  source: string;
  keywords: string[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface SearchFilters {
  category?: string;
  priceMin?: number;
  priceMax?: number;
  period?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export type SearchResult = AntiqueAuction[];

export type ListenerRegistration = () => void;

export interface SearchCacheEntry {
  items: SearchResult;
  createdAt: string;
  expiresAt: string;
}

export interface UserCollectionObserverPayload {
  items: CollectionItem[];
}

export class SearchAuthRequiredError extends Error {
  readonly code = "auth-required";

  constructor(message = "Please sign in to continue.") {
    super(message);
    this.name = "SearchAuthRequiredError";
  }
}
