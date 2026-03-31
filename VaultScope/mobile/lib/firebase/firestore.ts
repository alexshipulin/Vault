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

import { getVaultScopeDb } from "@/lib/firebase/config";
import type { CollectionItem, ScanResult, UserProfile } from "@/lib/types";

export async function saveScanResult(
  payload: Omit<ScanResult, "id" | "scannedAt"> & Partial<Pick<ScanResult, "id" | "scannedAt">>,
): Promise<string> {
  const db = getVaultScopeDb();
  const scanCollection = collection(db, "scan_results");
  const reference = payload.id ? doc(db, "scan_results", payload.id) : doc(scanCollection);
  const scannedAt = payload.scannedAt ?? new Date().toISOString();

  await setDoc(
    reference,
    {
      userId: payload.userId,
      category: payload.category,
      images: payload.images,
      identification: payload.identification,
      priceEstimate: payload.priceEstimate,
      scannedAt,
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
  const docRef = await addDoc(collectionRef, {
    ...item,
    addedAt: item.addedAt ?? new Date().toISOString(),
  });

  return docRef.id;
}

export async function upsertUserProfile(profile: UserProfile): Promise<void> {
  await setDoc(
    doc(getVaultScopeDb(), "users", profile.id),
    {
      email: profile.email,
      displayName: profile.displayName,
      subscription: profile.subscription,
      preferences: profile.preferences,
      createdAt: profile.createdAt,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
