import Foundation

// MARK: - AIServiceProtocol

/// Identifies collectibles from one or more processed images.
protocol AIServiceProtocol: AnyObject {
    func identify(
        images: [ScanImage],
        visionHint: String,
        category: CollectibleCategory?,
        mode: ScanMode
    ) async throws -> ScanResult
}

// MARK: - ScanMode

/// Modes supported by the scan flow.
enum ScanMode: Sendable {
    case identify(category: CollectibleCategory)
    case mystery
}

// MARK: - AIChatServiceProtocol

/// Streams chat responses about a previously scanned collectible.
protocol AIChatServiceProtocol: AnyObject {
    func chat(
        message: String,
        context: ScanResult,
        history: [ChatMessage]
    ) -> AsyncThrowingStream<String, Error>
}

// MARK: - ChatMessage

/// A single chat message in the collectible assistant conversation.
struct ChatMessage: Codable, Identifiable, Equatable, Sendable {
    let id: UUID
    let role: ChatRole
    let content: String
    let createdAt: Date
}

// MARK: - ChatRole

/// Roles supported in the collectible assistant transcript.
enum ChatRole: String, Codable, Sendable {
    case user
    case assistant
}
