import SwiftUI

// MARK: - VaultHistoryView

struct VaultHistoryView: View {
    @Environment(AppCoordinator.self) private var coordinator
    @State private var viewModel: VaultHistoryViewModel

    init(viewModel: VaultHistoryViewModel) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        @Bindable var viewModel = viewModel

        VaultScopeScreen(
            titleKey: "feature.vault.title"
        ) {
            VaultSearchField(
                placeholder: vsLocalized("feature.vault.search.placeholder"),
                text: $viewModel.searchText
            )

            VaultPanel {
                HStack(spacing: 0) {
                    summaryMetric(
                        title: vsLocalized("feature.vault.summary.count"),
                        value: viewModel.itemCountText
                    )

                    Rectangle()
                        .fill(VaultColor.borderMuted)
                        .frame(width: VaultBorder.hairline)

                    summaryMetric(
                        title: vsLocalized("feature.vault.summary.value"),
                        value: viewModel.totalValueText
                    )
                }
            }

            VaultScopePanel {
                HStack(alignment: .center) {
                    VaultScopeSectionTitle(key: "feature.vault.collection.section")
                    Spacer()

                    Text(viewModel.visibleItemCountText)
                        .font(VaultTypography.micro)
                        .foregroundStyle(VaultColor.foregroundSubtle)
                        .textCase(.uppercase)
                        .tracking(0.8)
                }

                if viewModel.hasVisibleItems {
                    LazyVGrid(
                        columns: [
                            GridItem(.flexible(), spacing: VaultSpacing.md, alignment: .top),
                            GridItem(.flexible(), spacing: VaultSpacing.md, alignment: .top)
                        ],
                        spacing: VaultSpacing.md
                    ) {
                        ForEach(viewModel.items) { item in
                            Button {
                                coordinator.showItemDetails(for: item, from: .vault)
                            } label: {
                                VaultGridCard(
                                    thumbnailText: item.thumbnailText,
                                    eyebrow: item.categoryText,
                                    title: item.title,
                                    subtitle: item.subtitle,
                                    value: item.valueText
                                )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                } else {
                    emptyState
                }
            }
        }
        .task {
            await viewModel.loadIfNeeded()
        }
        .onChange(of: coordinator.collectionRefreshID) { _, _ in
            Task {
                await viewModel.refresh()
            }
        }
    }

    private func summaryMetric(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: VaultSpacing.xs) {
            Text(title)
                .font(VaultTypography.sectionLabel)
                .textCase(.uppercase)
                .tracking(0.8)
                .foregroundStyle(VaultColor.foregroundSubtle)

            Text(value)
                .font(VaultTypography.rowTitle)
                .foregroundStyle(VaultColor.foreground)
                .lineLimit(1)
                .minimumScaleFactor(0.85)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var emptyState: some View {
        if viewModel.hasSavedItems {
            VaultEmptyStateBlock(
                title: vsLocalized("feature.vault.search_empty.title"),
                message: vsLocalized("feature.vault.search_empty.message"),
                actionTitle: vsLocalized("feature.vault.search.clear")
            ) {
                viewModel.clearSearch()
            }
        } else {
            VaultEmptyStateBlock(
                title: vsLocalized("feature.vault.empty.title"),
                message: vsLocalized("feature.vault.empty.message"),
                actionTitle: vsLocalized("feature.vault.empty.action")
            ) {
                coordinator.startScanFlow(mode: coordinator.preferredScanMode)
            }
        }
    }
}
