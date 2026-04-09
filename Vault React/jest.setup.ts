import "@testing-library/jest-native/extend-expect";
import React from "react";

import mockAsyncStorage from "@react-native-async-storage/async-storage/jest/async-storage-mock";

jest.mock("@react-native-async-storage/async-storage", () => mockAsyncStorage);

jest.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
  hideAsync: jest.fn(() => Promise.resolve())
}));

jest.mock("expo-router", () => {
  const mockReact = require("react");
  const passthrough = ({ children }: { children?: React.ReactNode }) =>
    mockReact.createElement(mockReact.Fragment, null, children);
  const screen = () => null;

  return {
    Stack: Object.assign(passthrough, { Screen: screen }),
    Tabs: Object.assign(passthrough, { Screen: screen }),
    useRouter: () => ({
      push: jest.fn(),
      replace: jest.fn(),
      back: jest.fn(),
      navigate: jest.fn()
    }),
    useLocalSearchParams: () => ({}),
    useFocusEffect: (callback: () => void) => callback()
  };
});

jest.mock("react-native-safe-area-context", () => {
  const React = require("react");
  const { View } = require("react-native");

  return {
    SafeAreaProvider: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    SafeAreaView: ({ children, ...rest }: { children?: React.ReactNode }) =>
      React.createElement(View, rest, children),
    useSafeAreaInsets: () => ({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    }),
    useSafeAreaFrame: () => ({
      x: 0,
      y: 0,
      width: 390,
      height: 844,
    }),
    initialWindowMetrics: {
      frame: { x: 0, y: 0, width: 390, height: 844 },
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
    },
  };
});

jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock")
);
