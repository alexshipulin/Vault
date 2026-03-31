import Foundation
import Observation

// MARK: - SubscriptionStore

@MainActor
@Observable
final class SubscriptionStore {
    private let service: any SubscriptionServiceProtocol

    private(set) var isSubscribed: Bool
    private(set) var trialDaysRemaining: Int?
    private(set) var scanCountToday: Int

    init(service: any SubscriptionServiceProtocol) {
        self.service = service
        self.isSubscribed = service.isSubscribed
        self.trialDaysRemaining = service.trialDaysRemaining
        self.scanCountToday = service.scanCountToday
    }

    func purchase(_ plan: SubscriptionPlan) async throws {
        try await service.purchase(plan)
        refresh()
    }

    func restorePurchases() async throws {
        try await service.restorePurchases()
        refresh()
    }

    func incrementScanCount() {
        service.incrementScanCount()
        refresh()
    }

    func refresh() {
        isSubscribed = service.isSubscribed
        trialDaysRemaining = service.trialDaysRemaining
        scanCountToday = service.scanCountToday
    }
}

// MARK: - LiveCameraService

final class LiveCameraService: CameraServiceProtocol {
    func requestPermission() async -> Bool {
        true
    }

    func startSession() async throws {}

    func stopSession() {}

    func capturePhoto() async throws -> ScanImage {
        ScanImage(data: Data())
    }
}

// MARK: - LiveVisionPreprocessor

final class LiveVisionPreprocessor: VisionPreprocessorProtocol {
    func process(_ image: ScanImage, category: CollectibleCategory?) async -> VisionResult {
        VisionResult(croppedImage: image)
    }
}

// MARK: - LiveAIService

final class LiveAIService: AIServiceProtocol {
    private let apiClient: APIClientProtocol

    init(apiClient: APIClientProtocol) {
        self.apiClient = apiClient
    }

    func identify(
        images: [ScanImage],
        visionHint: String,
        category: CollectibleCategory?,
        mode: ScanMode
    ) async throws -> ScanResult {
        _ = apiClient
        _ = images
        _ = visionHint

        let template = MockDomainFactory.scanResult()
        let resolvedCategory = category ?? template.category

        return ScanResult(
            id: template.id,
            category: resolvedCategory,
            name: template.name,
            year: template.year,
            origin: template.origin,
            condition: template.condition,
            conditionRangeLow: template.conditionRangeLow,
            conditionRangeHigh: template.conditionRangeHigh,
            historySummary: template.historySummary,
            confidence: template.confidence,
            priceData: nil,
            rawAIResponse: template.rawAIResponse,
            scannedAt: template.scannedAt,
            inputImageHashes: template.inputImageHashes
        )
    }
}

// MARK: - LiveAIChatService

final class LiveAIChatService: AIChatServiceProtocol {
    private let apiClient: APIClientProtocol

    init(apiClient: APIClientProtocol) {
        self.apiClient = apiClient
    }

    func chat(
        message: String,
        context: ScanResult,
        history: [ChatMessage]
    ) -> AsyncThrowingStream<String, Error> {
        _ = apiClient
        _ = message
        _ = context
        _ = history

        return AsyncThrowingStream { continuation in
            continuation.finish()
        }
    }
}

// MARK: - InMemoryCollectionRepository

final class InMemoryCollectionRepository: CollectionRepositoryProtocol {
    private var items: [CollectibleItem] = []

    func fetchAll() async throws -> [CollectibleItem] {
        items
    }

    func save(_ item: CollectibleItem) async throws {
        if let index = items.firstIndex(where: { $0.id == item.id }) {
            items[index] = item
        } else {
            items.append(item)
        }
    }

    func update(_ item: CollectibleItem) async throws {
        if let index = items.firstIndex(where: { $0.id == item.id }) {
            items[index] = item
        } else {
            items.append(item)
        }
    }

    func delete(_ item: CollectibleItem) async throws {
        items.removeAll { $0.id == item.id }
    }

    func search(query: String, category: CollectibleCategory?) async throws -> [CollectibleItem] {
        let normalizedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()

        return items.filter { item in
            let matchesCategory = category.map { item.categoryEnum == $0 } ?? true

            if normalizedQuery.isEmpty {
                return matchesCategory
            }

            let matchesQuery =
                item.name.lowercased().contains(normalizedQuery) ||
                item.notes.lowercased().contains(normalizedQuery) ||
                (item.origin?.lowercased().contains(normalizedQuery) ?? false)

            return matchesCategory && matchesQuery
        }
    }

    func totalValue() async -> Decimal {
        items.reduce(.zero) { partialResult, item in
            partialResult + decimalValue(from: item.priceMid ?? item.priceHigh ?? item.priceLow)
        }
    }

    func valueHistory(days: Int) async -> [(Date, Decimal)] {
        let cutoff = Calendar.current.date(byAdding: .day, value: -days, to: Date()) ?? .distantPast
        let sortedItems = items
            .filter { $0.addedAt >= cutoff }
            .sorted { $0.addedAt < $1.addedAt }

        var runningTotal = Decimal.zero

        return sortedItems.map { item in
            runningTotal += decimalValue(from: item.priceMid ?? item.priceHigh ?? item.priceLow)
            return (item.addedAt, runningTotal)
        }
    }

    private func decimalValue(from amount: Double?) -> Decimal {
        guard let amount else {
            return .zero
        }

        return Decimal(string: String(amount)) ?? Decimal(amount)
    }
}

// MARK: - LivePriceRepository

final class LivePriceRepository: PriceRepositoryProtocol {
    private let apiClient: APIClientProtocol

    init(apiClient: APIClientProtocol) {
        self.apiClient = apiClient
    }

    func fetchPrice(for result: ScanResult) async throws -> PriceData {
        _ = apiClient
        _ = result
        return MockDomainFactory.priceData()
    }

    func clearCache() async {}
}

// MARK: - LiveSubscriptionService

final class LiveSubscriptionService: SubscriptionServiceProtocol {
    private(set) var isSubscribed = false
    private(set) var trialDaysRemaining: Int? = 7
    private(set) var scanCountToday = 0

    func purchase(_ plan: SubscriptionPlan) async throws {
        _ = plan
        isSubscribed = true
        trialDaysRemaining = nil
    }

    func restorePurchases() async throws {
        isSubscribed = true
        trialDaysRemaining = nil
    }

    func incrementScanCount() {
        scanCountToday += 1
    }
}
