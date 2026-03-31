import Foundation

// MARK: - ScanImage

/// Raw image bytes passed through the Domain layer without UIKit dependencies.
struct ScanImage: Codable, Equatable, Sendable {
    let data: Data
    let mimeType: String

    init(data: Data, mimeType: String = "image/jpeg") {
        self.data = data
        self.mimeType = mimeType
    }
}

// MARK: - ImageBounds

/// Detected object bounds represented in normalized image coordinates.
struct ImageBounds: Codable, Equatable, Sendable {
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}

// MARK: - CameraServiceProtocol

/// Abstraction for camera permission, preview lifecycle, and still capture.
protocol CameraServiceProtocol: AnyObject {
    func requestPermission() async -> Bool
    func startSession() async throws
    func stopSession()
    func capturePhoto() async throws -> ScanImage
}

// MARK: - VisionResult

/// Output from the vision preprocessing pipeline used to help AI identification.
struct VisionResult: Equatable, Sendable {
    let croppedImage: ScanImage
    let extractedText: String
    let detectedBarcodes: [String]
    let objectBounds: ImageBounds?

    init(
        croppedImage: ScanImage,
        extractedText: String = "",
        detectedBarcodes: [String] = [],
        objectBounds: ImageBounds? = nil
    ) {
        self.croppedImage = croppedImage
        self.extractedText = extractedText
        self.detectedBarcodes = detectedBarcodes
        self.objectBounds = objectBounds
    }
}

// MARK: - VisionPreprocessorProtocol

/// Abstraction for OCR, barcode detection, and image cropping before AI identification.
protocol VisionPreprocessorProtocol: AnyObject {
    func process(_ image: ScanImage, category: CollectibleCategory?) async -> VisionResult
}
