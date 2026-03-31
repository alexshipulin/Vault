import Foundation

// MARK: - ItemChatSessionStoring

protocol ItemChatSessionStoring {
    func messages(for itemID: UUID) async -> [ChatMessage]
    func save(messages: [ChatMessage], for itemID: UUID) async
}

// MARK: - InMemoryItemChatSessionStore

actor InMemoryItemChatSessionStore: ItemChatSessionStoring {
    private var storage: [UUID: [ChatMessage]] = [:]

    func messages(for itemID: UUID) async -> [ChatMessage] {
        storage[itemID] ?? []
    }

    func save(messages: [ChatMessage], for itemID: UUID) async {
        storage[itemID] = messages
    }
}

// MARK: - FileBackedItemChatSessionStore

actor FileBackedItemChatSessionStore: ItemChatSessionStoring {
    private let storageURL: URL
    private let fileManager: FileManager
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    private var storage: [String: [ChatMessage]]?

    init(
        storageURL: URL = VaultLocalStorage.chatSessionsURL(),
        fileManager: FileManager = .default
    ) {
        self.storageURL = storageURL
        self.fileManager = fileManager

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        self.encoder = encoder

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        self.decoder = decoder
    }

    func messages(for itemID: UUID) async -> [ChatMessage] {
        do {
            try loadIfNeeded()
            return storage?[itemID.uuidString] ?? []
        } catch {
            return []
        }
    }

    func save(messages: [ChatMessage], for itemID: UUID) async {
        do {
            try loadIfNeeded()
            var currentStorage = storage ?? [:]
            currentStorage[itemID.uuidString] = messages
            storage = currentStorage
            try persist()
        } catch {
            return
        }
    }
}

// MARK: - Persistence

private extension FileBackedItemChatSessionStore {
    func loadIfNeeded() throws {
        guard storage == nil else {
            return
        }

        guard fileManager.fileExists(atPath: storageURL.path) else {
            storage = [:]
            return
        }

        let data = try Data(contentsOf: storageURL)
        storage = try decoder.decode([String: [ChatMessage]].self, from: data)
    }

    func persist() throws {
        let data = try encoder.encode(storage ?? [:])
        try data.write(to: storageURL, options: [.atomic])
    }
}
