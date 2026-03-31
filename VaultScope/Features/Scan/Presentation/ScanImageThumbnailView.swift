import SwiftUI

#if canImport(UIKit)
import UIKit

// MARK: - ScanImageThumbnailView

struct ScanImageThumbnailView: View {
    let image: ScanImage

    var body: some View {
        if let uiImage = UIImage(data: image.data) {
            Image(uiImage: uiImage)
                .resizable()
                .scaledToFill()
        } else {
            placeholder
        }
    }

    private var placeholder: some View {
        Rectangle()
            .fill(VaultColor.surface)
            .overlay(
                Text(vsLocalized("feature.processing.thumbnail.unavailable"))
                    .font(VaultTypography.micro)
                    .foregroundStyle(VaultColor.foregroundSubtle)
            )
    }
}

#else

// MARK: - ScanImageThumbnailView

struct ScanImageThumbnailView: View {
    let image: ScanImage

    var body: some View {
        Rectangle()
            .fill(VaultColor.surface)
            .overlay(
                Text(vsLocalized("feature.processing.thumbnail.unavailable"))
                    .font(VaultTypography.micro)
                    .foregroundStyle(VaultColor.foregroundSubtle)
            )
    }
}

#endif
