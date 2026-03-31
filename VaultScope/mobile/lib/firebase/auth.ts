import {
  onAuthStateChanged,
  signInAnonymously,
  signOut,
  type User,
} from "firebase/auth";

import { getVaultScopeAuth } from "@/lib/firebase/config";

export async function ensureAnonymousSession(): Promise<User> {
  const auth = getVaultScopeAuth();

  if (auth.currentUser) {
    return auth.currentUser;
  }

  const credential = await signInAnonymously(auth);
  return credential.user;
}

export function observeAuthState(listener: (user: User | null) => void): () => void {
  return onAuthStateChanged(getVaultScopeAuth(), listener);
}

export async function refreshAnonymousSession(): Promise<User> {
  const auth = getVaultScopeAuth();
  await signOut(auth);
  const credential = await signInAnonymously(auth);
  return credential.user;
}
