import Foundation

// MARK: - ItemMarketTrend

struct ItemMarketTrend: Sendable, Equatable {
    let percentage: Int
    let comparisonMonths: Int
}

// MARK: - ItemMarketTrendProviding

protocol ItemMarketTrendProviding {
    func trend(for item: CollectibleItem) -> ItemMarketTrend?
}

// MARK: - LocalMockItemMarketTrendProvider

final class LocalMockItemMarketTrendProvider: ItemMarketTrendProviding {
    private let seededTrends: [ItemMarketTrend?]

    init(
        seededTrends: [ItemMarketTrend?] = [
            ItemMarketTrend(percentage: 12, comparisonMonths: 6),
            ItemMarketTrend(percentage: -4, comparisonMonths: 6),
            ItemMarketTrend(percentage: 9, comparisonMonths: 12),
            ItemMarketTrend(percentage: 0, comparisonMonths: 12),
            nil
        ]
    ) {
        self.seededTrends = seededTrends
    }

    func trend(for item: CollectibleItem) -> ItemMarketTrend? {
        guard seededTrends.isEmpty == false else {
            return nil
        }

        let checksum = item.id.uuidString.unicodeScalars.reduce(into: 0) { partialResult, scalar in
            partialResult += Int(scalar.value)
        }

        return seededTrends[checksum % seededTrends.count]
    }
}
