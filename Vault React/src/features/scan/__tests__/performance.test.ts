import type { AnalysisService } from "@src/domain/contracts";
import { LocalMockScanOrchestrator } from "@src/features/scan/LocalMockScanOrchestrator";
import { LocalMockScanResultFactory } from "@src/features/scan/MockScanResultFactory";
import { RemoteScanOrchestrator } from "@src/features/scan/RemoteScanOrchestrator";
import { seededScanResult, seededTemporarySession } from "@src/test/fixtures/mockData";

describe("Scan Performance", () => {
  it("local mock should complete in <5 seconds", async () => {
    const orchestrator = new LocalMockScanOrchestrator(new LocalMockScanResultFactory(), 5, 5);
    const start = Date.now();

    for await (const update of orchestrator.process(seededTemporarySession("standard"))) {
      void update;
    }

    const end = Date.now();
    expect(end - start).toBeLessThan(5000);
  });

  it("remote analysis should complete in <15 seconds", async () => {
    const mockAnalysisService: AnalysisService = {
      isConfigured: jest.fn().mockResolvedValue(true),
      runAnalysis: jest.fn().mockResolvedValue(seededScanResult("coin", "standard"))
    };
    const orchestrator = new RemoteScanOrchestrator(mockAnalysisService, 5);
    const start = Date.now();

    for await (const update of orchestrator.process(seededTemporarySession("standard"))) {
      void update;
    }

    const end = Date.now();
    expect(end - start).toBeLessThan(15000);
  });
});
