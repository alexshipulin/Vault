import { performanceMonitor } from "@/lib/performance/monitoring";

describe("performanceMonitor error policy", () => {
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it("logs handled errors through console.warn and truncates long metadata", () => {
    performanceMonitor.captureError(
      new Error("Invalid JSON"),
      {
        payloadPreview: "x".repeat(500),
        matchedSources: ["ebay", "liveauctioneers", "heritage", "extra-1", "extra-2", "extra-3", "extra-4"],
      },
      { severity: "handled" },
    );

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    const [, , metadata] = consoleWarnSpy.mock.calls[0];
    expect((metadata as { payloadPreview: string }).payloadPreview.length).toBeLessThanOrEqual(261);
    expect((metadata as { matchedSources: string[] }).matchedSources).toHaveLength(6);
  });

  it("logs fatal errors through console.error", () => {
    performanceMonitor.captureError(new Error("Fatal runtime"), { area: "global.runtime" }, { severity: "fatal" });

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it("treats measureAsync failures as handled errors", async () => {
    await expect(
      performanceMonitor.measureAsync("scan.identify-item", async () => {
        throw new Error("Remote analysis failed");
      }, { category: "general", appraisalMode: "mystery" }),
    ).rejects.toThrow("Remote analysis failed");

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
