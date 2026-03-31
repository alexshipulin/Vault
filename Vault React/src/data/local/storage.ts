import AsyncStorage from "@react-native-async-storage/async-storage";

export const STORAGE_KEYS = {
  collection: "vault-react.collection.v1",
  temporarySession: "vault-react.temporary-session.v1",
  scanMode: "vault-react.scan-mode.v1",
  preferences: "vault-react.preferences.v1",
  chatSessions: "vault-react.chat-sessions.v1"
} as const;

export async function readJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function writeJSON<T>(key: string, value: T): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function clearVaultReactStorage(): Promise<void> {
  await AsyncStorage.multiRemove(Object.values(STORAGE_KEYS));
}
