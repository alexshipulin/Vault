import Foundation

// MARK: - PortfolioUseCase

/// Aggregates saved collectibles into portfolio-level presentation data.
final class PortfolioUseCase {
    private let collectionRepository: CollectionRepositoryProtocol

    init(collectionRepository: CollectionRepositoryProtocol) {
        self.collectionRepository = collectionRepository
    }

    func totalPortfolioValue() async -> Decimal {
        await collectionRepository.totalValue()
    }

    func topItems(limit: Int) async throws -> [CollectibleItem] {
        let safeLimit = max(limit, 0)
        let items = try await collectionRepository.fetchAll()

        return Array(
            items
                .sorted { portfolioValue(for: $0) > portfolioValue(for: $1) }
                .prefix(safeLimit)
        )
    }

    func categoryBreakdown() async throws -> [CollectibleCategory: Decimal] {
        let items = try await collectionRepository.fetchAll()
        var breakdown: [CollectibleCategory: Decimal] = [:]

        for item in items {
            guard let category = item.categoryEnum else {
                continue
            }

            breakdown[category, default: .zero] += portfolioValue(for: item)
        }

        return breakdown
    }

    func valueHistory(period: PortfolioPeriod) async -> [(Date, Decimal)] {
        await collectionRepository.valueHistory(days: period.days)
    }

    private func portfolioValue(for item: CollectibleItem) -> Decimal {
        decimal(from: item.priceMid ?? item.priceHigh ?? item.priceLow)
    }

    private func decimal(from value: Double?) -> Decimal {
        guard let value else {
            return .zero
        }

        return Decimal(string: String(value)) ?? Decimal(value)
    }
}

// MARK: - PortfolioPeriod

/// Time periods used when requesting portfolio history.
enum PortfolioPeriod: Sendable {
    case days30
    case days90
    case days365

    var days: Int {
        switch self {
        case .days30:
            30
        case .days90:
            90
        case .days365:
            365
        }
    }
}
