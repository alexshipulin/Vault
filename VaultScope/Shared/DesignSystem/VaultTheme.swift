import SwiftUI

// MARK: - VaultColor

/// Shared monochrome palette for the VaultScope UI.
enum VaultColor {
    static let background = Color.black
    static let surface = Color.black
    static let surfaceElevated = Color.white.opacity(0.04)
    static let foreground = Color.white
    static let foregroundMuted = Color.white.opacity(0.72)
    static let foregroundSubtle = Color.white.opacity(0.56)
    static let foregroundFaint = Color.white.opacity(0.38)
    static let inverseForeground = Color.black
    static let borderStrong = Color.white
    static let borderDefault = Color.white.opacity(0.24)
    static let borderMuted = Color.white.opacity(0.14)
    static let divider = Color.white.opacity(0.12)
    static let fillSelected = Color.white
    static let fillPressed = Color.white.opacity(0.86)
}

// MARK: - VaultSpacing

/// Shared spacing scale used by reusable components.
enum VaultSpacing {
    static let xxs: CGFloat = 4
    static let xs: CGFloat = 8
    static let sm: CGFloat = 12
    static let md: CGFloat = 16
    static let lg: CGFloat = 24
    static let xl: CGFloat = 32
}

// MARK: - VaultBorder

/// Border and divider constants for the sharp monochrome UI.
enum VaultBorder {
    static let hairline: CGFloat = 1
    static let emphasis: CGFloat = 1.5
}

// MARK: - VaultIconSize

/// Shared icon sizes for navigation and metadata rows.
enum VaultIconSize {
    static let xs: CGFloat = 12
    static let sm: CGFloat = 16
    static let md: CGFloat = 20
    static let lg: CGFloat = 24
}

// MARK: - VaultTypography

/// Type ramp for the editorial, premium presentation layer.
enum VaultTypography {
    static let screenTitle = Font.system(size: 28, weight: .bold)
    static let sectionLabel = Font.system(size: 11, weight: .semibold)
    static let body = Font.system(size: 14, weight: .regular)
    static let bodyStrong = Font.system(size: 14, weight: .semibold)
    static let rowTitle = Font.system(size: 16, weight: .semibold)
    static let rowValue = Font.system(size: 14, weight: .medium)
    static let micro = Font.system(size: 12, weight: .medium)
    static let tabLabel = Font.system(size: 10, weight: .semibold)
    static let button = Font.system(size: 14, weight: .semibold)
}
