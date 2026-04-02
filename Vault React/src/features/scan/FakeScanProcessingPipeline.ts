import type { MockScanResultFactory, ScanProcessingPipeline } from "@src/domain/contracts";
import type {
  ProcessingStageKind,
  ProcessingStageSnapshot,
  ProcessingUpdate,
  TemporaryScanSession
} from "@src/domain/models";
import type { ScanProgressUpdate } from "@src/domain/services";
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

type LegacyCompatibleScanProgressUpdate = ScanProgressUpdate & ProcessingUpdate;

function buildSnapshots(
  stages: ProcessingStageKind[],
  activeIndex: number | null,
  completedIndexes: Set<number>
): ProcessingStageSnapshot[] {
  return stages.map((kind, index) => ({
    kind,
    status: completedIndexes.has(index) ? "complete" : activeIndex === index ? "active" : "pending"
  }));
}

export class FakeScanProcessingPipeline implements ScanProcessingPipeline {
  constructor(
    private readonly resultFactory: MockScanResultFactory,
    private readonly stageDelayMs = 550,
    private readonly interStageDelayMs = 250
  ) {}

  async *process(session: TemporaryScanSession): AsyncGenerator<LegacyCompatibleScanProgressUpdate, void, unknown> {
    const sources = session.mode === "mystery" ? MYSTERY_SOURCES : STANDARD_SOURCES;
    const completedIndexes = new Set<number>();
    const pendingSnapshots = buildSnapshots(STAGES, null, completedIndexes);

    yield {
      stage: STAGES[0],
      progress: 0,
      snapshots: pendingSnapshots
    };
    yield {
      stage: STAGES[0],
      progress: 0,
      currentSearchSource: `${t("processing.searching.format").replace("%s", sources[0])}`,
      searchingSource: `${t("processing.searching.format").replace("%s", sources[0])}`
    };

    for (let index = 0; index < STAGES.length; index += 1) {
      const activeSnapshots = buildSnapshots(STAGES, index, completedIndexes);
      const currentSearchSource = `${t("processing.searching.format").replace("%s", sources[index])}`;

      yield {
        stage: STAGES[index],
        progress: index / STAGES.length,
        currentSearchSource,
        snapshots: activeSnapshots,
        searchingSource: currentSearchSource
      };

      await sleep(this.stageDelayMs);

      completedIndexes.add(index);
      const completedSnapshots = buildSnapshots(STAGES, null, completedIndexes);

      yield {
        stage: STAGES[index],
        progress: (index + 1) / STAGES.length,
        snapshots: completedSnapshots
      };

      if (index < STAGES.length - 1) {
        await sleep(this.interStageDelayMs);
      }
    }

    yield {
      stage: STAGES[STAGES.length - 1],
      progress: 1,
      completedResult: this.resultFactory.buildResult(session)
    };
  }
}
