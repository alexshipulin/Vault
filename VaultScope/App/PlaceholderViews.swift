import SwiftUI

// MARK: - OnboardingCoordinatorView

struct OnboardingCoordinatorView: View {
    static let lastStepIndex = OnboardingStep.allCases.count - 1

    @AppStorage("hasCompletedOnboarding") private var hasCompletedOnboarding = false
    @AppStorage("onboardingStep") private var onboardingStep = 0

    private var currentStep: OnboardingStep {
        OnboardingStep(rawValue: onboardingStep.clamped(to: 0...Self.lastStepIndex)) ?? .welcome
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Spacer()

                Image(systemName: currentStep.systemImage)
                    .font(.system(size: 52, weight: .semibold))
                    .foregroundStyle(VaultColor.foreground)

                VStack(spacing: 12) {
                    Text(localized(currentStep.titleKey))
                        .font(.largeTitle.bold())
                        .multilineTextAlignment(.center)

                    Text(localized(currentStep.messageKey))
                        .font(.body)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }

                Text(stepText)
                    .font(.footnote)
                    .foregroundStyle(.secondary)

                Spacer()

                HStack {
                    if onboardingStep > 0 {
                        Button(localized("app.onboarding.back")) {
                            onboardingStep -= 1
                        }
                        .buttonStyle(VaultScopeSecondaryButtonStyle())
                    }

                    Spacer()

                    Button(primaryButtonTitle) {
                        advance()
                    }
                    .buttonStyle(VaultScopePrimaryButtonStyle())
                }
            }
            .padding(24)
            .background(VaultColor.background.ignoresSafeArea())
            .onAppear {
                onboardingStep = onboardingStep.clamped(to: 0...Self.lastStepIndex)
            }
        }
    }

    private var primaryButtonTitle: String {
        if onboardingStep >= Self.lastStepIndex {
            return localized("app.onboarding.get_started")
        }

        return localized("app.onboarding.continue")
    }

    private var stepText: String {
        String(
            format: NSLocalizedString("app.onboarding.step_format", comment: ""),
            onboardingStep + 1,
            Self.lastStepIndex + 1
        )
    }

    private func advance() {
        if onboardingStep < Self.lastStepIndex {
            onboardingStep += 1
            return
        }

        hasCompletedOnboarding = true
        onboardingStep = 0
    }
}

// MARK: - ScannerView

struct ScannerView: View {
    var body: some View {
        ComingSoonView(
            titleKey: "app.scanner.placeholder.title",
            messageKey: "app.scanner.placeholder.message"
        )
    }
}

// MARK: - CollectionView

struct CollectionView: View {
    var body: some View {
        ComingSoonView(
            titleKey: "app.collection.placeholder.title",
            messageKey: "app.collection.placeholder.message"
        )
    }
}

// MARK: - PortfolioDashboardView

struct PortfolioDashboardView: View {
    var body: some View {
        ComingSoonView(
            titleKey: "app.portfolio.placeholder.title",
            messageKey: "app.portfolio.placeholder.message"
        )
    }
}

// MARK: - SettingsView

struct SettingsView: View {
    var body: some View {
        ComingSoonView(
            titleKey: "app.settings.placeholder.title",
            messageKey: "app.settings.placeholder.message"
        )
    }
}

// MARK: - TrialBannerView

struct TrialBannerView: View {
    let daysRemaining: Int

    var body: some View {
        Text(
            String(
                format: NSLocalizedString("app.trial.banner", comment: ""),
                daysRemaining
            )
        )
        .font(.footnote.weight(.semibold))
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(VaultColor.background)
        .overlay(Rectangle().stroke(VaultColor.borderDefault, lineWidth: VaultBorder.hairline))
        .padding(.bottom, 12)
    }
}

// MARK: - ComingSoonView

private struct ComingSoonView: View {
    let titleKey: String
    let messageKey: String

    var body: some View {
        VStack(spacing: 12) {
            Text(localized(titleKey))
                .font(.title.bold())

            Text(localized(messageKey))
                .font(.body)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(24)
    }
}

// MARK: - Localization

private func localized(_ key: String) -> String {
    NSLocalizedString(key, comment: "")
}

private extension Comparable {
    func clamped(to range: ClosedRange<Self>) -> Self {
        min(max(self, range.lowerBound), range.upperBound)
    }
}

// MARK: - OnboardingStep

private enum OnboardingStep: Int, CaseIterable {
    case welcome
    case permissions

    var titleKey: String {
        switch self {
        case .welcome:
            "app.onboarding.welcome.title"
        case .permissions:
            "app.onboarding.permissions.title"
        }
    }

    var messageKey: String {
        switch self {
        case .welcome:
            "app.onboarding.welcome.message"
        case .permissions:
            "app.onboarding.permissions.message"
        }
    }

    var systemImage: String {
        switch self {
        case .welcome:
            "sparkles.rectangle.stack"
        case .permissions:
            "camera.viewfinder"
        }
    }
}
