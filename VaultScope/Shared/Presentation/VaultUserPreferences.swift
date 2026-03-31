import Foundation

// MARK: - PreferredCurrency

enum PreferredCurrency: String, CaseIterable, Identifiable, Codable, Sendable {
    case usd
    case eur
    case gbp
    case jpy

    var id: String {
        rawValue
    }

    var code: String {
        rawValue.uppercased()
    }

    var displayName: String {
        switch self {
        case .usd:
            "USD"
        case .eur:
            "EUR"
        case .gbp:
            "GBP"
        case .jpy:
            "JPY"
        }
    }

    var conversionRateFromUSD: Decimal {
        switch self {
        case .usd:
            Decimal(string: "1.0") ?? 1
        case .eur:
            Decimal(string: "0.92") ?? 0.92
        case .gbp:
            Decimal(string: "0.79") ?? 0.79
        case .jpy:
            Decimal(string: "151.0") ?? 151
        }
    }
}

// MARK: - VaultUserPreferences

struct VaultUserPreferences: Equatable, Sendable {
    var categoriesOfInterest: [CollectibleCategory]
    var preferredCurrency: PreferredCurrency
    var notificationsEnabled: Bool

    static let `default` = VaultUserPreferences(
        categoriesOfInterest: CollectibleCategory.allCases,
        preferredCurrency: .usd,
        notificationsEnabled: true
    )
}

// MARK: - VaultUserPreferencesStoring

protocol VaultUserPreferencesStoring: AnyObject {
    func loadPreferences() -> VaultUserPreferences
    func savePreferences(_ preferences: VaultUserPreferences)
}

// MARK: - UserDefaultsVaultUserPreferencesStore

final class UserDefaultsVaultUserPreferencesStore: VaultUserPreferencesStoring {
    private let userDefaults: UserDefaults

    init(userDefaults: UserDefaults = .standard) {
        self.userDefaults = userDefaults
    }

    func loadPreferences() -> VaultUserPreferences {
        let categoriesRaw = userDefaults.stringArray(forKey: Self.categoriesKey) ?? []
        let categories = categoriesRaw.compactMap(CollectibleCategory.init(rawValue:))
        let currencyRaw = userDefaults.string(forKey: Self.currencyKey)
        let preferredCurrency = currencyRaw.flatMap(PreferredCurrency.init(rawValue:)) ?? .usd
        let notificationsEnabled = userDefaults.object(forKey: Self.notificationsKey) as? Bool ?? true

        return VaultUserPreferences(
            categoriesOfInterest: categories.isEmpty ? CollectibleCategory.allCases : categories,
            preferredCurrency: preferredCurrency,
            notificationsEnabled: notificationsEnabled
        )
    }

    func savePreferences(_ preferences: VaultUserPreferences) {
        userDefaults.set(
            preferences.categoriesOfInterest.map(\.rawValue),
            forKey: Self.categoriesKey
        )
        userDefaults.set(preferences.preferredCurrency.rawValue, forKey: Self.currencyKey)
        userDefaults.set(preferences.notificationsEnabled, forKey: Self.notificationsKey)
    }

    static func currentCurrency(userDefaults: UserDefaults = .standard) -> PreferredCurrency {
        let rawValue = userDefaults.string(forKey: currencyKey)
        return rawValue.flatMap(PreferredCurrency.init(rawValue:)) ?? .usd
    }
}

// MARK: - InMemoryVaultUserPreferencesStore

final class InMemoryVaultUserPreferencesStore: VaultUserPreferencesStoring {
    private var preferences: VaultUserPreferences

    init(preferences: VaultUserPreferences = .default) {
        self.preferences = preferences
    }

    func loadPreferences() -> VaultUserPreferences {
        preferences
    }

    func savePreferences(_ preferences: VaultUserPreferences) {
        self.preferences = preferences
    }
}

// MARK: - Keys

private extension UserDefaultsVaultUserPreferencesStore {
    static let categoriesKey = "vaultscope.preferences.categories"
    static let currencyKey = "vaultscope.preferences.currency"
    static let notificationsKey = "vaultscope.preferences.notifications"
}
