import type { AnalysisService } from "@src/domain/contracts";
import type { ScanResult, TemporaryScanSession } from "@src/domain/models";
import { RemoteScanOrchestrator } from "@src/features/scan/RemoteScanOrchestrator";
import { seededScanResult, seededTemporarySession } from "@src/test/fixtures/mockData";
import type { ScanProgressState } from "@/lib/scan/types";

function uniqueStages(sequence: string[]): string[] {
  return sequence.filter((stage, index) => stage !== sequence[index - 1]);
}

describe("RemoteScanOrchestrator", () => {
  const mockSession: TemporaryScanSession = seededTemporarySession("standard");
  const mockScanResult: ScanResult = seededScanResult("coin", "standard");
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  function createProgressingAnalysisService(
    steps: ScanProgressState[],
    result: ScanResult = mockScanResult,
  ): AnalysisService {
    return {
      isConfigured: jest.fn().mockResolvedValue(true),
      runAnalysis: jest.fn().mockImplementation(async (_session, onProgress) => {
        steps.forEach((step) => {
          onProgress?.(step);
        });
        return result;
      }),
    };
  }

  it("emits all stages in correct order", async () => {
    const mockAnalysisService = createProgressingAnalysisService([
      {
        step: "processing",
        label: "Processing image...",
        status: "active",
        currentSearchSource: "Preparing scan images",
      },
      {
        step: "identifying",
        label: "Identifying item...",
        status: "active",
        currentSearchSource: "Checking Gemini AI identification",
        lookupProgress: {
          sourceKey: "gemini",
          sourceLabel: "Gemini AI",
          message: "Checking Gemini AI identification",
        },
      },
      {
        step: "identifying",
        label: "Identifying item...",
        status: "active",
        currentSearchSource: "Assessing visible wear and overall condition",
        lookupProgress: {
          sourceKey: "condition",
          sourceLabel: "Condition review",
          message: "Assessing visible wear and overall condition",
        },
      },
      {
        step: "pricing",
        label: "Finding prices...",
        status: "active",
        currentSearchSource: "Searching recent marketplace sales",
        lookupProgress: {
          sourceKey: "marketplace",
          sourceLabel: "Marketplace sales",
          message: "Searching recent marketplace sales",
        },
      },
      {
        step: "pricing",
        label: "Finding prices...",
        status: "active",
        currentSearchSource: "Cross-checking auction records",
        lookupProgress: {
          sourceKey: "auction_records",
          sourceLabel: "Auction records",
          message: "Cross-checking auction records",
        },
      },
      {
        step: "saving",
        label: "Almost done...",
        status: "active",
        currentSearchSource: "Building final estimate",
        lookupProgress: {
          sourceKey: "final_estimate",
          sourceLabel: "Final estimate",
          message: "Building final estimate",
        },
      },
    ]);

    const orchestrator = new RemoteScanOrchestrator(mockAnalysisService, 1);
    const stages: string[] = [];

    for await (const update of orchestrator.process(mockSession)) {
      if (update.stage) {
        stages.push(update.stage);
      }
    }

    expect(uniqueStages(stages)).toEqual([
      "objectRecognition",
      "conditionAssessment",
      "priceLookup",
      "historicalRecords"
    ]);
  });

  it("calls remote analysis during the scan flow with the current session", async () => {
    const mockAnalysisService = createProgressingAnalysisService([]);

    const orchestrator = new RemoteScanOrchestrator(mockAnalysisService, 1);

    for await (const _update of orchestrator.process(mockSession)) {
      // consume generator
    }

    expect(mockAnalysisService.runAnalysis).toHaveBeenCalledWith(mockSession, expect.any(Function));
    expect(mockAnalysisService.runAnalysis).toHaveBeenCalledTimes(1);
  });

  it("rejects with a remote analysis error when no fallback is provided", async () => {
    const mockAnalysisService: AnalysisService = {
      isConfigured: jest.fn().mockResolvedValue(true),
      runAnalysis: jest.fn().mockRejectedValue(new Error("Network error"))
    };

    const orchestrator = new RemoteScanOrchestrator(mockAnalysisService, 1);

    await expect(
      (async () => {
        for await (const _update of orchestrator.process(mockSession)) {
          // consume generator
        }
      })()
    ).rejects.toThrow("Remote analysis failed: Network error");
  });

  it("does not substitute a local mock result when remote analysis fails", async () => {
    const mockAnalysisService: AnalysisService = {
      isConfigured: jest.fn().mockResolvedValue(true),
      runAnalysis: jest.fn().mockRejectedValue(new Error("Network error"))
    };

    const orchestrator = new RemoteScanOrchestrator(mockAnalysisService, 1);
    const mysterySession: TemporaryScanSession = seededTemporarySession("mystery");

    let completedResult: ScanResult | undefined;

    await expect(
      (async () => {
        for await (const update of orchestrator.process(mysterySession)) {
          if (update.completedResult) {
            completedResult = update.completedResult;
          }
        }
      })()
    ).rejects.toThrow("Remote analysis failed: Network error");

    expect(mockAnalysisService.runAnalysis).toHaveBeenCalledTimes(1);
    expect(completedResult).toBeUndefined();
    expect(completedResult?.name).not.toBe("Blue Note First Press LP");
  });

  it("passes through friendly source progress labels for live analysis", async () => {
    const sourceLines: string[] = [];
    const mockAnalysisService = createProgressingAnalysisService([
      {
        step: "pricing",
        label: "Finding prices...",
        status: "active",
        currentSearchSource: "Checking PCGS price guide",
        lookupProgress: {
          sourceKey: "pcgs",
          sourceLabel: "PCGS Price Guide",
          message: "Checking PCGS price guide",
        },
      },
      {
        step: "pricing",
        label: "Finding prices...",
        status: "active",
        currentSearchSource: "Checking live metals spot prices",
        lookupProgress: {
          sourceKey: "metals",
          sourceLabel: "Metals API",
          message: "Checking live metals spot prices",
        },
      },
    ]);

    const orchestrator = new RemoteScanOrchestrator(mockAnalysisService, 1);
    for await (const update of orchestrator.process(mockSession)) {
      if (update.currentSearchSource) {
        sourceLines.push(update.currentSearchSource);
      }
    }

    expect(sourceLines).toEqual(
      expect.arrayContaining([
        "Checking PCGS price guide",
        "Checking live metals spot prices",
      ]),
    );
  });
});
