import SwiftUI

#if canImport(UIKit)
import AVFoundation
import UIKit

// MARK: - CameraPreviewView

struct CameraPreviewView: UIViewRepresentable {
    let session: AVCaptureSession

    func makeUIView(context: Context) -> PreviewContainerView {
        let view = PreviewContainerView()
        view.previewLayer.videoGravity = .resizeAspectFill
        view.previewLayer.session = session
        return view
    }

    func updateUIView(_ uiView: PreviewContainerView, context: Context) {
        uiView.previewLayer.session = session
    }
}

// MARK: - PreviewContainerView

final class PreviewContainerView: UIView {
    override class var layerClass: AnyClass {
        AVCaptureVideoPreviewLayer.self
    }

    var previewLayer: AVCaptureVideoPreviewLayer {
        guard let layer = layer as? AVCaptureVideoPreviewLayer else {
            return AVCaptureVideoPreviewLayer()
        }

        return layer
    }
}

#else

// MARK: - CameraPreviewView

struct CameraPreviewView: View {
    init(session: Any) {}

    var body: some View {
        Color.clear
    }
}

#endif
