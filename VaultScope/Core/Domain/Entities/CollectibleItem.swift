import Foundation
import SwiftData

// MARK: - CollectibleItem

/// SwiftData-backed collectible stored in the user's portfolio.
@Model
final class CollectibleItem {
    @Attribute(.unique) var id: UUID
    var name: String
    var category: String
    var conditionRaw: Int
    var year: Int?
    var origin: String?
    var notes: String
    var photoURLs: [URL]
    var priceLow: Double?
    var priceMid: Double?
    var priceHigh: Double?
    var priceSource: String?
    var priceFetchedAt: Date?
    var historySummary: String
    var addedAt: Date
    var updatedAt: Date
    var isSyncedToCloud: Bool

    var categoryEnum: CollectibleCategory? {
        CollectibleCategory(rawValue: category)
    }

    var conditionGrade: ConditionGrade? {
        ConditionGrade(rawValue: conditionRaw)
    }

    init(
        id: UUID = UUID(),
        name: String,
        category: String,
        conditionRaw: Int,
        year: Int? = nil,
        origin: String? = nil,
        notes: String = "",
        photoURLs: [URL] = [],
        priceLow: Double? = nil,
        priceMid: Double? = nil,
        priceHigh: Double? = nil,
        priceSource: String? = nil,
        priceFetchedAt: Date? = nil,
        historySummary: String = "",
        addedAt: Date = Date(),
        updatedAt: Date = Date(),
        isSyncedToCloud: Bool = false
    ) {
        self.id = id
        self.name = name
        self.category = category
        self.conditionRaw = conditionRaw
        self.year = year
        self.origin = origin
        self.notes = notes
        self.photoURLs = photoURLs
        self.priceLow = priceLow
        self.priceMid = priceMid
        self.priceHigh = priceHigh
        self.priceSource = priceSource
        self.priceFetchedAt = priceFetchedAt
        self.historySummary = historySummary
        self.addedAt = addedAt
        self.updatedAt = updatedAt
        self.isSyncedToCloud = isSyncedToCloud
    }

    convenience init(from scanResult: ScanResult) {
        let priceLow = scanResult.priceData.map { NSDecimalNumber(decimal: $0.low).doubleValue }
        let priceMid = scanResult.priceData.map { NSDecimalNumber(decimal: $0.mid).doubleValue }
        let priceHigh = scanResult.priceData.map { NSDecimalNumber(decimal: $0.high).doubleValue }
        let timestamp = scanResult.scannedAt

        self.init(
            id: scanResult.id,
            name: scanResult.name,
            category: scanResult.category.rawValue,
            conditionRaw: scanResult.condition.rawValue,
            year: scanResult.year,
            origin: scanResult.origin,
            notes: "",
            photoURLs: [],
            priceLow: priceLow,
            priceMid: priceMid,
            priceHigh: priceHigh,
            priceSource: scanResult.priceData?.source.rawValue,
            priceFetchedAt: scanResult.priceData?.fetchedAt,
            historySummary: scanResult.historySummary,
            addedAt: timestamp,
            updatedAt: timestamp,
            isSyncedToCloud: false
        )
    }
}
