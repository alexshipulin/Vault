import {
  getFirestore,
  Timestamp,
  type DocumentData,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";

import type {
  AntiqueAuctionData,
  AntiqueAuctionDocument,
  ScanPriceData,
  ScanResultData,
  ScanResultDocument,
  UserCollectionItemData,
  UserCollectionItemDocument,
  UserProfileData,
  UserProfileDocument,
} from "../types/firestore";
import {
  antiqueAuctionDataSchema,
  antiqueAuctionDocumentSchema,
  scanPriceDataSchema,
  scanResultDataSchema,
  scanResultDocumentSchema,
  userCollectionItemDataSchema,
  userCollectionItemDocumentSchema,
  userProfileDataSchema,
  userProfileDocumentSchema,
} from "./validation";

function toTimestamp(value: Date): Timestamp {
  return Timestamp.fromDate(value);
}

function stripId<T extends { id?: string }>(value: T): Omit<T, "id"> {
  const { id: _id, ...rest } = value;
  return rest;
}

function stripCollectionDocumentMetadata(
  value: UserCollectionItemDocument | UserCollectionItemData,
): UserCollectionItemData {
  const { id: _id, userId: _userId, ...rest } = value as UserCollectionItemDocument;
  return userCollectionItemDataSchema.parse(rest);
}

function serializeScanPriceData(value: ScanPriceData | null): DocumentData | null {
  if (value === null) {
    return null;
  }

  const parsed = scanPriceDataSchema.parse(value);

  return {
    ...parsed,
    generatedAt: toTimestamp(parsed.generatedAt),
  };
}

function deserializeScanPriceData(value: unknown): ScanPriceData | null {
  if (value === null || value === undefined) {
    return null;
  }

  return scanPriceDataSchema.parse({
    ...(value as Record<string, unknown>),
    generatedAt: value instanceof Object ? (value as Record<string, unknown>).generatedAt : value,
  });
}

function serializeAntiqueAuction(
  value: AntiqueAuctionDocument | AntiqueAuctionData,
): DocumentData {
  const parsed = antiqueAuctionDataSchema.parse(stripId(value as AntiqueAuctionDocument));

  return {
    ...parsed,
    saleDate: toTimestamp(parsed.saleDate),
    createdAt: toTimestamp(parsed.createdAt),
    updatedAt: toTimestamp(parsed.updatedAt),
  };
}

function deserializeAntiqueAuction(snapshot: QueryDocumentSnapshot): AntiqueAuctionDocument {
  const data = snapshot.data();

  return antiqueAuctionDocumentSchema.parse({
    id: snapshot.id,
    ...data,
    saleDate: data.saleDate,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  });
}

function serializeScanResult(value: ScanResultDocument | ScanResultData): DocumentData {
  const parsed = scanResultDataSchema.parse(stripId(value as ScanResultDocument));

  return {
    ...parsed,
    scannedAt: toTimestamp(parsed.scannedAt),
    priceData: serializeScanPriceData(parsed.priceData),
  };
}

function deserializeScanResult(snapshot: QueryDocumentSnapshot): ScanResultDocument {
  const data = snapshot.data();

  return scanResultDocumentSchema.parse({
    id: snapshot.id,
    ...data,
    scannedAt: data.scannedAt,
    priceData: deserializeScanPriceData(data.priceData),
  });
}

function serializeUserCollectionItem(
  value: UserCollectionItemDocument | UserCollectionItemData,
): DocumentData {
  const parsed = stripCollectionDocumentMetadata(value);

  return {
    ...parsed,
    addedAt: toTimestamp(parsed.addedAt),
    priceEstimate: {
      ...parsed.priceEstimate,
      capturedAt: toTimestamp(parsed.priceEstimate.capturedAt),
    },
  };
}

function deserializeUserCollectionItem(snapshot: QueryDocumentSnapshot): UserCollectionItemDocument {
  const data = snapshot.data();
  const userId = snapshot.ref.parent.parent?.id;

  return userCollectionItemDocumentSchema.parse({
    id: snapshot.id,
    userId,
    ...data,
    addedAt: data.addedAt,
    priceEstimate: {
      ...(data.priceEstimate as Record<string, unknown>),
      capturedAt: (data.priceEstimate as Record<string, unknown>).capturedAt,
    },
  });
}

function serializeUserProfile(value: UserProfileDocument | UserProfileData): DocumentData {
  const parsed = userProfileDataSchema.parse(stripId(value as UserProfileDocument));

  return {
    ...parsed,
    createdAt: toTimestamp(parsed.createdAt),
    subscription: {
      ...parsed.subscription,
      renewalDate: parsed.subscription.renewalDate
        ? toTimestamp(parsed.subscription.renewalDate)
        : null,
    },
  };
}

function deserializeUserProfile(snapshot: QueryDocumentSnapshot): UserProfileDocument {
  const data = snapshot.data();

  return userProfileDocumentSchema.parse({
    id: snapshot.id,
    ...data,
    createdAt: data.createdAt,
    subscription: {
      ...(data.subscription as Record<string, unknown>),
      renewalDate: (data.subscription as Record<string, unknown>).renewalDate ?? null,
    },
  });
}

export const antiqueAuctionConverter = {
  toFirestore: serializeAntiqueAuction,
  fromFirestore: deserializeAntiqueAuction,
} as FirestoreDataConverter<AntiqueAuctionDocument>;

export const scanResultConverter = {
  toFirestore: serializeScanResult,
  fromFirestore: deserializeScanResult,
} as FirestoreDataConverter<ScanResultDocument>;

export const userCollectionItemConverter = {
  toFirestore: serializeUserCollectionItem,
  fromFirestore: deserializeUserCollectionItem,
} as FirestoreDataConverter<UserCollectionItemDocument>;

export const userProfileConverter = {
  toFirestore: serializeUserProfile,
  fromFirestore: deserializeUserProfile,
} as FirestoreDataConverter<UserProfileDocument>;

export function antiqueAuctionsCollection() {
  return getFirestore()
    .collection("antique_auctions")
    .withConverter(antiqueAuctionConverter);
}

export function scanResultsCollection() {
  return getFirestore()
    .collection("scan_results")
    .withConverter(scanResultConverter);
}

export function usersCollection() {
  return getFirestore()
    .collection("users")
    .withConverter(userProfileConverter);
}

export function userCollectionItemsCollection(userId: string) {
  return getFirestore()
    .collection("user_collections")
    .doc(userId)
    .collection("items")
    .withConverter(userCollectionItemConverter);
}
