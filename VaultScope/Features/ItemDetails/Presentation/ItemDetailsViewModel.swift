import Foundation
import Observation

// MARK: - ItemDetailsMetadata

struct ItemDetailsMetadata: Identifiable, Hashable {
    let id: String
    let labelKey: String
    let value: String
}

// MARK: - ItemDetailsPresentation

struct ItemDetailsPresentation: Equatable {
    let itemID: UUID
    let listItem: CollectibleListItem
    let heroMonogram: String
    let heroCaption: String
    let scannedDateText: String
    let titleText: String
    let secondaryText: String
    let metadataRows: [ItemDetailsMetadata]
    let valueRangeText: String
    let valueCaptionText: String
    let marketDeltaText: String?
    let descriptionText: String
    let shareText: String
}

// MARK: - ItemDetailsViewModel

@MainActor
@Observable
final class ItemDetailsViewModel {
    private let itemID: UUID?
    private let fallbackItem: CollectibleListItem?
    private let collectionRepository: CollectionRepositoryProtocol
    private let marketTrendProvider: any ItemMarketTrendProviding

    private(set) var presentation: ItemDetailsPresentation?
    private(set) var isLoading = false
    private(set) var hasAttemptedLoad = false

    init(
        itemID: UUID?,
        fallbackItem: CollectibleListItem?,
        collectionRepository: CollectionRepositoryProtocol,
        marketTrendProvider: any ItemMarketTrendProviding
    ) {
        self.itemID = itemID
        self.fallbackItem = fallbackItem
        self.collectionRepository = collectionRepository
        self.marketTrendProvider = marketTrendProvider
    }

    var hasLoadedItem: Bool {
        presentation != nil
    }

    var displayItem: CollectibleListItem {
        presentation?.listItem ?? fallbackItem ?? .placeholder
    }

    func loadIfNeeded() async {
        guard hasAttemptedLoad == false, isLoading == false else {
            return
        }

        await refresh()
    }

    func refresh() async {
        guard isLoading == false else {
            return
        }

        isLoading = true
        hasAttemptedLoad = true
        defer { isLoading = false }

        let targetID = itemID ?? fallbackItem?.id

        do {
            let items = try await collectionRepository.fetchAll()
            if let targetID, let item = items.first(where: { $0.id == targetID }) {
                presentation = makePresentation(from: item)
            } else if let fallbackItem {
                presentation = makeFallbackPresentation(from: fallbackItem)
            } else {
                presentation = nil
            }
        } catch {
            if let fallbackItem {
                presentation = makeFallbackPresentation(from: fallbackItem)
            } else {
                presentation = nil
            }
        }
    }
}

// MARK: - Presentation Mapping

private extension ItemDetailsViewModel {
    func makePresentation(from item: CollectibleItem) -> ItemDetailsPresentation {
        let listItem = CollectibleListItem(item: item)
        let categoryText = item.categoryEnum?.displayName ?? vsLocalized("feature.shared.unknown_category")
        let originText = item.origin ?? vsLocalized("feature.shared.unknown_origin")
        let eraText = makeEraText(year: item.year)
        let conditionText = item.conditionGrade?.displayLabel ?? vsLocalized("feature.details.condition.unknown")
        let valueRangeText = makeValueRangeText(for: item)
        let valueCaptionText = makeValueCaptionText(for: item)
        let marketDeltaText = makeMarketDeltaText(for: item)
        let descriptionText = makeDescriptionText(for: item)

        return ItemDetailsPresentation(
            itemID: item.id,
            listItem: listItem,
            heroMonogram: listItem.thumbnailText,
            heroCaption: categoryText,
            scannedDateText: Self.dateFormatter.string(from: item.addedAt),
            titleText: item.name,
            secondaryText: [categoryText, eraText, originText].joined(separator: " · "),
            metadataRows: [
                ItemDetailsMetadata(id: "category", labelKey: "feature.details.category", value: categoryText),
                ItemDetailsMetadata(id: "origin", labelKey: "feature.details.origin", value: originText),
                ItemDetailsMetadata(id: "era", labelKey: "feature.details.era", value: eraText),
                ItemDetailsMetadata(id: "condition", labelKey: "feature.details.condition", value: conditionText)
            ],
            valueRangeText: valueRangeText,
            valueCaptionText: valueCaptionText,
            marketDeltaText: marketDeltaText,
            descriptionText: descriptionText,
            shareText: [
                item.name,
                [categoryText, originText].joined(separator: " · "),
                "\(vsLocalized("feature.details.market_value")): \(valueRangeText)",
                "\(vsLocalized("feature.details.condition")): \(conditionText)"
            ].joined(separator: "\n")
        )
    }

