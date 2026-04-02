import type { AnalysisService } from "@src/domain/contracts";
import type { ScanResult, TemporaryScanSession } from "@src/domain/models";
import { RemoteScanOrchestrator } from "@src/features/scan/RemoteScanOrchestrator";
import { seededScanResult, seededTemporarySession } from "@src/test/fixtures/mockData";

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

  it("emits all stages in correct order", async () => {
    const mockAnalysisService: AnalysisService = {
      isConfigured: jest.fn().mockResolvedValue(true),
      runAnalysis: jest.fn().mockResolvedValue(mockScanResult)
    };

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
    const mockAnalysisService: AnalysisService = {
      isConfigured: jest.fn().mockResolvedValue(true),
      runAnalysis: jest.fn().mockResolvedValue(mockScanResult)
    };

    const orchestrator = new RemoteScanOrchestrator(mockAnalysisService, 1);

    for await (const _update of orchestrator.process(mockSession)) {
      // consume generator
    }

    expect(mockAnalysisService.runAnalysis).toHaveBeenCalledWith(mockSession);
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
});
