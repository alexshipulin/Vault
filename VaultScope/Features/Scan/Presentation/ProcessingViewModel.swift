import Foundation
import Observation

// MARK: - ProcessingStepItem

struct ProcessingStepItem: Identifiable, Hashable {
    let kind: ScanProcessingStageKind
    let titleKey: String
    var state: VaultProgressState

    var id: ScanProcessingStageKind {
        kind
    }
}

// MARK: - ProcessingViewModel

@MainActor
@Observable
final class ProcessingViewModel {
    private let processingPipeline: any ScanProcessingPipelineProtocol
    private var processingTask: Task<Void, Never>?

    let session: TemporaryScanSession?

    private(set) var steps: [ProcessingStepItem]
    private(set) var searchingSourceText = vsLocalized("feature.processing.searching.start")
    private(set) var generatedResult: ScanResult?
    private(set) var isProcessing = false

    init(
        session: TemporaryScanSession?,
        processingPipeline: any ScanProcessingPipelineProtocol
    ) {
        self.session = session
        self.processingPipeline = processingPipeline
        self.steps = ScanProcessingStageKind.allCases.map { kind in
            ProcessingStepItem(
                kind: kind,
                titleKey: kind.titleKey,
                state: .pending
            )
        }
    }

    var modeText: String {
        guard let session else {
            return vsLocalized("feature.processing.mode.unknown")
        }

        return vsLocalized(session.mode.titleKey)
    }

    var captureCountText: String {
        let count = session?.capturedImages.count ?? 0
        return String(
            format: NSLocalizedString("feature.processing.captures.count", comment: ""),
            count
        )
    }

    var previewImage: ScanImage? {
        session?.capturedImages.first
    }

    var hasSession: Bool {
        session != nil
    }

    func startIfNeeded() {
        guard processingTask == nil, let session else {
            return
        }

        isProcessing = true

        processingTask = Task { [weak self] in
            guard let self else {
                return
            }

            do {
                for try await update in processingPipeline.process(session: session) {
                    if Task.isCancelled {
                        return
                    }

                    apply(update)
                }
            } catch {
                handleFailure()
            }
        }
    }

    func cancelProcessing() {
        processingTask?.cancel()
        processingTask = nil
        isProcessing = false
    }

    private func apply(_ update: ScanProcessingUpdate) {
        switch update {
        case let .stageSnapshots(snapshots):
            steps = snapshots.map { snapshot in
                ProcessingStepItem(
                    kind: snapshot.kind,
                    titleKey: snapshot.kind.titleKey,
                    state: mapState(snapshot.status)
                )
            }

        case let .searchingSource(source):
            searchingSourceText = String(
                format: NSLocalizedString("feature.processing.searching.format", comment: ""),
                source
            )

        case let .completed(result):
            generatedResult = result
            searchingSourceText = vsLocalized("feature.processing.searching.complete")
            isProcessing = false
            processingTask = nil
        }
    }

    private func handleFailure() {
        searchingSourceText = vsLocalized("feature.processing.searching.failed")
        isProcessing = false
        processingTask = nil
    }

    private func mapState(_ status: ScanProcessingStageStatus) -> VaultProgressState {
        switch status {
        case .pending:
            .pending
        case .active:
            .active
        case .complete:
            .complete
        }
    }
}
