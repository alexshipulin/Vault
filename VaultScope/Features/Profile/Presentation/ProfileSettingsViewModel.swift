import Foundation
import Observation

// MARK: - ProfileSettingsViewModel

@MainActor
@Observable
final class ProfileSettingsViewModel {
    private let subscriptionService: any SubscriptionServiceProtocol
    private let collectionRepository: CollectionRepositoryProtocol
    private let userPreferencesStore: any VaultUserPreferencesStoring
    private let profileDataExporter: any ProfileDataExporting

    private(set) var preferences: VaultUserPreferences
    private(set) var scansThisMonthCount = 0
    private(set) var isLoading = false
    private(set) var hasAttemptedLoad = false
    private(set) var isExporting = false

    let userName = "Vault Collector"

    init(
        subscriptionService: any SubscriptionServiceProtocol,
        collectionRepository: CollectionRepositoryProtocol,
        userPreferencesStore: any VaultUserPreferencesStoring,
        profileDataExporter: any ProfileDataExporting
    ) {
        self.subscriptionService = subscriptionService
        self.collectionRepository = collectionRepository
        self.userPreferencesStore = userPreferencesStore
        self.profileDataExporter = profileDataExporter
        self.preferences = userPreferencesStore.loadPreferences()
    }

    var avatarText: String {
        let parts = userName.split(separator: " ")
        let letters = parts.prefix(2).compactMap { $0.first }
        return letters.isEmpty ? "VS" : String(letters).uppercased()
    }

    var planLabelText: String {
        if subscriptionService.isSubscribed {
            return vsLocalized("feature.profile.plan.premium")
        }

        if subscriptionService.trialDaysRemaining != nil {
            return vsLocalized("feature.profile.plan.trial")
        }

        return vsLocalized("feature.profile.plan.free")
    }

    var subscriptionStatusText: String {
        if subscriptionService.isSubscribed {
            return vsLocalized("feature.profile.status.active")
        }

        if let trialDaysRemaining = subscriptionService.trialDaysRemaining {
            return String(
                format: NSLocalizedString("feature.profile.status.trial", comment: ""),
                trialDaysRemaining
            )
        }

        return vsLocalized("feature.profile.status.free")
    }

    var scansThisMonthText: String {
        String(
            format: NSLocalizedString("feature.profile.scans_this_month.value", comment: ""),
            scansThisMonthCount
        )
    }

    var categoriesSummaryText: String {
        let categories = preferences.categoriesOfInterest

        if categories.count == CollectibleCategory.allCases.count {
            return vsLocalized("feature.profile.preferences.categories.all")
        }

        if categories.isEmpty {
            return vsLocalized("feature.profile.preferences.categories.none")
        }

        return categories.map(\.displayName).joined(separator: ", ")
    }

    var currencySummaryText: String {
        preferences.preferredCurrency.displayName
    }

    var notificationsSummaryText: String {
        preferences.notificationsEnabled
            ? vsLocalized("feature.profile.preferences.notifications.on")
            : vsLocalized("feature.profile.preferences.notifications.off")
    }

    func loadIfNeeded() async {
        guard hasAttemptedLoad == false, isLoading == false else {
            return
        }

        await refresh()
    }

    func refresh() async {
        guard isLoading == false else {
            return
        }

        isLoading = true
        hasAttemptedLoad = true
        defer { isLoading = false }

        preferences = userPreferencesStore.loadPreferences()

        do {
            let items = try await collectionRepository.fetchAll()
            scansThisMonthCount = items.filter { Self.calendar.isDate($0.addedAt, equalTo: Date(), toGranularity: .month) }.count
        } catch {
            scansThisMonthCount = 0
        }
    }

    func toggleCategory(_ category: CollectibleCategory) {
        var updated = preferences.categoriesOfInterest

        if let index = updated.firstIndex(of: category) {
            updated.remove(at: index)
        } else {
            updated.append(category)
        }

        preferences.categoriesOfInterest = updated.sorted {
            $0.displayName < $1.displayName
        }
        persistPreferences()
    }

    func updateCurrency(_ currency: PreferredCurrency) {
        guard preferences.preferredCurrency != currency else {
            return
        }

        preferences.preferredCurrency = currency
        persistPreferences()
    }

    func toggleNotifications() {
        preferences.notificationsEnabled.toggle()
        persistPreferences()
    }

    func exportData() async -> String? {
        guard isExporting == false else {
            return nil
        }

        isExporting = true
        defer { isExporting = false }

        return try? await profileDataExporter.exportJSON(
            userName: userName,
            planLabel: planLabelText,
            preferences: preferences
        )
    }

    var signOutMessage: String {
        vsLocalized("feature.profile.sign_out.placeholder")
    }

    private func persistPreferences() {
        userPreferencesStore.savePreferences(preferences)
    }
}

// MARK: - Calendar

private extension ProfileSettingsViewModel {
    static let calendar = Calendar.current
}
