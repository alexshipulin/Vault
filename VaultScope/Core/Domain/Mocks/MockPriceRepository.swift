import Foundation

// MARK: - MockPriceRepository

/// Mock price repository that returns canned appraisal data.
final class MockPriceRepository: PriceRepositoryProtocol {
    var priceData: PriceData
    var error: Error?

    private(set) var fetchedResults: [ScanResult] = []
    private(set) var didClearCache = false

    init(priceData: PriceData = MockDomainFactory.priceData(), error: Error? = nil) {
        self.priceData = priceData
        self.error = error
    }

    func fetchPrice(for result: ScanResult) async throws -> PriceData {
        if let error {
            throw error
        }

        fetchedResults.append(result)
        return priceData
    }

    func clearCache() async {
        didClearCache = true
    }
}
