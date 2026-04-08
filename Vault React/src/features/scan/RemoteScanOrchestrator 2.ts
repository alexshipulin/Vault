import type { AnalysisService } from "@src/domain/contracts";
import type { TemporaryScanSession } from "@src/domain/models";
import type { ScanOrchestrator, ScanProgressUpdate } from "@src/domain/services";
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

export class RemoteScanOrchestrator implements ScanOrchestrator {
  constructor(
    private readonly analysisService: AnalysisService,
    private readonly stageDelayMs = 800,
  ) {}

  async *process(session: TemporaryScanSession): AsyncGenerator<ScanProgressUpdate, void, unknown> {
    yield {
      stage: "objectRecognition",
      progress: 0.25,
      currentSearchSource: "Processing images..."
    };
    await delay(this.stageDelayMs);

    yield {
      stage: "objectRecognition",
      progress: 0.5,
      currentSearchSource: "Running AI analysis..."
    };
    await delay(this.stageDelayMs);

    yield {
      stage: "objectRecognition",
      progress: 1
    };

    yield {
      stage: "conditionAssessment",
      progress: 0.5,
      currentSearchSource: "Analyzing condition..."
    };
    await delay(this.stageDelayMs);

    yield {
      stage: "conditionAssessment",
      progress: 1
    };

    yield {
      stage: "priceLookup",
      progress: 0.3,
      currentSearchSource: "Searching databases..."
    };

    try {
      const result = await this.analysisService.runAnalysis(session);

      yield {
        stage: "priceLookup",
        progress: 0.7,
        currentSearchSource: "Found comparable items..."
      };
      await delay(this.stageDelayMs);

      yield {
        stage: "priceLookup",
        progress: 1
      };

      yield {
        stage: "historicalRecords",
        progress: 0.5,
        currentSearchSource: "Calculating estimate..."
      };
      await delay(this.stageDelayMs);

      yield {
        stage: "historicalRecords",
        progress: 1,
        completedResult: result
      };
    } catch (error) {
      performanceMonitor.captureError(error, {
        area: "scan.remote-orchestrator",
        mode: session.mode,
      });

      throw new Error(`Remote analysis failed: ${errorMessage(error)}`);
    }
  }
}
