import React from "react";
import { Text, View } from "react-native";
import { render, waitFor } from "@testing-library/react-native";

const mockNavigate = jest.fn();
const mockPush = jest.fn();
const mockSetPreferredScanMode = jest.fn();
const mockSetSelectedItem = jest.fn();
const mockSetSelectedItemID = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({
    navigate: mockNavigate,
    push: mockPush
  }),
  useFocusEffect: () => undefined
}));

jest.mock("@src/shared/design-system/primitives", () => {
  const ReactModule = require("react") as typeof import("react");
  const { Text: RNText, View: RNView, Pressable: RNPressable } = require("react-native") as typeof import("react-native");

  return {
    Screen: ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) => <RNView testID={testID}>{children}</RNView>,
    Divider: () => <RNView />,
    EmptyState: ({ title, testID }: { title: string; testID?: string }) => <RNText testID={testID}>{title}</RNText>,
    Thumbnail: ({ text, photoUri }: { text: string; photoUri?: string }) => (
      <RNView>
        <RNText>{photoUri ?? text}</RNText>
      </RNView>
    )
  };
});

jest.mock("@src/core/app/AppProvider", () => ({
  useAppState: () => ({
    container: {
      collectionRepository: {
        fetchAll: jest.fn().mockResolvedValue([
          {
            id: "scan-4",
            name: "1909-S VDB Lincoln Cent",
            category: "coin",
            conditionRaw: 4,
            origin: "United States",
            notes: "",
            photoUris: ["file:///tmp/scan-4.jpg"],
            priceLow: 950,
            priceMid: 1100,
            priceHigh: 1250,
            priceSource: "antiqueDB",
            priceFetchedAt: "2026-04-01T10:00:00.000Z",
            historySummary: "Key date cent.",
            addedAt: "2026-04-01T10:00:00.000Z",
            updatedAt: "2026-04-01T10:00:00.000Z",
            isSyncedToCloud: false
          },
          {
            id: "scan-3",
            name: "Blue Note LP",
            category: "vinyl",
            conditionRaw: 3,
            origin: "United States",
            notes: "",
            photoUris: [],
            priceLow: 180,
            priceMid: 260,
            priceHigh: 390,
            priceSource: "discogs",
            priceFetchedAt: "2026-03-31T10:00:00.000Z",
            historySummary: "Blue Note pressing.",
            addedAt: "2026-03-31T10:00:00.000Z",
            updatedAt: "2026-03-31T10:00:00.000Z",
            isSyncedToCloud: false
          },
          {
            id: "scan-2",
            name: "Art Deco Vase",
            category: "antique",
            conditionRaw: 5,
            origin: "France",
            notes: "",
            photoUris: [],
            priceLow: 300,
            priceMid: 420,
            priceHigh: 540,
            priceSource: "antiqueDB",
            priceFetchedAt: "2026-03-30T10:00:00.000Z",
            historySummary: "French glass vase.",
            addedAt: "2026-03-30T10:00:00.000Z",
            updatedAt: "2026-03-30T10:00:00.000Z",
            isSyncedToCloud: false
          },
          {
            id: "scan-1",
            name: "Topps Rookie Card",
            category: "card",
            conditionRaw: 2,
            origin: "United States",
            notes: "",
            photoUris: [],
            priceLow: 120,
            priceMid: 150,
            priceHigh: 210,
            priceSource: "ebay",
            priceFetchedAt: "2026-03-29T10:00:00.000Z",
            historySummary: "Sports card.",
            addedAt: "2026-03-29T10:00:00.000Z",
            updatedAt: "2026-03-29T10:00:00.000Z",
            isSyncedToCloud: false
          }
        ])
      },
      preferencesStore: {
        load: jest.fn().mockResolvedValue({ preferredCurrency: "usd" })
      }
    },
    preferredScanMode: "standard",
    setPreferredScanMode: mockSetPreferredScanMode,
    collectionVersion: 1,
    setSelectedItem: mockSetSelectedItem,
    setSelectedItemID: mockSetSelectedItemID
  })
}));

describe("HomeScreen", () => {
  it("shows the latest three saved scans and keeps photo thumbnails when present", async () => {
    const { HomeScreen } = require("@src/features/home/HomeScreen") as typeof import("@src/features/home/HomeScreen");
    const screen = render(<HomeScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("home.recentScanCell.scan-4")).toBeTruthy();
    });

    expect(screen.getByTestId("home.recentScanCell.scan-3")).toBeTruthy();
    expect(screen.getByTestId("home.recentScanCell.scan-2")).toBeTruthy();
    expect(screen.queryByTestId("home.recentScanCell.scan-1")).toBeNull();

    expect(screen.getByText("file:///tmp/scan-4.jpg")).toBeTruthy();
  });
});
