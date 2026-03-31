import Foundation
import Observation

// MARK: - ScanResultViewModel

@MainActor
@Observable
final class ScanResultViewModel {
    private let collectionRepository: CollectionRepositoryProtocol

    let result: ScanResult
    let session: TemporaryScanSession?

    private(set) var isSaved = false
    private(set) var isSaving = false

    init(
        result: ScanResult,
        session: TemporaryScanSession?,
        collectionRepository: CollectionRepositoryProtocol
    ) {
        self.result = result
        self.session = session
        self.collectionRepository = collectionRepository
    }

    var titleText: String {
        result.name
    }

    var secondaryDescriptionText: String {
        let components = [
            result.category.displayName,
            eraText,
            result.origin ?? vsLocalized("feature.shared.unknown_origin")
        ]
        return components.joined(separator: " · ")
    }

    var originText: String {
        result.origin ?? vsLocalized("feature.shared.unknown_origin")
    }

    var eraText: String {
        guard let year = result.year else {
            return vsLocalized("feature.result.era.unknown")
        }

        let decade = (year / 10) * 10
        return "\(decade)s"
    }

    var valuationRangeText: String {
        guard let priceData = result.priceData else {
            return CurrencyFormatter.string(from: .zero)
        }

        return "\(CurrencyFormatter.string(from: priceData.low)) - \(CurrencyFormatter.string(from: priceData.high))"
    }

    var sourceUpdateText: String {
        guard let priceData = result.priceData else {
            return vsLocalized("feature.result.source.pending")
        }

        let dateFormatter = DateFormatter()
        dateFormatter.dateStyle = .medium
        dateFormatter.timeStyle = .none

        return String(
            format: NSLocalizedString("feature.result.source.updated_format", comment: ""),
            priceData.source.displayName,
            dateFormatter.string(from: priceData.fetchedAt)
        )
    }

    var confidenceText: String {
        let percent = Int((result.confidence * 100).rounded())
        return "\(percent)%"
    }

    var confidenceProgress: Double {
        min(max(result.confidence, 0), 1)
    }

    var conditionText: String {
        result.condition.displayLabel
    }

    var summaryText: String {
        result.historySummary
    }

    var disclaimerText: String {
        vsLocalized("feature.result.disclaimer")
    }

    var shareText: String {
        [
            titleText,
            secondaryDescriptionText,
            "\(vsLocalized("feature.result.value")): \(valuationRangeText)",
            "\(vsLocalized("feature.result.confidence")): \(confidenceText)"
        ].joined(separator: "\n")
    }

    var previewImage: ScanImage? {
        session?.capturedImages.first
    }

    var saveButtonTitleKey: String {
        isSaved ? "feature.result.saved_cta" : "feature.result.save_cta"
    }

    func loadSavedState() async {
        do {
            let items = try await collectionRepository.fetchAll()
            isSaved = items.contains { $0.id == result.id }
        } catch {
            isSaved = false
        }
    }

    func saveIfNeeded() async -> CollectibleListItem? {
        guard isSaved == false, isSaving == false else {
            return nil
        }

        isSaving = true
        defer { isSaving = false }

        let item = CollectibleItem(from: result)

        do {
            try await collectionRepository.save(item)
            isSaved = true
            return CollectibleListItem(item: item)
        } catch {
            return nil
        }
    }
}
