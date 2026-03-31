import Foundation
import Observation

// MARK: - ScanRootViewModel

@MainActor
@Observable
final class ScanRootViewModel {
    let supportedCategories: [CollectibleCategory] = CollectibleCategory.allCases
}
