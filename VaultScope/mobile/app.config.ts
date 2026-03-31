import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
  return {
    ...config,
    extra: {
      ...config.extra,
      firebaseApiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? "",
      firebaseProjectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? "",
      firebaseAuthDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
      firebaseStorageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
      firebaseAppId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? "",
      firebaseMessagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
      geminiApiKey: process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? ""
    }
  };
};
