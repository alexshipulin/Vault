import {
  onAuthStateChanged,
  signInAnonymously,
  signOut,
  type User,
} from "firebase/auth";

import { getVaultScopeAuth } from "@/lib/firebase/config";

let anonymousSignInInFlight: Promise<User | null> | null = null;
let anonymousAuthUnavailable = false;

function isAnonymousAuthConfigurationError(error: unknown): boolean {
  if (typeof error !== "object" || error == null) {
    return false;
  }

  const maybeCode = "code" in error ? (error as { code?: unknown }).code : undefined;
  if (maybeCode === "auth/configuration-not-found") {
    return true;
  }

  if (error instanceof Error) {
    return error.message.toLowerCase().includes("configuration-not-found");
  }

  return false;
}

export async function ensureAnonymousSession(): Promise<User | null> {
  const auth = getVaultScopeAuth();

  if (auth.currentUser) {
    return auth.currentUser;
  }

  if (anonymousAuthUnavailable) {
    return null;
  }

  if (anonymousSignInInFlight) {
    return anonymousSignInInFlight;
  }

  anonymousSignInInFlight = signInAnonymously(auth)
    .then((credential) => credential.user)
    .catch((error: unknown) => {
      if (isAnonymousAuthConfigurationError(error)) {
        anonymousAuthUnavailable = true;
        console.warn(
          "[VaultScope] Firebase anonymous auth is unavailable for this project. Continuing without authenticated Firebase session.",
        );
        return null;
      }
      throw error;
    })
    .finally(() => {
      anonymousSignInInFlight = null;
    });

  return anonymousSignInInFlight;
}

export function observeAuthState(listener: (user: User | null) => void): () => void {
  return onAuthStateChanged(getVaultScopeAuth(), listener);
}

export async function refreshAnonymousSession(): Promise<User | null> {
  const auth = getVaultScopeAuth();
  if (anonymousAuthUnavailable) {
    return null;
  }

  if (auth.currentUser) {
    await signOut(auth);
  }

  try {
    const credential = await signInAnonymously(auth);
    return credential.user;
  } catch (error) {
    if (isAnonymousAuthConfigurationError(error)) {
      anonymousAuthUnavailable = true;
      return null;
    }
    throw error;
  }
}
