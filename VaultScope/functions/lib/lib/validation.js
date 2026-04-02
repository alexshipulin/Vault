"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserCollectionInputSchema = exports.searchAntiquesInputSchema = exports.userProfileDocumentSchema = exports.userProfileDataSchema = exports.userPreferencesSchema = exports.userSubscriptionSchema = exports.userCollectionItemDocumentSchema = exports.addToCollectionInputSchema = exports.userCollectionItemDataSchema = exports.priceEstimateSnapshotSchema = exports.scanResultDocumentSchema = exports.saveScanResultInputSchema = exports.scanResultDataSchema = exports.scanPriceDataSchema = exports.scanIdentificationSchema = exports.antiqueAuctionDocumentSchema = exports.antiqueAuctionDataSchema = exports.priceRangeSchema = void 0;
const firestore_1 = require("firebase-admin/firestore");
const zod_1 = require("zod");
const firestoreDateSchema = zod_1.z.preprocess((value) => {
    if (value instanceof firestore_1.Timestamp) {
        return value.toDate();
    }
    if (value instanceof Date) {
        return value;
    }
    if (typeof value === "string" || typeof value === "number") {
        return new Date(value);
    }
    return value;
}, zod_1.z.date());
const trimmedStringSchema = zod_1.z.string().trim().min(1);
const nullableTrimmedStringSchema = zod_1.z.string().trim().min(1).nullable();
const nonNegativeNumberSchema = zod_1.z.number().finite().nonnegative();
const nullableMoneySchema = nonNegativeNumberSchema.nullable();
exports.priceRangeSchema = zod_1.z.object({
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
const antiqueAuctionDataBaseSchema = zod_1.z.object({
    title: trimmedStringSchema,
    description: zod_1.z.string().trim().default(""),
    priceRealized: nullableMoneySchema,
    estimateLow: nullableMoneySchema,
    estimateHigh: nullableMoneySchema,
    auctionHouse: trimmedStringSchema,
    saleDate: firestoreDateSchema,
    category: trimmedStringSchema,
    period: nullableTrimmedStringSchema,
    material: nullableTrimmedStringSchema,
    originCountry: nullableTrimmedStringSchema,
    imageUrl: zod_1.z.string().trim().url().nullable(),
    source: trimmedStringSchema,
    keywords: zod_1.z.array(trimmedStringSchema).min(1).max(25),
    createdAt: firestoreDateSchema,
    updatedAt: firestoreDateSchema,
});
exports.antiqueAuctionDataSchema = antiqueAuctionDataBaseSchema.refine((value) => {
    if (value.estimateLow === null || value.estimateHigh === null) {
        return true;
    }
    return value.estimateLow <= value.estimateHigh;
}, {
    message: "estimateLow must be less than or equal to estimateHigh",
    path: ["estimateHigh"],
});
exports.antiqueAuctionDocumentSchema = antiqueAuctionDataBaseSchema.extend({
    id: trimmedStringSchema,
}).refine((value) => {
    if (value.estimateLow === null || value.estimateHigh === null) {
        return true;
    }
    return value.estimateLow <= value.estimateHigh;
}, {
    message: "estimateLow must be less than or equal to estimateHigh",
    path: ["estimateHigh"],
});
exports.scanIdentificationSchema = zod_1.z.object({
    title: trimmedStringSchema,
    description: nullableTrimmedStringSchema,
    confidence: zod_1.z.number().finite().min(0).max(1),
    period: nullableTrimmedStringSchema,
    material: nullableTrimmedStringSchema,
    originCountry: nullableTrimmedStringSchema,
    matchedAuctionIds: zod_1.z.array(trimmedStringSchema).max(20),
});
exports.scanPriceDataSchema = zod_1.z.object({
    estimateLow: nullableMoneySchema,
    estimateHigh: nullableMoneySchema,
    estimatedMarketValue: nullableMoneySchema,
    currency: zod_1.z.string().trim().length(3).transform((value) => value.toUpperCase()),
    confidenceScore: zod_1.z.number().finite().min(0).max(1).nullable(),
    comparableAuctionIds: zod_1.z.array(trimmedStringSchema).max(25),
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
exports.scanResultDataSchema = zod_1.z.object({
    userId: trimmedStringSchema,
    category: trimmedStringSchema,
    images: zod_1.z.array(trimmedStringSchema).min(1).max(10),
    identification: exports.scanIdentificationSchema,
    priceData: exports.scanPriceDataSchema.nullable(),
    scannedAt: firestoreDateSchema,
});
exports.saveScanResultInputSchema = exports.scanResultDataSchema.extend({
    id: trimmedStringSchema.optional(),
    scannedAt: firestoreDateSchema.optional().default(() => new Date()),
});
exports.scanResultDocumentSchema = exports.scanResultDataSchema.extend({
    id: trimmedStringSchema,
});
exports.priceEstimateSnapshotSchema = zod_1.z.object({
    estimateLow: nullableMoneySchema,
    estimateHigh: nullableMoneySchema,
    estimatedMarketValue: nullableMoneySchema,
    currency: zod_1.z.string().trim().length(3).transform((value) => value.toUpperCase()),
    confidenceScore: zod_1.z.number().finite().min(0).max(1).nullable(),
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
exports.userCollectionItemDataSchema = zod_1.z.object({
    scanResultId: trimmedStringSchema,
    title: trimmedStringSchema,
    imageUrl: zod_1.z.string().trim().url().nullable(),
    priceEstimate: exports.priceEstimateSnapshotSchema,
    addedAt: firestoreDateSchema,
    customNotes: zod_1.z.string().trim().max(2_000).nullable(),
});
exports.addToCollectionInputSchema = exports.userCollectionItemDataSchema.extend({
    id: trimmedStringSchema.optional(),
    addedAt: firestoreDateSchema.optional().default(() => new Date()),
});
exports.userCollectionItemDocumentSchema = exports.userCollectionItemDataSchema.extend({
    id: trimmedStringSchema,
    userId: trimmedStringSchema,
});
exports.userSubscriptionSchema = zod_1.z.object({
    plan: zod_1.z.enum(["free", "pro", "premium"]),
    status: zod_1.z.enum(["active", "trialing", "canceled", "past_due", "expired"]),
    renewalDate: firestoreDateSchema.nullable(),
    scanCreditsRemaining: zod_1.z.number().int().nonnegative().nullable(),
});
exports.userPreferencesSchema = zod_1.z.object({
    preferredCurrency: zod_1.z.string().trim().length(3).transform((value) => value.toUpperCase()),
    locale: trimmedStringSchema,
    notificationsEnabled: zod_1.z.boolean(),
    favoriteCategories: zod_1.z.array(trimmedStringSchema).max(20),
});
exports.userProfileDataSchema = zod_1.z.object({
    email: zod_1.z.string().trim().email(),
    displayName: nullableTrimmedStringSchema,
    subscription: exports.userSubscriptionSchema,
    preferences: exports.userPreferencesSchema,
    createdAt: firestoreDateSchema,
});
exports.userProfileDocumentSchema = exports.userProfileDataSchema.extend({
    id: trimmedStringSchema,
});
exports.searchAntiquesInputSchema = zod_1.z.object({
    keywords: zod_1.z.array(trimmedStringSchema).min(1).max(10),
    category: trimmedStringSchema.optional(),
    priceRange: exports.priceRangeSchema.optional(),
    limit: zod_1.z.number().int().min(1).max(50).default(20),
});
exports.getUserCollectionInputSchema = zod_1.z.object({
    userId: trimmedStringSchema,
    limit: zod_1.z.number().int().min(1).max(100).default(50),
    beforeAddedAt: firestoreDateSchema.optional(),
});
//# sourceMappingURL=validation.js.map