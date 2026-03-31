import Foundation

// MARK: - MockCameraService

/// In-memory camera service mock for previews and unit tests.
final class MockCameraService: CameraServiceProtocol {
    var permissionGranted: Bool
    var capturedPhoto: ScanImage
    var startSessionError: Error?
    var captureError: Error?

    private(set) var didStartSession = false
    private(set) var didStopSession = false

    init(
        permissionGranted: Bool = true,
        capturedPhoto: ScanImage = MockDomainFactory.scanImage(),
        startSessionError: Error? = nil,
        captureError: Error? = nil
    ) {
        self.permissionGranted = permissionGranted
        self.capturedPhoto = capturedPhoto
        self.startSessionError = startSessionError
        self.captureError = captureError
    }

    func requestPermission() async -> Bool {
        permissionGranted
    }

    func startSession() async throws {
        if let startSessionError {
            throw startSessionError
        }

        didStartSession = true
        didStopSession = false
    }

    func stopSession() {
        didStopSession = true
        didStartSession = false
    }

    func capturePhoto() async throws -> ScanImage {
        if let captureError {
            throw captureError
        }

        return capturedPhoto
    }
}
