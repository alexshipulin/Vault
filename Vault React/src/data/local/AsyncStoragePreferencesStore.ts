import type { PreferencesStore } from "@src/domain/contracts";
import { DEFAULT_PREFERENCES, type VaultUserPreferences } from "@src/domain/models";

import { readJSON, STORAGE_KEYS, writeJSON } from "./storage";

export class AsyncStoragePreferencesStore implements PreferencesStore {
  async load(): Promise<VaultUserPreferences> {
    return readJSON<VaultUserPreferences>(STORAGE_KEYS.preferences, DEFAULT_PREFERENCES);
  }

  async save(preferences: VaultUserPreferences): Promise<void> {
    await writeJSON(STORAGE_KEYS.preferences, preferences);
  }
}
