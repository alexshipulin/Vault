import Foundation

// MARK: - MockAIService

/// Mock AI identification service with configurable output and captured inputs.
final class MockAIService: AIServiceProtocol {
    var result: ScanResult
    var error: Error?

    private(set) var lastImages: [ScanImage] = []
    private(set) var lastVisionHint: String?
    private(set) var lastCategory: CollectibleCategory?
    private(set) var lastMode: ScanMode?

    init(result: ScanResult = MockDomainFactory.scanResult(), error: Error? = nil) {
        self.result = result
        self.error = error
    }

    func identify(
        images: [ScanImage],
        visionHint: String,
        category: CollectibleCategory?,
        mode: ScanMode
    ) async throws -> ScanResult {
        if let error {
            throw error
        }

        lastImages = images
        lastVisionHint = visionHint
        lastCategory = category
        lastMode = mode

        return result
    }
}
