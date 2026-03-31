import Foundation

// MARK: - SubscriptionServiceProtocol

/// Boundary for subscription purchase state and paywall actions.
protocol SubscriptionServiceProtocol: AnyObject {
    var isSubscribed: Bool { get }
    var trialDaysRemaining: Int? { get }
    var scanCountToday: Int { get }

    func purchase(_ plan: SubscriptionPlan) async throws
    func restorePurchases() async throws
    func incrementScanCount()
}

// MARK: - SubscriptionPlan

/// Product plans offered by VaultScope.
enum SubscriptionPlan: String, CaseIterable, Sendable {
    case weekly
    case monthly
    case annual
    case lifetime

    var price: String {
        switch self {
        case .weekly:
            "$5.99/week"
        case .monthly:
            "$14.99/month"
        case .annual:
            "$89.99/year"
        case .lifetime:
            "$249.99 once"
        }
    }

    var appleProductId: String {
        switch self {
        case .weekly:
            "com.vaultscope.subscription.weekly"
        case .monthly:
            "com.vaultscope.subscription.monthly"
        case .annual:
            "com.vaultscope.subscription.annual"
        case .lifetime:
            "com.vaultscope.subscription.lifetime"
        }
    }

    var isRecommended: Bool {
        self == .weekly
    }
}
