import AVFoundation
import Foundation

// MARK: - CameraPreviewAvailability

enum CameraPreviewAvailability: Sendable {
    case live
    case simulatorFallback
    case unavailable
}

// MARK: - CameraPreviewSourceProtocol

protocol CameraPreviewSourceProtocol: AnyObject {
    var previewSession: AVCaptureSession? { get }
    var previewAvailability: CameraPreviewAvailability { get }
}

// MARK: - MockCameraPreviewSource

final class MockCameraPreviewSource: CameraPreviewSourceProtocol {
    let previewSession: AVCaptureSession?
    let previewAvailability: CameraPreviewAvailability

    init(
        previewSession: AVCaptureSession? = nil,
        previewAvailability: CameraPreviewAvailability = .simulatorFallback
    ) {
        self.previewSession = previewSession
        self.previewAvailability = previewAvailability
    }
}
