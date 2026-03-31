import Foundation
import Observation

// MARK: - VaultHistoryViewModel

@MainActor
@Observable
final class VaultHistoryViewModel {
    private let collectionRepository: CollectionRepositoryProtocol
    private var storedItems: [CollectibleItem] = []

    var searchText = "" {
        didSet {
            applyFilter()
        }
    }

    private(set) var items: [CollectibleListItem] = []
    private(set) var isLoading = false
    private(set) var itemCountText = "0"
    private(set) var totalValueText = CurrencyFormatter.string(from: .zero)

    init(collectionRepository: CollectionRepositoryProtocol) {
        self.collectionRepository = collectionRepository
    }

    var hasSavedItems: Bool {
        storedItems.isEmpty == false
    }

    var hasVisibleItems: Bool {
        items.isEmpty == false
    }

    var visibleItemCountText: String {
        String(items.count)
    }

    var isSearching: Bool {
        searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
    }

    func loadIfNeeded() async {
        guard storedItems.isEmpty, isLoading == false else {
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
            storedItems = try await collectionRepository.fetchAll()
                .sorted { $0.updatedAt > $1.updatedAt }
            updateSummary()
            applyFilter()
        } catch {
            storedItems = []
            items = []
            itemCountText = "0"
            totalValueText = CurrencyFormatter.string(from: .zero)
        }
    }

    func clearSearch() {
        searchText = ""
    }
}

// MARK: - Helpers

private extension VaultHistoryViewModel {
    func applyFilter() {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()

        let filteredItems: [CollectibleItem]
        if query.isEmpty {
            filteredItems = storedItems
        } else {
            filteredItems = storedItems.filter { item in
                let categoryMatch = item.categoryEnum?.displayName.lowercased().contains(query) ?? item.category.lowercased().contains(query)
                let nameMatch = item.name.lowercased().contains(query)
                let originMatch = item.origin?.lowercased().contains(query) ?? false
                let historyMatch = item.historySummary.lowercased().contains(query)

                return nameMatch || originMatch || categoryMatch || historyMatch
            }
        }

        items = filteredItems.map(CollectibleListItem.init(item:))
    }

    func updateSummary() {
        itemCountText = String(storedItems.count)
        totalValueText = CurrencyFormatter.string(
            from: storedItems.reduce(.zero) { partialResult, item in
                partialResult + estimatedValue(of: item)
            }
        )
    }

    func estimatedValue(of item: CollectibleItem) -> Decimal {
        let amount = item.priceMid ?? item.priceHigh ?? item.priceLow
        guard let amount else {
            return .zero
        }

        return Decimal(string: String(amount)) ?? Decimal(amount)
    }
}
