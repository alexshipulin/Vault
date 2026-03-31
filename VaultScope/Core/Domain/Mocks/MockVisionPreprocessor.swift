import Foundation

// MARK: - MockVisionPreprocessor

/// Deterministic vision preprocessing mock for previews and tests.
final class MockVisionPreprocessor: VisionPreprocessorProtocol {
    var result: VisionResult
    var onProcess: ((ScanImage, CollectibleCategory?) -> Void)?

    init(result: VisionResult = MockDomainFactory.visionResult()) {
        self.result = result
    }

    func process(_ image: ScanImage, category: CollectibleCategory?) async -> VisionResult {
        onProcess?(image, category)
        return result
    }
}
