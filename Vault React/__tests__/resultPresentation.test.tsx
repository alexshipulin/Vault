import React from "react";
import { render } from "@testing-library/react-native";

import { ResultPresentationScreen } from "@src/features/results/ResultPresentationScreen";
import {
  buildResultPresentationFromCollectionItem,
  buildResultPresentationFromScanResult,
} from "@src/features/results/resultPresentation";

jest.mock("@expo/vector-icons", () => {
  const React = require("react");
  const { Text } = require("react-native");

  return {
    Ionicons: ({ name }: { name: string }) => React.createElement(Text, null, name),
  };
});

describe("result presentation mappers", () => {
  it("maps a scan result into the shared result-style view model", () => {
    const model = buildResultPresentationFromScanResult(
      {
        id: "scan-1",
        category: "antique",
        name: "Martaban Jar",
        year: 1800,
        origin: "Southeast Asia",
        condition: 2,
        conditionRangeLow: 2,
        conditionRangeHigh: 3,
        historySummary: "Stoneware jar used for storage and transport.",
        confidence: 0.74,
        priceData: {
          low: 20,
          mid: 26,
          high: 35,
          currency: "USD",
          source: "aiEstimate",
          sourceLabel: "AI approximation used because no market matches were found.",
          fetchedAt: "2026-04-01T00:00:00.000Z",
          valuationConfidence: 0.28,
          valuationMode: "mystery",
          matchedSources: ["liveauctioneers"],
          comparableCount: 1,
          needsReview: true,
          valuationWarnings: ["Comparable items only weakly matched the detected object."],
        },
        rawAIResponse: "{}",
        scannedAt: "2026-04-01T00:00:00.000Z",
        inputImageHashes: [],
      },
      "usd",
      "file:///tmp/jar.jpg",
    );

    expect(model.subtitle).toBe("Antique · Southeast Asia · 1800");
    expect(model.sourceText).toBe("AI Estimate · no matches");
    expect(model.confidenceLabel).toBe("VALUATION CONFIDENCE");
    expect(model.confidence).toBe(0.28);
    expect(model.diagnostics).toEqual(
      expect.arrayContaining([
        "Estimate based on weak matches. Add a base photo and dimensions to improve accuracy.",
        "Sources: LiveAuctioneers",
        "Estimate is conservative because flea-market items are usually low-value unless proven otherwise.",
      ]),
    );
  });

  it("keeps old saved items clean by omitting confidence and valuation checks when data is missing", () => {
    const model = buildResultPresentationFromCollectionItem(
      {
        id: "saved-1",
        name: "Blue Note First Press LP",
        category: "vinyl",
        conditionRaw: 3,
        year: 1958,
        origin: "United States",
        notes: "",
        photoUris: ["file:///tmp/lp.jpg"],
        priceLow: 180,
        priceMid: 260,
        priceHigh: 390,
        priceSource: "discogs",
        historySummary: "Early Blue Note pressing with collectible label details.",
        addedAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-02T00:00:00.000Z",
        isSyncedToCloud: false,
      },
      "usd",
    );

    expect(model.confidence).toBeNull();
    expect(model.diagnostics).toEqual([]);

    const screen = render(
      <ResultPresentationScreen
        headerTitle="SCAN RESULT"
        model={model}
        onBack={() => {}}
        onHeaderShare={() => {}}
        actions={[]}
        testIDs={{
          screen: "details.screen",
          valueRange: "details.valueRange",
          diagnostics: "details.diagnostics",
          confidence: "details.confidence",
        }}
      />,
    );

    expect(screen.getByTestId("details.valueRange")).toHaveTextContent("$180 — $390");
    expect(screen.queryByTestId("details.diagnostics")).toBeNull();
    expect(screen.queryByTestId("details.confidence")).toBeNull();
  });
});
