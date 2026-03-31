import Foundation

// MARK: - VaultLocalStorage

enum VaultLocalStorage {
    static func collectionURL(fileManager: FileManager = .default) -> URL {
        directoryURL(fileManager: fileManager)
            .appendingPathComponent("collection.json")
    }

    static func chatSessionsURL(fileManager: FileManager = .default) -> URL {
        directoryURL(fileManager: fileManager)
            .appendingPathComponent("item-chat-sessions.json")
    }

    static func temporaryScanSessionURL(fileManager: FileManager = .default) -> URL {
        directoryURL(fileManager: fileManager)
            .appendingPathComponent("temporary-scan-session.json")
    }
}

// MARK: - Helpers

private extension VaultLocalStorage {
    static func directoryURL(fileManager: FileManager) -> URL {
        let baseDirectory =
            fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first ??
            fileManager.urls(for: .documentDirectory, in: .userDomainMask).first ??
            URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)

        let directory = baseDirectory.appendingPathComponent("VaultScopeLocalStore", isDirectory: true)

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
