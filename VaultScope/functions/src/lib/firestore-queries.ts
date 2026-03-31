import { Timestamp } from "firebase-admin/firestore";

import type {
  AddToCollectionInput,
  AntiqueAuctionDocument,
  GetUserCollectionOptions,
  PriceRange,
  SaveScanResultInput,
  ScanResultDocument,
  UserCollectionItemDocument,
} from "../types/firestore";
import {
  antiqueAuctionsCollection,
  scanResultsCollection,
  userCollectionItemsCollection,
} from "./firestore-converters";
import {
  addToCollectionInputSchema,
  getUserCollectionInputSchema,
  saveScanResultInputSchema,
  searchAntiquesInputSchema,
} from "./validation";

const DEFAULT_SEARCH_LIMIT = 20;
const DEFAULT_COLLECTION_LIMIT = 50;
const MAX_SEARCH_TERMS = 10;

function normalizeKeywords(keywords: string[]): string[] {
  return Array.from(new Set(
    keywords
      .map((keyword) => keyword.trim().toLowerCase())
      .filter(Boolean),
  )).slice(0, MAX_SEARCH_TERMS);
}

export async function searchAntiques(
  keywords: string[],
  category?: string,
  priceRange?: PriceRange,
  limit = DEFAULT_SEARCH_LIMIT,
): Promise<AntiqueAuctionDocument[]> {
  const parsed = searchAntiquesInputSchema.parse({
    keywords: normalizeKeywords(keywords),
    category: category?.trim() || undefined,
    priceRange,
    limit,
  });

  const query = parsed.keywords.length > 1
    ? antiqueAuctionsCollection().where("keywords", "array-contains-any", parsed.keywords)
    : antiqueAuctionsCollection().where("keywords", "array-contains", parsed.keywords[0]);

  let firestoreQuery = query;

  if (parsed.category) {
    firestoreQuery = firestoreQuery.where("category", "==", parsed.category);
  }

  if (parsed.priceRange?.min !== undefined) {
    firestoreQuery = firestoreQuery.where("priceRealized", ">=", parsed.priceRange.min);
  }

  if (parsed.priceRange?.max !== undefined) {
    firestoreQuery = firestoreQuery.where("priceRealized", "<=", parsed.priceRange.max);
  }

  const snapshot = await firestoreQuery
    .orderBy("priceRealized", "desc")
    .limit(parsed.limit)
    .get();

  return snapshot.docs.map((document) => document.data());
}

export async function getUserCollection(
  userId: string,
  options: GetUserCollectionOptions = {},
): Promise<UserCollectionItemDocument[]> {
  const { userId: validatedUserId, limit, beforeAddedAt } = getUserCollectionInputSchema.parse({
    userId,
    limit: options.limit ?? DEFAULT_COLLECTION_LIMIT,
    beforeAddedAt: options.beforeAddedAt,
  });

  let query = userCollectionItemsCollection(validatedUserId)
    .orderBy("addedAt", "desc")
    .limit(limit);

  if (beforeAddedAt) {
    query = query.startAfter(Timestamp.fromDate(beforeAddedAt));
  }

  const snapshot = await query.get();
  return snapshot.docs.map((document) => document.data());
}

export async function saveScanResult(
  scanResult: SaveScanResultInput,
): Promise<ScanResultDocument> {
  const parsed = saveScanResultInputSchema.parse(scanResult);
  const collection = scanResultsCollection();
  const docRef = parsed.id ? collection.doc(parsed.id) : collection.doc();

  const document: ScanResultDocument = {
    id: docRef.id,
    userId: parsed.userId,
    category: parsed.category,
    images: parsed.images,
    identification: parsed.identification,
    priceData: parsed.priceData,
    scannedAt: parsed.scannedAt,
  };

  await docRef.set(document);
  return document;
}

export async function addToCollection(
  userId: string,
  item: AddToCollectionInput,
): Promise<UserCollectionItemDocument> {
  const validatedUserId = getUserCollectionInputSchema.parse({
    userId,
    limit: DEFAULT_COLLECTION_LIMIT,
  }).userId;
  const parsed = addToCollectionInputSchema.parse(item);
  const collection = userCollectionItemsCollection(validatedUserId);
  const docRef = parsed.id ? collection.doc(parsed.id) : collection.doc();

  const document: UserCollectionItemDocument = {
    id: docRef.id,
    userId: validatedUserId,
    scanResultId: parsed.scanResultId,
    title: parsed.title,
    imageUrl: parsed.imageUrl,
    priceEstimate: parsed.priceEstimate,
    addedAt: parsed.addedAt,
    customNotes: parsed.customNotes,
  };

  await docRef.set(document);
  return document;
}
