import Foundation

// MARK: - CollectibleCategory

/// Supported collectible categories that VaultScope can identify and store.
enum CollectibleCategory: String, Codable, CaseIterable, Identifiable, Sendable {
    case coin
    case vinyl
    case antique
    case card

    var id: String {
        rawValue
    }

    var displayName: String {
        switch self {
        case .coin:
            "Coins"
        case .vinyl:
            "Vinyl Records"
        case .antique:
            "Antiques"
        case .card:
            "Sports Cards"
        }
    }

    var scanOverlayShape: OverlayShape {
        switch self {
        case .coin:
            .circle
        case .vinyl:
            .rectangle
        case .antique:
            .square
        case .card:
            .rectangle
        }
    }
}

// MARK: - OverlayShape

/// Camera overlay shapes used to guide users during capture.
enum OverlayShape: String, Codable, Sendable {
    case circle
    case rectangle
    case square
}
