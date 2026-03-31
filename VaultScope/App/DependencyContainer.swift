import Foundation
import Observation
import SwiftUI

// MARK: - DependencyContainer

@MainActor
final class DependencyContainer: ObservableObject {
    let appCoordinator: AppCoordinator
    let scanModePreferenceStore: any ScanModePreferenceStoring

    let apiClient: APIClientProtocol
    let keychainService: KeychainServiceProtocol

    let cameraService: CameraServiceProtocol
    let cameraPreviewSource: any CameraPreviewSourceProtocol
    let visionPreprocessor: VisionPreprocessorProtocol
    let aiService: AIServiceProtocol
    let aiChatService: AIChatServiceProtocol

    let collectionRepository: CollectionRepositoryProtocol
    let priceRepository: PriceRepositoryProtocol
    let mockScanResultFactory: any MockScanResultBuilding
    let scanProcessingPipeline: any ScanProcessingPipelineProtocol
    let itemMarketTrendProvider: any ItemMarketTrendProviding
    let itemChatSessionStore: any ItemChatSessionStoring
    let itemChatResponseGenerator: any ItemChatResponseGenerating
    let temporaryScanSessionStore: any TemporaryScanSessionStoring
    let userPreferencesStore: any VaultUserPreferencesStoring
    let profileDataExporter: any ProfileDataExporting

    let subscriptionService: any SubscriptionServiceProtocol
    let subscriptionManager: SubscriptionStore

    private(set) lazy var scanUseCase: ScanItemUseCase =
        ScanItemUseCase(aiService: aiService, priceRepository: priceRepository)

    private(set) lazy var portfolioUseCase: PortfolioUseCase =
        PortfolioUseCase(collectionRepository: collectionRepository)

