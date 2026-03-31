import SwiftUI

// MARK: - CameraScanView

struct CameraScanView: View {
    @Environment(AppCoordinator.self) private var coordinator
    @State private var viewModel: CameraScanViewModel

    private let previewSource: any CameraPreviewSourceProtocol

    init(
        viewModel: CameraScanViewModel,
        previewSource: any CameraPreviewSourceProtocol
    ) {
        _viewModel = State(initialValue: viewModel)
        self.previewSource = previewSource
    }

    var body: some View {
        ZStack {
            VaultColor.background
                .ignoresSafeArea()

            VStack(alignment: .leading, spacing: VaultSpacing.md) {
                VaultScreenHeader(
                    title: vsLocalized("feature.scan.camera.title"),
                    subtitle: nil,
                    leadingAction: VaultHeaderAction(
                        systemImage: "xmark",
                        accessibilityLabel: vsLocalized("feature.scan.camera.close")
                    ) {
                        coordinator.returnToHome()
                    }
                )

                VaultSegmentedModeSwitch(
                    options: viewModel.modeOptions,
                    selection: Binding(
                        get: { viewModel.selectedScanMode },
                        set: { mode in
                            viewModel.setSelectedScanMode(mode)
                            coordinator.setPreferredScanMode(mode)
                        }
                    )
                )

                previewArea

                Text(vsLocalized(viewModel.helperTextKey))
                    .font(VaultTypography.micro)
                    .foregroundStyle(VaultColor.foregroundSubtle)
                    .frame(maxWidth: .infinity, alignment: .center)
            }
            .padding(.horizontal, VaultSpacing.lg)
            .padding(.top, 20)
            .padding(.bottom, 24)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VaultStickyActionBar {
                HStack(alignment: .center) {
                    Text(viewModel.modeTitle)
                        .font(VaultTypography.micro)
                        .foregroundStyle(VaultColor.foregroundSubtle)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    Button {
                        Task {
                            if let session = await viewModel.capture() {
                                coordinator.setPreferredScanMode(session.mode)
                                coordinator.showProcessing(with: session)
                            }
                        }
                    } label: {
                        captureButton
                    }
                    .buttonStyle(.plain)
                    .disabled(viewModel.canCapture == false)

                    Text(vsLocalized("feature.scan.camera.shot.count"))
                        .font(VaultTypography.micro)
                        .foregroundStyle(VaultColor.foregroundSubtle)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }
            }
        }
        .task {
            viewModel.synchronizeMode(coordinator.preferredScanMode)
            await viewModel.updateVisibility(isVisible: isCameraVisible)
        }
        .onChange(of: coordinator.preferredScanMode) { _, mode in
            viewModel.synchronizeMode(mode)
        }
        .onChange(of: isCameraVisible) { _, isVisible in
            Task {
                await viewModel.updateVisibility(isVisible: isVisible)
            }
        }
        .vaultNavigationChrome()
    }

    private var isCameraVisible: Bool {
        coordinator.selectedTab == .scan && coordinator.scanPath.isEmpty
    }

