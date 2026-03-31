import Foundation

// MARK: - PriceRepositoryProtocol

/// Repository boundary for loading and caching appraisal price data.
protocol PriceRepositoryProtocol: AnyObject {
    func fetchPrice(for result: ScanResult) async throws -> PriceData
    func clearCache() async
}
