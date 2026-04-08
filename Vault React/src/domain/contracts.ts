import type { ScanProgressState } from "@/lib/scan/types";
import type {
  AppReadinessReport,
  ChatMessage,
  CollectibleItem,
  CollectibleListItem,
  ItemChatContext,
  ProcessingUpdate,
  ScanImage,
  ScanMode,
  ScanResult,
  TemporaryScanSession,
  VaultUserPreferences
} from "@src/domain/models";
import type { ScanOrchestrator } from "@src/domain/services";

export interface CollectionRepository {
  fetchAll(): Promise<CollectibleItem[]>;
  save(item: CollectibleItem): Promise<void>;
  update(item: CollectibleItem): Promise<void>;
  delete(itemID: string): Promise<void>;
  search(query: string): Promise<CollectibleItem[]>;
  totalValue(): Promise<number>;
}

export interface TemporaryScanSessionStore {
  load(): Promise<TemporaryScanSession | null>;
  save(session: TemporaryScanSession): Promise<void>;
  clear(): Promise<void>;
}

export interface ScanModeStore {
  load(): Promise<ScanMode>;
  save(mode: ScanMode): Promise<void>;
}

export interface PreferencesStore {
  load(): Promise<VaultUserPreferences>;
  save(preferences: VaultUserPreferences): Promise<void>;
}

export interface ItemChatSessionStore {
  load(itemID: string): Promise<ChatMessage[]>;
  save(itemID: string, messages: ChatMessage[]): Promise<void>;
}

export interface MockScanResultFactory {
  buildResult(session: TemporaryScanSession): ScanResult;
}

export interface ScanProcessingPipeline {
  process(session: TemporaryScanSession): AsyncGenerator<ProcessingUpdate, void, void>;
}

export interface ChatResponseGenerator {
  introduction(context: ItemChatContext): string;
  suggestedPrompts(context: ItemChatContext): string[];
  response(message: string, context: ItemChatContext, history: ChatMessage[]): Promise<string>;
}

export interface MockCaptureService {
  capture(mode: ScanMode): Promise<ScanImage>;
}

export interface ImagePersistenceService {
  persistImages(images: ScanImage[]): Promise<string[]>;
}

export interface ProfileDataExporter {
  exportJSON(input: {
    userName: string;
    planLabel: string;
    preferences: VaultUserPreferences;
    items: CollectibleItem[];
  }): Promise<string | null>;
}

export interface MarketTrendProvider {
  trendFor(item: CollectibleItem): { percentage: number; comparisonMonths: number } | null;
}

export interface AnalysisService {
  isConfigured(): Promise<boolean>;
  runAnalysis(
    session: TemporaryScanSession,
    onProgress?: (progress: ScanProgressState) => void,
  ): Promise<ScanResult>;
}

export interface RemoteSearchService {
  isConfigured(): Promise<boolean>;
  isDataReady(): Promise<boolean>;
}

export interface AppReadinessService {
  check(): Promise<AppReadinessReport>;
}

export interface AppContainer {
  collectionRepository: CollectionRepository;
  temporaryScanSessionStore: TemporaryScanSessionStore;
  scanModeStore: ScanModeStore;
  preferencesStore: PreferencesStore;
  itemChatSessionStore: ItemChatSessionStore;
  mockScanResultFactory: MockScanResultFactory;
  scanOrchestrator: ScanOrchestrator;
  chatResponseGenerator: ChatResponseGenerator;
  mockCaptureService: MockCaptureService;
  imagePersistenceService: ImagePersistenceService;
  profileDataExporter: ProfileDataExporter;
  marketTrendProvider: MarketTrendProvider;
  analysisService: AnalysisService;
  remoteSearchService: RemoteSearchService;
  readinessService: AppReadinessService;
}

export interface AppRouteState {
  latestResult?: ScanResult;
  selectedItem?: CollectibleListItem;
  selectedItemID?: string;
}
