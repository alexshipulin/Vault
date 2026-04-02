import Constants from "expo-constants";

type ExtraConfig = {
  firebaseApiKey?: string;
  firebaseProjectId?: string;
  firebaseAuthDomain?: string;
  firebaseStorageBucket?: string;
  firebaseAppId?: string;
  firebaseMessagingSenderId?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  vaultEnvironment?: string;
  vaultSeedData?: string;
  vaultFastProcessing?: string;
  vaultClearData?: string;
  vaultSkipOnboarding?: string;
  vaultRemoteBackend?: string;
  vaultForceMockCamera?: string;
  vaultDebugSinkUrl?: string;
};

function getExtraConfig(): ExtraConfig {
  return (Constants.expoConfig?.extra ?? {}) as ExtraConfig;
}

function asBool(value: string | undefined, fallback = false): boolean {
  if (value == null) {
    return fallback;
  }

  return value === "true";
}

function optionalEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export const AppConfig = {
  firebase: {
    apiKey: optionalEnv(getExtraConfig().firebaseApiKey),
    projectId: optionalEnv(getExtraConfig().firebaseProjectId),
    authDomain: optionalEnv(getExtraConfig().firebaseAuthDomain),
    storageBucket: optionalEnv(getExtraConfig().firebaseStorageBucket),
    appId: optionalEnv(getExtraConfig().firebaseAppId),
    messagingSenderId: optionalEnv(getExtraConfig().firebaseMessagingSenderId)
  },
  geminiApiKey: optionalEnv(getExtraConfig().geminiApiKey),
  geminiModel: optionalEnv(getExtraConfig().geminiModel),
  debugSinkUrl: optionalEnv(getExtraConfig().vaultDebugSinkUrl),
  vaultEnvironment: getExtraConfig().vaultEnvironment === "production" ? "production" : "mock",
  flags: {
    seedData: asBool(getExtraConfig().vaultSeedData),
    fastProcessing: asBool(getExtraConfig().vaultFastProcessing),
    clearData: asBool(getExtraConfig().vaultClearData),
    skipOnboarding: asBool(getExtraConfig().vaultSkipOnboarding, true),
    remoteBackend: asBool(getExtraConfig().vaultRemoteBackend),
    forceMockCamera: asBool(getExtraConfig().vaultForceMockCamera)
  }
} as const;

export function getRemoteReadinessStatus(): {
  isReady: boolean;
  missingConfig: string[];
} {
  const missing: string[] = [];

  if (!AppConfig.firebase.apiKey) missing.push("Firebase API Key");
  if (!AppConfig.firebase.projectId) missing.push("Firebase Project ID");
  if (!AppConfig.firebase.authDomain) missing.push("Firebase Auth Domain");
  if (!AppConfig.firebase.storageBucket) missing.push("Firebase Storage Bucket");
  if (!AppConfig.firebase.appId) missing.push("Firebase App ID");
  if (!AppConfig.firebase.messagingSenderId) missing.push("Firebase Messaging Sender ID");
  if (!AppConfig.geminiApiKey) missing.push("Gemini API Key");

  return {
    isReady: missing.length === 0,
    missingConfig: missing
  };
}

export function hasRemoteConfig(): boolean {
  return getRemoteReadinessStatus().isReady;
}
