import Foundation

// MARK: - TemporaryScanSessionStoring

protocol TemporaryScanSessionStoring {
    func load() async -> TemporaryScanSession?
    func save(_ session: TemporaryScanSession) async
    func clear() async
}

// MARK: - InMemoryTemporaryScanSessionStore

actor InMemoryTemporaryScanSessionStore: TemporaryScanSessionStoring {
    private var session: TemporaryScanSession?

    func load() async -> TemporaryScanSession? {
        session
    }

    func save(_ session: TemporaryScanSession) async {
        self.session = session
    }

    func clear() async {
        session = nil
    }
}

// MARK: - FileBackedTemporaryScanSessionStore

actor FileBackedTemporaryScanSessionStore: TemporaryScanSessionStoring {
    private let storageURL: URL
    private let fileManager: FileManager
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    private var session: TemporaryScanSession?
    private var hasLoaded = false

    init(
        storageURL: URL = VaultLocalStorage.temporaryScanSessionURL(),
        fileManager: FileManager = .default
    ) {
        self.storageURL = storageURL
        self.fileManager = fileManager

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        self.encoder = encoder

        let decoder = JSONDecoder()
        self.decoder = decoder
    }

    func load() async -> TemporaryScanSession? {
        do {
            try loadIfNeeded()
            return session
        } catch {
            return nil
        }
    }

    func save(_ session: TemporaryScanSession) async {
        do {
            try loadIfNeeded()
            self.session = session
            try persist()
        } catch {
            return
        }
    }

    func clear() async {
        do {
            session = nil
            hasLoaded = true

            if fileManager.fileExists(atPath: storageURL.path) {
                try fileManager.removeItem(at: storageURL)
            }
        } catch {
            return
        }
    }
}

// MARK: - Persistence

private extension FileBackedTemporaryScanSessionStore {
    func loadIfNeeded() throws {
        guard hasLoaded == false else {
            return
        }

        hasLoaded = true

        guard fileManager.fileExists(atPath: storageURL.path) else {
            session = nil
            return
        }

        let data = try Data(contentsOf: storageURL)
        session = try decoder.decode(TemporaryScanSession.self, from: data)
    }

    func persist() throws {
        let data = try encoder.encode(session)
        try data.write(to: storageURL, options: [.atomic])
    }
}
