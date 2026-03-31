import Foundation
import Observation

// MARK: - CameraScreenState

enum CameraScreenState: Equatable {
    case idle
    case requestingAccess
    case ready
    case simulatorFallback
    case permissionDenied
    case unavailable
    case error(message: String)
}

// MARK: - CameraScanViewModel

@MainActor
@Observable
final class CameraScanViewModel {
    private let cameraService: CameraServiceProtocol
    private let cameraPreviewSource: any CameraPreviewSourceProtocol
    private let scanModePreferenceStore: any ScanModePreferenceStoring

    private(set) var screenState: CameraScreenState = .idle
    private(set) var isCapturing = false
    private var isSessionVisible = false

    var selectedScanMode: VaultScanMode

    init(
        cameraService: CameraServiceProtocol,
        cameraPreviewSource: any CameraPreviewSourceProtocol,
        scanModePreferenceStore: any ScanModePreferenceStoring,
        scanMode: VaultScanMode
    ) {
        self.cameraService = cameraService
        self.cameraPreviewSource = cameraPreviewSource
        self.scanModePreferenceStore = scanModePreferenceStore
        self.selectedScanMode = scanMode
    }

    var modeOptions: [VaultSegmentedOption<VaultScanMode>] {
        VaultScanMode.allCases.map { mode in
            VaultSegmentedOption(value: mode, title: vsLocalized(mode.titleKey))
        }
    }

    var canCapture: Bool {
        guard isCapturing == false else {
            return false
        }

        switch screenState {
        case .ready, .simulatorFallback, .unavailable:
            return true
        case .idle, .requestingAccess, .permissionDenied, .error:
            return false
        }
    }

    var helperTextKey: String {
        switch selectedScanMode {
        case .standard:
            "feature.scan.camera.helper"
        case .mystery:
            "feature.scan.camera.helper.mystery"
        }
    }

    var modeTitle: String {
        vsLocalized(selectedScanMode.titleKey)
    }

    func setSelectedScanMode(_ mode: VaultScanMode) {
        guard selectedScanMode != mode else {
            return
        }

        selectedScanMode = mode
        scanModePreferenceStore.saveMode(mode)
    }

    func synchronizeMode(_ mode: VaultScanMode) {
        guard selectedScanMode != mode else {
            return
        }

        selectedScanMode = mode
    }

    func updateVisibility(isVisible: Bool) async {
        guard isSessionVisible != isVisible else {
            return
        }

        isSessionVisible = isVisible

        if isVisible {
            await prepareCamera()
        } else {
            cameraService.stopSession()

            if case .permissionDenied = screenState {
                return
            }

            screenState = .idle
        }
    }

    func retry() async {
        await prepareCamera()
    }

    func capture() async -> TemporaryScanSession? {
        guard canCapture else {
            return nil
        }

        isCapturing = true
        defer { isCapturing = false }

        do {
            let image = try await cameraService.capturePhoto()
            return TemporaryScanSession(
                mode: selectedScanMode,
                capturedImages: [image]
            )
        } catch {
            screenState = .error(message: error.localizedDescription)
            return nil
        }
    }

    private func prepareCamera() async {
        screenState = .requestingAccess

        let permissionGranted = await cameraService.requestPermission()
        guard permissionGranted else {
            screenState = .permissionDenied
            return
        }

        do {
            try await cameraService.startSession()

            switch cameraPreviewSource.previewAvailability {
            case .live:
                screenState = .ready
            case .simulatorFallback:
                screenState = .simulatorFallback
            case .unavailable:
                screenState = .unavailable
            }
        } catch {
            screenState = .error(message: error.localizedDescription)
        }
    }
}
