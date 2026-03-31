import "react-native-reanimated";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { validateAppConfig } from "@/constants/Config";
import { ensureAnonymousSession } from "@/lib/firebase/auth";
import { initializeFirebase } from "@/lib/firebase/config";
import { GeminiClient } from "@/lib/gemini/client";

const ONBOARDING_KEY = "vaultscope:onboarding-complete";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [initialRouteName, setInitialRouteName] = useState<"(tabs)" | "onboarding">("onboarding");
  const [bootError, setBootError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      try {
        validateAppConfig();
        GeminiClient.validateConfig();
        initializeFirebase();
        await ensureAnonymousSession();
        const onboardingComplete = await AsyncStorage.getItem(ONBOARDING_KEY);

        if (active) {
          setInitialRouteName(onboardingComplete === "true" ? "(tabs)" : "onboarding");
        }
      } catch (error) {
        if (active) {
          setBootError(
            error instanceof Error ? error : new Error("VaultScope failed to initialize."),
          );
        }
      } finally {
        if (active) {
          setReady(true);
          await SplashScreen.hideAsync();
        }
      }
    };

    void bootstrap();

    return () => {
      active = false;
    };
  }, []);

  if (bootError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Startup configuration issue</Text>
        <Text style={styles.errorBody}>{bootError.message}</Text>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#1E3A34" size="large" />
        <Text style={styles.loadingText}>Initializing VaultScope...</Text>
      </View>
    );
  }

  return (
    <Stack initialRouteName={initialRouteName} screenOptions={{ headerShown: false }}>
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="scan-result/[id]" options={{ presentation: "card" }} />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "#F4EFE4",
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    color: "#4B5A57",
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#8F2D2D",
    textAlign: "center",
  },
  errorBody: {
    fontSize: 15,
    lineHeight: 22,
    color: "#4D4032",
    textAlign: "center",
  },
});