    func makeFallbackPresentation(from item: CollectibleListItem) -> ItemDetailsPresentation {
        ItemDetailsPresentation(
            itemID: item.id,
            listItem: item,
            heroMonogram: item.thumbnailText,
            heroCaption: item.categoryText,
            scannedDateText: item.timestampText,
            titleText: item.title,
            secondaryText: [item.categoryText, item.subtitle].joined(separator: " · "),
            metadataRows: [
                ItemDetailsMetadata(id: "category", labelKey: "feature.details.category", value: item.categoryText),
                ItemDetailsMetadata(id: "origin", labelKey: "feature.details.origin", value: item.subtitle),
                ItemDetailsMetadata(id: "era", labelKey: "feature.details.era", value: vsLocalized("feature.result.era.unknown")),
                ItemDetailsMetadata(id: "condition", labelKey: "feature.details.condition", value: vsLocalized("feature.details.condition.unknown"))
            ],
            valueRangeText: item.valueText,
            valueCaptionText: vsLocalized("feature.details.market.saved"),
            marketDeltaText: nil,
            descriptionText: item.noteText.isEmpty ? vsLocalized("feature.details.description.empty") : item.noteText,
            shareText: [
                item.title,
                item.subtitle,
                "\(vsLocalized("feature.details.market_value")): \(item.valueText)"
            ].joined(separator: "\n")
        )
    }

    func makeEraText(year: Int?) -> String {
        guard let year else {
            return vsLocalized("feature.result.era.unknown")
        }

        let decade = (year / 10) * 10
        return "\(decade)s"
    }

    func makeValueRangeText(for item: CollectibleItem) -> String {
        let low = item.priceLow.map(decimalValue(from:))
        let high = item.priceHigh.map(decimalValue(from:))
        let mid = item.priceMid.map(decimalValue(from:))

        if let low, let high {
            return "\(CurrencyFormatter.string(from: low)) - \(CurrencyFormatter.string(from: high))"
        }

        if let mid {
            return CurrencyFormatter.string(from: mid)
        }

        if let low {
            return CurrencyFormatter.string(from: low)
        }

        if let high {
            return CurrencyFormatter.string(from: high)
        }

        return vsLocalized("feature.details.market.unavailable")
    }

    func makeValueCaptionText(for item: CollectibleItem) -> String {
        guard
            let rawSource = item.priceSource,
            let source = PriceSource(rawValue: rawSource),
            let fetchedAt = item.priceFetchedAt
        else {
            return vsLocalized("feature.details.market.saved")
        }

        return String(
            format: NSLocalizedString("feature.details.market.updated_format", comment: ""),
            source.displayName,
            Self.dateFormatter.string(from: fetchedAt)
        )
    }

    func makeMarketDeltaText(for item: CollectibleItem) -> String? {
        guard let trend = marketTrendProvider.trend(for: item) else {
            return nil
        }

        let sign = trend.percentage > 0 ? "+" : ""
        return String(
            format: NSLocalizedString("feature.details.market.delta_format", comment: ""),
            "\(sign)\(trend.percentage)%",
            "\(trend.comparisonMonths)"
        )
    }

    func makeDescriptionText(for item: CollectibleItem) -> String {
        if item.historySummary.isEmpty == false {
            return item.historySummary
        }

        if item.notes.isEmpty == false {
            return item.notes
        }

        return vsLocalized("feature.details.description.empty")
    }

    func decimalValue(from amount: Double) -> Decimal {
        Decimal(string: String(amount)) ?? Decimal(amount)
    }
}

// MARK: - Formatters

private extension ItemDetailsViewModel {
    static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        return formatter
    }()
}
