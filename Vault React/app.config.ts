import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Vault React",
  slug: "vault-react",
  scheme: "vaultreact",
  orientation: "portrait",
  userInterfaceStyle: "dark",
  plugins: [
    "expo-router",
    "expo-sharing",
    [
      "expo-camera",
      {
        cameraPermission: "Vault React uses the camera to scan collectibles."
      }
    ]
  ],
  experiments: {
    typedRoutes: true
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.alexshipulin.vaultreact"
  },
  android: {
    package: "com.alexshipulin.vaultreact"
  },
  extra: {
    ...config.extra,
    firebaseApiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? "",
    firebaseProjectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    firebaseAuthDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    firebaseStorageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
    firebaseAppId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? "",
    firebaseMessagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    geminiApiKey: process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? "",
    vaultEnvironment: process.env.EXPO_PUBLIC_VAULT_ENVIRONMENT ?? "mock",
    vaultSeedData: process.env.EXPO_PUBLIC_VAULT_SEED_DATA ?? "true",
    vaultFastProcessing: process.env.EXPO_PUBLIC_VAULT_FAST_PROCESSING ?? "false",
    vaultClearData: process.env.EXPO_PUBLIC_VAULT_CLEAR_DATA ?? "false",
    vaultSkipOnboarding: process.env.EXPO_PUBLIC_VAULT_SKIP_ONBOARDING ?? "true",
    vaultRemoteBackend: process.env.EXPO_PUBLIC_VAULT_REMOTE_BACKEND ?? "false",
    vaultForceMockCamera: process.env.EXPO_PUBLIC_VAULT_FORCE_MOCK_CAMERA ?? "false"
  }
});
