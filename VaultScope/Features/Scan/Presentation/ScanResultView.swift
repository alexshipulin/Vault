import SwiftUI

// MARK: - ScanResultView

struct ScanResultView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppCoordinator.self) private var coordinator
    @State private var viewModel: ScanResultViewModel
    @State private var isSharePresented = false

    init(viewModel: ScanResultViewModel) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: VaultSpacing.lg) {
                VaultScreenHeader(
                    title: vsLocalized("feature.result.title"),
                    subtitle: nil,
                    leadingAction: VaultHeaderAction(
                        systemImage: "chevron.left",
                        accessibilityLabel: vsLocalized("feature.result.back")
                    ) {
                        dismiss()
                    },
                    trailingAction: VaultHeaderAction(
                        systemImage: "square.and.arrow.up",
                        accessibilityLabel: vsLocalized("feature.result.share_cta")
                    ) {
                        isSharePresented = true
                    }
                )

                heroPanel

                VaultPanel {
                    Text(viewModel.titleText)
                        .font(VaultTypography.screenTitle)
                        .foregroundStyle(VaultColor.foreground)

                    Text(viewModel.secondaryDescriptionText)
                        .font(VaultTypography.body)
                        .foregroundStyle(VaultColor.foregroundMuted)
                }

                VaultPanel {
                    VaultInfoRow(
                        label: vsLocalized("feature.result.origin"),
                        value: viewModel.originText
                    )

                    VaultDivider()

                    VaultInfoRow(
                        label: vsLocalized("feature.result.era"),
                        value: viewModel.eraText
                    )

                    VaultDivider()

                    VaultInfoRow(
                        label: vsLocalized("feature.result.condition"),
                        value: viewModel.conditionText
                    )
                }

                VaultPanel {
                    VaultMicroSectionLabel(title: vsLocalized("feature.result.confidence"))

                    HStack(alignment: .firstTextBaseline) {
                        Text(viewModel.confidenceText)
                            .font(VaultTypography.screenTitle)
                            .foregroundStyle(VaultColor.foreground)

                        Spacer()

                        Text(vsLocalized("feature.result.confidence.note"))
                            .font(VaultTypography.micro)
                            .foregroundStyle(VaultColor.foregroundSubtle)
                    }

                    confidenceBar
                }

                VaultPanel {
                    VaultMicroSectionLabel(title: vsLocalized("feature.result.value"))

                    Text(viewModel.valuationRangeText)
                        .font(VaultTypography.screenTitle)
                        .foregroundStyle(VaultColor.foreground)

                    Text(viewModel.sourceUpdateText)
                        .font(VaultTypography.micro)
                        .foregroundStyle(VaultColor.foregroundSubtle)
                }

                VaultPanel {
                    VaultMicroSectionLabel(title: vsLocalized("feature.result.history"))

                    Text(viewModel.summaryText)
                        .font(VaultTypography.body)
                        .foregroundStyle(VaultColor.foregroundMuted)
                }

                Text(viewModel.disclaimerText)
                    .font(VaultTypography.micro)
                    .foregroundStyle(VaultColor.foregroundFaint)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, VaultSpacing.lg)
            .padding(.top, 20)
            .padding(.bottom, 156)
        }
        .background(VaultColor.background.ignoresSafeArea())
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VaultStickyActionBar {
                HStack(spacing: VaultSpacing.sm) {
                    saveButton

                    Button(vsLocalized("feature.result.chat_cta")) {
                        coordinator.selectedItem = CollectibleListItem(scanResult: viewModel.result)
                        coordinator.showAIChat(from: .scan)
                    }
                    .buttonStyle(VaultSecondaryCTAButtonStyle())

                    Button(vsLocalized("feature.result.share_cta")) {
                        isSharePresented = true
                    }
                    .buttonStyle(VaultSecondaryCTAButtonStyle())
                }
            }
        }
        .sheet(isPresented: $isSharePresented) {
            VaultActivitySheet(activityItems: [viewModel.shareText])
        }
        .navigationTitle(vsLocalized("feature.result.nav"))
        .vaultInlineNavigationTitleDisplayMode()
        .navigationBarBackButtonHidden()
        .vaultNavigationChrome()
        .task {
            await viewModel.loadSavedState()
        }
    }

    private var heroPanel: some View {
        Group {
            if let previewImage = viewModel.previewImage {
                ScanImageThumbnailView(image: previewImage)
                    .frame(height: 260)
                    .clipped()
            } else {
                ZStack {
                    Rectangle()
                        .fill(VaultColor.surface)

                    VStack(spacing: VaultSpacing.sm) {
                        Text(String(viewModel.titleText.prefix(2)).uppercased())
                            .font(.system(size: 40, weight: .bold))
                            .foregroundStyle(VaultColor.foreground)

                        Text(viewModel.conditionText)
                            .font(VaultTypography.micro)
                            .foregroundStyle(VaultColor.foregroundSubtle)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: 260)
        .overlay(
            Rectangle()
                .stroke(VaultColor.borderDefault, lineWidth: VaultBorder.hairline)
        )
    }

    private var confidenceBar: some View {
        GeometryReader { geometry in
            ZStack(alignment: .leading) {
                Rectangle()
                    .fill(VaultColor.surfaceElevated)

                Rectangle()
                    .fill(VaultColor.foreground)
                    .frame(width: geometry.size.width * viewModel.confidenceProgress)
            }
        }
        .frame(height: 10)
        .overlay(
            Rectangle()
                .stroke(VaultColor.borderDefault, lineWidth: VaultBorder.hairline)
        )
    }

    @ViewBuilder
    private var saveButton: some View {
        if viewModel.isSaved {
            Button(vsLocalized(viewModel.saveButtonTitleKey)) {}
                .buttonStyle(VaultSecondaryCTAButtonStyle())
                .disabled(true)
        } else {
            Button(vsLocalized(viewModel.saveButtonTitleKey)) {
                Task {
                    if let savedItem = await viewModel.saveIfNeeded() {
                        coordinator.didSaveCollectionItem(savedItem)
                    }
                }
            }
            .buttonStyle(VaultPrimaryCTAButtonStyle())
            .disabled(viewModel.isSaving)
        }
    }
}
