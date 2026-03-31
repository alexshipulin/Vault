import "@testing-library/jest-native/extend-expect";

import mockAsyncStorage from "@react-native-async-storage/async-storage/jest/async-storage-mock";

jest.mock("@react-native-async-storage/async-storage", () => mockAsyncStorage);

jest.mock("expo-router", () => {
  return {
    Stack: {
      Screen: () => null
    },
    Tabs: {
      Screen: () => null
    },
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