    init(configuration: AppLaunchConfiguration = .current) {
        let environment = configuration.environment
        let resolvedScanModePreferenceStore: any ScanModePreferenceStoring

        let resolvedAPIClient: APIClientProtocol
        let resolvedKeychainService: KeychainServiceProtocol
        let resolvedCameraService: CameraServiceProtocol
        let resolvedCameraPreviewSource: any CameraPreviewSourceProtocol
        let resolvedVisionPreprocessor: VisionPreprocessorProtocol
        let resolvedAIService: AIServiceProtocol
        let resolvedAIChatService: AIChatServiceProtocol
        let resolvedCollectionRepository: CollectionRepositoryProtocol
        let resolvedPriceRepository: PriceRepositoryProtocol
        let resolvedMockScanResultFactory: any MockScanResultBuilding
        let resolvedScanProcessingPipeline: any ScanProcessingPipelineProtocol
        let resolvedItemMarketTrendProvider: any ItemMarketTrendProviding
        let resolvedItemChatSessionStore: any ItemChatSessionStoring
        let resolvedItemChatResponseGenerator: any ItemChatResponseGenerating
        let resolvedTemporaryScanSessionStore: any TemporaryScanSessionStoring
        let resolvedUserPreferencesStore: any VaultUserPreferencesStoring
        let resolvedSubscriptionService: any SubscriptionServiceProtocol

        switch environment {
        case .production:
            let scanModePreferenceStore = UserDefaultsScanModePreferenceStore()
            let userPreferencesStore = UserDefaultsVaultUserPreferencesStore()
            let keychainService = KeychainService()
            _ = Self.preloadAPIKeys(using: keychainService)

            let apiClient = URLSessionAPIClient(keychainService: keychainService)
            let cameraService = AVFoundationCameraService()
            let mockResultFactory = LocalMockScanResultFactory()

            resolvedScanModePreferenceStore = scanModePreferenceStore
            resolvedKeychainService = keychainService
            resolvedAPIClient = apiClient
            resolvedCameraService = cameraService
            resolvedCameraPreviewSource = cameraService
            resolvedVisionPreprocessor = LiveVisionPreprocessor()
            resolvedAIService = LiveAIService(apiClient: apiClient)
            resolvedAIChatService = LiveAIChatService(apiClient: apiClient)
            resolvedCollectionRepository = PersistentCollectionRepository()
            resolvedPriceRepository = LivePriceRepository(apiClient: apiClient)
            resolvedMockScanResultFactory = mockResultFactory
            resolvedScanProcessingPipeline = FakeScanProcessingPipeline(resultFactory: mockResultFactory)
            resolvedItemMarketTrendProvider = LocalMockItemMarketTrendProvider()
            resolvedItemChatSessionStore = FileBackedItemChatSessionStore()
            resolvedItemChatResponseGenerator = LocalMockItemChatResponseGenerator()
            resolvedTemporaryScanSessionStore = FileBackedTemporaryScanSessionStore()
            resolvedUserPreferencesStore = userPreferencesStore
            resolvedSubscriptionService = LiveSubscriptionService()

        case .mock:
            let scanModePreferenceStore = InMemoryScanModePreferenceStore()
            let userPreferencesStore = InMemoryVaultUserPreferencesStore()
            let keychainService = MockKeychainService(
                storage: [
                    .openAIKey: "mock-openai-key",
                    .supabaseAnonKey: "mock-supabase-key",
                    .pcgsToken: "mock-pcgs-token",
                    .discogsConsumerKey: "mock-discogs-key",
                    .eBayOAuthToken: "mock-ebay-token"
                ]
            )
            let apiClient = MockAPIClient()
            let seededCollection = MockCollectionRepository(
                items: MockDomainFactory.seededCollectibleItems()
            )
            let cameraService = MockCameraService()
            let mockResultFactory = LocalMockScanResultFactory()

            resolvedScanModePreferenceStore = scanModePreferenceStore
            resolvedKeychainService = keychainService
            resolvedAPIClient = apiClient
            resolvedCameraService = cameraService
            resolvedCameraPreviewSource = MockCameraPreviewSource()
            resolvedVisionPreprocessor = MockVisionPreprocessor()
            resolvedAIService = MockAIService(result: MockDomainFactory.scanResult())
            resolvedAIChatService = MockAIChatService()
            resolvedCollectionRepository = seededCollection
            resolvedPriceRepository = MockPriceRepository()
            resolvedMockScanResultFactory = mockResultFactory
            resolvedScanProcessingPipeline = FakeScanProcessingPipeline(resultFactory: mockResultFactory)
            resolvedItemMarketTrendProvider = LocalMockItemMarketTrendProvider()
            resolvedItemChatSessionStore = InMemoryItemChatSessionStore()
            resolvedItemChatResponseGenerator = LocalMockItemChatResponseGenerator()
            resolvedTemporaryScanSessionStore = InMemoryTemporaryScanSessionStore()
            resolvedUserPreferencesStore = userPreferencesStore
            resolvedSubscriptionService = MockSubscriptionService()

        case .uiTesting:
            let scanModePreferenceStore = UserDefaultsScanModePreferenceStore()
            let userPreferencesStore = UserDefaultsVaultUserPreferencesStore()
            let keychainService = MockKeychainService(
                storage: [
                    .openAIKey: "ui-test-openai-key",
                    .supabaseAnonKey: "ui-test-supabase-key",
                    .pcgsToken: "ui-test-pcgs-token",
                    .discogsConsumerKey: "ui-test-discogs-key",
                    .eBayOAuthToken: "ui-test-ebay-token"
                ]
            )
            let apiClient = MockAPIClient()
            let cameraService = MockCameraService()
            let mockResultFactory = LocalMockScanResultFactory()
            let storageDirectory = configuration.storageDirectory
            let seedItems = configuration.seedLocalData ? MockDomainFactory.seededCollectibleItems() : []

            resolvedScanModePreferenceStore = scanModePreferenceStore
            resolvedKeychainService = keychainService
            resolvedAPIClient = apiClient
            resolvedCameraService = cameraService
            resolvedCameraPreviewSource = MockCameraPreviewSource()
            resolvedVisionPreprocessor = MockVisionPreprocessor()
            resolvedAIService = MockAIService(result: MockDomainFactory.scanResult())
            resolvedAIChatService = MockAIChatService()
            resolvedCollectionRepository = PersistentCollectionRepository(
                storageURL: VaultLocalStorage.collectionURL(baseDirectory: storageDirectory),
                seedItems: seedItems
            )
            resolvedPriceRepository = MockPriceRepository()
            resolvedMockScanResultFactory = mockResultFactory
            resolvedScanProcessingPipeline = FakeScanProcessingPipeline(
                resultFactory: mockResultFactory,
                stageDelayNanoseconds: configuration.fastProcessing ? 20_000_000 : 550_000_000,
                interStageDelayNanoseconds: configuration.fastProcessing ? 10_000_000 : 250_000_000
            )
            resolvedItemMarketTrendProvider = LocalMockItemMarketTrendProvider()
            resolvedItemChatSessionStore = FileBackedItemChatSessionStore(
                storageURL: VaultLocalStorage.chatSessionsURL(baseDirectory: storageDirectory)
            )
            resolvedItemChatResponseGenerator = LocalMockItemChatResponseGenerator()
            resolvedTemporaryScanSessionStore = FileBackedTemporaryScanSessionStore(
                storageURL: VaultLocalStorage.temporaryScanSessionURL(baseDirectory: storageDirectory)
            )
            resolvedUserPreferencesStore = userPreferencesStore
            resolvedSubscriptionService = MockSubscriptionService()
        }

        scanModePreferenceStore = resolvedScanModePreferenceStore
        temporaryScanSessionStore = resolvedTemporaryScanSessionStore
        appCoordinator = AppCoordinator(
            preferredScanMode: resolvedScanModePreferenceStore.loadMode(),
            temporaryScanSessionStore: resolvedTemporaryScanSessionStore
        )
        apiClient = resolvedAPIClient
        keychainService = resolvedKeychainService
        cameraService = resolvedCameraService
        cameraPreviewSource = resolvedCameraPreviewSource
        visionPreprocessor = resolvedVisionPreprocessor
        aiService = resolvedAIService
        aiChatService = resolvedAIChatService
        collectionRepository = resolvedCollectionRepository
        priceRepository = resolvedPriceRepository
        mockScanResultFactory = resolvedMockScanResultFactory
        scanProcessingPipeline = resolvedScanProcessingPipeline
        itemMarketTrendProvider = resolvedItemMarketTrendProvider
        itemChatSessionStore = resolvedItemChatSessionStore
        itemChatResponseGenerator = resolvedItemChatResponseGenerator
        userPreferencesStore = resolvedUserPreferencesStore
        profileDataExporter = LocalProfileDataExporter(collectionRepository: resolvedCollectionRepository)
        subscriptionService = resolvedSubscriptionService
        subscriptionManager = SubscriptionStore(service: resolvedSubscriptionService)
    }

