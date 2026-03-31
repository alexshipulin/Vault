import Foundation

// MARK: - AppError

/// Domain-level application error surfaced to the presentation layer.
enum AppError: LocalizedError {
    case networkUnavailable
    case apiError(statusCode: Int, message: String)
    case identificationFailed(reason: String)
    case lowConfidence(confidence: Double)
    case priceDataUnavailable
    case cameraPermissionDenied
    case subscriptionRequired
    case storageError(underlying: Error)
    case unknown(underlying: Error)

    var errorDescription: String? {
        switch self {
        case .networkUnavailable:
            return "No internet connection is available right now."
        case let .apiError(statusCode, message):
            return "The server returned an error (\(statusCode)): \(message)"
        case let .identificationFailed(reason):
            return "We couldn't identify this item. \(reason)"
        case let .lowConfidence(confidence):
            let percent = Int((confidence * 100).rounded())
            return "The scan confidence was too low (\(percent)%)."
        case .priceDataUnavailable:
            return "Price data isn't available for this item yet."
        case .cameraPermissionDenied:
            return "Camera access is turned off for VaultScope."
        case .subscriptionRequired:
            return "A subscription is required to continue this action."
        case .storageError:
            return "We couldn't save or load your collection data."
        case .unknown:
            return "Something went wrong."
        }
    }

    var recoverySuggestion: String? {
        switch self {
        case .networkUnavailable:
            "Check your connection and try again."
        case .apiError:
            "Please wait a moment and try again."
        case .identificationFailed:
            "Retake the photo in better lighting and fill the frame with the item."
        case .lowConfidence:
            "Try scanning again with a clearer, closer image."
        case .priceDataUnavailable:
            "Try again later or save the item without price data for now."
        case .cameraPermissionDenied:
            "Open Settings, allow camera access, then return to VaultScope."
        case .subscriptionRequired:
            "Start a plan or restore your purchases to continue."
        case .storageError:
            "Retry the action. If it keeps happening, restart the app."
        case .unknown:
            "Try again. If the issue continues, restart the app."
        }
    }

    var isRetryable: Bool {
        switch self {
        case .networkUnavailable:
            true
        case let .apiError(statusCode, _):
            statusCode >= 500 || statusCode == 429
        case .identificationFailed:
            true
        case .lowConfidence:
            true
        case .priceDataUnavailable:
            true
        case .cameraPermissionDenied:
            false
        case .subscriptionRequired:
            false
        case .storageError:
            true
        case .unknown:
            true
        }
    }
}
