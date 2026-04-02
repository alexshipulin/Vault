import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useAppState } from "@src/core/app/AppProvider";
import type { CollectibleListItem, PreferredCurrency, ScanResult } from "@src/domain/models";
import {
  EmptyState,
  Screen,
  Thumbnail,
} from "@src/shared/design-system/primitives";
import { borders, colors, spacing } from "@src/shared/design-system/tokens";
import { t } from "@src/shared/i18n/strings";
import {
  collectibleListItemFromItem,
  collectibleListItemFromResult,
  formatCurrency,
  totalCollectionValue
} from "@src/shared/utils/formatters";

export function HomeScreen() {
  const router = useRouter();
  const {
    container,
    preferredScanMode,
    setPreferredScanMode,
    collectionVersion,
    latestResult,
    selectedItem,
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
    const savedRecentItems = items.map((item) => mapHomeRecentItemFromItem(item, currency));
    const hasSavedLatestResult = latestResult ? items.some((item) => item.id === latestResult.id) : false;
    const unsavedLatestResult =
      latestResult && !hasSavedLatestResult
        ? {
            ...mapHomeRecentItemFromResult(latestResult, currency),
            photoUri: selectedItem?.id === latestResult.id ? selectedItem.photoUri : undefined
          }
        : null;
    const recent = unsavedLatestResult
      ? [unsavedLatestResult, ...savedRecentItems].slice(0, 3)
      : savedRecentItems.slice(0, 3);

    setRecentItems(recent);
    setEstimatedTotal(formatCurrency(totalCollectionValue(items), currency));
  }, [container, latestResult, selectedItem]);

  useEffect(() => {
    void load();
  }, [load, collectionVersion]);

  useFocusEffect(
    useCallback(() => {
      void collectionVersion;
      void load();
    }, [load, collectionVersion])
  );

  return (
    <Screen edges={["top", "left", "right"]} testID="home.screen">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerSpacer} />
          <Text style={styles.headerTitle} testID="home.title">
            {t("home.title").toUpperCase()}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.sectionDivider} />

        <View style={styles.valueBar}>
          <Text style={styles.valueLabel}>{t("home.total.section")}</Text>
          <Text style={styles.valueAmount} testID="home.totalValue">
            {estimatedTotal}
          </Text>
        </View>

        <View style={styles.sectionDivider} />

        <View style={styles.ctaZone}>
          <Text style={styles.ctaLabel}>{t("home.scan.section")}</Text>
          <Pressable
            onPress={() => router.navigate("/scan")}
            style={styles.scanButton}
            testID="home.startScanButton"
          >
            <Ionicons color={colors.inverseForeground} name="scan-outline" size={18} />
            <Text style={styles.scanButtonText}>{t("home.start_scan")}</Text>
          </Pressable>

          <View style={styles.modeToggle}>
            <HomeModeOption
              description="Valuables & collectibles"
              selected={preferredScanMode === "standard"}
              testID="home.mode.standard"
              title="STANDARD"
              onPress={() => {
                void setPreferredScanMode("standard");
              }}
            />
            <HomeModeOption
              description="Unknown flea market finds"
              selected={preferredScanMode === "mystery"}
              testID="home.mode.mystery"
              title="MYSTERY"
              onPress={() => {
                void setPreferredScanMode("mystery");
              }}
            />
          </View>
        </View>

        <View style={styles.sectionDivider} />

        <View testID="home.recentScansSection">
          <View style={styles.recentHeader}>
            <Text style={styles.recentHeaderLabel}>{t("home.recent.section")}</Text>
            <Pressable onPress={() => router.navigate("/vault")} testID="home.viewAllButton">
              <Text style={styles.recentHeaderAction}>{`${t("common.all")} →`}</Text>
            </Pressable>
          </View>

          {recentItems.length > 0 ? (
            recentItems.map((item, index) => (
              <React.Fragment key={item.id}>
                <HomeRecentRow
                  item={item}
                  onPress={() => {
                    setSelectedItem(item);
                    setSelectedItemID(item.id);
                    router.push({
                      pathname: "/item/[itemId]",
                      params: { itemId: item.id, source: "home" }
                    });
                  }}
                  testID={`home.recentScanCell.${item.id}`}
                />
                {index < recentItems.length - 1 ? <View style={styles.recentDivider} /> : null}
              </React.Fragment>
            ))
          ) : (
            <View style={styles.emptyWrap}>
              <EmptyState
                title={t("home.empty.title")}
                message={t("home.empty.message")}
                actionTitle={t("home.start_scan")}
                onAction={() => router.navigate("/scan")}
                testID="home.recentScansSection.empty"
              />
            </View>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

function HomeModeOption({
  title,
  description,
  selected,
  onPress,
  testID
}: {
  title: string;
  description: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.modeOption, selected ? styles.modeOptionSelected : styles.modeOptionIdle]}
      testID={testID}
    >
      <Text style={[styles.modeTitle, selected ? styles.modeTitleSelected : styles.modeTitleIdle]}>
        {title}
      </Text>
      <Text
        style={[
          styles.modeDescription,
          selected ? styles.modeDescriptionSelected : styles.modeDescriptionIdle
        ]}
      >
        {description}
      </Text>
    </Pressable>
  );
}

