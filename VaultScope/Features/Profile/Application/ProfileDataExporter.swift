import Foundation

// MARK: - ProfileDataExporting

protocol ProfileDataExporting {
    func exportJSON(
        userName: String,
        planLabel: String,
        preferences: VaultUserPreferences
    ) async throws -> String
}

// MARK: - LocalProfileDataExporter

final class LocalProfileDataExporter: ProfileDataExporting {
    private let collectionRepository: CollectionRepositoryProtocol

    init(collectionRepository: CollectionRepositoryProtocol) {
        self.collectionRepository = collectionRepository
    }

    func exportJSON(
        userName: String,
        planLabel: String,
        preferences: VaultUserPreferences
    ) async throws -> String {
        let items = try await collectionRepository.fetchAll()

        let payload = ProfileExportPayload(
            userName: userName,
            planLabel: planLabel,
            exportedAt: Date(),
            preferences: ProfileExportPreferences(
                categories: preferences.categoriesOfInterest.map(\.rawValue),
                currency: preferences.preferredCurrency.code,
                notificationsEnabled: preferences.notificationsEnabled
            ),
            items: items.map(ProfileExportItem.init(item:))
        )

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601

        let data = try encoder.encode(payload)
        return String(decoding: data, as: UTF8.self)
    }
}

// MARK: - Export Payload

private struct ProfileExportPayload: Codable {
    let userName: String
    let planLabel: String
    let exportedAt: Date
    let preferences: ProfileExportPreferences
    let items: [ProfileExportItem]
}

private struct ProfileExportPreferences: Codable {
    let categories: [String]
    let currency: String
    let notificationsEnabled: Bool
}

private struct ProfileExportItem: Codable {
    let id: UUID
    let name: String
    let category: String
    let conditionRaw: Int
    let year: Int?
    let origin: String?
    let notes: String
    let priceLow: Double?
    let priceMid: Double?
    let priceHigh: Double?
    let priceSource: String?
    let priceFetchedAt: Date?
    let historySummary: String
    let addedAt: Date
    let updatedAt: Date

    init(item: CollectibleItem) {
        self.id = item.id
        self.name = item.name
        self.category = item.category
        self.conditionRaw = item.conditionRaw
        self.year = item.year
        self.origin = item.origin
        self.notes = item.notes
        self.priceLow = item.priceLow
        self.priceMid = item.priceMid
        self.priceHigh = item.priceHigh
        self.priceSource = item.priceSource
        self.priceFetchedAt = item.priceFetchedAt
        self.historySummary = item.historySummary
        self.addedAt = item.addedAt
        self.updatedAt = item.updatedAt
    }
}
