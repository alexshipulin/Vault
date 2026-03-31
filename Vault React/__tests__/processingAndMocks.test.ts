import { FakeScanProcessingPipeline } from "@src/features/scan/FakeScanProcessingPipeline";
import { LocalMockScanResultFactory } from "@src/features/scan/MockScanResultFactory";
import { seededTemporarySession } from "@src/test/fixtures/mockData";

describe("fake processing pipeline and mock result factory", () => {
  it("produces valid standard and mystery mock results", () => {
    const factory = new LocalMockScanResultFactory();

    const standard = factory.buildResult(seededTemporarySession("standard"));
    const mystery = factory.buildResult(seededTemporarySession("mystery"));

    expect(standard.name).toBeTruthy();
    expect(standard.priceData?.low).toBeLessThanOrEqual(standard.priceData?.high ?? 0);
    expect(standard.confidence).toBeGreaterThan(0.5);

    expect(mystery.name).toBeTruthy();
    expect(mystery.priceData?.sourceLabel).toBeTruthy();
    expect(mystery.inputImageHashes.length).toBeGreaterThan(0);
  });

  it("emits stages in order and completes with a result", async () => {
    const pipeline = new FakeScanProcessingPipeline(new LocalMockScanResultFactory(), 1, 1);
    const session = seededTemporarySession("standard");
    const seen: string[] = [];
    let completedName = "";

    for await (const update of pipeline.process(session)) {
      if (update.snapshots) {
        seen.push(update.snapshots.map((entry) => `${entry.kind}:${entry.status}`).join("|"));
      }

      if (update.completedResult) {
        completedName = update.completedResult.name;
      }
    }

    expect(seen.some((entry) => entry.includes("objectRecognition:active"))).toBe(true);
    expect(seen.some((entry) => entry.includes("historicalRecords:complete"))).toBe(true);
    expect(completedName).toBeTruthy();
  });

  it("supports cancellation via iterator return", async () => {
    const pipeline = new FakeScanProcessingPipeline(new LocalMockScanResultFactory(), 10, 10);
    const iterator = pipeline.process(seededTemporarySession("standard"));

    const first = await iterator.next();
    expect(first.done).toBe(false);

    await iterator.return(undefined);
    const finalState = await iterator.next();
    expect(finalState.done).toBe(true);
  });
});
