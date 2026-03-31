import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Text, View } from "react-native";

import { useAppState } from "@src/app/AppProvider";
import type { CollectibleListItem, PreferredCurrency } from "@src/domain/models";
import {
  Panel,
  PrimaryButton,
  RecentScanRow,
  HeaderAction,
  ScreenHeader,
  ScrollScreen,
  SectionLabel,
  SegmentedModeSwitch,
  EmptyState
} from "@src/shared/design-system/primitives";
import { colors, textStyles } from "@src/shared/design-system/tokens";
import { t } from "@src/shared/i18n/strings";
import { collectibleListItemFromItem, formatCurrency, totalCollectionValue } from "@src/shared/utils/formatters";

export function HomeScreen() {
  const router = useRouter();
  const {
    container,
    preferredScanMode,
    setPreferredScanMode,
    collectionVersion,
    setSelectedItem,
    setSelectedItemID
  } = useAppState();
  const [recentItems, setRecentItems] = useState<CollectibleListItem[]>([]);
  const [estimatedTotal, setEstimatedTotal] = useState("$0");

  const load = useCallback(async () => {
    const [items, preferences] = await Promise.all([
      container.collectionRepository.fetchAll(),
      container.preferencesStore.load()
    ]);
    const currency = preferences.preferredCurrency as PreferredCurrency;

    setRecentItems(items.map((item) => collectibleListItemFromItem(item, currency)));
    setEstimatedTotal(formatCurrency(totalCollectionValue(items), currency));
  }, [container]);

  useFocusEffect(
    useCallback(() => {
      void collectionVersion;
      void load();
    }, [load, collectionVersion])
  );

  return (
    <ScrollScreen testID="home.screen">
      <ScreenHeader
        title={t("home.title")}
        rightAction={
          <HeaderAction
            icon="person-outline"
            onPress={() => router.navigate("/(tabs)/profile")}
            testID="home.profileButton"
          />
        }
        testID="home.title"
      />

      <Panel>
        <SectionLabel>{t("home.total.section")}</SectionLabel>
        <Text style={[textStyles.rowTitle, { color: colors.foreground }]} testID="home.totalValue">
          {estimatedTotal}
        </Text>
        <Text style={[textStyles.micro, { color: colors.foregroundSubtle }]}>
          {t("home.total.caption")}
        </Text>
      </Panel>

      <Panel>
        <SectionLabel>{t("home.scan.section")}</SectionLabel>
        <Text style={[textStyles.body, { color: colors.foregroundMuted }]}>
          {t("home.scan.caption")}
        </Text>
        <SegmentedModeSwitch
          value={preferredScanMode}
          onChange={setPreferredScanMode}
          testPrefix="home.mode"
        />
        <PrimaryButton
          onPress={() => router.navigate("/(tabs)/scan")}
          testID="home.startScanButton"
          title={t("home.start_scan")}
        />
      </Panel>

      <Panel testID="home.recentScansSection">
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <SectionLabel>{t("home.recent.section")}</SectionLabel>
          <View style={{ flex: 1 }} />
          <Text
            accessibilityRole="button"
            onPress={() => router.navigate("/(tabs)/vault")}
            style={[textStyles.micro, { color: colors.foregroundSubtle }]}
            testID="home.viewAllButton"
          >
            {t("common.all")}
          </Text>
        </View>

        {recentItems.length > 0 ? (
          recentItems.slice(0, 3).map((item, index) => (
            <RecentScanRow
              item={item}
              key={item.id}
              onPress={() => {
                setSelectedItem(item);
                setSelectedItemID(item.id);
                router.push(`/item/${item.id}?source=home`);
              }}
              showDivider={index < Math.min(recentItems.length, 3) - 1}
              testID={`home.recentScanCell.${item.id}`}
            />
          ))
        ) : (
          <EmptyState
            title={t("home.empty.title")}
            message={t("home.empty.message")}
            actionTitle={t("home.start_scan")}
            onAction={() => router.navigate("/(tabs)/scan")}
            testID="home.recentScansSection.empty"
          />
        )}
      </Panel>
    </ScrollScreen>
  );
}
