import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";

const firestoreDateSchema = z.preprocess((value) => {
  if (value instanceof Timestamp) {
    return value.toDate();
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "string" || typeof value === "number") {
    return new Date(value);
  }

  return value;
}, z.date());

const trimmedStringSchema = z.string().trim().min(1);
const nullableTrimmedStringSchema = z.string().trim().min(1).nullable();
const nonNegativeNumberSchema = z.number().finite().nonnegative();
const nullableMoneySchema = nonNegativeNumberSchema.nullable();

export const priceRangeSchema = z.object({
  min: nonNegativeNumberSchema.optional(),
  max: nonNegativeNumberSchema.optional(),
}).refine((value) => {
  if (value.min === undefined || value.max === undefined) {
    return true;
  }

  return value.min <= value.max;
}, {
  message: "priceRange.min must be less than or equal to priceRange.max",
  path: ["max"],
});

export const antiqueAuctionDataSchema = z.object({
  title: trimmedStringSchema,
  description: z.string().trim().default(""),
  priceRealized: nullableMoneySchema,
  estimateLow: nullableMoneySchema,
  estimateHigh: nullableMoneySchema,
  auctionHouse: trimmedStringSchema,
  saleDate: firestoreDateSchema,
  category: trimmedStringSchema,
  period: nullableTrimmedStringSchema,
  material: nullableTrimmedStringSchema,
  originCountry: nullableTrimmedStringSchema,
  imageUrl: z.string().trim().url().nullable(),
  source: trimmedStringSchema,
  keywords: z.array(trimmedStringSchema).min(1).max(25),
  createdAt: firestoreDateSchema,
  updatedAt: firestoreDateSchema,
}).refine((value) => {
  if (value.estimateLow === null || value.estimateHigh === null) {
    return true;
  }

  return value.estimateLow <= value.estimateHigh;
}, {
  message: "estimateLow must be less than or equal to estimateHigh",
  path: ["estimateHigh"],
});

export const antiqueAuctionDocumentSchema = antiqueAuctionDataSchema.extend({
  id: trimmedStringSchema,
});

export const scanIdentificationSchema = z.object({
  title: trimmedStringSchema,
  description: nullableTrimmedStringSchema,
  confidence: z.number().finite().min(0).max(1),
  period: nullableTrimmedStringSchema,
  material: nullableTrimmedStringSchema,
  originCountry: nullableTrimmedStringSchema,
  matchedAuctionIds: z.array(trimmedStringSchema).max(20),
});

export const scanPriceDataSchema = z.object({
  estimateLow: nullableMoneySchema,
  estimateHigh: nullableMoneySchema,
  estimatedMarketValue: nullableMoneySchema,
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  confidenceScore: z.number().finite().min(0).max(1).nullable(),
  comparableAuctionIds: z.array(trimmedStringSchema).max(25),
  generatedAt: firestoreDateSchema,
}).refine((value) => {
  if (value.estimateLow === null || value.estimateHigh === null) {
    return true;
  }

  return value.estimateLow <= value.estimateHigh;
}, {
  message: "estimateLow must be less than or equal to estimateHigh",
  path: ["estimateHigh"],
});

export const scanResultDataSchema = z.object({
  userId: trimmedStringSchema,
  category: trimmedStringSchema,
  images: z.array(trimmedStringSchema).min(1).max(10),
  identification: scanIdentificationSchema,
  priceData: scanPriceDataSchema.nullable(),
  scannedAt: firestoreDateSchema,
});

export const saveScanResultInputSchema = scanResultDataSchema.extend({
  id: trimmedStringSchema.optional(),
  scannedAt: firestoreDateSchema.optional().default(() => new Date()),
});

export const scanResultDocumentSchema = scanResultDataSchema.extend({
  id: trimmedStringSchema,
});

export const priceEstimateSnapshotSchema = z.object({
  estimateLow: nullableMoneySchema,
  estimateHigh: nullableMoneySchema,
  estimatedMarketValue: nullableMoneySchema,
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  confidenceScore: z.number().finite().min(0).max(1).nullable(),
  capturedAt: firestoreDateSchema,
}).refine((value) => {
  if (value.estimateLow === null || value.estimateHigh === null) {
    return true;
  }

  return value.estimateLow <= value.estimateHigh;
}, {
  message: "estimateLow must be less than or equal to estimateHigh",
  path: ["estimateHigh"],
});

export const userCollectionItemDataSchema = z.object({
  scanResultId: trimmedStringSchema,
  title: trimmedStringSchema,
  imageUrl: z.string().trim().url().nullable(),
  priceEstimate: priceEstimateSnapshotSchema,
  addedAt: firestoreDateSchema,
  customNotes: z.string().trim().max(2_000).nullable(),
});

export const addToCollectionInputSchema = userCollectionItemDataSchema.extend({
  id: trimmedStringSchema.optional(),
  addedAt: firestoreDateSchema.optional().default(() => new Date()),
});

export const userCollectionItemDocumentSchema = userCollectionItemDataSchema.extend({
  id: trimmedStringSchema,
  userId: trimmedStringSchema,
});

export const userSubscriptionSchema = z.object({
  plan: z.enum(["free", "pro", "premium"]),
  status: z.enum(["active", "trialing", "canceled", "past_due", "expired"]),
  renewalDate: firestoreDateSchema.nullable(),
  scanCreditsRemaining: z.number().int().nonnegative().nullable(),
});

export const userPreferencesSchema = z.object({
  preferredCurrency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  locale: trimmedStringSchema,
  notificationsEnabled: z.boolean(),
  favoriteCategories: z.array(trimmedStringSchema).max(20),
});

export const userProfileDataSchema = z.object({
  email: z.string().trim().email(),
  displayName: nullableTrimmedStringSchema,
  subscription: userSubscriptionSchema,
  preferences: userPreferencesSchema,
  createdAt: firestoreDateSchema,
});

export const userProfileDocumentSchema = userProfileDataSchema.extend({
  id: trimmedStringSchema,
});

export const searchAntiquesInputSchema = z.object({
  keywords: z.array(trimmedStringSchema).min(1).max(10),
  category: trimmedStringSchema.optional(),
  priceRange: priceRangeSchema.optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export const getUserCollectionInputSchema = z.object({
  userId: trimmedStringSchema,
  limit: z.number().int().min(1).max(100).default(50),
  beforeAddedAt: firestoreDateSchema.optional(),
});
