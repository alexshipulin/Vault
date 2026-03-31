import Foundation
import Observation

// MARK: - AppCoordinator

@MainActor
@Observable
final class AppCoordinator {
    private let temporaryScanSessionStore: any TemporaryScanSessionStoring

    var preferredScanMode: VaultScanMode
    var selectedTab: AppTab = .home
    var homePath: [HomeRoute] = []
    var scanPath: [ScanRoute] = []
    var vaultPath: [VaultRoute] = []
    var profilePath: [ProfileRoute] = []

    var selectedItemID: UUID?
    var selectedItem: CollectibleListItem?
    var latestScanResult: ScanResult?
    var currentScanSession: TemporaryScanSession?
    var collectionRefreshID = 0

    init(
        preferredScanMode: VaultScanMode = .standard,
        temporaryScanSessionStore: any TemporaryScanSessionStoring = InMemoryTemporaryScanSessionStore()
    ) {
        self.preferredScanMode = preferredScanMode
        self.temporaryScanSessionStore = temporaryScanSessionStore

        Task { [weak self] in
            guard let self else {
                return
            }

            let restoredSession = await temporaryScanSessionStore.load()
            await MainActor.run {
                self.currentScanSession = restoredSession

                if restoredSession != nil {
                    self.selectedTab = .scan
                    self.scanPath = [.processing]
                }
            }
        }
    }

    func selectTab(_ tab: AppTab) {
        switch tab {
        case .scan:
            openScanTab()
        case .home, .vault, .profile:
            selectedTab = tab
        }
    }

    func setPreferredScanMode(_ mode: VaultScanMode) {
        preferredScanMode = mode
    }

    func openScanTab(resetToRoot: Bool = true) {
        selectedTab = .scan

        if resetToRoot {
            scanPath = []
        }
    }

    func startScanFlow(mode: VaultScanMode? = nil) {
        if let mode {
            preferredScanMode = mode
        }

        selectedItemID = nil
        selectedItem = nil
        latestScanResult = nil
        currentScanSession = nil
        Task {
            await temporaryScanSessionStore.clear()
        }
        openScanTab()
    }

    func showProcessing(with session: TemporaryScanSession) {
        currentScanSession = session
        Task {
            await temporaryScanSessionStore.save(session)
        }
        selectedTab = .scan
        scanPath = [.processing]
    }

    func showScanResult(_ result: ScanResult) {
        latestScanResult = result
        selectedItemID = result.id
        selectedItem = CollectibleListItem(scanResult: result)
        Task {
            await temporaryScanSessionStore.clear()
        }
        selectedTab = .scan
        scanPath = [.processing, .result]
    }

    func didSaveCollectionItem(_ item: CollectibleListItem) {
        selectedItemID = item.id
        selectedItem = item
        collectionRefreshID += 1
    }

    func retakeCurrentScan() {
        latestScanResult = nil
        selectedItemID = nil
        selectedItem = nil
        currentScanSession = nil
        Task {
            await temporaryScanSessionStore.clear()
        }
        selectedTab = .scan
        scanPath = []
    }

    func showItemDetails(for item: CollectibleListItem, from tab: AppTab) {
        selectedItemID = item.id
        selectedItem = item
        selectedTab = tab

        switch tab {
        case .home:
            homePath.append(.itemDetails)
        case .scan:
            scanPath.append(.itemDetails)
        case .vault:
            vaultPath.append(.itemDetails)
        case .profile:
            profilePath.append(.details)
        }
    }

    func showAIChat(from tab: AppTab) {
        selectedTab = tab

        switch tab {
        case .home:
            homePath.append(.aiChat)
        case .scan:
            scanPath.append(.aiChat)
        case .vault:
            vaultPath.append(.aiChat)
        case .profile:
            profilePath.append(.chat)
        }
    }

    func returnToHome() {
        selectedTab = .home
        selectedItemID = nil
        homePath = []
        scanPath = []
        currentScanSession = nil
        Task {
            await temporaryScanSessionStore.clear()
        }
    }
}
