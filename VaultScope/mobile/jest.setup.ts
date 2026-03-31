jest.mock(
  "@react-native-async-storage/async-storage",
  () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        firebaseApiKey: "test-firebase-api-key",
        firebaseProjectId: "test-project-id",
        firebaseAuthDomain: "test.firebaseapp.com",
        firebaseStorageBucket: "test.firebasestorage.app",
        firebaseAppId: "test-app-id",
        firebaseMessagingSenderId: "1234567890",
        geminiApiKey: "test-gemini-api-key",
      },
    },
  },
}));

Object.defineProperty(global, "fetch", {
  writable: true,
  value: jest.fn(),
});

beforeEach(() => {
  jest.clearAllMocks();
});
