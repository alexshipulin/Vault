import Foundation

// MARK: - VaultLocalStorage

enum VaultLocalStorage {
    static func collectionURL(
        fileManager: FileManager = .default,
        baseDirectory: URL? = nil
    ) -> URL {
        directoryURL(fileManager: fileManager, baseDirectory: baseDirectory)
            .appendingPathComponent("collection.json")
    }

    static func chatSessionsURL(
        fileManager: FileManager = .default,
        baseDirectory: URL? = nil
    ) -> URL {
        directoryURL(fileManager: fileManager, baseDirectory: baseDirectory)
            .appendingPathComponent("item-chat-sessions.json")
    }

    static func temporaryScanSessionURL(
        fileManager: FileManager = .default,
        baseDirectory: URL? = nil
    ) -> URL {
        directoryURL(fileManager: fileManager, baseDirectory: baseDirectory)
            .appendingPathComponent("temporary-scan-session.json")
    }

    static func resetStore(
        fileManager: FileManager = .default,
        baseDirectory: URL? = nil
    ) {
        let directory = directoryURL(fileManager: fileManager, baseDirectory: baseDirectory)

        if fileManager.fileExists(atPath: directory.path) {
            try? fileManager.removeItem(at: directory)
        }
    }
}

// MARK: - Helpers

private extension VaultLocalStorage {
    static func directoryURL(fileManager: FileManager, baseDirectory: URL?) -> URL {
        let resolvedBaseDirectory =
            baseDirectory ??
            fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first ??
            fileManager.urls(for: .documentDirectory, in: .userDomainMask).first ??
            URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)

        let directory = resolvedBaseDirectory.appendingPathComponent("VaultScopeLocalStore", isDirectory: true)

        if fileManager.fileExists(atPath: directory.path) == false {
            try? fileManager.createDirectory(
                at: directory,
                withIntermediateDirectories: true,
                attributes: nil
            )
        }

        return directory
    }
}
