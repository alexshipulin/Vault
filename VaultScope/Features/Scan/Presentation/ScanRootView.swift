import SwiftUI

// MARK: - ScanRootView

struct ScanRootView: View {
    @Environment(AppCoordinator.self) private var coordinator
    @State private var viewModel: ScanRootViewModel

    init(viewModel: ScanRootViewModel) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        VaultScopeScreen(
            titleKey: "feature.scan.root.title",
            subtitleKey: "feature.scan.root.subtitle"
        ) {
            VaultScopePanel {
                VaultScopeSectionTitle(key: "feature.scan.root.categories")

                VStack(alignment: .leading, spacing: 8) {
                    ForEach(viewModel.supportedCategories, id: \.id) { category in
                        Text(category.displayName)
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(.white)
                    }
                }

                Button(vsLocalized("feature.scan.root.primary_cta")) {
                    coordinator.startScanFlow()
                }
                .buttonStyle(VaultScopePrimaryButtonStyle())
            }
        }
    }
}