    @ViewBuilder
    private var previewArea: some View {
        ZStack {
            Rectangle()
                .fill(VaultColor.surface)
                .overlay(
                    Rectangle()
                        .stroke(VaultColor.borderDefault, lineWidth: VaultBorder.hairline)
                )

            switch viewModel.screenState {
            case .ready:
                if let session = previewSource.previewSession {
                    CameraPreviewView(session: session)
                        .clipped()
                }
                overlayGuides

            case .requestingAccess, .idle:
                fallbackOverlay(
                    title: vsLocalized("feature.scan.camera.loading.title"),
                    message: vsLocalized("feature.scan.camera.loading.message"),
                    actionTitle: nil,
                    action: nil
                )

            case .simulatorFallback:
                fallbackOverlay(
                    title: vsLocalized("feature.scan.camera.simulator.title"),
                    message: vsLocalized("feature.scan.camera.simulator.message"),
                    actionTitle: vsLocalized("feature.scan.camera.capture")
                ) {
                    Task {
                        if let session = await viewModel.capture() {
                            coordinator.setPreferredScanMode(session.mode)
                            coordinator.showProcessing(with: session)
                        }
                    }
                }

            case .permissionDenied:
                fallbackOverlay(
                    title: vsLocalized("feature.scan.camera.permission.title"),
                    message: vsLocalized("feature.scan.camera.permission.message"),
                    actionTitle: vsLocalized("feature.scan.camera.permission.retry")
                ) {
                    Task {
                        await viewModel.retry()
                    }
                }

            case .unavailable:
                fallbackOverlay(
                    title: vsLocalized("feature.scan.camera.unavailable.title"),
                    message: vsLocalized("feature.scan.camera.unavailable.message"),
                    actionTitle: vsLocalized("feature.scan.camera.capture")
                ) {
                    Task {
                        if let session = await viewModel.capture() {
                            coordinator.setPreferredScanMode(session.mode)
                            coordinator.showProcessing(with: session)
                        }
                    }
                }

            case let .error(message):
                fallbackOverlay(
                    title: vsLocalized("feature.scan.camera.error.title"),
                    message: message,
                    actionTitle: vsLocalized("feature.scan.camera.permission.retry")
                ) {
                    Task {
                        await viewModel.retry()
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var overlayGuides: some View {
        GeometryReader { geometry in
            let inset: CGFloat = 26
            let line: CGFloat = 28

            ZStack {
                cornerGuide(x: inset, y: inset, horizontal: .leading, vertical: .top, line: line)
                cornerGuide(x: geometry.size.width - inset, y: inset, horizontal: .trailing, vertical: .top, line: line)
                cornerGuide(x: inset, y: geometry.size.height - inset, horizontal: .leading, vertical: .bottom, line: line)
                cornerGuide(x: geometry.size.width - inset, y: geometry.size.height - inset, horizontal: .trailing, vertical: .bottom, line: line)
            }
        }
        .allowsHitTesting(false)
    }

    private func cornerGuide(
        x: CGFloat,
        y: CGFloat,
        horizontal: CameraGuideHorizontalEdge,
        vertical: CameraGuideVerticalEdge,
        line: CGFloat
    ) -> some View {
        Path { path in
            path.move(to: CGPoint(x: x, y: y))

            switch horizontal {
            case .leading:
                path.addLine(to: CGPoint(x: x + line, y: y))
            case .trailing:
                path.addLine(to: CGPoint(x: x - line, y: y))
            }

            path.move(to: CGPoint(x: x, y: y))

            switch vertical {
            case .top:
                path.addLine(to: CGPoint(x: x, y: y + line))
            case .bottom:
                path.addLine(to: CGPoint(x: x, y: y - line))
            }
        }
        .stroke(VaultColor.foreground, lineWidth: VaultBorder.hairline)
    }

    private func fallbackOverlay(
        title: String,
        message: String,
        actionTitle: String?,
        action: (() -> Void)?
    ) -> some View {
        VStack(spacing: VaultSpacing.md) {
            VaultEmptyStateBlock(
                title: title,
                message: message,
                actionTitle: actionTitle,
                action: action
            )
        }
        .padding(VaultSpacing.lg)
    }

    private var captureButton: some View {
        ZStack {
            Rectangle()
                .stroke(VaultColor.borderStrong, lineWidth: VaultBorder.emphasis)
                .frame(width: 72, height: 72)

            Rectangle()
                .fill(viewModel.isCapturing ? VaultColor.fillPressed : VaultColor.fillSelected)
                .frame(width: 54, height: 54)
        }
    }
}

// MARK: - CameraGuideHorizontalEdge

private enum CameraGuideHorizontalEdge {
    case leading
    case trailing
}

// MARK: - CameraGuideVerticalEdge

private enum CameraGuideVerticalEdge {
    case top
    case bottom
}
