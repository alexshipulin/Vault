import SwiftUI

#if canImport(UIKit)
import UIKit

// MARK: - VaultActivitySheet

struct VaultActivitySheet: UIViewControllerRepresentable {
    let activityItems: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: activityItems, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

#else

// MARK: - VaultActivitySheet

struct VaultActivitySheet: View {
    let activityItems: [Any]

    var body: some View {
        EmptyView()
    }
}

#endif
