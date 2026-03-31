import SwiftUI

// MARK: - HomeView

struct HomeView: View {
    @Environment(AppCoordinator.self) private var coordinator
    @State private var viewModel: HomeViewModel

    init(viewModel: HomeViewModel) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        VaultScopeScreen(
            titleKey: "feature.home.title",
            trailingAction: VaultHeaderAction(
                systemImage: "person.crop.square",
                accessibilityLabel: vsLocalized("feature.home.profile_accessibility")
            ) {
                coordinator.selectTab(.profile)
            }
        ) {
            VaultScopePanel {
                VaultScopeSectionTitle(key: "feature.home.total.section")

                Text(viewModel.estimatedTotalText)
                    .font(VaultTypography.rowTitle)
                    .foregroundStyle(VaultColor.foreground)

                Text(vsLocalized("feature.home.total.caption"))
                    .font(VaultTypography.micro)
                    .foregroundStyle(VaultColor.foregroundSubtle)
            }

            VaultScopePanel {
                VaultScopeSectionTitle(key: "feature.home.scan.section")

                Text(vsLocalized("feature.home.scan.caption"))
                    .font(VaultTypography.body)
                    .foregroundStyle(VaultColor.foregroundMuted)

                VaultSegmentedModeSwitch(
                    options: [
                        VaultSegmentedOption(value: VaultScanMode.standard, title: vsLocalized("feature.home.mode.standard")),
                        VaultSegmentedOption(value: VaultScanMode.mystery, title: vsLocalized("feature.home.mode.mystery"))
                    ],
                    selection: Binding(
                        get: { viewModel.selectedScanMode },
                        set: { mode in
                            viewModel.updateSelectedScanMode(mode)
                            coordinator.setPreferredScanMode(mode)
                        }
                    )
                )

                Button(vsLocalized("feature.home.primary_cta")) {
                    coordinator.startScanFlow(mode: viewModel.selectedScanMode)
                }
                .buttonStyle(VaultScopePrimaryButtonStyle())
            }

            VaultScopePanel {
                HStack(alignment: .center) {
                    VaultScopeSectionTitle(key: "feature.home.recent.section")
                    Spacer()

                    Button(vsLocalized("feature.home.recent.all")) {
                        coordinator.selectTab(.vault)
                    }
                    .buttonStyle(.plain)
                    .font(VaultTypography.micro)
                    .foregroundStyle(VaultColor.foregroundSubtle)
                    .textCase(.uppercase)
                    .tracking(0.8)
                }

                if viewModel.hasRecentItems {
                    ForEach(Array(viewModel.displayedRecentItems.enumerated()), id: \.element.id) { index, item in
                        Button {
                            coordinator.showItemDetails(for: item, from: .home)
                        } label: {
                            VaultRecentScanRow(
                                item: item,
                                showsDivider: index < viewModel.displayedRecentItems.count - 1
                            )
                        }
                        .buttonStyle(.plain)
                    }
                } else {
                    VaultEmptyStateBlock(
                        title: vsLocalized("feature.home.empty.title"),
                        message: vsLocalized("feature.home.empty.message"),
                        actionTitle: vsLocalized("feature.home.primary_cta")
                    ) {
                        coordinator.startScanFlow(mode: viewModel.selectedScanMode)
                    }
                }
            }
        }
        .task {
            coordinator.setPreferredScanMode(viewModel.selectedScanMode)
            await viewModel.loadIfNeeded()
        }
        .onChange(of: coordinator.collectionRefreshID) { _, _ in
            Task {
                await viewModel.refresh()
            }
        }
    }
}
