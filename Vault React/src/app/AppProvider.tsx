import * as SplashScreen from "expo-splash-screen";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { createAppContainer, type ExtendedAppContainer } from "@src/app/container";
import type { CollectibleListItem, ScanMode, ScanResult, TemporaryScanSession } from "@src/domain/models";
import { t } from "@src/shared/i18n/strings";
import { colors, textStyles } from "@src/shared/design-system/tokens";

void SplashScreen.preventAutoHideAsync();

type AppStateValue = {
  container: ExtendedAppContainer;
  ready: boolean;
  preferredScanMode: ScanMode;
  setPreferredScanMode: (mode: ScanMode) => Promise<void>;
  currentSession: TemporaryScanSession | null;
  setCurrentSession: (session: TemporaryScanSession | null) => Promise<void>;
  latestResult: ScanResult | null;
  setLatestResult: (result: ScanResult | null) => void;
  selectedItem: CollectibleListItem | null;
  setSelectedItem: (item: CollectibleListItem | null) => void;
  selectedItemID: string | null;
  setSelectedItemID: (itemID: string | null) => void;
  collectionVersion: number;
  bumpCollectionVersion: () => void;
};

const AppContext = createContext<AppStateValue | null>(null);

export function AppProvider({ children }: React.PropsWithChildren) {
  const container = useMemo(() => createAppContainer(), []);
  const [ready, setReady] = useState(false);
  const [preferredScanMode, setPreferredScanModeState] = useState<ScanMode>("standard");
  const [currentSession, setCurrentSessionState] = useState<TemporaryScanSession | null>(null);
  const [latestResult, setLatestResult] = useState<ScanResult | null>(null);
  const [selectedItem, setSelectedItem] = useState<CollectibleListItem | null>(null);
  const [selectedItemID, setSelectedItemID] = useState<string | null>(null);
  const [collectionVersion, setCollectionVersion] = useState(0);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      await container.bootstrap();
      const [mode, session] = await Promise.all([
        container.scanModeStore.load(),
        container.temporaryScanSessionStore.load()
      ]);

      if (!mounted) {
        return;
      }

      setPreferredScanModeState(mode);
      setCurrentSessionState(session);
      setReady(true);
      await SplashScreen.hideAsync();
    };

    void bootstrap();

    return () => {
      mounted = false;
    };
  }, [container]);

  const value = useMemo<AppStateValue>(
    () => ({
      container,
      ready,
      preferredScanMode,
      async setPreferredScanMode(mode) {
        setPreferredScanModeState(mode);
        await container.scanModeStore.save(mode);
      },
      currentSession,
      async setCurrentSession(session) {
        setCurrentSessionState(session);
        if (session) {
          await container.temporaryScanSessionStore.save(session);
        } else {
          await container.temporaryScanSessionStore.clear();
        }
      },
      latestResult,
      setLatestResult,
      selectedItem,
      setSelectedItem,
      selectedItemID,
      setSelectedItemID,
      collectionVersion,
      bumpCollectionVersion() {
        setCollectionVersion((value) => value + 1);
      }
    }),
    [collectionVersion, container, currentSession, latestResult, preferredScanMode, ready, selectedItem, selectedItemID]
  );

  if (!ready) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color={colors.foreground} />
        <Text style={styles.loadingText}>{t("common.loading")}</Text>
      </View>
    );
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppState(): AppStateValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppState must be used inside AppProvider");
  }

  return context;
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: colors.background
  },
  loadingText: {
    ...textStyles.body,
    color: colors.foregroundMuted
  }
});
