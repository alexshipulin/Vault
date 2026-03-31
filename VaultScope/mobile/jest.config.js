module.exports = {
  preset: "jest-expo",
  testMatch: ["**/__tests__/**/*.test.ts"],
  testPathIgnorePatterns: ["/e2e/"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native|expo(nent)?|@expo(nent)?/.*|expo-camera|expo-file-system|expo-haptics|expo-image-picker|expo-image-manipulator|expo-router|react-native-reanimated|@react-navigation/.*))",
  ],
  collectCoverageFrom: [
    "lib/**/*.ts",
    "components/**/*.tsx",
    "!lib/types/**/*.ts",
    "!lib/gemini/types.ts",
    "!lib/firebase/types.ts",
    "!lib/scan/types.ts",
  ],
};
