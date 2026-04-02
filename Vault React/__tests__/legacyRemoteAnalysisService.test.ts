import type { TemporaryScanSession } from "@src/domain/models";
import { seededTemporarySession } from "@src/test/fixtures/mockData";

const mockExecuteScan = jest.fn();

jest.mock("@/lib/scan/pipeline", () => ({
  ScanPipeline: class {
    executeScan(...args: unknown[]) {
      return mockExecuteScan(...args);
    }
  }
}));

describe("LegacyRemoteAnalysisService", () => {
  const session: TemporaryScanSession = seededTemporarySession("standard");

  beforeEach(() => {
    jest.resetModules();
    mockExecuteScan.mockReset();
  });

  it("maps AI fallback estimates into RN priceData without zero-filling", async () => {
    mockExecuteScan.mockResolvedValue({
      id: "remote-1",
      images: ["file:///tmp/capture.jpg"],
      scannedAt: "2026-04-01T00:00:00.000Z",
      comparableAuctions: [],
      identification: {
        category: "coin",
        name: "Rare Coin",
        year: 1901,
        origin: "United States",
        condition: "fine",
        conditionRange: ["good", "near_mint"],
        historySummary: "Collector item.",
        confidence: 0.72
      },
      priceEstimate: {
        low: 850,
        high: 1400,
        currency: "USD",
        source: "aiFallback",
        sourceLabel: "AI approximation used because no market matches were found.",
        valuationConfidence: 0.31,
        valuationMode: "mystery",
        evidenceStrength: "weak",
        appliedValueCeiling: 100,
        sourceBreakdown: { ebay: 0, liveauctioneers: 1, heritage: 0 },
      }
    });

    const { LegacyRemoteAnalysisService } = require("@src/data/remote/LegacyRemoteServices") as typeof import("@src/data/remote/LegacyRemoteServices");
    const service = new LegacyRemoteAnalysisService();
    const result = await service.runAnalysis(session);

    expect(result.priceData).not.toBeNull();
    expect(result.priceData?.low).toBe(850);
    expect(result.priceData?.mid).toBe(1125);
    expect(result.priceData?.high).toBe(1400);
    expect(result.priceData?.source).toBe("aiEstimate");
    expect(result.priceData?.valuationConfidence).toBe(0.31);
    expect(result.priceData?.valuationMode).toBe("mystery");
    expect(result.priceData?.appliedValueCeiling).toBe(100);
    expect(result.priceData?.sourceLabel).toContain("no market matches");
    expect(mockExecuteScan).toHaveBeenCalledWith(
      session.capturedImages.map((image) => image.uri),
      "general",
      "standard",
    );
  });

  it("keeps priceData null when the remote pipeline has no usable estimate", async () => {
    mockExecuteScan.mockResolvedValue({
      id: "remote-2",
      images: ["file:///tmp/capture.jpg"],
      scannedAt: "2026-04-01T00:00:00.000Z",
      comparableAuctions: [],
      identification: {
        category: "coin",
        name: "Unknown Coin",
        year: null,
        origin: null,
        condition: "good",
        conditionRange: ["poor", "fine"],
        historySummary: "Unknown item.",
        confidence: 0.32
      },
      priceEstimate: {
        low: null,
        high: null,
        currency: "USD"
      }
    });

    const { LegacyRemoteAnalysisService } = require("@src/data/remote/LegacyRemoteServices") as typeof import("@src/data/remote/LegacyRemoteServices");
    const service = new LegacyRemoteAnalysisService();
    const result = await service.runAnalysis(session);

    expect(result.priceData).toBeNull();
  });

  it("maps ceramic and jar-like categories to antique for the UI", async () => {
    mockExecuteScan.mockResolvedValue({
      id: "remote-3",
      images: ["file:///tmp/capture.jpg"],
      scannedAt: "2026-04-01T00:00:00.000Z",
      comparableAuctions: [],
      identification: {
        category: "stoneware storage jar",
        name: "Southeast Asian Storage Jar",
        year: 1800,
        origin: "Southeast Asia",
        condition: "good",
        conditionRange: ["good", "very_good"],
        historySummary: "Historic vessel.",
        confidence: 0.68
      },
      priceEstimate: {
        low: null,
        high: null,
        currency: "USD"
      }
    });

    const { LegacyRemoteAnalysisService } = require("@src/data/remote/LegacyRemoteServices") as typeof import("@src/data/remote/LegacyRemoteServices");
    const service = new LegacyRemoteAnalysisService();
    const result = await service.runAnalysis(session);

    expect(result.category).toBe("antique");
  });

  it("passes mystery mode through to the live pipeline", async () => {
    const mysterySession: TemporaryScanSession = seededTemporarySession("mystery");
    mockExecuteScan.mockResolvedValue({
      id: "remote-4",
      images: ["file:///tmp/capture.jpg"],
      scannedAt: "2026-04-01T00:00:00.000Z",
      comparableAuctions: [],
      identification: {
        category: "decorative vase",
        name: "Decorative Vase",
        year: null,
        origin: null,
        condition: "good",
        conditionRange: ["good", "very_good"],
        historySummary: "Likely decorative household item.",
        confidence: 0.51,
      },
      priceEstimate: {
        low: 20,
        high: 40,
        currency: "USD",
        source: "aiFallback",
      },
    });

    const { LegacyRemoteAnalysisService } = require("@src/data/remote/LegacyRemoteServices") as typeof import("@src/data/remote/LegacyRemoteServices");
    const service = new LegacyRemoteAnalysisService();
    await service.runAnalysis(mysterySession);

    expect(mockExecuteScan).toHaveBeenCalledWith(
      mysterySession.capturedImages.map((image) => image.uri),
      "general",
      "mystery",
    );
  });
});
