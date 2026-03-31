import Foundation
import Security

// MARK: - KeychainServiceProtocol

/// Secure storage boundary for VaultScope credentials.
protocol KeychainServiceProtocol: AnyObject {
    func save(_ value: String, for key: KeychainKey) throws
    func load(for key: KeychainKey) throws -> String
    func delete(for key: KeychainKey) throws
}

// MARK: - KeychainKey

/// Keys used to store API credentials in the app keychain group.
enum KeychainKey: String, CaseIterable {
    case openAIKey = "vs.openai.apikey"
    case supabaseAnonKey = "vs.supabase.anonkey"
    case pcgsToken = "vs.pcgs.token"
    case discogsConsumerKey = "vs.discogs.consumerkey"
    case eBayOAuthToken = "vs.ebay.oauthtoken"
}

// MARK: - KeychainService

/// Security-framework-backed keychain service using generic password items.
final class KeychainService: KeychainServiceProtocol {
    private let service: String
    private let accessGroup: String?

    init(
        service: String = Bundle.main.bundleIdentifier ?? "VaultScope",
        accessGroup: String? = nil
    ) {
        self.service = service
        self.accessGroup = accessGroup
    }

    func save(_ value: String, for key: KeychainKey) throws {
        let data = Data(value.utf8)
        var query = baseQuery(for: key)

        SecItemDelete(query as CFDictionary)

        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock

        let status = SecItemAdd(query as CFDictionary, nil)

        guard status == errSecSuccess else {
            throw KeychainError.unhandledStatus(status)
        }
    }

    func load(for key: KeychainKey) throws -> String {
        var query = baseQuery(for: key)
        query[kSecReturnData as String] = kCFBooleanTrue
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)

        guard status != errSecItemNotFound else {
            throw KeychainError.itemNotFound(key.rawValue)
        }

        guard status == errSecSuccess else {
            throw KeychainError.unhandledStatus(status)
        }

        guard
            let data = item as? Data,
            let value = String(data: data, encoding: .utf8)
        else {
            throw KeychainError.invalidValue
        }

        return value
    }

    func delete(for key: KeychainKey) throws {
        let status = SecItemDelete(baseQuery(for: key) as CFDictionary)

        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.unhandledStatus(status)
        }
    }

    private func baseQuery(for key: KeychainKey) -> [String: Any] {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key.rawValue
        ]

        if let accessGroup {
            query[kSecAttrAccessGroup as String] = accessGroup
        }

        return query
    }
}

// MARK: - MockKeychainService

/// In-memory keychain implementation for previews and tests.
final class MockKeychainService: KeychainServiceProtocol {
    private var storage: [KeychainKey: String]

    init(storage: [KeychainKey: String] = [:]) {
        self.storage = storage
    }

    func save(_ value: String, for key: KeychainKey) throws {
        storage[key] = value
    }

    func load(for key: KeychainKey) throws -> String {
        guard let value = storage[key] else {
            throw KeychainError.itemNotFound(key.rawValue)
        }

        return value
    }

    func delete(for key: KeychainKey) throws {
        storage.removeValue(forKey: key)
    }
}

// MARK: - KeychainError

private enum KeychainError: LocalizedError {
    case itemNotFound(String)
    case invalidValue
    case unhandledStatus(OSStatus)

    var errorDescription: String? {
        switch self {
        case let .itemNotFound(key):
            return "No value found for \(key)."
        case .invalidValue:
            return "Stored keychain data could not be decoded."
        case let .unhandledStatus(status):
            return "Keychain request failed with status \(status)."
        }
    }
}
