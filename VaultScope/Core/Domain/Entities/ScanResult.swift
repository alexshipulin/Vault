import Foundation

// MARK: - ScanResult

/// The AI identification payload returned for a capture session.
struct ScanResult: Codable, Identifiable, Equatable, Sendable {
    let id: UUID
    let category: CollectibleCategory
    let name: String
    let year: Int?
    let origin: String?
    let condition: ConditionGrade
    let conditionRangeLow: ConditionGrade
    let conditionRangeHigh: ConditionGrade
    let historySummary: String
    let confidence: Double
    let priceData: PriceData?
    let rawAIResponse: String
    let scannedAt: Date
    let inputImageHashes: [String]

    var isHighConfidence: Bool {
        confidence >= 0.85
    }

    var hasPriceData: Bool {
        priceData != nil
    }

    func withPrice(_ price: PriceData) -> ScanResult {
        ScanResult(
            id: id,
            category: category,
            name: name,
            year: year,
            origin: origin,
            condition: condition,
            conditionRangeLow: conditionRangeLow,
            conditionRangeHigh: conditionRangeHigh,
            historySummary: historySummary,
            confidence: confidence,
            priceData: price,
            rawAIResponse: rawAIResponse,
            scannedAt: scannedAt,
            inputImageHashes: inputImageHashes
        )
    }
}
