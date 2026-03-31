import Foundation

// MARK: - APIClientProtocol

/// Base HTTP client used by infrastructure services to perform requests and streams.
protocol APIClientProtocol: AnyObject {
    func request<T: Decodable>(_ endpoint: Endpoint) async throws -> T
    func stream(_ endpoint: Endpoint) -> AsyncThrowingStream<Data, Error>
}

// MARK: - Endpoint

/// Describes an HTTP endpoint request.
struct Endpoint {
    let baseURL: URL
    let path: String
    let method: HTTPMethod
    let headers: [String: String]
    let body: Data?
    var queryItems: [URLQueryItem]

    init(
        baseURL: URL,
        path: String,
        method: HTTPMethod,
        headers: [String: String] = [:],
        body: Data? = nil,
        queryItems: [URLQueryItem] = []
    ) {
        self.baseURL = baseURL
        self.path = path
        self.method = method
        self.headers = headers
        self.body = body
        self.queryItems = queryItems
    }

    var url: URL {
        var components = URLComponents(
            url: baseURL.appendingPathComponent(path),
            resolvingAgainstBaseURL: false
        )
        components?.queryItems = queryItems.isEmpty ? nil : queryItems

        return components?.url ?? baseURL.appendingPathComponent(path)
    }
}

// MARK: - HTTPMethod

/// Supported HTTP verbs for VaultScope network calls.
enum HTTPMethod: String {
    case GET
    case POST
    case PUT
    case DELETE
}

// MARK: - URLSessionAPIClient

/// URLSession-backed API client that injects auth headers from Keychain and maps errors to AppError.
final class URLSessionAPIClient: APIClientProtocol {
    private let session: URLSession
    private let keychainService: KeychainServiceProtocol
    private let decoder: JSONDecoder
    private let maxRetries = 3
    private let onAuthenticationFailure: @MainActor () -> Void

    init(
        session: URLSession = .shared,
        keychainService: KeychainServiceProtocol,
        onAuthenticationFailure: @escaping @MainActor () -> Void = {}
    ) {
        self.session = session
        self.keychainService = keychainService
        self.onAuthenticationFailure = onAuthenticationFailure

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        self.decoder = decoder
    }

