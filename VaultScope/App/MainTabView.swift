import SwiftUI

// MARK: - MainTabView

struct MainTabView: View {
    @EnvironmentObject private var container: DependencyContainer
    @Environment(AppCoordinator.self) private var coordinator
    @Environment(SubscriptionStore.self) private var subscription

    var body: some View {
        @Bindable var coordinator = coordinator

        ZStack {
            VaultColor.background
                .ignoresSafeArea()

            tabContainer(isSelected: coordinator.selectedTab == .home) {
                NavigationStack(path: $coordinator.homePath) {
                    HomeView(viewModel: container.makeHomeViewModel())
                        .navigationDestination(for: HomeRoute.self) { route in
                            switch route {
                            case .itemDetails:
                                ItemDetailsView(
                                    sourceTab: .home,
                                    viewModel: container.makeItemDetailsViewModel(
                                        itemID: coordinator.selectedItemID,
                                        fallbackItem: coordinator.selectedItem
                                    )
                                )
                            case .aiChat:
                                AIChatView(
                                    viewModel: container.makeAIChatViewModel(
                                        itemID: coordinator.selectedItemID,
                                        fallbackItem: coordinator.selectedItem
                                    )
                                )
                            }
                        }
                }
            }

            tabContainer(isSelected: coordinator.selectedTab == .scan) {
                NavigationStack(path: $coordinator.scanPath) {
                    CameraScanView(
                        viewModel: container.makeCameraScanViewModel(scanMode: coordinator.preferredScanMode),
                        previewSource: container.cameraPreviewSource
                    )
                        .navigationDestination(for: ScanRoute.self) { route in
                            switch route {
                            case .processing:
                                ProcessingView(
                                    viewModel: container.makeProcessingViewModel(session: coordinator.currentScanSession)
                                )
                            case .result:
                                ScanResultView(
                                    viewModel: container.makeScanResultViewModel(
                                        result: coordinator.latestScanResult,
                                        session: coordinator.currentScanSession
                                    )
                                )
                            case .itemDetails:
                                ItemDetailsView(
                                    sourceTab: .scan,
                                    viewModel: container.makeItemDetailsViewModel(
                                        itemID: coordinator.selectedItemID,
                                        fallbackItem: coordinator.selectedItem
                                    )
                                )
                            case .aiChat:
                                AIChatView(
                                    viewModel: container.makeAIChatViewModel(
                                        itemID: coordinator.selectedItemID,
                                        fallbackItem: coordinator.selectedItem
                                    )
                                )
                            }
                        }
                }
            }

            tabContainer(isSelected: coordinator.selectedTab == .vault) {
                NavigationStack(path: $coordinator.vaultPath) {
                    VaultHistoryView(viewModel: container.makeVaultHistoryViewModel())
                        .navigationDestination(for: VaultRoute.self) { route in
                            switch route {
                            case .itemDetails:
                                ItemDetailsView(
                                    sourceTab: .vault,
                                    viewModel: container.makeItemDetailsViewModel(
                                        itemID: coordinator.selectedItemID,
                                        fallbackItem: coordinator.selectedItem
                                    )
                                )
                            case .aiChat:
                                AIChatView(
                                    viewModel: container.makeAIChatViewModel(
                                        itemID: coordinator.selectedItemID,
                                        fallbackItem: coordinator.selectedItem
                                    )
                                )
                            }
                        }
                }
            }

            tabContainer(isSelected: coordinator.selectedTab == .profile) {
                NavigationStack(path: $coordinator.profilePath) {
                    ProfileSettingsView(viewModel: container.makeProfileSettingsViewModel())
                        .navigationDestination(for: ProfileRoute.self) { route in
                            switch route {
                            case .details:
                                ItemDetailsView(
                                    sourceTab: .profile,
                                    viewModel: container.makeItemDetailsViewModel(
                                        itemID: coordinator.selectedItemID,
                                        fallbackItem: coordinator.selectedItem
                                    )
                                )
                            case .chat:
                                AIChatView(
                                    viewModel: container.makeAIChatViewModel(
                                        itemID: coordinator.selectedItemID,
                                        fallbackItem: coordinator.selectedItem
                                    )
                                )
                            }
                        }
                }
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(spacing: VaultSpacing.sm) {
                if let daysRemaining = subscription.trialDaysRemaining {
                    TrialBannerView(daysRemaining: daysRemaining)
                        .padding(.horizontal, VaultSpacing.lg)
                        .padding(.top, VaultSpacing.xs)
                }

                VaultRootTabBar(
                    selectedTab: coordinator.selectedTab,
                    onSelect: handleTabSelection
                )
            }
            .background(VaultColor.background)
        }
        .preferredColorScheme(.dark)
    }

    @ViewBuilder
    private func tabContainer<Content: View>(
        isSelected: Bool,
        @ViewBuilder content: () -> Content
    ) -> some View {
        content()
            .opacity(isSelected ? 1 : 0)
            .allowsHitTesting(isSelected)
            .accessibilityHidden(isSelected == false)
    }

    private func handleTabSelection(_ tab: AppTab) {
        switch tab {
        case .scan:
            coordinator.openScanTab()
        case .home, .vault, .profile:
            coordinator.selectTab(tab)
        }
    }
}

// MARK: - AppTab

enum AppTab: String, Hashable, CaseIterable {
    case home
    case scan
    case vault
    case profile

    var titleKey: String {
        switch self {
        case .home:
            "app.tab.home"
        case .scan:
            "app.tab.scan"
        case .vault:
            "app.tab.vault"
        case .profile:
            "app.tab.profile"
        }
    }

    var systemImage: String {
        switch self {
        case .home:
            "house"
        case .scan:
            "viewfinder"
        case .vault:
            "archivebox"
        case .profile:
            "person.crop.square"
        }
    }

    init?(url: URL) {
        guard url.scheme?.lowercased() == "vaultscope" else {
            return nil
        }

        let destination = (url.host ?? url.pathComponents.dropFirst().first ?? "").lowercased()

        switch destination {
        case "home":
            self = .home
        case "scan", "camera":
            self = .scan
        case "vault", "history":
            self = .vault
        case "profile", "settings":
            self = .profile
        default:
            return nil
        }
    }
}

// MARK: - VaultRootTabBar

private struct VaultRootTabBar: View {
    let selectedTab: AppTab
    let onSelect: (AppTab) -> Void

    var body: some View {
        VStack(spacing: 0) {
            VaultDivider()

            HStack(spacing: VaultSpacing.xs) {
                ForEach(AppTab.allCases, id: \.self) { tab in
                    Button {
                        onSelect(tab)
                    } label: {
                        VaultTabItemLabel(
                            title: vsLocalized(tab.titleKey),
                            systemImage: tab.systemImage
                        )
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, VaultSpacing.sm)
                        .background(isSelected(tab) ? VaultColor.fillSelected : VaultColor.surface)
                        .overlay(
                            Rectangle()
                                .stroke(
                                    isSelected(tab) ? VaultColor.borderStrong : VaultColor.borderDefault,
                                    lineWidth: VaultBorder.hairline
                                )
                        )
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(isSelected(tab) ? VaultColor.inverseForeground : VaultColor.foreground)
                    .accessibilityLabel(vsLocalized(tab.titleKey))
                }
            }
            .padding(.horizontal, VaultSpacing.lg)
            .padding(.top, VaultSpacing.sm)
            .padding(.bottom, VaultSpacing.xs)
        }
        .background(VaultColor.background)
    }

    private func isSelected(_ tab: AppTab) -> Bool {
        selectedTab == tab
    }
}
