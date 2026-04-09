import React from "react";
import { act, render, waitFor, within } from "@testing-library/react-native";
import { Alert, Animated } from "react-native";

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockSetCurrentSession = jest.fn().mockResolvedValue(undefined);
const mockSetLatestResult = jest.fn();
const mockSetSelectedItem = jest.fn();
const mockSetSelectedItemID = jest.fn();
const mockProgressUpdates = [
  {
    stage: "priceLookup",
    progress: 0.45,
    currentSearchSource: "Checking PCGS price guide",
    lookupProgress: {
      sourceKey: "pcgs",
      sourceLabel: "PCGS Price Guide",
      message: "Checking PCGS price guide",
    },
  },
];
let throwAfterUpdates: Error | null = null;
const mockScanProcess = jest.fn(async function* () {
  for (const update of mockProgressUpdates) {
    yield update;
  }

  if (throwAfterUpdates) {
    throw throwAfterUpdates;
  }
});
const mockAppState = {
  currentSession: {
    id: "session-1",
    mode: "standard",
    createdAt: "2026-04-03T00:00:00.000Z",
    capturedImages: [
      {
        id: "img-1",
        uri: "file:///tmp/test.jpg",
        mimeType: "image/jpeg",
      },
    ],
  },
  setCurrentSession: mockSetCurrentSession,
  setLatestResult: mockSetLatestResult,
  setSelectedItem: mockSetSelectedItem,
  setSelectedItemID: mockSetSelectedItemID,
  container: {
    scanOrchestrator: {
      process: (...args: unknown[]) => mockScanProcess(...args),
    },
  },
};

