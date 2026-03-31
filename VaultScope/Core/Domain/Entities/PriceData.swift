import Foundation

// MARK: - PriceData

/// A normalized appraisal price band and the provenance metadata behind it.
struct PriceData: Codable, Equatable, Sendable {
    let low: Decimal
    let mid: Decimal
    let high: Decimal
    let currency: String
    let source: PriceSource
    let sourceLabel: String
    let fetchedAt: Date
    let comparables: [ComparableSale]?
}

// MARK: - PriceSource

/// Supported sources that can power appraisal pricing.
enum PriceSource: String, Codable, Sendable {
    case pcgs
    case discogs
    case ebay
    case antiqueDB
    case aiEstimate

    var displayName: String {
        switch self {
        case .pcgs:
            "PCGS"
        case .discogs:
            "Discogs"
        case .ebay:
            "eBay"
        case .antiqueDB:
            "Antique Database"
        case .aiEstimate:
            "AI Estimate"
        }
    }
}

// MARK: - ComparableSale

/// A recent comparable sale surfaced to the user alongside an appraisal.
struct ComparableSale: Codable, Identifiable, Equatable, Sendable {
    let id: UUID
    let title: String
    let price: Decimal
    let soldAt: Date
    let sourceURL: URL?
}
