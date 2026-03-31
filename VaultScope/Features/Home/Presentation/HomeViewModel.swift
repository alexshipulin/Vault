import Foundation
import Observation

// MARK: - HomeViewModel

@MainActor
@Observable
final class HomeViewModel {
    private let collectionRepository: CollectionRepositoryProtocol
    private let scanModePreferenceStore: any ScanModePreferenceStoring

    private(set) var estimatedTotalText = CurrencyFormatter.string(from: .zero)
    private(set) var recentItems: [CollectibleListItem] = []
    private(set) var selectedScanMode: VaultScanMode
    private(set) var isLoading = false

    init(
        collectionRepository: CollectionRepositoryProtocol,
        scanModePreferenceStore: any ScanModePreferenceStoring
    ) {
        self.collectionRepository = collectionRepository
        self.scanModePreferenceStore = scanModePreferenceStore
        self.selectedScanMode = scanModePreferenceStore.loadMode()
    }

    var hasRecentItems: Bool {
        recentItems.isEmpty == false
    }

    var displayedRecentItems: [CollectibleListItem] {
        Array(recentItems.prefix(3))
    }

    func updateSelectedScanMode(_ mode: VaultScanMode) {
        guard selectedScanMode != mode else {
            return
        }

        selectedScanMode = mode
        scanModePreferenceStore.saveMode(mode)
    }

    func loadIfNeeded() async {
        guard recentItems.isEmpty, isLoading == false else {
            return
        }

        await refresh()
    }

    func refresh() async {
        guard isLoading == false else {
            return
        }

        isLoading = true
        defer { isLoading = false }

        do {
            let items = try await collectionRepository.fetchAll()
            let total = await collectionRepository.totalValue()
            estimatedTotalText = CurrencyFormatter.string(from: total)

            recentItems = items
                .sorted { $0.updatedAt > $1.updatedAt }
                .map(CollectibleListItem.init(item:))
        } catch {
            estimatedTotalText = CurrencyFormatter.string(from: .zero)
            recentItems = []
        }
    }
}
