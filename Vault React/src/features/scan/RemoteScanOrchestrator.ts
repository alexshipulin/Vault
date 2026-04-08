import type { AnalysisService } from "@src/domain/contracts";
import type { TemporaryScanSession } from "@src/domain/models";
import type { ScanOrchestrator, ScanProgressUpdate } from "@src/domain/services";
import type { ScanLookupProgress, ScanProgressState } from "@/lib/scan/types";
import { performanceMonitor } from "@/lib/performance/monitoring";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown remote analysis failure";
}

function mapProgressToStage(progress: ScanProgressState): Pick<ScanProgressUpdate, "stage" | "progress"> {
  const sourceKey = progress.lookupProgress?.sourceKey;

  switch (progress.step) {
    case "processing":
      return {
        stage: "objectRecognition",
        progress: progress.status === "complete" ? 0.35 : 0.15,
      };
    case "identifying":
      if (sourceKey === "condition") {
        return {
          stage: "conditionAssessment",
          progress: progress.status === "complete" ? 1 : 0.6,
        };
      }

      return {
        stage: "objectRecognition",
        progress: progress.status === "complete" ? 1 : 0.7,
      };
    case "pricing":
      return {
        stage: sourceKey === "auction_records" ? "historicalRecords" : "priceLookup",
        progress: progress.status === "complete" ? 1 : sourceKey === "auction_records" ? 0.55 : 0.45,
      };
    case "saving":
      return {
        stage: "historicalRecords",
        progress: progress.status === "complete" ? 1 : sourceKey === "final_estimate" ? 0.82 : 0.94,
      };
    case "done":
      return {
        stage: "historicalRecords",
        progress: 1,
      };
  }
}

function toScanProgressUpdate(progress: ScanProgressState): ScanProgressUpdate {
  const mapped = mapProgressToStage(progress);

  return {
    ...mapped,
    currentSearchSource: progress.lookupProgress?.message ?? progress.currentSearchSource,
    lookupProgress: progress.lookupProgress ?? null,
  };
}

type RemoteQueueItem =
  | { kind: "progress"; update: ScanProgressUpdate }
  | { kind: "result"; result: Awaited<ReturnType<AnalysisService["runAnalysis"]>> }
  | { kind: "error"; error: unknown };

export class RemoteScanOrchestrator implements ScanOrchestrator {
  constructor(
    private readonly analysisService: AnalysisService,
    private readonly stageDelayMs = 800,
  ) {}

  async *process(session: TemporaryScanSession): AsyncGenerator<ScanProgressUpdate, void, unknown> {
    const queue: RemoteQueueItem[] = [];
    let notifyNext: (() => void) | null = null;

    const push = (item: RemoteQueueItem) => {
      queue.push(item);
      notifyNext?.();
      notifyNext = null;
    };

    void this.analysisService
      .runAnalysis(session, (progress) => {
        push({
          kind: "progress",
          update: toScanProgressUpdate(progress),
        });
      })
      .then((result) => {
        push({ kind: "result", result });
      })
      .catch((error) => {
        push({ kind: "error", error });
      });

    while (true) {
      if (queue.length === 0) {
        await new Promise<void>((resolve) => {
          notifyNext = resolve;
        });
      }

      const item = queue.shift();
      if (!item) {
        continue;
      }

      if (item.kind === "progress") {
        yield item.update;
        continue;
      }

      if (item.kind === "result") {
        yield {
          stage: "historicalRecords",
          progress: 1,
          currentSearchSource: item.result.priceData?.sourceLabel ?? "Building final estimate",
          completedResult: item.result,
        };
        return;
      }

      performanceMonitor.captureError(item.error, {
        area: "scan.remote-orchestrator",
        mode: session.mode,
      });
      throw new Error(`Remote analysis failed: ${errorMessage(item.error)}`);
    }
  }
}
