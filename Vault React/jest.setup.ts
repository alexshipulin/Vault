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

jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock")
);
