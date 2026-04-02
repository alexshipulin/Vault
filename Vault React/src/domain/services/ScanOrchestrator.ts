import type {
  ProcessingStageKind as DomainProcessingStageKind,
  ScanResult,
  TemporaryScanSession
} from "@src/domain/models";

export type ProcessingStageKind = DomainProcessingStageKind;

export type ScanProgressUpdate = {
  stage: ProcessingStageKind;
  progress: number;
  currentSearchSource?: string;
  completedResult?: ScanResult;
};

export interface ScanOrchestrator {
  process(session: TemporaryScanSession): AsyncGenerator<ScanProgressUpdate, void, unknown>;
}
