import Foundation
import SwiftUI

// MARK: - Localization

func vsLocalized(_ key: String) -> String {
    NSLocalizedString(key, comment: "")
}

// MARK: - CollectibleListItem

struct CollectibleListItem: Identifiable, Hashable, Sendable {
    let id: UUID
    let title: String
    let subtitle: String
    let categoryText: String
    let valueText: String
    let timestampText: String
    let noteText: String

    init(
        id: UUID,
        title: String,
        subtitle: String,
        categoryText: String,
        valueText: String,
        timestampText: String,
        noteText: String
    ) {
        self.id = id
        self.title = title
        self.subtitle = subtitle
        self.categoryText = categoryText
        self.valueText = valueText
        self.timestampText = timestampText
        self.noteText = noteText
    }

    init(scanResult: ScanResult) {
        self.init(
            id: scanResult.id,
            title: scanResult.name,
            subtitle: scanResult.origin ?? vsLocalized("feature.shared.unknown_origin"),
            categoryText: scanResult.category.displayName,
            valueText: CurrencyFormatter.string(from: scanResult.priceData?.mid ?? .zero),
            timestampText: DateFormatter.shortDisplay.string(from: scanResult.scannedAt),
            noteText: scanResult.historySummary
        )
    }

    init(item: CollectibleItem) {
        let category = item.categoryEnum?.displayName ?? vsLocalized("feature.shared.unknown_category")
        let value = CurrencyFormatter.string(from: Decimal(string: String(item.priceMid ?? item.priceHigh ?? item.priceLow ?? 0)) ?? .zero)

        self.init(
            id: item.id,
            title: item.name,
            subtitle: item.origin ?? vsLocalized("feature.shared.unknown_origin"),
            categoryText: category,
            valueText: value,
            timestampText: DateFormatter.shortDisplay.string(from: item.updatedAt),
            noteText: item.historySummary
        )
    }

    var thumbnailText: String {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let source = trimmedTitle.isEmpty ? categoryText : trimmedTitle
        return String(source.prefix(2)).uppercased()
    }

    static var placeholder: CollectibleListItem {
        CollectibleListItem(scanResult: MockDomainFactory.scanResult(priceData: MockDomainFactory.priceData()))
    }
}

// MARK: - CurrencyFormatter

enum CurrencyFormatter {
    static func string(from decimal: Decimal, currency: PreferredCurrency? = nil) -> String {
        let resolvedCurrency = currency ?? UserDefaultsVaultUserPreferencesStore.currentCurrency()
        let amount = convertedAmount(fromUSD: decimal, to: resolvedCurrency)
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = resolvedCurrency.code
        formatter.maximumFractionDigits = resolvedCurrency == .jpy ? 0 : 0

        return formatter.string(from: NSDecimalNumber(decimal: amount)) ?? "$0"
    }

    private static func convertedAmount(fromUSD decimal: Decimal, to currency: PreferredCurrency) -> Decimal {
        let source = NSDecimalNumber(decimal: decimal)
        let rate = NSDecimalNumber(decimal: currency.conversionRateFromUSD)
        return source.multiplying(by: rate).decimalValue
    }
}

// MARK: - DateFormatter

private extension DateFormatter {
    static let shortDisplay: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        return formatter
    }()
}

// MARK: - VaultScopeScreen

struct VaultScopeScreen<Content: View>: View {
    let titleKey: String
    let subtitleKey: String?
    let screenAccessibilityIdentifier: String?
    let titleAccessibilityIdentifier: String?
    let leadingAction: VaultHeaderAction?
    let trailingAction: VaultHeaderAction?
    let content: Content

    init(
        titleKey: String,
        subtitleKey: String? = nil,
        screenAccessibilityIdentifier: String? = nil,
        titleAccessibilityIdentifier: String? = nil,
        leadingAction: VaultHeaderAction? = nil,
        trailingAction: VaultHeaderAction? = nil,
        @ViewBuilder content: () -> Content
    ) {
        self.titleKey = titleKey
        self.subtitleKey = subtitleKey
        self.screenAccessibilityIdentifier = screenAccessibilityIdentifier
        self.titleAccessibilityIdentifier = titleAccessibilityIdentifier
        self.leadingAction = leadingAction
        self.trailingAction = trailingAction
        self.content = content()
    }

    var body: some View {
        ZStack {
            VaultColor.background.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: VaultSpacing.lg) {
                    VaultScreenHeader(
                        title: vsLocalized(titleKey),
                        subtitle: subtitleKey.map(vsLocalized),
                        titleAccessibilityIdentifier: titleAccessibilityIdentifier,
                        leadingAction: leadingAction,
                        trailingAction: trailingAction
                    )

                    content
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, VaultSpacing.lg)
                .padding(.top, 20)
                .padding(.bottom, 40)
            }
        }
        .vaultNavigationChrome()
        .vaultAccessibilityID(screenAccessibilityIdentifier)
    }
}

// MARK: - VaultScopePanel

struct VaultScopePanel<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        VaultPanel {
            content
        }
    }
}

// MARK: - VaultScopeButtonStyles

struct VaultScopePrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        VaultPrimaryCTAButtonStyle().makeBody(configuration: configuration)
    }
}

struct VaultScopeSecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        VaultSecondaryCTAButtonStyle().makeBody(configuration: configuration)
    }
}

// MARK: - VaultScopeSectionTitle

struct VaultScopeSectionTitle: View {
    let key: String

    var body: some View {
        VaultMicroSectionLabel(title: vsLocalized(key))
    }
}

// MARK: - View

extension View {
    @ViewBuilder
    func vaultNavigationChrome() -> some View {
        #if os(iOS)
        self
            .toolbarBackground(VaultColor.background, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
        #else
        self
        #endif
    }

    @ViewBuilder
    func vaultInlineNavigationTitleDisplayMode() -> some View {
        #if os(iOS)
        self.navigationBarTitleDisplayMode(.inline)
        #else
        self
        #endif
    }

    @ViewBuilder
    func vaultAccessibilityID(_ identifier: String?) -> some View {
        if let identifier {
            accessibilityIdentifier(identifier)
        } else {
            self
        }
    }
}
