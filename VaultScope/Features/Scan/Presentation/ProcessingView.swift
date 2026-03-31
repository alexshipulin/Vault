import SwiftUI

// MARK: - ProcessingView

struct ProcessingView: View {
    @Environment(AppCoordinator.self) private var coordinator
    @State private var viewModel: ProcessingViewModel

    init(viewModel: ProcessingViewModel) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        ZStack {
            VaultColor.background
                .ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: VaultSpacing.lg) {
                    VaultScreenHeader(
                        title: vsLocalized("feature.processing.title"),
                        subtitle: nil,
                        leadingAction: VaultHeaderAction(
                            systemImage: "chevron.left",
                            accessibilityLabel: vsLocalized("feature.processing.back")
                        ) {
                            retake()
                        }
                    )

                    if viewModel.hasSession {
                        capturedPreviewPanel
                        progressPanel
                    } else {
                        VaultEmptyStateBlock(
                            title: vsLocalized("feature.processing.empty.title"),
                            message: vsLocalized("feature.processing.empty.message"),
                            actionTitle: vsLocalized("feature.processing.retake")
                        ) {
                            retake()
                        }
                    }
                }
                .padding(.horizontal, VaultSpacing.lg)
                .padding(.top, 20)
                .padding(.bottom, 120)
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VaultStickyActionBar {
                Text(viewModel.searchingSourceText)
                    .font(VaultTypography.micro)
                    .foregroundStyle(VaultColor.foregroundSubtle)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .textCase(.uppercase)
                    .tracking(0.8)
            }
        }
        .navigationTitle(vsLocalized("feature.processing.nav"))
        .vaultInlineNavigationTitleDisplayMode()
        .navigationBarBackButtonHidden()
        .vaultNavigationChrome()
        .task {
            viewModel.startIfNeeded()
        }
        .onChange(of: viewModel.generatedResult?.id) { _, _ in
            guard let result = viewModel.generatedResult else {
                return
            }

            coordinator.showScanResult(result)
        }
        .onDisappear {
            if viewModel.generatedResult == nil {
                viewModel.cancelProcessing()
            }
        }
    }

    private var capturedPreviewPanel: some View {
        VaultPanel {
            HStack(alignment: .center) {
                VaultMicroSectionLabel(title: vsLocalized("feature.processing.capture.section"))
                Spacer()

                Button(vsLocalized("feature.processing.retake")) {
                    retake()
                }
                .buttonStyle(.plain)
                .font(VaultTypography.micro)
                .foregroundStyle(VaultColor.foregroundSubtle)
                .textCase(.uppercase)
                .tracking(0.8)
            }

            if let previewImage = viewModel.previewImage {
                ScanImageThumbnailView(image: previewImage)
                    .frame(height: 260)
                    .clipped()
                    .overlay(
                        Rectangle()
                            .stroke(VaultColor.borderDefault, lineWidth: VaultBorder.hairline)
                    )
            }

            VaultInfoRow(
                label: vsLocalized("feature.processing.mode"),
                value: viewModel.modeText
            )

            VaultInfoRow(
                label: vsLocalized("feature.processing.captures"),
                value: viewModel.captureCountText
            )
        }
    }

    private var progressPanel: some View {
        VaultPanel {
            VaultMicroSectionLabel(title: vsLocalized("feature.processing.section"))

            ForEach(viewModel.steps) { step in
                VaultProgressRow(
                    title: vsLocalized(step.titleKey),
                    state: step.state
                )
            }
        }
    }

    private func retake() {
        viewModel.cancelProcessing()
        coordinator.retakeCurrentScan()
    }
}
