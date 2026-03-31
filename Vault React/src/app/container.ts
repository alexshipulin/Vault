import type { AppContainer } from "@src/domain/contracts";
import { AsyncStorageCollectionRepository } from "@src/data/local/AsyncStorageCollectionRepository";
import { AsyncStorageItemChatSessionStore } from "@src/data/local/AsyncStorageItemChatSessionStore";
import { AsyncStoragePreferencesStore } from "@src/data/local/AsyncStoragePreferencesStore";
import { AsyncStorageScanModeStore } from "@src/data/local/AsyncStorageScanModeStore";
import { AsyncStorageTemporaryScanSessionStore } from "@src/data/local/AsyncStorageTemporaryScanSessionStore";
import { LocalCameraService } from "@src/data/local/LocalCameraService";
import { LocalImagePersistenceService } from "@src/data/local/LocalImagePersistenceService";
import { LocalMarketTrendProvider } from "@src/data/local/LocalMarketTrendProvider";
import { LocalProfileDataExporter } from "@src/data/local/LocalProfileDataExporter";
import { clearVaultReactStorage } from "@src/data/local/storage";
import {
  LegacyReadinessService,
  LegacyRemoteAnalysisService,
  LegacyRemoteCollectionMirrorService,
  LegacyRemoteSearchService
} from "@src/data/remote/LegacyRemoteServices";
import { LocalMockChatResponseGenerator } from "@src/features/chat/LocalMockChatResponseGenerator";
import { FakeScanProcessingPipeline } from "@src/features/scan/FakeScanProcessingPipeline";
import { LocalMockScanResultFactory } from "@src/features/scan/MockScanResultFactory";
import { currentRuntimeConfig, type RuntimeConfig } from "@src/app/runtime";

export type ExtendedAppContainer = AppContainer & {
  runtimeConfig: RuntimeConfig;
  remoteCollectionMirror: LegacyRemoteCollectionMirrorService;
  bootstrap(): Promise<void>;
};

export function createAppContainer(runtimeConfig = currentRuntimeConfig()): ExtendedAppContainer {
  const collectionRepository = new AsyncStorageCollectionRepository(runtimeConfig.flags.seedData);
  const temporaryScanSessionStore = new AsyncStorageTemporaryScanSessionStore();
  const scanModeStore = new AsyncStorageScanModeStore();
  const preferencesStore = new AsyncStoragePreferencesStore();
  const itemChatSessionStore = new AsyncStorageItemChatSessionStore();
  const mockScanResultFactory = new LocalMockScanResultFactory();
  const scanProcessingPipeline = new FakeScanProcessingPipeline(
    mockScanResultFactory,
    runtimeConfig.flags.fastProcessing ? 60 : 550,
    runtimeConfig.flags.fastProcessing ? 30 : 250
  );
  const chatResponseGenerator = new LocalMockChatResponseGenerator();
  const cameraService = new LocalCameraService(runtimeConfig.flags.forceMockCamera);
  const imagePersistenceService = new LocalImagePersistenceService();
  const profileDataExporter = new LocalProfileDataExporter();
  const marketTrendProvider = new LocalMarketTrendProvider();
  const analysisService = new LegacyRemoteAnalysisService();
  const remoteSearchService = new LegacyRemoteSearchService();
  const remoteCollectionMirror = new LegacyRemoteCollectionMirrorService();
  const readinessService = new LegacyReadinessService(remoteSearchService, analysisService);

  return {
    runtimeConfig,
    collectionRepository,
    temporaryScanSessionStore,
    scanModeStore,
    preferencesStore,
    itemChatSessionStore,
    mockScanResultFactory,
    scanProcessingPipeline,
    chatResponseGenerator,
    cameraService,
    imagePersistenceService,
    profileDataExporter,
    marketTrendProvider,
    analysisService,
    remoteSearchService,
    readinessService,
    remoteCollectionMirror,
    async bootstrap() {
      if (runtimeConfig.flags.clearData) {
        await clearVaultReactStorage();
      }

      await collectionRepository.fetchAll();
      await preferencesStore.load();
      await scanModeStore.load();
    }
  };
}
