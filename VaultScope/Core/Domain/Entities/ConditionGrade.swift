import Foundation

// MARK: - ConditionGrade

/// Normalized condition grades used across supported collectible categories.
enum ConditionGrade: Int, Codable, CaseIterable, Comparable, Sendable {
    case poor = 1
    case good = 2
    case veryGood = 3
    case fine = 4
    case veryFine = 5
    case extremelyFine = 6
    case aboutUncirculated = 7
    case mint = 8
    case gemMint = 9

    var displayLabel: String {
        switch self {
        case .poor:
            "Poor"
        case .good:
            "Good"
        case .veryGood:
            "Very Good"
        case .fine:
            "Fine"
        case .veryFine:
            "Very Fine"
        case .extremelyFine:
            "Extremely Fine"
        case .aboutUncirculated:
            "About Uncirculated"
        case .mint:
            "Mint"
        case .gemMint:
            "Gem Mint"
        }
    }

    var shortLabel: String {
        switch self {
        case .poor:
            "PR"
        case .good:
            "G"
        case .veryGood:
            "VG"
        case .fine:
            "F"
        case .veryFine:
            "VF"
        case .extremelyFine:
            "XF"
        case .aboutUncirculated:
            "AU"
        case .mint:
            "M"
        case .gemMint:
            "GM"
        }
    }

    var colorHex: String {
        switch self {
        case .poor:
            "#D64545"
        case .good:
            "#E67E22"
        case .veryGood:
            "#F39C12"
        case .fine:
            "#F1C40F"
        case .veryFine:
            "#B7CC43"
        case .extremelyFine:
            "#7CB342"
        case .aboutUncirculated:
            "#43A047"
        case .mint:
            "#2E7D32"
        case .gemMint:
            "#1B5E20"
        }
    }

    static func < (lhs: ConditionGrade, rhs: ConditionGrade) -> Bool {
        lhs.rawValue < rhs.rawValue
    }
}
