"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchAntiques = searchAntiques;
exports.getUserCollection = getUserCollection;
exports.saveScanResult = saveScanResult;
exports.addToCollection = addToCollection;
const firestore_1 = require("firebase-admin/firestore");
const firestore_converters_1 = require("./firestore-converters");
const validation_1 = require("./validation");
const DEFAULT_SEARCH_LIMIT = 20;
const DEFAULT_COLLECTION_LIMIT = 50;
const MAX_SEARCH_TERMS = 10;
function normalizeKeywords(keywords) {
    return Array.from(new Set(keywords
        .map((keyword) => keyword.trim().toLowerCase())
        .filter(Boolean))).slice(0, MAX_SEARCH_TERMS);
}
async function searchAntiques(keywords, category, priceRange, limit = DEFAULT_SEARCH_LIMIT) {
    const parsed = validation_1.searchAntiquesInputSchema.parse({
        keywords: normalizeKeywords(keywords),
        category: category?.trim() || undefined,
        priceRange,
        limit,
    });
    const query = parsed.keywords.length > 1
        ? (0, firestore_converters_1.antiqueAuctionsCollection)().where("keywords", "array-contains-any", parsed.keywords)
        : (0, firestore_converters_1.antiqueAuctionsCollection)().where("keywords", "array-contains", parsed.keywords[0]);
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
async function getUserCollection(userId, options = {}) {
    const { userId: validatedUserId, limit, beforeAddedAt } = validation_1.getUserCollectionInputSchema.parse({
        userId,
        limit: options.limit ?? DEFAULT_COLLECTION_LIMIT,
        beforeAddedAt: options.beforeAddedAt,
    });
    let query = (0, firestore_converters_1.userCollectionItemsCollection)(validatedUserId)
        .orderBy("addedAt", "desc")
        .limit(limit);
    if (beforeAddedAt) {
        query = query.startAfter(firestore_1.Timestamp.fromDate(beforeAddedAt));
    }
    const snapshot = await query.get();
    return snapshot.docs.map((document) => document.data());
}
async function saveScanResult(scanResult) {
    const parsed = validation_1.saveScanResultInputSchema.parse(scanResult);
    const collection = (0, firestore_converters_1.scanResultsCollection)();
    const docRef = parsed.id ? collection.doc(parsed.id) : collection.doc();
    const document = {
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
async function addToCollection(userId, item) {
    const validatedUserId = validation_1.getUserCollectionInputSchema.parse({
        userId,
        limit: DEFAULT_COLLECTION_LIMIT,
    }).userId;
    const parsed = validation_1.addToCollectionInputSchema.parse(item);
    const collection = (0, firestore_converters_1.userCollectionItemsCollection)(validatedUserId);
    const docRef = parsed.id ? collection.doc(parsed.id) : collection.doc();
    const document = {
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
//# sourceMappingURL=firestore-queries.js.map