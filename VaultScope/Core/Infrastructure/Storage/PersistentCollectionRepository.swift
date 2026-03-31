import Foundation

// MARK: - PersistentCollectionRepository

final class PersistentCollectionRepository: CollectionRepositoryProtocol {
    private let storageURL: URL
    private let seedRecords: [StoredCollectibleRecord]
    private let fileManager: FileManager
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder
    private let lock = NSLock()

    private var records: [StoredCollectibleRecord]?

    init(
        storageURL: URL = VaultLocalStorage.collectionURL(),
        seedItems: [CollectibleItem] = [],
        fileManager: FileManager = .default
    ) {
        self.storageURL = storageURL
        self.seedRecords = seedItems.map(StoredCollectibleRecord.init(item:))
        self.fileManager = fileManager

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        self.encoder = encoder

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        self.decoder = decoder
    }

    func fetchAll() async throws -> [CollectibleItem] {
        try withRecords { records in
            records.map(\.item)
        }
    }

    func save(_ item: CollectibleItem) async throws {
        try withMutableRecords { records in
            let record = StoredCollectibleRecord(item: item)

            if let index = records.firstIndex(where: { $0.id == record.id }) {
                records[index] = record
            } else {
                records.append(record)
            }
        }
    }

    func update(_ item: CollectibleItem) async throws {
        try await save(item)
    }

    func delete(_ item: CollectibleItem) async throws {
        try withMutableRecords { records in
            records.removeAll { $0.id == item.id }
        }
    }

    func search(query: String, category: CollectibleCategory?) async throws -> [CollectibleItem] {
        let normalizedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()

        return try withRecords { records in
            records.filter { record in
                let matchesCategory = category.map { record.category == $0.rawValue } ?? true

                if normalizedQuery.isEmpty {
                    return matchesCategory
                }

                let matchesQuery =
                    record.name.lowercased().contains(normalizedQuery) ||
                    record.notes.lowercased().contains(normalizedQuery) ||
                    (record.origin?.lowercased().contains(normalizedQuery) ?? false) ||
                    record.historySummary.lowercased().contains(normalizedQuery)

                return matchesCategory && matchesQuery
            }
            .map(\.item)
        }
    }

    func totalValue() async -> Decimal {
        (try? withRecords { records in
            records.reduce(.zero) { partialResult, record in
                partialResult + decimalValue(from: record.priceMid ?? record.priceHigh ?? record.priceLow)
            }
        }) ?? .zero
    }

    func valueHistory(days: Int) async -> [(Date, Decimal)] {
        (try? withRecords { records in
            let cutoff = Calendar.current.date(byAdding: .day, value: -days, to: Date()) ?? .distantPast
            let sortedRecords = records
                .filter { $0.addedAt >= cutoff }
                .sorted { $0.addedAt < $1.addedAt }

            var runningTotal = Decimal.zero

            return sortedRecords.map { record in
                runningTotal += decimalValue(from: record.priceMid ?? record.priceHigh ?? record.priceLow)
                return (record.addedAt, runningTotal)
            }
        }) ?? []
    }
}

// MARK: - Record Access

private extension PersistentCollectionRepository {
    func withRecords<T>(_ operation: ([StoredCollectibleRecord]) throws -> T) throws -> T {
        lock.lock()
        defer { lock.unlock() }

        try loadIfNeededLocked()
        return try operation(records ?? [])
    }

    func withMutableRecords(_ operation: (inout [StoredCollectibleRecord]) throws -> Void) throws {
        lock.lock()
        defer { lock.unlock() }

        try loadIfNeededLocked()
        var mutableRecords = records ?? []
        try operation(&mutableRecords)
        records = mutableRecords
        try persistLocked()
    }

    func loadIfNeededLocked() throws {
        guard records == nil else {
            return
        }

        guard fileManager.fileExists(atPath: storageURL.path) else {
            records = seedRecords

            if seedRecords.isEmpty == false {
                try persistLocked()
            }
            return
        }

        let data = try Data(contentsOf: storageURL)
        records = try decoder.decode([StoredCollectibleRecord].self, from: data)
    }

    func persistLocked() throws {
        let data = try encoder.encode(records ?? [])
        try data.write(to: storageURL, options: [.atomic])
    }

    func decimalValue(from amount: Double?) -> Decimal {
        guard let amount else {
            return .zero
        }

        return Decimal(string: String(amount)) ?? Decimal(amount)
    }
}

// MARK: - StoredCollectibleRecord

private struct StoredCollectibleRecord: Codable {
    let id: UUID
    let name: String
    let category: String
    let conditionRaw: Int
    let year: Int?
    let origin: String?
    let notes: String
    let photoURLs: [URL]
    let priceLow: Double?
    let priceMid: Double?
    let priceHigh: Double?
    let priceSource: String?
    let priceFetchedAt: Date?
    let historySummary: String
    let addedAt: Date
    let updatedAt: Date
    let isSyncedToCloud: Bool

    init(item: CollectibleItem) {
        self.id = item.id
        self.name = item.name
        self.category = item.category
        self.conditionRaw = item.conditionRaw
        self.year = item.year
        self.origin = item.origin
        self.notes = item.notes
        self.photoURLs = item.photoURLs
        self.priceLow = item.priceLow
        self.priceMid = item.priceMid
        self.priceHigh = item.priceHigh
        self.priceSource = item.priceSource
        self.priceFetchedAt = item.priceFetchedAt
        self.historySummary = item.historySummary
        self.addedAt = item.addedAt
        self.updatedAt = item.updatedAt
        self.isSyncedToCloud = item.isSyncedToCloud
    }

    var item: CollectibleItem {
        CollectibleItem(
            id: id,
            name: name,
            category: category,
            conditionRaw: conditionRaw,
            year: year,
            origin: origin,
            notes: notes,
            photoURLs: photoURLs,
            priceLow: priceLow,
            priceMid: priceMid,
            priceHigh: priceHigh,
            priceSource: priceSource,
            priceFetchedAt: priceFetchedAt,
            historySummary: historySummary,
            addedAt: addedAt,
            updatedAt: updatedAt,
            isSyncedToCloud: isSyncedToCloud
        )
    }
}
