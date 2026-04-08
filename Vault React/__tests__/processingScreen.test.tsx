import React from "react";
import { act, render, waitFor, within } from "@testing-library/react-native";
import { Animated } from "react-native";

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
const mockScanProcess = jest.fn(async function* () {
  for (const update of mockProgressUpdates) {
    yield update;
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

  it("renders the active source detail inline with the active step", async () => {
    const { ProcessingScreen } = require("@src/features/scan/ProcessingScreen") as typeof import("@src/features/scan/ProcessingScreen");
    const screen = render(<ProcessingScreen />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockScanProcess).toHaveBeenCalled();
    });

    expect(await screen.findByText("PCGS PRICE GUIDE")).toBeTruthy();
    expect(await screen.findByText("Checking PCGS price guide")).toBeTruthy();
    expect(screen.queryByTestId("processing.sourcesLine")).toBeNull();
    expect(screen.getByTestId("processing.step.priceLookup")).toContainElement(
      screen.getByText("Checking PCGS price guide"),
    );
  });

  it("shows final estimate and save provider copy inside the value estimate row", async () => {
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

    expect(await screen.findByText("FIREBASE SAVE")).toBeTruthy();
    expect(await screen.findByText("Saving scan result")).toBeTruthy();
    expect(screen.getByTestId("processing.step.valueEstimate")).toContainElement(
      screen.getByText("Saving scan result"),
    );
    expect(screen.queryAllByText("Saving scan result")).toHaveLength(1);
  });

  it("marks historical records complete once the flow advances into value estimate", async () => {
    mockProgressUpdates.splice(
      0,
      mockProgressUpdates.length,
      {
        stage: "historicalRecords",
        progress: 1,
        currentSearchSource: "Building final estimate",
        lookupProgress: {
          sourceKey: "marketplace",
          sourceLabel: "Marketplace search",
          message: "Building final estimate",
        },
      },
    );

    const { ProcessingScreen } =
      require("@src/features/scan/ProcessingScreen") as typeof import("@src/features/scan/ProcessingScreen");
    const screen = render(<ProcessingScreen />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockScanProcess).toHaveBeenCalled();
    });

    expect(within(screen.getByTestId("processing.step.historicalRecords")).getByText("DONE")).toBeTruthy();
    expect(within(screen.getByTestId("processing.step.valueEstimate")).getByText("IN PROGRESS")).toBeTruthy();
    expect(screen.queryAllByText("Building final estimate")).toHaveLength(1);
  });
});
