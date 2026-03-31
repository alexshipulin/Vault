import Constants from "expo-constants";

type ExtraConfig = {
  firebaseApiKey?: string;
  firebaseProjectId?: string;
  firebaseAuthDomain?: string;
  firebaseStorageBucket?: string;
  firebaseAppId?: string;
  firebaseMessagingSenderId?: string;
  geminiApiKey?: string;
};

function getExtraConfig(): ExtraConfig {
  return (Constants.expoConfig?.extra ?? {}) as ExtraConfig;
}

function requireEnv(name: string, value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value.trim();
}

export const AppConfig = {
  firebase: {
    apiKey: requireEnv("EXPO_PUBLIC_FIREBASE_API_KEY", getExtraConfig().firebaseApiKey),
    projectId: requireEnv("EXPO_PUBLIC_FIREBASE_PROJECT_ID", getExtraConfig().firebaseProjectId),
    authDomain: requireEnv("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN", getExtraConfig().firebaseAuthDomain),
    storageBucket: requireEnv(
      "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET",
      getExtraConfig().firebaseStorageBucket,
    ),
    appId: requireEnv("EXPO_PUBLIC_FIREBASE_APP_ID", getExtraConfig().firebaseAppId),
    messagingSenderId: requireEnv(
      "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
      getExtraConfig().firebaseMessagingSenderId,
    ),
  },
  geminiApiKey: requireEnv("EXPO_PUBLIC_GEMINI_API_KEY", getExtraConfig().geminiApiKey),
};

export function validateAppConfig(): void {
  void AppConfig.firebase.apiKey;
  void AppConfig.firebase.projectId;
  void AppConfig.firebase.authDomain;
  void AppConfig.firebase.storageBucket;
  void AppConfig.firebase.appId;
  void AppConfig.firebase.messagingSenderId;
  void AppConfig.geminiApiKey;
}
