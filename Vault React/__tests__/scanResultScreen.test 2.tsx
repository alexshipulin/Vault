import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockSetSelectedItem = jest.fn();
const mockSetSelectedItemID = jest.fn();
const mockBumpCollectionVersion = jest.fn();
const mockCollectionSave = jest.fn().mockResolvedValue(undefined);

jest.mock("expo-router", () => ({
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
    replace: mockReplace
  }),
  useLocalSearchParams: () => ({
    resultId: "result-ai-fallback"
  })
}));

jest.mock("@src/core/app/AppProvider", () => ({
  useAppState: () => ({
    latestResult: {
      id: "result-ai-fallback",
      category: "coin",
      name: "1909-S VDB Lincoln Wheat Cent",
      year: 1909,
      origin: "United States",
      condition: 4,
      conditionRangeLow: 3,
      conditionRangeHigh: 5,
      historySummary: "AI fallback estimate used after no market matches were found.",
      confidence: 0.81,
      priceData: {
        low: 900,
        mid: 1100,
        high: 1300,
        currency: "USD",
        source: "aiEstimate",
        sourceLabel: "AI approximation used because no market matches were found.",
        fetchedAt: "2026-04-01T00:00:00.000Z",
        matchedSources: ["ebay"],
        comparableCount: 1,
        needsReview: true,
        valuationWarnings: ["Comparable items only weakly matched the detected object."],
        comparables: []
      },
      rawAIResponse: "{}",
      scannedAt: "2026-04-01T00:00:00.000Z",
      inputImageHashes: []
    },
    currentSession: null,
    selectedItem: {
      id: "result-ai-fallback",
      title: "1909-S VDB Lincoln Wheat Cent",
      subtitle: "United States",
      categoryText: "Coins",
      valueText: "$1,100",
      timestampText: "Apr 1, 2026",
      noteText: "AI fallback estimate used after no market matches were found.",
      thumbnailText: "19",
      photoUri: "file:///tmp/capture.jpg"
    },
    setSelectedItem: mockSetSelectedItem,
    setSelectedItemID: mockSetSelectedItemID,
    container: {
      collectionRepository: {
        fetchAll: jest.fn().mockResolvedValue([]),
        save: mockCollectionSave,
      },
      preferencesStore: {
        load: jest.fn().mockResolvedValue({ preferredCurrency: "usd" })
      },
      imagePersistenceService: {
        persistImages: jest.fn().mockResolvedValue([])
      },
      remoteCollectionMirror: {
        mirrorItem: jest.fn()
      },
      runtimeConfig: {
        flags: {
          remoteBackend: true
        }
      }
    },
    bumpCollectionVersion: mockBumpCollectionVersion
  })
}));

describe("ScanResultScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders AI fallback value range and labels it as AI-based when no database matches exist", async () => {
    const { ScanResultScreen } = require("@src/features/scan/ScanResultScreen") as typeof import("@src/features/scan/ScanResultScreen");
    const screen = render(<ScanResultScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("result.valueRange")).toHaveTextContent("$900 — $1,300");
    });

    expect(screen.getByText("AI Estimate · no matches")).toBeTruthy();
    expect(screen.getByTestId("result.summary")).toHaveTextContent("AI fallback estimate used after no market matches were found.");
  });

  it("persists diagnostics and confidence when saving a result into the collection", async () => {
    const { ScanResultScreen } = require("@src/features/scan/ScanResultScreen") as typeof import("@src/features/scan/ScanResultScreen");
    const screen = render(<ScanResultScreen />);

    fireEvent.press(screen.getByTestId("result.saveButton"));

    await waitFor(() => {
      expect(mockCollectionSave).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "result-ai-fallback",
          sourceLabel: "AI approximation used because no market matches were found.",
          confidence: 0.81,
          matchedSources: ["ebay"],
          comparableCount: 1,
          needsReview: true,
          valuationWarnings: ["Comparable items only weakly matched the detected object."],
          photoUris: ["file:///tmp/capture.jpg"],
        }),
      );
    });
  });
});
