import type { MockScanResultFactory } from "@src/domain/contracts";
import type { TemporaryScanSession } from "@src/domain/models";
import type { ScanOrchestrator, ScanProgressUpdate } from "@src/domain/services";

import { FakeScanProcessingPipeline } from "./FakeScanProcessingPipeline";

export class LocalMockScanOrchestrator implements ScanOrchestrator {
  private readonly pipeline: FakeScanProcessingPipeline;

  constructor(
    resultFactory: MockScanResultFactory,
    stageDelayMs = 550,
    interStageDelayMs = 250
  ) {
    this.pipeline = new FakeScanProcessingPipeline(resultFactory, stageDelayMs, interStageDelayMs);
  }

  async *process(session: TemporaryScanSession): AsyncGenerator<ScanProgressUpdate, void, unknown> {
    for await (const update of this.pipeline.process(session)) {
      yield update;
    }
  }
}
