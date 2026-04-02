import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  type Auth,
} from "firebase/auth";
import {
  CACHE_SIZE_UNLIMITED,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  type Firestore,
} from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

import { AppConfig } from "@/constants/Config";

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;
let firestoreDb: Firestore | null = null;
let storageInstance: FirebaseStorage | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (firebaseApp) {
    return firebaseApp;
  }

  firebaseApp =
    getApps().length > 0
      ? getApp()
      : initializeApp({
          apiKey: AppConfig.firebase.apiKey,
          projectId: AppConfig.firebase.projectId,
          authDomain: AppConfig.firebase.authDomain,
          storageBucket: AppConfig.firebase.storageBucket,
          appId: AppConfig.firebase.appId,
          messagingSenderId: AppConfig.firebase.messagingSenderId,
        });

  return firebaseApp;
}

export function getVaultScopeAuth(): Auth {
  if (firebaseAuth) {
    return firebaseAuth;
  }

  const app = getFirebaseApp();

  try {
    firebaseAuth = initializeAuth(app);
  } catch {
    firebaseAuth = getAuth(app);
  }

  return firebaseAuth;
}

export function getVaultScopeDb(): Firestore {
  if (firestoreDb) {
    return firestoreDb;
  }

  const app = getFirebaseApp();
  const supportsPersistentLocalCache =
    typeof globalThis !== "undefined" && "indexedDB" in globalThis;

  try {
    firestoreDb = supportsPersistentLocalCache
      ? initializeFirestore(app, {
          localCache: persistentLocalCache({
            cacheSizeBytes: CACHE_SIZE_UNLIMITED,
          }),
        })
      : initializeFirestore(app, {
          experimentalForceLongPolling: true,
          cacheSizeBytes: CACHE_SIZE_UNLIMITED,
        });
  } catch {
    firestoreDb = getFirestore(app);
  }

  return firestoreDb;
}

export function getVaultScopeStorage(): FirebaseStorage {
  if (storageInstance) {
    return storageInstance;
  }

  storageInstance = getStorage(getFirebaseApp());
  return storageInstance;
}

export function initializeFirebase(): {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
} {
  return {
    app: getFirebaseApp(),
    auth: getVaultScopeAuth(),
    db: getVaultScopeDb(),
    storage: getVaultScopeStorage(),
  };
}
