import Foundation

// MARK: - AppLaunchArgument

enum AppLaunchArgument: String {
    case uiTesting = "-VaultScopeUITesting"
    case seedLocalData = "-VaultScopeSeedLocalData"
    case clearLocalData = "-VaultScopeClearLocalData"
    case skipOnboarding = "-VaultScopeSkipOnboarding"
    case fastProcessing = "-VaultScopeFastProcessing"
}

// MARK: - AppLaunchConfiguration

struct AppLaunchConfiguration {
    let environment: AppEnvironment
    let seedLocalData: Bool
    let clearLocalData: Bool
    let skipOnboarding: Bool
    let fastProcessing: Bool
    let storageDirectory: URL?

    static var current: AppLaunchConfiguration {
        let processInfo = ProcessInfo.processInfo
        let arguments = Set(processInfo.arguments)
        let environment = processInfo.environment

        let isUITesting =
            arguments.contains(AppLaunchArgument.uiTesting.rawValue) ||
            environment["VAULTSCOPE_UI_TESTING"] == "1"

        let seedLocalData = arguments.contains(AppLaunchArgument.seedLocalData.rawValue)
        let clearLocalData = arguments.contains(AppLaunchArgument.clearLocalData.rawValue)
        let skipOnboarding = arguments.contains(AppLaunchArgument.skipOnboarding.rawValue)
        let fastProcessing = arguments.contains(AppLaunchArgument.fastProcessing.rawValue)

        let storageDirectory: URL?
        if isUITesting {
            if let customDirectory = environment["VAULTSCOPE_STORAGE_DIRECTORY"], customDirectory.isEmpty == false {
                storageDirectory = URL(fileURLWithPath: customDirectory, isDirectory: true)
            } else {
                storageDirectory = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
                    .appendingPathComponent("VaultScopeUITestStore", isDirectory: true)
            }
        } else {
            storageDirectory = nil
        }

        return AppLaunchConfiguration(
            environment: isUITesting ? .uiTesting : .production,
            seedLocalData: seedLocalData || isUITesting,
            clearLocalData: clearLocalData,
            skipOnboarding: skipOnboarding || isUITesting,
            fastProcessing: fastProcessing || isUITesting,
            storageDirectory: storageDirectory
        )
    }

    func applyPrelaunchState() {
        if let storageDirectory, clearLocalData {
            VaultLocalStorage.resetStore(baseDirectory: storageDirectory)
        }

        if clearLocalData {
            let defaults = UserDefaults.standard
            defaults.removeObject(forKey: AppStorageKey.pendingTab.rawValue)
            defaults.removeObject(forKey: AppStorageKey.onboardingStep.rawValue)
            defaults.removeObject(forKey: "vaultscope.scan.mode")
            defaults.removeObject(forKey: "vaultscope.preferences.categories")
            defaults.removeObject(forKey: "vaultscope.preferences.currency")
            defaults.removeObject(forKey: "vaultscope.preferences.notifications")
        }

        if skipOnboarding {
            let defaults = UserDefaults.standard
            defaults.set(true, forKey: AppStorageKey.hasCompletedOnboarding.rawValue)
            defaults.set(AppTab.home.rawValue, forKey: AppStorageKey.pendingTab.rawValue)
        }
    }
}
