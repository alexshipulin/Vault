import { AppConfig, hasRemoteConfig } from "@/constants/Config";
import type { VaultEnvironment } from "@src/domain/models";

export interface RuntimeConfig {
  environment: VaultEnvironment;
  flags: {
    seedData: boolean;
    fastProcessing: boolean;
    clearData: boolean;
    skipOnboarding: boolean;
    remoteBackend: boolean;
    forceMockCamera: boolean;
  };
}

export function currentRuntimeConfig(): RuntimeConfig {
  return {
    environment: AppConfig.vaultEnvironment,
    flags: {
      ...AppConfig.flags,
      remoteBackend: AppConfig.flags.remoteBackend && hasRemoteConfig()
    }
  };
}
