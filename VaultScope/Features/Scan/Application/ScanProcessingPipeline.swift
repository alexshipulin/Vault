import Foundation

// MARK: - ScanProcessingStageKind

enum ScanProcessingStageKind: String, CaseIterable, Identifiable, Sendable {
    case objectRecognition
    case conditionAssessment
    case priceLookup
    case historicalRecords

    var id: String {
        rawValue
    }

    var titleKey: String {
        switch self {
        case .objectRecognition:
            "feature.processing.stage.object_recognition"
        case .conditionAssessment:
            "feature.processing.stage.condition_assessment"
        case .priceLookup:
            "feature.processing.stage.price_lookup"
        case .historicalRecords:
            "feature.processing.stage.historical_records"
        }
    }
}

// MARK: - ScanProcessingStageStatus

enum ScanProcessingStageStatus: Sendable {
    case pending
    case active
    case complete
}

// MARK: - ScanProcessingStageSnapshot

struct ScanProcessingStageSnapshot: Identifiable, Sendable {
    let kind: ScanProcessingStageKind
    let status: ScanProcessingStageStatus

    var id: ScanProcessingStageKind {
        kind
    }
}

// MARK: - ScanProcessingUpdate

enum ScanProcessingUpdate: Sendable {
    case stageSnapshots([ScanProcessingStageSnapshot])
    case searchingSource(String)
    case completed(ScanResult)
}

// MARK: - ScanProcessingPipelineProtocol

protocol ScanProcessingPipelineProtocol: AnyObject {
    func process(session: TemporaryScanSession) -> AsyncThrowingStream<ScanProcessingUpdate, Error>
}

// MARK: - FakeScanProcessingPipeline

final class FakeScanProcessingPipeline: ScanProcessingPipelineProtocol {
    private let resultFactory: any MockScanResultBuilding
    private let stageDelayNanoseconds: UInt64
    private let interStageDelayNanoseconds: UInt64

    init(
        resultFactory: any MockScanResultBuilding,
        stageDelayNanoseconds: UInt64 = 550_000_000,
        interStageDelayNanoseconds: UInt64 = 250_000_000
    ) {
        self.resultFactory = resultFactory
        self.stageDelayNanoseconds = stageDelayNanoseconds
        self.interStageDelayNanoseconds = interStageDelayNanoseconds
    }

    func process(session: TemporaryScanSession) -> AsyncThrowingStream<ScanProcessingUpdate, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    var snapshots = ScanProcessingStageKind.allCases.map {
                        ScanProcessingStageSnapshot(kind: $0, status: .pending)
                    }

                    continuation.yield(.stageSnapshots(snapshots))

                    let sources = sourceKeys(for: session.mode)
                    continuation.yield(.searchingSource(vsLocalized(sources[0])))

                    for (index, stageKind) in ScanProcessingStageKind.allCases.enumerated() {
                        try Task.checkCancellation()

                        snapshots[index] = ScanProcessingStageSnapshot(kind: stageKind, status: .active)
                        continuation.yield(.stageSnapshots(snapshots))
                        continuation.yield(.searchingSource(vsLocalized(sources[index])))

                        try await Task.sleep(nanoseconds: stageDelayNanoseconds)
                        try Task.checkCancellation()

                        snapshots[index] = ScanProcessingStageSnapshot(kind: stageKind, status: .complete)
                        continuation.yield(.stageSnapshots(snapshots))

                        if index < ScanProcessingStageKind.allCases.count - 1 {
                            try await Task.sleep(nanoseconds: interStageDelayNanoseconds)
                        }
                    }

                    try Task.checkCancellation()
                    continuation.yield(.completed(resultFactory.buildResult(for: session)))
                    continuation.finish()
                } catch is CancellationError {
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }

            continuation.onTermination = { _ in
                task.cancel()
            }
        }
    }

    private func sourceKeys(for mode: VaultScanMode) -> [String] {
        switch mode {
        case .standard:
            [
                "feature.processing.source.ebay",
                "feature.processing.source.pcgs",
                "feature.processing.source.worthpoint",
                "feature.processing.source.library"
            ]
        case .mystery:
            [
                "feature.processing.source.ebay",
                "feature.processing.source.christies",
                "feature.processing.source.sothebys",
                "feature.processing.source.worthpoint"
            ]
        }
    }
}
