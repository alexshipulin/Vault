import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { attachScanIdToAnalysisLog } from "@/lib/analysis/logs";
import { getVaultScopeDb } from "@/lib/firebase/config";
import type { CollectionItem, ScanResult, UserProfile } from "@/lib/types";

function sanitizeFirestoreValue(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (value == null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeFirestoreValue(item))
      .filter((item) => item !== undefined);
  }

  if (typeof value !== "object") {
    return value;
  }

  if (value instanceof Date) {
    return value;
  }

  const prototype = Object.getPrototypeOf(value);
  const isPlainObject = prototype === Object.prototype || prototype === null;
  if (!isPlainObject) {
    return value;
  }

  const sanitized: Record<string, unknown> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, nestedValue]) => {
    const normalized = sanitizeFirestoreValue(nestedValue);
    if (normalized !== undefined) {
      sanitized[key] = normalized;
    }
  });
  return sanitized;
}

function sanitizeFirestorePayload<T extends Record<string, unknown>>(value: T): T {
  return sanitizeFirestoreValue(value) as T;
}

export async function saveScanResult(
  payload: Omit<ScanResult, "id" | "scannedAt"> & Partial<Pick<ScanResult, "id" | "scannedAt">>,
): Promise<string> {
  const db = getVaultScopeDb();
  const scanCollection = collection(db, "scan_results");
  const reference = payload.id ? doc(db, "scan_results", payload.id) : doc(scanCollection);
  const scannedAt = payload.scannedAt ?? new Date().toISOString();
  const analysisLog = attachScanIdToAnalysisLog(payload.analysisLog, reference.id);
  const documentPayload = sanitizeFirestorePayload({
    userId: payload.userId,
    category: payload.category,
    images: payload.images,
    identification: payload.identification,
    priceEstimate: payload.priceEstimate,
    analysisLog,
    scannedAt,
  });

  await setDoc(
    reference,
    {
      ...documentPayload,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return reference.id;
}

export async function saveFailedScanLog(payload: {
  id: string;
  userId: string;
  category: string;
  images: string[];
  analysisLog: NonNullable<ScanResult["analysisLog"]>;
  scannedAt: string;
  errorSummary: string;
  failedStep: string;
}): Promise<string> {
  const db = getVaultScopeDb();
  const reference = doc(db, "scan_results", payload.id);
  const analysisLog = attachScanIdToAnalysisLog(payload.analysisLog, reference.id);
  const documentPayload = sanitizeFirestorePayload({
    userId: payload.userId,
    category: payload.category,
    images: payload.images,
    analysisLog,
    scannedAt: payload.scannedAt,
    status: "failed",
    errorSummary: payload.errorSummary,
    failedStep: payload.failedStep,
  });

  await setDoc(
    reference,
    {
      ...documentPayload,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return reference.id;
}

export async function getScanResult(scanId: string): Promise<ScanResult | null> {
  const snapshot = await getDoc(doc(getVaultScopeDb(), "scan_results", scanId));

  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data() as Omit<ScanResult, "id">;
  return {
    id: snapshot.id,
    ...data,
  };
}

export async function getUserCollection(userId: string): Promise<CollectionItem[]> {
  const itemsQuery = query(
    collection(getVaultScopeDb(), "user_collections", userId, "items"),
    orderBy("addedAt", "desc"),
  );

  const snapshot = await getDocs(itemsQuery);

  return snapshot.docs.map((itemDoc) => ({
    id: itemDoc.id,
    ...(itemDoc.data() as Omit<CollectionItem, "id">),
  }));
}

export async function addToCollection(
  userId: string,
  item: Omit<CollectionItem, "id" | "addedAt"> & Partial<Pick<CollectionItem, "addedAt">>,
): Promise<string> {
  const collectionRef = collection(getVaultScopeDb(), "user_collections", userId, "items");
  const documentPayload = sanitizeFirestorePayload({
    ...item,
    addedAt: item.addedAt ?? new Date().toISOString(),
  });
  const docRef = await addDoc(collectionRef, documentPayload);

  return docRef.id;
}

export async function upsertUserProfile(profile: UserProfile): Promise<void> {
  const documentPayload = sanitizeFirestorePayload({
    email: profile.email,
    displayName: profile.displayName,
    subscription: profile.subscription,
    preferences: profile.preferences,
    createdAt: profile.createdAt,
  });

  await setDoc(
    doc(getVaultScopeDb(), "users", profile.id),
    {
      ...documentPayload,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