function HomeRecentRow({
  item,
  onPress,
  testID
}: {
  item: CollectibleListItem;
  onPress: () => void;
  testID: string;
}) {
  const subtitle = item.subtitle || item.categoryText;

  return (
    <Pressable onPress={onPress} style={styles.recentRow} testID={testID}>
      <Thumbnail photoUri={item.photoUri} size={48} text={item.thumbnailText} />
      <View style={styles.recentInfo}>
        <Text numberOfLines={1} style={styles.recentTitle}>
          {item.title}
        </Text>
        <Text numberOfLines={1} style={styles.recentSubtitle}>
          {subtitle}
        </Text>
      </View>
      <Text numberOfLines={1} style={styles.recentPrice}>
        {item.valueText}
      </Text>
    </Pressable>
  );
}

function mapHomeRecentItemFromItem(item: Parameters<typeof collectibleListItemFromItem>[0], currency: PreferredCurrency) {
  const listItem = collectibleListItemFromItem(item, currency);
  const compactValue = item.priceMid ?? item.priceHigh ?? item.priceLow ?? null;

  return {
    ...listItem,
    valueText: typeof compactValue === "number" ? formatCurrency(compactValue, currency) : listItem.valueText
  };
}

function mapHomeRecentItemFromResult(result: ScanResult, currency: PreferredCurrency) {
  const listItem = collectibleListItemFromResult(result, currency);
  const compactValue = result.priceData?.mid ?? result.priceData?.high ?? result.priceData?.low ?? null;

  return {
    ...listItem,
    valueText: typeof compactValue === "number" ? formatCurrency(compactValue, currency) : listItem.valueText
  };
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 40,
  },
  header: {
    height: 52,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerSpacer: {
    width: 36,
    height: 36,
  },
  headerTitle: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 3,
    textAlign: "center",
  },
  valueBar: {
    height: 48,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  valueLabel: {
    color: "#444444",
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 2,
  },
  valueAmount: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "500",
  },
  ctaZone: {
    paddingVertical: 40,
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 20,
  },
  ctaLabel: {
    color: "#888888",
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 3,
  },
  scanButton: {
    width: 240,
    height: 56,
    backgroundColor: colors.fillSelected,
    borderWidth: borders.hairline,
    borderColor: colors.borderStrong,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  scanButtonText: {
    color: colors.inverseForeground,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2,
  },
  modeToggle: {
    flexDirection: "row",
  },
  modeOption: {
    width: 120,
    height: 52,
    paddingVertical: 8,
    paddingHorizontal: 14,
    justifyContent: "center",
    alignItems: "center",
    gap: 3,
  },
  modeOptionSelected: {
    backgroundColor: colors.fillSelected,
  },
  modeOptionIdle: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: "#FFFFFF",
  },
  modeTitle: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 2,
  },
  modeTitleSelected: {
    color: colors.inverseForeground,
  },
  modeTitleIdle: {
    color: "#FFFFFF",
  },
  modeDescription: {
    fontSize: 8,
    lineHeight: 10,
    textAlign: "center",
  },
  modeDescriptionSelected: {
    color: "#555555",
  },
  modeDescriptionIdle: {
    color: "#FFFFFF",
  },
  recentHeader: {
    height: 44,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  recentHeaderLabel: {
    color: "#444444",
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 2,
  },
  recentHeaderAction: {
    color: colors.foreground,
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 2,
  },
  sectionDivider: {
    width: "100%",
    height: 1,
    backgroundColor: "#1A1A1A",
  },
  recentRow: {
    height: 72,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  recentInfo: {
    flex: 1,
    gap: 4,
  },
  recentTitle: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "500",
  },
  recentSubtitle: {
    color: "#555555",
    fontSize: 11,
    fontWeight: "400",
  },
  recentDivider: {
    width: "100%",
    height: 1,
    backgroundColor: "#111111",
  },
  recentPrice: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "600",
    marginLeft: spacing.sm,
    flexShrink: 0,
  },
  emptyWrap: {
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
});