    func makeHomeViewModel() -> HomeViewModel {
        HomeViewModel(
            collectionRepository: collectionRepository,
            scanModePreferenceStore: scanModePreferenceStore
        )
    }

    func makeScanRootViewModel() -> ScanRootViewModel {
        ScanRootViewModel()
    }

    func makeCameraScanViewModel(scanMode: VaultScanMode) -> CameraScanViewModel {
        CameraScanViewModel(
            cameraService: cameraService,
            cameraPreviewSource: cameraPreviewSource,
            scanModePreferenceStore: scanModePreferenceStore,
            scanMode: scanMode
        )
    }

    func makeProcessingViewModel(session: TemporaryScanSession?) -> ProcessingViewModel {
        ProcessingViewModel(
            session: session,
            processingPipeline: scanProcessingPipeline
        )
    }

    func makeScanResultViewModel(
        result: ScanResult?,
        session: TemporaryScanSession?
    ) -> ScanResultViewModel {
        ScanResultViewModel(
            result: result ?? MockDomainFactory.scanResult(priceData: MockDomainFactory.priceData()),
            session: session,
            collectionRepository: collectionRepository
        )
    }

    func makeVaultHistoryViewModel() -> VaultHistoryViewModel {
        VaultHistoryViewModel(collectionRepository: collectionRepository)
    }

    func makeItemDetailsViewModel(
        itemID: UUID?,
        fallbackItem: CollectibleListItem?
    ) -> ItemDetailsViewModel {
        ItemDetailsViewModel(
            itemID: itemID,
            fallbackItem: fallbackItem,
            collectionRepository: collectionRepository,
            marketTrendProvider: itemMarketTrendProvider
        )
    }

    func makeAIChatViewModel(
        itemID: UUID?,
        fallbackItem: CollectibleListItem?
    ) -> AIChatViewModel {
        AIChatViewModel(
            itemID: itemID,
            fallbackItem: fallbackItem,
            collectionRepository: collectionRepository,
            sessionStore: itemChatSessionStore,
            responseGenerator: itemChatResponseGenerator
        )
    }

    func makeProfileSettingsViewModel() -> ProfileSettingsViewModel {
        ProfileSettingsViewModel(
            subscriptionService: subscriptionService,
            collectionRepository: collectionRepository,
            userPreferencesStore: userPreferencesStore,
            profileDataExporter: profileDataExporter
        )
    }
}

// MARK: - AppEnvironment

enum AppEnvironment {
    case production
    case mock
    case uiTesting
}

// MARK: - Helpers

private extension DependencyContainer {
    static func preloadAPIKeys(using keychainService: KeychainServiceProtocol) -> [KeychainKey: String] {
        var values: [KeychainKey: String] = [:]

        for key in KeychainKey.allCases {
            if let value = try? keychainService.load(for: key) {
                values[key] = value
            }
        }

        return values
    }
}
