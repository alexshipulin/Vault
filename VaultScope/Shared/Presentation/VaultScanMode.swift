import Foundation

// MARK: - VaultScanMode

enum VaultScanMode: String, CaseIterable, Codable, Sendable {
    case standard
    case mystery

    var titleKey: String {
        switch self {
        case .standard:
            "feature.home.mode.standard"
        case .mystery:
            "feature.home.mode.mystery"
        }
    }
}

// MARK: - ScanModePreferenceStoring

protocol ScanModePreferenceStoring: AnyObject {
    func loadMode() -> VaultScanMode
    func saveMode(_ mode: VaultScanMode)
}

// MARK: - UserDefaultsScanModePreferenceStore

final class UserDefaultsScanModePreferenceStore: ScanModePreferenceStoring {
    private let userDefaults: UserDefaults
    private let storageKey: String

    init(
        userDefaults: UserDefaults = .standard,
        storageKey: String = "vaultscope.scan.mode"
    ) {
        self.userDefaults = userDefaults
        self.storageKey = storageKey
    }

    func loadMode() -> VaultScanMode {
        guard
            let rawValue = userDefaults.string(forKey: storageKey),
            let mode = VaultScanMode(rawValue: rawValue)
        else {
            return .standard
        }

        return mode
    }

    func saveMode(_ mode: VaultScanMode) {
        userDefaults.set(mode.rawValue, forKey: storageKey)
    }
}

// MARK: - InMemoryScanModePreferenceStore

final class InMemoryScanModePreferenceStore: ScanModePreferenceStoring {
    private var mode: VaultScanMode

    init(mode: VaultScanMode = .standard) {
        self.mode = mode
    }

    func loadMode() -> VaultScanMode {
        mode
    }

    func saveMode(_ mode: VaultScanMode) {
        self.mode = mode
    }
}
