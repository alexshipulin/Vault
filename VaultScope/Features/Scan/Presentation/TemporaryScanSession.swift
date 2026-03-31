import Foundation

// MARK: - TemporaryScanSession

struct TemporaryScanSession: Identifiable, Codable, Equatable, Sendable {
    let id: UUID
    let mode: VaultScanMode
    let capturedImages: [ScanImage]
    let createdAt: Date

    init(
        id: UUID = UUID(),
        mode: VaultScanMode,
        capturedImages: [ScanImage],
        createdAt: Date = Date()
    ) {
        self.id = id
        self.mode = mode
        self.capturedImages = capturedImages
        self.createdAt = createdAt
    }
}
