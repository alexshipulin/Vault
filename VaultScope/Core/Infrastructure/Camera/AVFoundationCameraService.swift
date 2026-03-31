import AVFoundation
import Foundation

#if canImport(UIKit)
import UIKit
#endif

// MARK: - AVFoundationCameraService

final class AVFoundationCameraService: NSObject, @unchecked Sendable, CameraServiceProtocol, CameraPreviewSourceProtocol {
    private let session = AVCaptureSession()
    private let photoOutput = AVCapturePhotoOutput()
    private let sessionQueue = DispatchQueue(label: "com.vaultscope.camera.session")

    private var continuation: CheckedContinuation<ScanImage, Error>?
    private var isConfigured = false

    private(set) var previewAvailability: CameraPreviewAvailability = {
        #if targetEnvironment(simulator)
        .simulatorFallback
        #else
        .unavailable
        #endif
    }()

    var previewSession: AVCaptureSession? {
        previewAvailability == .live ? session : nil
    }

    func requestPermission() async -> Bool {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            return true
        case .notDetermined:
            return await AVCaptureDevice.requestAccess(for: .video)
        case .denied, .restricted:
            return false
        @unknown default:
            return false
        }
    }

    func startSession() async throws {
        #if targetEnvironment(simulator)
        previewAvailability = .simulatorFallback
        return
        #else
        try await withCheckedThrowingContinuation { continuation in
            sessionQueue.async { [weak self] in
                guard let self else {
                    continuation.resume()
                    return
                }

                do {
                    try self.configureSessionIfNeeded()

                    if self.session.isRunning == false {
                        self.session.startRunning()
                    }

                    continuation.resume()
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        }
        #endif
    }

    func stopSession() {
        sessionQueue.async { [weak self] in
            guard let self else {
                return
            }

            if self.session.isRunning {
                self.session.stopRunning()
            }
        }
    }

    func capturePhoto() async throws -> ScanImage {
        guard previewAvailability == .live else {
            return placeholderScanImage()
        }

        return try await withCheckedThrowingContinuation { continuation in
            sessionQueue.async { [weak self] in
                guard let self else {
                    continuation.resume(returning: self?.placeholderScanImage() ?? ScanImage(data: Data()))
                    return
                }

                self.continuation = continuation
                let settings = AVCapturePhotoSettings()
                settings.flashMode = .off
                self.photoOutput.capturePhoto(with: settings, delegate: self)
            }
        }
    }

    private func configureSessionIfNeeded() throws {
        guard isConfigured == false else {
            return
        }

        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else {
            previewAvailability = .simulatorFallback
            return
        }

        let input = try AVCaptureDeviceInput(device: device)

        session.beginConfiguration()
        session.sessionPreset = .photo

        if session.canAddInput(input) {
            session.addInput(input)
        }

        if session.canAddOutput(photoOutput) {
            session.addOutput(photoOutput)
        }

        session.commitConfiguration()
        isConfigured = true
        previewAvailability = .live
    }

    private func placeholderScanImage() -> ScanImage {
        guard
            let data = Data(base64Encoded: Self.placeholderPNGBase64)
        else {
            return ScanImage(data: Data())
        }

        return ScanImage(data: data, mimeType: "image/png")
    }

    private static let placeholderPNGBase64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sot0JcAAAAASUVORK5CYII="
}

// MARK: - AVCapturePhotoCaptureDelegate

extension AVFoundationCameraService: AVCapturePhotoCaptureDelegate {
    func photoOutput(
        _ output: AVCapturePhotoOutput,
        didFinishProcessingPhoto photo: AVCapturePhoto,
        error: Error?
    ) {
        let continuation = continuation
        self.continuation = nil

        if let error {
            continuation?.resume(throwing: error)
            return
        }

        guard let data = photo.fileDataRepresentation() else {
            continuation?.resume(returning: placeholderScanImage())
            return
        }

        continuation?.resume(returning: ScanImage(data: data))
    }
}
