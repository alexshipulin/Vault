import Foundation

// MARK: - MockAIChatService

/// Mock streaming chat service that emits canned assistant chunks.
final class MockAIChatService: AIChatServiceProtocol {
    var chunks: [String]
    var error: Error?

    private(set) var lastMessage: String?
    private(set) var lastContext: ScanResult?
    private(set) var lastHistory: [ChatMessage] = []

    init(chunks: [String] = ["This is a key-date Lincoln cent."], error: Error? = nil) {
        self.chunks = chunks
        self.error = error
    }

    func chat(
        message: String,
        context: ScanResult,
        history: [ChatMessage]
    ) -> AsyncThrowingStream<String, Error> {
        lastMessage = message
        lastContext = context
        lastHistory = history

        let chunks = self.chunks
        let error = self.error

        return AsyncThrowingStream { continuation in
            Task {
                if let error {
                    continuation.finish(throwing: error)
                    return
                }

                for chunk in chunks {
                    continuation.yield(chunk)
                }

                continuation.finish()
            }
        }
    }
}
