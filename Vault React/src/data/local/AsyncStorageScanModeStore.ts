import type { ScanModeStore } from "@src/domain/contracts";
import type { ScanMode } from "@src/domain/models";

import { readJSON, STORAGE_KEYS, writeJSON } from "./storage";

export class AsyncStorageScanModeStore implements ScanModeStore {
  async load(): Promise<ScanMode> {
    return readJSON<ScanMode>(STORAGE_KEYS.scanMode, "standard");
  }

  async save(mode: ScanMode): Promise<void> {
    await writeJSON(STORAGE_KEYS.scanMode, mode);
  }
}
