import type { MockScanResultFactory, ScanProcessingPipeline } from "@src/domain/contracts";
import type {
  ProcessingStageKind,
  ProcessingStageSnapshot,
  ProcessingUpdate,
  TemporaryScanSession
} from "@src/domain/models";
import { t } from "@src/shared/i18n/strings";

const STAGES: ProcessingStageKind[] = [
  "objectRecognition",
  "conditionAssessment",
  "priceLookup",
  "historicalRecords"
];

const STANDARD_SOURCES = ["eBay", "PCGS", "WorthPoint", "Library Archives"];
const MYSTERY_SOURCES = ["eBay", "Christie's", "Sotheby's", "WorthPoint"];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class FakeScanProcessingPipeline implements ScanProcessingPipeline {
  constructor(
    private readonly resultFactory: MockScanResultFactory,
    private readonly stageDelayMs = 550,
    private readonly interStageDelayMs = 250
  ) {}

  async *process(session: TemporaryScanSession): AsyncGenerator<ProcessingUpdate, void, void> {
    const sources = session.mode === "mystery" ? MYSTERY_SOURCES : STANDARD_SOURCES;
    const snapshots: ProcessingStageSnapshot[] = STAGES.map((kind) => ({ kind, status: "pending" }));

    yield { snapshots };
    yield { searchingSource: `${t("processing.searching.format").replace("%s", sources[0])}` };

    for (let index = 0; index < STAGES.length; index += 1) {
      snapshots[index] = { kind: STAGES[index], status: "active" };
      yield { snapshots: [...snapshots], searchingSource: `${t("processing.searching.format").replace("%s", sources[index])}` };

      await sleep(this.stageDelayMs);

      snapshots[index] = { kind: STAGES[index], status: "complete" };
      yield { snapshots: [...snapshots] };

      if (index < STAGES.length - 1) {
        await sleep(this.interStageDelayMs);
      }
    }

    yield { completedResult: this.resultFactory.buildResult(session) };
  }
}
