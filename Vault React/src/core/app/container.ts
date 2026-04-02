import { AppConfig, getRemoteReadinessStatus } from "@/constants/Config";
import { currentRuntimeConfig, type RuntimeConfig } from "@src/core/app/runtime";
import { seededItems } from "@src/data/seeds/seededItems";
import type { AppContainer } from "@src/domain/contracts";
import { AsyncStorageCollectionRepository } from "@src/data/local/AsyncStorageCollectionRepository";
import { AsyncStorageItemChatSessionStore } from "@src/data/local/AsyncStorageItemChatSessionStore";
import { AsyncStoragePreferencesStore } from "@src/data/local/AsyncStoragePreferencesStore";
import { AsyncStorageScanModeStore } from "@src/data/local/AsyncStorageScanModeStore";
import { AsyncStorageTemporaryScanSessionStore } from "@src/data/local/AsyncStorageTemporaryScanSessionStore";
import { LocalImagePersistenceService } from "@src/data/local/LocalImagePersistenceService";
import { LocalMarketTrendProvider } from "@src/data/local/LocalMarketTrendProvider";
import { MockCaptureService } from "@src/data/local/MockCaptureService";
import { LocalProfileDataExporter } from "@src/data/local/LocalProfileDataExporter";
import {
  clearVaultReactStorage,
  readJSON,
  STORAGE_KEYS,
  writeJSON
} from "@src/data/local/storage";
import {
  LegacyReadinessService,
  LegacyRemoteAnalysisService,
  LegacyRemoteCollectionMirrorService,
  LegacyRemoteSearchService
} from "@src/data/remote/LegacyRemoteServices";
import type { ScanOrchestrator } from "@src/domain/services";
import { LocalMockChatResponseGenerator } from "@src/features/chat/LocalMockChatResponseGenerator";
import { LocalMockScanOrchestrator } from "@src/features/scan/LocalMockScanOrchestrator";
import { LocalMockScanResultFactory } from "@src/features/scan/MockScanResultFactory";
import { RemoteScanOrchestrator } from "@src/features/scan/RemoteScanOrchestrator";

export type ExtendedAppContainer = AppContainer & {
  runtimeConfig: RuntimeConfig;
  remoteCollectionMirror: LegacyRemoteCollectionMirrorService;
  scanOrchestrator: ScanOrchestrator;
  bootstrap(): Promise<void>;
};

export function createAppContainer(runtimeConfig = currentRuntimeConfig()): ExtendedAppContainer {
  const remoteStatus = getRemoteReadinessStatus();
  const requestedRemoteBackend = runtimeConfig.flags.remoteBackend || AppConfig.flags.remoteBackend;

  if (requestedRemoteBackend && !remoteStatus.isReady) {
    console.warn("⚠️ Remote backend requested but config incomplete:");
    remoteStatus.missingConfig.forEach((item) => console.warn(`  - Missing: ${item}`));
    console.warn("Falling back to local mock mode");
  }

  const effectiveRuntimeConfig: RuntimeConfig =
    requestedRemoteBackend && !remoteStatus.isReady
      ? {
          ...runtimeConfig,
          flags: {
            ...runtimeConfig.flags,
            remoteBackend: false
          }
        }
      : runtimeConfig;

  const collectionRepository = new AsyncStorageCollectionRepository();
  const temporaryScanSessionStore = new AsyncStorageTemporaryScanSessionStore();
  const scanModeStore = new AsyncStorageScanModeStore();
  const preferencesStore = new AsyncStoragePreferencesStore();
  const itemChatSessionStore = new AsyncStorageItemChatSessionStore();
  const mockScanResultFactory = new LocalMockScanResultFactory();
  const localOrchestrator = new LocalMockScanOrchestrator(
    mockScanResultFactory,
    effectiveRuntimeConfig.flags.fastProcessing ? 60 : 550,
    effectiveRuntimeConfig.flags.fastProcessing ? 30 : 250
  );
  const chatResponseGenerator = new LocalMockChatResponseGenerator();
  const mockCaptureService = new MockCaptureService();
  const imagePersistenceService = new LocalImagePersistenceService();
  const profileDataExporter = new LocalProfileDataExporter();
  const marketTrendProvider = new LocalMarketTrendProvider();
  const analysisService = new LegacyRemoteAnalysisService();
  const remoteSearchService = new LegacyRemoteSearchService();
  const remoteCollectionMirror = new LegacyRemoteCollectionMirrorService();
  const readinessService = new LegacyReadinessService(remoteSearchService, analysisService);
  const remoteOrchestrator: ScanOrchestrator = new RemoteScanOrchestrator(
    analysisService,
    effectiveRuntimeConfig.flags.fastProcessing ? 300 : 800,
  );
  const scanOrchestrator: ScanOrchestrator = effectiveRuntimeConfig.flags.remoteBackend
    ? remoteOrchestrator
    : localOrchestrator;

  return {
    runtimeConfig: effectiveRuntimeConfig,
    collectionRepository,
    temporaryScanSessionStore,
    scanModeStore,
    preferencesStore,
    itemChatSessionStore,
    mockScanResultFactory,
    scanOrchestrator,
    chatResponseGenerator,
    mockCaptureService,
    imagePersistenceService,
    profileDataExporter,
    marketTrendProvider,
    analysisService,
    remoteSearchService,
    readinessService,
    remoteCollectionMirror,
    async bootstrap() {
      if (effectiveRuntimeConfig.flags.clearData) {
        await clearVaultReactStorage();
      }

      if (effectiveRuntimeConfig.flags.seedData) {
        const existingCollection = await readJSON(STORAGE_KEYS.collection, null as null | unknown[]);
        if (existingCollection === null) {
          await writeJSON(STORAGE_KEYS.collection, seededItems);
        }
      }

      await collectionRepository.fetchAll();
      await preferencesStore.load();
      await scanModeStore.load();
    }
  };
}
