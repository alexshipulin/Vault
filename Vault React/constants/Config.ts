import Constants from "expo-constants";

type ExtraConfig = {
  firebaseApiKey?: string;
  firebaseProjectId?: string;
  firebaseAuthDomain?: string;
  firebaseStorageBucket?: string;
  firebaseAppId?: string;
  firebaseMessagingSenderId?: string;
  geminiApiKey?: string;
  vaultEnvironment?: string;
  vaultSeedData?: string;
  vaultFastProcessing?: string;
  vaultClearData?: string;
  vaultSkipOnboarding?: string;
  vaultRemoteBackend?: string;
  vaultForceMockCamera?: string;
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
  vaultEnvironment: getExtraConfig().vaultEnvironment === "production" ? "production" : "mock",
  flags: {
    seedData: asBool(getExtraConfig().vaultSeedData, true),
    fastProcessing: asBool(getExtraConfig().vaultFastProcessing),
    clearData: asBool(getExtraConfig().vaultClearData),
    skipOnboarding: asBool(getExtraConfig().vaultSkipOnboarding, true),
    remoteBackend: asBool(getExtraConfig().vaultRemoteBackend),
    forceMockCamera: asBool(getExtraConfig().vaultForceMockCamera)
  }
} as const;

export function hasRemoteConfig(): boolean {
  return Boolean(
    AppConfig.firebase.apiKey &&
      AppConfig.firebase.projectId &&
      AppConfig.firebase.authDomain &&
      AppConfig.firebase.storageBucket &&
      AppConfig.firebase.appId &&
      AppConfig.firebase.messagingSenderId &&
      AppConfig.geminiApiKey
  );
}
