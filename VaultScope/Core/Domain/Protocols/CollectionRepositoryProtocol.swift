import Foundation

// MARK: - CollectionRepositoryProtocol

/// Repository boundary for CRUD and portfolio aggregation over saved collectibles.
protocol CollectionRepositoryProtocol: AnyObject {
    func fetchAll() async throws -> [CollectibleItem]
    func save(_ item: CollectibleItem) async throws
    func update(_ item: CollectibleItem) async throws
    func delete(_ item: CollectibleItem) async throws
    func search(query: String, category: CollectibleCategory?) async throws -> [CollectibleItem]
    func totalValue() async -> Decimal
    func valueHistory(days: Int) async -> [(Date, Decimal)]
}
