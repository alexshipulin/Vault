import SwiftUI

// MARK: - ItemDetailsView

struct ItemDetailsView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppCoordinator.self) private var coordinator
    let sourceTab: AppTab
    @State private var viewModel: ItemDetailsViewModel
    @State private var isSharePresented = false

    init(sourceTab: AppTab, viewModel: ItemDetailsViewModel) {
        self.sourceTab = sourceTab
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: VaultSpacing.lg) {
                VaultScreenHeader(
                    title: vsLocalized("feature.details.title"),
                    subtitle: nil,
                    leadingAction: VaultHeaderAction(
                        systemImage: "chevron.left",
                        accessibilityLabel: vsLocalized("feature.details.back")
                    ) {
                        dismiss()
                    },
                    trailingAction: viewModel.hasLoadedItem
                        ? VaultHeaderAction(
                            systemImage: "ellipsis",
                            accessibilityLabel: vsLocalized("feature.details.share_cta")
                        ) {
                            isSharePresented = true
                        }
                        : nil
                )

                if let presentation = viewModel.presentation {
                    heroPanel(presentation: presentation)
                    infoStrip(presentation: presentation)
                    titlePanel(presentation: presentation)
                    metadataPanel(presentation: presentation)
                    marketValuePanel(presentation: presentation)
                    descriptionPanel(presentation: presentation)
                } else if viewModel.isLoading {
                    loadingPanel
                } else {
                    missingState
                }
            }
            .padding(.horizontal, VaultSpacing.lg)
            .padding(.top, 20)
            .padding(.bottom, 156)
        }
        .background(VaultColor.background.ignoresSafeArea())
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if viewModel.hasLoadedItem {
                VaultStickyActionBar {
                    HStack(spacing: VaultSpacing.sm) {
                        Button(vsLocalized("feature.details.chat_cta")) {
                            coordinator.selectedItemID = viewModel.displayItem.id
                            coordinator.selectedItem = viewModel.displayItem
                            coordinator.showAIChat(from: sourceTab)
                        }
                        .buttonStyle(VaultPrimaryCTAButtonStyle())

                        Button(vsLocalized("feature.details.share_cta")) {
                            isSharePresented = true
                        }
                        .buttonStyle(VaultSecondaryCTAButtonStyle())
                    }
                }
            }
        }
        .sheet(isPresented: $isSharePresented) {
            if let presentation = viewModel.presentation {
                VaultActivitySheet(activityItems: [presentation.shareText])
            }
        }
        .navigationTitle(vsLocalized("feature.details.nav"))
        .vaultInlineNavigationTitleDisplayMode()
        .navigationBarBackButtonHidden()
        .vaultNavigationChrome()
        .task {
            await viewModel.loadIfNeeded()
        }
    }

    private func heroPanel(presentation: ItemDetailsPresentation) -> some View {
        ZStack {
            Rectangle()
                .fill(VaultColor.surface)

            VStack(spacing: VaultSpacing.sm) {
                Text(presentation.heroMonogram)
                    .font(.system(size: 40, weight: .bold))
                    .foregroundStyle(VaultColor.foreground)

                Text(presentation.heroCaption)
                    .font(VaultTypography.micro)
                    .foregroundStyle(VaultColor.foregroundSubtle)
                    .textCase(.uppercase)
                    .tracking(0.8)
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: 260)
        .overlay(
            Rectangle()
                .stroke(VaultColor.borderDefault, lineWidth: VaultBorder.hairline)
        )
    }

    private func infoStrip(presentation: ItemDetailsPresentation) -> some View {
        VaultPanel {
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: VaultSpacing.xxs) {
                    VaultMicroSectionLabel(title: vsLocalized("feature.details.scanned"))

                    Text(presentation.scannedDateText)
                        .font(VaultTypography.body)
                        .foregroundStyle(VaultColor.foreground)
                }

                Spacer()

                Button(vsLocalized("feature.details.edit")) {
                    // Edit flow intentionally deferred until item editing is scoped.
                }
                .buttonStyle(.plain)
                .font(VaultTypography.micro)
                .foregroundStyle(VaultColor.foregroundSubtle)
                .textCase(.uppercase)
                .tracking(0.8)
            }
        }
    }

    private func titlePanel(presentation: ItemDetailsPresentation) -> some View {
        VaultPanel {
            Text(presentation.titleText)
                .font(VaultTypography.screenTitle)
                .foregroundStyle(VaultColor.foreground)

            Text(presentation.secondaryText)
                .font(VaultTypography.body)
                .foregroundStyle(VaultColor.foregroundMuted)
        }
    }

    private func metadataPanel(presentation: ItemDetailsPresentation) -> some View {
        VaultPanel {
            ForEach(Array(presentation.metadataRows.enumerated()), id: \.element.id) { index, row in
                VaultInfoRow(
                    label: vsLocalized(row.labelKey),
                    value: row.value
                )

                if index < presentation.metadataRows.count - 1 {
                    VaultDivider()
                }
            }
        }
    }

    private func marketValuePanel(presentation: ItemDetailsPresentation) -> some View {
        VaultPanel {
            VaultMicroSectionLabel(title: vsLocalized("feature.details.market_value"))

            HStack(alignment: .firstTextBaseline, spacing: VaultSpacing.md) {
                Text(presentation.valueRangeText)
                    .font(VaultTypography.screenTitle)
                    .foregroundStyle(VaultColor.foreground)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)

                Spacer(minLength: 0)

                if let marketDeltaText = presentation.marketDeltaText {
                    Text(marketDeltaText)
                        .font(VaultTypography.micro)
                        .foregroundStyle(VaultColor.foregroundSubtle)
                        .textCase(.uppercase)
                        .tracking(0.8)
                }
            }

            Text(presentation.valueCaptionText)
                .font(VaultTypography.micro)
                .foregroundStyle(VaultColor.foregroundSubtle)
        }
    }

    private func descriptionPanel(presentation: ItemDetailsPresentation) -> some View {
        VaultPanel {
            VaultMicroSectionLabel(title: vsLocalized("feature.details.notes"))

            Text(presentation.descriptionText)
                .font(VaultTypography.body)
                .foregroundStyle(VaultColor.foregroundMuted)
        }
    }

    private var loadingPanel: some View {
        VaultEmptyStateBlock(
            title: vsLocalized("feature.details.loading.title"),
            message: vsLocalized("feature.details.loading.message")
        )
    }

    private var missingState: some View {
        VaultEmptyStateBlock(
            title: vsLocalized("feature.details.empty.title"),
            message: vsLocalized("feature.details.empty.message")
        )
    }
}
