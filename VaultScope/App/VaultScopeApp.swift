import SwiftUI

// MARK: - VaultScopeApp

@main
struct VaultScopeApp: App {
    @StateObject private var container = DependencyContainer()

    var body: some Scene {
        WindowGroup {
            AppRouter()
                .environmentObject(container)
                .environment(container.appCoordinator)
                .environment(container.subscriptionManager)
        }
    }
}
