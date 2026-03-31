import SwiftUI

// MARK: - ProfileSettingsSheet

private enum ProfileSettingsSheet: String, Identifiable {
    case categories
    case currency

    var id: String {
        rawValue
    }
}

// MARK: - ProfileSettingsView

struct ProfileSettingsView: View {
    @Environment(AppCoordinator.self) private var coordinator
    @State private var viewModel: ProfileSettingsViewModel
    @State private var activeSheet: ProfileSettingsSheet?
    @State private var exportPayload: String?
    @State private var isSignOutAlertPresented = false

    init(viewModel: ProfileSettingsViewModel) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        let resolvedViewModel = viewModel

        VaultScopeScreen(
            titleKey: "feature.profile.title",
            screenAccessibilityIdentifier: "profile.screen",
            titleAccessibilityIdentifier: "profile.title"
        ) {
            userPanel(resolvedViewModel)
            subscriptionPanel(resolvedViewModel)
            preferencesPanel(resolvedViewModel)
            accountPanel(resolvedViewModel)
        }
        .task {
            await resolvedViewModel.loadIfNeeded()
        }
        .onChange(of: coordinator.collectionRefreshID) { _, _ in
            Task {
                await resolvedViewModel.refresh()
            }
        }
        .sheet(item: $activeSheet) { sheet in
            switch sheet {
            case .categories:
                categoriesSheet(resolvedViewModel)
                    .presentationDetents([.medium, .large])
            case .currency:
                currencySheet(resolvedViewModel)
                    .presentationDetents([.medium])
            }
        }
        .sheet(
            isPresented: Binding(
                get: { exportPayload != nil },
                set: { isPresented in
                    if isPresented == false {
                        exportPayload = nil
                    }
                }
            )
        ) {
            if let exportPayload {
                VaultActivitySheet(activityItems: [exportPayload])
            }
        }
        .alert(
            vsLocalized("feature.profile.sign_out.title"),
            isPresented: $isSignOutAlertPresented
        ) {
            Button(vsLocalized("feature.profile.sign_out.dismiss"), role: .cancel) {}
        } message: {
            Text(resolvedViewModel.signOutMessage)
        }
    }

    private func userPanel(_ viewModel: ProfileSettingsViewModel) -> some View {
        VaultPanel {
            HStack(alignment: .center, spacing: VaultSpacing.md) {
                Rectangle()
                    .stroke(VaultColor.borderDefault, lineWidth: VaultBorder.hairline)
                    .frame(width: 64, height: 64)
                    .overlay(
                        Text(viewModel.avatarText)
                            .font(VaultTypography.rowTitle)
                            .foregroundStyle(VaultColor.foreground)
                    )

                VStack(alignment: .leading, spacing: VaultSpacing.xxs) {
                    Text(viewModel.userName)
                        .font(VaultTypography.screenTitle)
                        .foregroundStyle(VaultColor.foreground)

                    Text(viewModel.planLabelText)
                        .font(VaultTypography.micro)
                        .foregroundStyle(VaultColor.foregroundSubtle)
                        .textCase(.uppercase)
                        .tracking(0.8)
                }
            }
        }
    }

    private func subscriptionPanel(_ viewModel: ProfileSettingsViewModel) -> some View {
        VaultPanel {
            VaultScopeSectionTitle(key: "feature.profile.subscription.section")

            VaultSettingsRow(
                title: vsLocalized("feature.profile.subscription.plan"),
                detail: viewModel.subscriptionStatusText,
                systemImage: "creditcard",
                showsDisclosure: false
            )
            .vaultAccessibilityID("profile.planRow")

            VaultDivider()

            VaultSettingsRow(
                title: vsLocalized("feature.profile.subscription.scans"),
                detail: viewModel.scansThisMonthText,
                systemImage: "barcode.viewfinder",
                showsDisclosure: false
            )
            .vaultAccessibilityID("profile.scansThisMonthRow")
        }
    }

    private func preferencesPanel(_ viewModel: ProfileSettingsViewModel) -> some View {
        VaultPanel {
            VaultScopeSectionTitle(key: "feature.profile.preferences.section")

            Button {
                activeSheet = .categories
            } label: {
                VaultSettingsRow(
                    title: vsLocalized("feature.profile.preferences.categories"),
                    detail: viewModel.categoriesSummaryText,
                    systemImage: "square.grid.2x2",
                    showsDisclosure: true
                )
            }
            .buttonStyle(.plain)

            VaultDivider()

            Button {
                activeSheet = .currency
            } label: {
                VaultSettingsRow(
                    title: vsLocalized("feature.profile.preferences.currency"),
                    detail: viewModel.currencySummaryText,
                    systemImage: "dollarsign.circle",
                    showsDisclosure: true
                )
            }
            .buttonStyle(.plain)
            .vaultAccessibilityID("profile.currencyRow")

            VaultDivider()

            Button {
                viewModel.toggleNotifications()
            } label: {
                VaultSettingsRow(
                    title: vsLocalized("feature.profile.preferences.notifications"),
                    detail: viewModel.notificationsSummaryText,
                    systemImage: "bell",
                    showsDisclosure: false
                )
            }
            .buttonStyle(.plain)
            .vaultAccessibilityID("profile.notificationsRow")
        }
    }

    private func accountPanel(_ viewModel: ProfileSettingsViewModel) -> some View {
        VaultPanel {
            VaultScopeSectionTitle(key: "feature.profile.account.section")

            Button {
                Task {
                    exportPayload = await viewModel.exportData()
                }
            } label: {
                VaultSettingsRow(
                    title: vsLocalized("feature.profile.account.export"),
                    detail: viewModel.isExporting ? vsLocalized("feature.profile.export.loading") : nil,
                    systemImage: "square.and.arrow.up",
                    showsDisclosure: false
                )
            }
            .buttonStyle(.plain)
            .disabled(viewModel.isExporting)
            .vaultAccessibilityID("profile.exportDataRow")

            VaultDivider()

            Button {
                isSignOutAlertPresented = true
            } label: {
                VaultSettingsRow(
                    title: vsLocalized("feature.profile.account.sign_out"),
                    systemImage: "rectangle.portrait.and.arrow.right",
                    showsDisclosure: false
                )
            }
            .buttonStyle(.plain)
            .vaultAccessibilityID("profile.signOutRow")
        }
    }

    private func categoriesSheet(_ viewModel: ProfileSettingsViewModel) -> some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: VaultSpacing.lg) {
                    VaultScreenHeader(
                        title: vsLocalized("feature.profile.preferences.categories"),
                        subtitle: vsLocalized("feature.profile.preferences.categories.subtitle")
                    )

                    VaultPanel {
                        LazyVGrid(
                            columns: [GridItem(.adaptive(minimum: 140), spacing: VaultSpacing.sm)],
                            alignment: .leading,
                            spacing: VaultSpacing.sm
                        ) {
                            ForEach(CollectibleCategory.allCases) { category in
                                VaultChipButton(
                                    title: category.displayName,
                                    isSelected: viewModel.preferences.categoriesOfInterest.contains(category)
                                ) {
                                    viewModel.toggleCategory(category)
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, VaultSpacing.lg)
                .padding(.top, 20)
                .padding(.bottom, 40)
            }
            .background(VaultColor.background.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(vsLocalized("feature.profile.sheet.done")) {
                        activeSheet = nil
                    }
                    .foregroundStyle(VaultColor.foreground)
                }
            }
            .vaultNavigationChrome()
        }
        .presentationBackground(VaultColor.background)
    }

    private func currencySheet(_ viewModel: ProfileSettingsViewModel) -> some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: VaultSpacing.lg) {
                    VaultScreenHeader(
                        title: vsLocalized("feature.profile.preferences.currency"),
                        subtitle: vsLocalized("feature.profile.preferences.currency.subtitle")
                    )

                    VaultPanel {
                        ForEach(Array(PreferredCurrency.allCases.enumerated()), id: \.element.id) { index, currency in
                            Button {
                                viewModel.updateCurrency(currency)
                                activeSheet = nil
                            } label: {
                                VaultSettingsRow(
                                    title: currency.displayName,
                                    detail: viewModel.preferences.preferredCurrency == currency
                                        ? vsLocalized("feature.profile.preferences.currency.selected")
                                        : nil,
                                    systemImage: "dollarsign.circle",
                                    showsDisclosure: false
                                )
                            }
                            .buttonStyle(.plain)

                            if index < PreferredCurrency.allCases.count - 1 {
                                VaultDivider()
                            }
                        }
                    }
                }
                .padding(.horizontal, VaultSpacing.lg)
                .padding(.top, 20)
                .padding(.bottom, 40)
            }
            .background(VaultColor.background.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(vsLocalized("feature.profile.sheet.done")) {
                        activeSheet = nil
                    }
                    .foregroundStyle(VaultColor.foreground)
                }
            }
            .vaultNavigationChrome()
        }
        .presentationBackground(VaultColor.background)
    }
}
