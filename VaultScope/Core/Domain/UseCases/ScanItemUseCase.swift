import Foundation

// MARK: - ScanItemUseCase

/// Coordinates AI identification and progressive price loading for the scan flow.
final class ScanItemUseCase {
    private let aiService: AIServiceProtocol
    private let priceRepository: PriceRepositoryProtocol

    init(aiService: AIServiceProtocol, priceRepository: PriceRepositoryProtocol) {
        self.aiService = aiService
        self.priceRepository = priceRepository
    }

    func identify(
        images: [ScanImage],
        visionResult: VisionResult,
        mode: ScanMode
    ) async throws -> ScanResult {
        let selectedCategory: CollectibleCategory?

        switch mode {
        case let .identify(category):
            selectedCategory = category
        case .mystery:
            selectedCategory = nil
        }

        let normalizedImages = mergedImages(images: images, croppedImage: visionResult.croppedImage)

        return try await aiService.identify(
            images: normalizedImages,
            visionHint: visionHint(from: visionResult),
            category: selectedCategory,
            mode: mode
        )
    }

    func fetchPrice(for result: ScanResult) async throws -> ScanResult {
        if result.hasPriceData {
            return result
        }

        let price = try await priceRepository.fetchPrice(for: result)
        return result.withPrice(price)
    }

    private func visionHint(from result: VisionResult) -> String {
        var components: [String] = []

        let extractedText = result.extractedText.trimmingCharacters(in: .whitespacesAndNewlines)
        if extractedText.isEmpty == false {
            components.append("OCR: \(extractedText)")
        }

        if result.detectedBarcodes.isEmpty == false {
            components.append("Barcodes: \(result.detectedBarcodes.joined(separator: ", "))")
        }

        if let bounds = result.objectBounds {
            components.append(
                "Bounds: x=\(bounds.x), y=\(bounds.y), width=\(bounds.width), height=\(bounds.height)"
            )
        }

        return components.joined(separator: "\n")
    }

    private func mergedImages(images: [ScanImage], croppedImage: ScanImage) -> [ScanImage] {
        if images.contains(croppedImage) {
            return images
        }

        return [croppedImage] + images
    }
}
