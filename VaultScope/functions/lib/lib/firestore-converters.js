"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userProfileConverter = exports.userCollectionItemConverter = exports.scanResultConverter = exports.antiqueAuctionConverter = void 0;
exports.antiqueAuctionsCollection = antiqueAuctionsCollection;
exports.scanResultsCollection = scanResultsCollection;
exports.usersCollection = usersCollection;
exports.userCollectionItemsCollection = userCollectionItemsCollection;
const firestore_1 = require("firebase-admin/firestore");
const validation_1 = require("./validation");
function toTimestamp(value) {
    return firestore_1.Timestamp.fromDate(value);
}
function stripId(value) {
    const { id: _id, ...rest } = value;
    return rest;
}
function stripCollectionDocumentMetadata(value) {
    const { id: _id, userId: _userId, ...rest } = value;
    return validation_1.userCollectionItemDataSchema.parse(rest);
}
function serializeScanPriceData(value) {
    if (value === null) {
        return null;
    }
    const parsed = validation_1.scanPriceDataSchema.parse(value);
    return {
        ...parsed,
        generatedAt: toTimestamp(parsed.generatedAt),
    };
}
function deserializeScanPriceData(value) {
    if (value === null || value === undefined) {
        return null;
    }
    return validation_1.scanPriceDataSchema.parse({
        ...value,
        generatedAt: value instanceof Object ? value.generatedAt : value,
    });
}
function serializeAntiqueAuction(value) {
    const parsed = validation_1.antiqueAuctionDataSchema.parse(stripId(value));
    return {
        ...parsed,
        saleDate: toTimestamp(parsed.saleDate),
        createdAt: toTimestamp(parsed.createdAt),
        updatedAt: toTimestamp(parsed.updatedAt),
    };
}
function deserializeAntiqueAuction(snapshot) {
    const data = snapshot.data();
    return validation_1.antiqueAuctionDocumentSchema.parse({
        id: snapshot.id,
        ...data,
        saleDate: data.saleDate,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
    });
}
function serializeScanResult(value) {
    const parsed = validation_1.scanResultDataSchema.parse(stripId(value));
    return {
        ...parsed,
        scannedAt: toTimestamp(parsed.scannedAt),
        priceData: serializeScanPriceData(parsed.priceData),
    };
}
function deserializeScanResult(snapshot) {
    const data = snapshot.data();
    return validation_1.scanResultDocumentSchema.parse({
        id: snapshot.id,
        ...data,
        scannedAt: data.scannedAt,
        priceData: deserializeScanPriceData(data.priceData),
    });
}
function serializeUserCollectionItem(value) {
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
function deserializeUserCollectionItem(snapshot) {
    const data = snapshot.data();
    const userId = snapshot.ref.parent.parent?.id;
    return validation_1.userCollectionItemDocumentSchema.parse({
        id: snapshot.id,
        userId,
        ...data,
        addedAt: data.addedAt,
        priceEstimate: {
            ...data.priceEstimate,
            capturedAt: data.priceEstimate.capturedAt,
        },
    });
}
function serializeUserProfile(value) {
    const parsed = validation_1.userProfileDataSchema.parse(stripId(value));
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
function deserializeUserProfile(snapshot) {
    const data = snapshot.data();
    return validation_1.userProfileDocumentSchema.parse({
        id: snapshot.id,
        ...data,
        createdAt: data.createdAt,
        subscription: {
            ...data.subscription,
            renewalDate: data.subscription.renewalDate ?? null,
        },
    });
}
exports.antiqueAuctionConverter = {
    toFirestore: serializeAntiqueAuction,
    fromFirestore: deserializeAntiqueAuction,
};
exports.scanResultConverter = {
    toFirestore: serializeScanResult,
    fromFirestore: deserializeScanResult,
};
exports.userCollectionItemConverter = {
    toFirestore: serializeUserCollectionItem,
    fromFirestore: deserializeUserCollectionItem,
};
exports.userProfileConverter = {
    toFirestore: serializeUserProfile,
    fromFirestore: deserializeUserProfile,
};
function antiqueAuctionsCollection() {
    return (0, firestore_1.getFirestore)()
        .collection("antique_auctions")
        .withConverter(exports.antiqueAuctionConverter);
}
function scanResultsCollection() {
    return (0, firestore_1.getFirestore)()
        .collection("scan_results")
        .withConverter(exports.scanResultConverter);
}
function usersCollection() {
    return (0, firestore_1.getFirestore)()
        .collection("users")
        .withConverter(exports.userProfileConverter);
}
function userCollectionItemsCollection(userId) {
    return (0, firestore_1.getFirestore)()
        .collection("user_collections")
        .doc(userId)
        .collection("items")
        .withConverter(exports.userCollectionItemConverter);
}
//# sourceMappingURL=firestore-converters.js.map