import Foundation

// MARK: - MockSubscriptionService

/// Mock subscription service that simulates paywall state in tests and previews.
final class MockSubscriptionService: SubscriptionServiceProtocol {
    var isSubscribed: Bool
    var trialDaysRemaining: Int?
    var scanCountToday: Int
    var purchaseError: Error?
    var restoreError: Error?

    private(set) var purchasedPlans: [SubscriptionPlan] = []

    init(
        isSubscribed: Bool = false,
        trialDaysRemaining: Int? = 7,
        scanCountToday: Int = 0,
        purchaseError: Error? = nil,
        restoreError: Error? = nil
    ) {
        self.isSubscribed = isSubscribed
        self.trialDaysRemaining = trialDaysRemaining
        self.scanCountToday = scanCountToday
        self.purchaseError = purchaseError
        self.restoreError = restoreError
    }

    func purchase(_ plan: SubscriptionPlan) async throws {
        if let purchaseError {
            throw purchaseError
        }

        purchasedPlans.append(plan)
        isSubscribed = true
        trialDaysRemaining = nil
    }

    func restorePurchases() async throws {
        if let restoreError {
            throw restoreError
        }

        isSubscribed = true
        trialDaysRemaining = nil
    }

    func incrementScanCount() {
        scanCountToday += 1
    }
}
