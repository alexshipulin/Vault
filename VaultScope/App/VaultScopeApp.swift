import SwiftUI

// MARK: - VaultScopeApp

@main
struct VaultScopeApp: App {
    @StateObject private var container: DependencyContainer

    init() {
        let launchConfiguration = AppLaunchConfiguration.current
        launchConfiguration.applyPrelaunchState()
        _container = StateObject(
            wrappedValue: DependencyContainer(configuration: launchConfiguration)
        )
    }

    var body: some Scene {
        WindowGroup {
            AppRouter()
                .environmentObject(container)
                .environment(container.appCoordinator)
                .environment(container.subscriptionManager)
        }
    }
}
