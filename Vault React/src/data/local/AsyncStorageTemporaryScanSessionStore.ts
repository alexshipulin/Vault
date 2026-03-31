import type { TemporaryScanSessionStore } from "@src/domain/contracts";
import type { TemporaryScanSession } from "@src/domain/models";

import { readJSON, STORAGE_KEYS, writeJSON } from "./storage";

export class AsyncStorageTemporaryScanSessionStore implements TemporaryScanSessionStore {
  async load(): Promise<TemporaryScanSession | null> {
    return readJSON<TemporaryScanSession | null>(STORAGE_KEYS.temporarySession, null);
  }

  async save(session: TemporaryScanSession): Promise<void> {
    await writeJSON(STORAGE_KEYS.temporarySession, session);
  }

  async clear(): Promise<void> {
    await writeJSON(STORAGE_KEYS.temporarySession, null);
  }
}
