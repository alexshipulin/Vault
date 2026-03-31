import Foundation

// MARK: - MockCollectionRepository

/// In-memory collection repository for previews and unit tests.
final class MockCollectionRepository: CollectionRepositoryProtocol {
    var items: [CollectibleItem]
    var fetchError: Error?
    var saveError: Error?
    var updateError: Error?
    var deleteError: Error?
    var historyOverride: [(Date, Decimal)]?

    init(
        items: [CollectibleItem] = [],
        fetchError: Error? = nil,
        saveError: Error? = nil,
        updateError: Error? = nil,
        deleteError: Error? = nil,
        historyOverride: [(Date, Decimal)]? = nil
    ) {
        self.items = items
        self.fetchError = fetchError
        self.saveError = saveError
        self.updateError = updateError
        self.deleteError = deleteError
        self.historyOverride = historyOverride
    }

    func fetchAll() async throws -> [CollectibleItem] {
        if let fetchError {
            throw fetchError
        }

        return items
    }

    func save(_ item: CollectibleItem) async throws {
        if let saveError {
            throw saveError
        }

        if let index = items.firstIndex(where: { $0.id == item.id }) {
            items[index] = item
        } else {
            items.append(item)
        }
    }

    func update(_ item: CollectibleItem) async throws {
        if let updateError {
            throw updateError
        }

        guard let index = items.firstIndex(where: { $0.id == item.id }) else {
            items.append(item)
            return
        }

        items[index] = item
    }

    func delete(_ item: CollectibleItem) async throws {
        if let deleteError {
            throw deleteError
        }

        items.removeAll { $0.id == item.id }
    }

    func search(query: String, category: CollectibleCategory?) async throws -> [CollectibleItem] {
        if let fetchError {
            throw fetchError
        }

        let normalizedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()

        return items.filter { item in
            let matchesCategory = category.map { item.categoryEnum == $0 } ?? true
            let matchesQuery: Bool

            if normalizedQuery.isEmpty {
                matchesQuery = true
            } else {
                matchesQuery =
                    item.name.lowercased().contains(normalizedQuery) ||
                    item.notes.lowercased().contains(normalizedQuery) ||
                    (item.origin?.lowercased().contains(normalizedQuery) ?? false)
            }

            return matchesCategory && matchesQuery
        }
    }

    func totalValue() async -> Decimal {
        items.reduce(.zero) { partialResult, item in
            partialResult + value(of: item)
        }
    }

    func valueHistory(days: Int) async -> [(Date, Decimal)] {
        if let historyOverride {
            return historyOverride
        }

        let now = Date()
        let cutoff = Calendar.current.date(byAdding: .day, value: -max(days, 0), to: now) ?? .distantPast
        let sortedItems = items
            .filter { $0.addedAt >= cutoff }
            .sorted { $0.addedAt < $1.addedAt }

        var runningTotal = Decimal.zero

        return sortedItems.map { item in
            runningTotal += value(of: item)
            return (item.addedAt, runningTotal)
        }
    }

    private func value(of item: CollectibleItem) -> Decimal {
        let amount = item.priceMid ?? item.priceHigh ?? item.priceLow
        guard let amount else {
            return .zero
        }

        return Decimal(string: String(amount)) ?? Decimal(amount)
    }
}