jest.mock("expo-router", () => ({
  useRouter: () => ({
    replace: mockReplace,
    back: mockBack,
  }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  SafeAreaView: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => {
    const ReactNative = require("react-native") as typeof import("react-native");
    return <ReactNative.View testID={testID}>{children}</ReactNative.View>;
  },
}));

jest.mock("@src/core/app/AppProvider", () => ({
  useAppState: () => mockAppState,
}));

describe("ProcessingScreen", () => {
  let animatedTimingSpy: jest.SpyInstance;
  let animatedSequenceSpy: jest.SpyInstance;
  let animatedLoopSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    throwAfterUpdates = null;
    mockProgressUpdates.splice(
      0,
      mockProgressUpdates.length,
      {
        stage: "priceLookup",
        progress: 0.45,
        currentSearchSource: "Checking PCGS price guide",
        lookupProgress: {
          sourceKey: "pcgs",
          sourceLabel: "PCGS Price Guide",
          message: "Checking PCGS price guide",
        },
      },
    );
    const createAnimation = () => ({
      start: jest.fn(),
      stop: jest.fn(),
      reset: jest.fn(),
    });
    animatedTimingSpy = jest.spyOn(Animated, "timing").mockImplementation(() => createAnimation() as never);
    animatedSequenceSpy = jest.spyOn(Animated, "sequence").mockImplementation(() => createAnimation() as never);
    animatedLoopSpy = jest.spyOn(Animated, "loop").mockImplementation(() => createAnimation() as never);
  });

  afterEach(() => {
    animatedTimingSpy.mockRestore();
    animatedSequenceSpy.mockRestore();
    animatedLoopSpy.mockRestore();
  });

  it("renders each source as its own one-line row with status", async () => {
    const { ProcessingScreen } = require("@src/features/scan/ProcessingScreen") as typeof import("@src/features/scan/ProcessingScreen");
    const screen = render(<ProcessingScreen />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockScanProcess).toHaveBeenCalled();
    });

    expect(await screen.findByText("Object Recognition")).toBeTruthy();
    expect(await screen.findByText("PCGS CoinFacts")).toBeTruthy();
    expect(screen.queryByText("Checking PCGS price guide")).toBeNull();
    expect(within(screen.getByTestId("processing.step.objectRecognition")).getByText("DONE")).toBeTruthy();
    expect(within(screen.getByTestId("processing.step.pcgs")).getByText("IN PROGRESS")).toBeTruthy();
  });

  it("shows final estimate and saving as separate rows", async () => {
    mockProgressUpdates.splice(
      0,
      mockProgressUpdates.length,
      {
        stage: "historicalRecords",
        progress: 0.82,
        currentSearchSource: "Building final estimate",
        lookupProgress: {
          sourceKey: "final_estimate",
          sourceLabel: "Final estimate",
          message: "Building final estimate",
        },
      },
      {
        stage: "historicalRecords",
        progress: 0.94,
        currentSearchSource: "Saving scan result",
        lookupProgress: {
          sourceKey: "saving",
          sourceLabel: "Firebase save",
          message: "Saving scan result",
        },
      },
    );

    const { ProcessingScreen } =
      require("@src/features/scan/ProcessingScreen") as typeof import("@src/features/scan/ProcessingScreen");
    const screen = render(<ProcessingScreen />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockScanProcess).toHaveBeenCalled();
    });

    expect(await screen.findByText("Value Estimate")).toBeTruthy();
    expect(await screen.findByText("Result Storage")).toBeTruthy();
    expect(screen.queryByText("Saving scan result")).toBeNull();
    expect(within(screen.getByTestId("processing.step.valueEstimate")).getByText("DONE")).toBeTruthy();
    expect(within(screen.getByTestId("processing.step.saving")).getByText("IN PROGRESS")).toBeTruthy();
  });

  it("keeps source rows in execution order and only one row active", async () => {
    mockProgressUpdates.splice(
      0,
      mockProgressUpdates.length,
      {
        stage: "priceLookup",
        progress: 0.45,
        currentSearchSource: "Checking eBay active listings",
        lookupProgress: {
          sourceKey: "ebay",
          sourceLabel: "eBay Active Listings",
          message: "Checking eBay active listings",
        },
      },
      {
        stage: "priceLookup",
        progress: 0.62,
        currentSearchSource: "Checking PCGS price guide",
        lookupProgress: {
          sourceKey: "pcgs",
          sourceLabel: "PCGS Price Guide",
          message: "Checking PCGS price guide",
        },
      },
    );

    const { ProcessingScreen } =
      require("@src/features/scan/ProcessingScreen") as typeof import("@src/features/scan/ProcessingScreen");
    const screen = render(<ProcessingScreen />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockScanProcess).toHaveBeenCalled();
    });

    expect(within(screen.getByTestId("processing.step.objectRecognition")).getByText("DONE")).toBeTruthy();
    expect(within(screen.getByTestId("processing.step.ebay")).getByText("DONE")).toBeTruthy();
    expect(within(screen.getByTestId("processing.step.pcgs")).getByText("IN PROGRESS")).toBeTruthy();
    expect(screen.queryAllByText("IN PROGRESS")).toHaveLength(1);
  });

  it("marks the current source row as error on failure", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    throwAfterUpdates = new Error("Remote pipeline failed");
    mockProgressUpdates.splice(
      0,
      mockProgressUpdates.length,
      {
        stage: "historicalRecords",
        progress: 0.4,
        currentSearchSource: "Cross-checking auction records",
        lookupProgress: {
          sourceKey: "auction_records",
          sourceLabel: "Auction records",
          message: "Cross-checking auction records",
        },
      },
    );

    const { ProcessingScreen } =
      require("@src/features/scan/ProcessingScreen") as typeof import("@src/features/scan/ProcessingScreen");
    const screen = render(<ProcessingScreen />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });

    const alertMessage = String(alertSpy.mock.calls[0]?.[1] ?? "");
    expect(alertMessage).toContain("Last step: Auction Records");
    expect(alertMessage).toContain("Cross-checking auction records");
    expect(within(screen.getByTestId("processing.step.auction_records")).getByText("ERROR")).toBeTruthy();
    expect(screen.queryAllByText("IN PROGRESS")).toHaveLength(0);

    alertSpy.mockRestore();
  });
});
