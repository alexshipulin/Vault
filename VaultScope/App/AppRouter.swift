import SwiftUI

// MARK: - AppRouter

struct AppRouter: View {
    @EnvironmentObject private var container: DependencyContainer
    @Environment(AppCoordinator.self) private var coordinator
    @AppStorage(AppStorageKey.hasCompletedOnboarding.rawValue) private var hasCompletedOnboarding = false
    @AppStorage(AppStorageKey.onboardingStep.rawValue) private var onboardingStep = 0
    @AppStorage(AppStorageKey.pendingTab.rawValue) private var pendingTabRawValue = AppTab.home.rawValue

    var body: some View {
        Group {
            if hasCompletedOnboarding {
                MainTabView()
            } else {
                OnboardingCoordinatorView()
            }
        }
        .animation(.easeInOut(duration: 0.3), value: hasCompletedOnboarding)
        .task {
            restoreState()
            container.subscriptionManager.refresh()
        }
        .onChange(of: hasCompletedOnboarding) { _, completed in
            if completed {
                activatePendingTab()
            }
        }
        .onOpenURL(perform: handleDeepLink)
    }

    private func restoreState() {
        onboardingStep = onboardingStep.clamped(to: 0...OnboardingCoordinatorView.lastStepIndex)

        if hasCompletedOnboarding {
            activatePendingTab()
        }
    }

    private func activatePendingTab() {
        guard coordinator.currentScanSession == nil, coordinator.scanPath.isEmpty else {
            pendingTabRawValue = AppTab.scan.rawValue
            return
        }

        let pendingTab = AppTab(rawValue: pendingTabRawValue) ?? .home
        coordinator.selectTab(pendingTab)
        pendingTabRawValue = pendingTab.rawValue
    }

    private func handleDeepLink(_ url: URL) {
        guard let destination = AppTab(url: url) else {
            return
        }

        if hasCompletedOnboarding {
            coordinator.selectTab(destination)
            pendingTabRawValue = destination.rawValue
        } else {
            pendingTabRawValue = destination.rawValue
        }
    }
}

// MARK: - AppStorageKey

enum AppStorageKey: String {
    case hasCompletedOnboarding
    case onboardingStep
    case pendingTab
}

// MARK: - Comparable

private extension Comparable {
    func clamped(to range: ClosedRange<Self>) -> Self {
        min(max(self, range.lowerBound), range.upperBound)
    }
}