    func request<T: Decodable>(_ endpoint: Endpoint) async throws -> T {
        let data = try await performDataRequest(for: endpoint, attempt: 0)

        if let rawData = data as? T {
            return rawData
        }

        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw AppError.apiError(statusCode: -1, message: error.localizedDescription)
        }
    }

    func stream(_ endpoint: Endpoint) -> AsyncThrowingStream<Data, Error> {
        AsyncThrowingStream { continuation in
            Task {
                do {
                    let request = try buildRequest(for: endpoint)
                    try await stream(request, attempt: 0, continuation: continuation)
                } catch {
                    continuation.finish(throwing: mapError(error))
                }
            }
        }
    }

    private func performDataRequest(for endpoint: Endpoint, attempt: Int) async throws -> Data {
        let request = try buildRequest(for: endpoint)

        do {
            let (data, response) = try await session.data(for: request)
            return try await handleHTTPResponse(response, data: data, endpoint: endpoint, attempt: attempt)
        } catch {
            throw mapError(error)
        }
    }

    private func stream(
        _ request: URLRequest,
        attempt: Int,
        continuation: AsyncThrowingStream<Data, Error>.Continuation
    ) async throws {
        let (bytes, response) = try await session.bytes(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw AppError.unknown(underlying: URLError(.badServerResponse))
        }

        switch httpResponse.statusCode {
        case 200 ... 299:
            for try await line in bytes.lines {
                guard line.hasPrefix("data:") else {
                    continue
                }

                let payload = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
                guard payload != "[DONE]" else {
                    break
                }

                if let data = payload.data(using: .utf8) {
                    continuation.yield(data)
                }
            }

            continuation.finish()

        case 401:
            await onAuthenticationFailure()
            continuation.finish(
                throwing: AppError.apiError(statusCode: 401, message: "Unauthorized")
            )

        case 429 where attempt < maxRetries:
            try await backoff(for: attempt)
            try await stream(request, attempt: attempt + 1, continuation: continuation)

        default:
            continuation.finish(
                throwing: AppError.apiError(
                    statusCode: httpResponse.statusCode,
                    message: HTTPURLResponse.localizedString(forStatusCode: httpResponse.statusCode)
                )
            )
        }
    }

    private func handleHTTPResponse(
        _ response: URLResponse,
        data: Data,
        endpoint: Endpoint,
        attempt: Int
    ) async throws -> Data {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw AppError.unknown(underlying: URLError(.badServerResponse))
        }

        switch httpResponse.statusCode {
        case 200 ... 299:
            return data

        case 401:
            await onAuthenticationFailure()
            throw AppError.apiError(statusCode: 401, message: responseMessage(from: data))

        case 429 where attempt < maxRetries:
            try await backoff(for: attempt)
            return try await performDataRequest(for: endpoint, attempt: attempt + 1)

        default:
            throw AppError.apiError(
                statusCode: httpResponse.statusCode,
                message: responseMessage(from: data)
            )
        }
    }

    private func buildRequest(for endpoint: Endpoint) throws -> URLRequest {
        var request = URLRequest(url: endpoint.url)
        request.httpMethod = endpoint.method.rawValue
        request.httpBody = endpoint.body

        var headers = endpoint.headers

        if headers["Authorization"] == nil, let authorizationHeader = try authorizationHeader(for: endpoint) {
            headers["Authorization"] = authorizationHeader
        }

        if endpoint.body != nil, headers["Content-Type"] == nil {
            headers["Content-Type"] = "application/json"
        }

        for (key, value) in headers {
            request.setValue(value, forHTTPHeaderField: key)
        }

        return request
    }

    private func authorizationHeader(for endpoint: Endpoint) throws -> String? {
        let host = endpoint.baseURL.host?.lowercased() ?? ""

        if host.contains("openai") {
            return "Bearer \(try keychainService.load(for: .openAIKey))"
        }

        if host.contains("pcgs") {
            return "Bearer \(try keychainService.load(for: .pcgsToken))"
        }

        if host.contains("ebay") {
            return "Bearer \(try keychainService.load(for: .eBayOAuthToken))"
        }

        if host.contains("discogs") {
            return "Discogs key=\(try keychainService.load(for: .discogsConsumerKey))"
        }

        if host.contains("supabase") {
            return "Bearer \(try keychainService.load(for: .supabaseAnonKey))"
        }

        return nil
    }

    private func backoff(for attempt: Int) async throws {
        let delay = UInt64(pow(2.0, Double(attempt)) * 500_000_000)
        try await Task.sleep(nanoseconds: delay)
    }

    private func responseMessage(from data: Data) -> String {
        if let text = String(data: data, encoding: .utf8), text.isEmpty == false {
            return text
        }

        return "Unexpected server response."
    }

    private func mapError(_ error: Error) -> Error {
        if let appError = error as? AppError {
            return appError
        }

        if let urlError = error as? URLError {
            switch urlError.code {
            case .notConnectedToInternet, .networkConnectionLost, .cannotFindHost, .cannotConnectToHost:
                return AppError.networkUnavailable
            default:
                return AppError.unknown(underlying: urlError)
            }
        }

        return AppError.unknown(underlying: error)
    }
}

// MARK: - MockAPIClient

/// In-memory API client used by previews and tests.
final class MockAPIClient: APIClientProtocol {
    var cannedData = Data()
    var streamChunks: [Data] = []
    var error: Error?

    func request<T: Decodable>(_ endpoint: Endpoint) async throws -> T {
        _ = endpoint

        if let error {
            throw error
        }

        if let rawData = cannedData as? T {
            return rawData
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(T.self, from: cannedData)
    }

    func stream(_ endpoint: Endpoint) -> AsyncThrowingStream<Data, Error> {
        _ = endpoint

        let chunks = streamChunks
        let error = error

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
