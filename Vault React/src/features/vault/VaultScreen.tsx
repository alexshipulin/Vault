import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";

import { useAppState } from "@src/core/app/AppProvider";
import type { CollectibleItem, CollectibleListItem, PreferredCurrency } from "@src/domain/models";
import {
  EmptyState,
  GridCard,
  Panel,
  ScreenHeader,
  ScrollScreen,
  SearchField,
  SectionLabel
} from "@src/shared/design-system/primitives";
import { colors, spacing, textStyles } from "@src/shared/design-system/tokens";
import { t } from "@src/shared/i18n/strings";
import { collectibleListItemFromItem, formatCurrency, totalCollectionValue } from "@src/shared/utils/formatters";

export function VaultScreen() {
  const router = useRouter();
  const { container, collectionVersion, setSelectedItem, setSelectedItemID } = useAppState();
  const [searchText, setSearchText] = useState("");
  const [rawItems, setRawItems] = useState<CollectibleItem[]>([]);
  const [items, setItems] = useState<CollectibleListItem[]>([]);
  const [currency, setCurrency] = useState<PreferredCurrency>("usd");

  const load = useCallback(async () => {
    const [savedItems, preferences] = await Promise.all([
      container.collectionRepository.fetchAll(),
      container.preferencesStore.load()
    ]);
    setCurrency(preferences.preferredCurrency);
    setRawItems(savedItems);
    setItems(savedItems.map((item) => collectibleListItemFromItem(item, preferences.preferredCurrency)));
  }, [container]);

  useFocusEffect(
    useCallback(() => {
      void collectionVersion;
      void load();
    }, [load, collectionVersion])
  );

  const filteredItems = useMemo(() => {
    const normalized = searchText.trim().toLowerCase();
    if (!normalized) {
      return items;
    }

    return items.filter((item) => {
      return (
        item.title.toLowerCase().includes(normalized) ||
        item.subtitle.toLowerCase().includes(normalized) ||
        item.categoryText.toLowerCase().includes(normalized) ||
        item.noteText.toLowerCase().includes(normalized)
      );
    });
  }, [items, searchText]);

  return (
    <ScrollScreen testID="vault.screen">
      <ScreenHeader title={t("vault.title")} testID="vault.title" />
      <SearchField
        value={searchText}
        onChangeText={setSearchText}
        placeholder={t("vault.search.placeholder")}
        testID="vault.searchField"
      />

      <Panel>
        <View style={{ flexDirection: "row", alignItems: "stretch" }}>
          <View style={{ flex: 1 }} testID="vault.itemCount">
            <Text style={[textStyles.sectionLabel, { color: colors.foregroundSubtle }]}>{t("vault.summary.count")}</Text>
            <Text style={[textStyles.rowTitle, { color: colors.foreground }]}>{items.length}</Text>
          </View>
          <View style={{ width: 1, backgroundColor: colors.borderMuted }} />
          <View style={{ flex: 1, paddingLeft: spacing.md }} testID="vault.totalValue">
            <Text style={[textStyles.sectionLabel, { color: colors.foregroundSubtle }]}>{t("vault.summary.value")}</Text>
            <Text style={[textStyles.rowTitle, { color: colors.foreground }]}>
              {formatCurrency(totalCollectionValue(rawItems), currency)}
            </Text>
          </View>
        </View>
      </Panel>

      <Panel>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <SectionLabel>{t("vault.collection.section")}</SectionLabel>
          <View style={{ flex: 1 }} />
          <Text style={[textStyles.micro, { color: colors.foregroundSubtle }]}>{filteredItems.length}</Text>
        </View>

        {filteredItems.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }} testID="vault.grid">
            {filteredItems.map((item) => (
              <View key={item.id} style={{ width: "47%" }}>
                <GridCard
                  item={item}
                  onPress={() => {
                    setSelectedItem(item);
                    setSelectedItemID(item.id);
                    router.push({
                      pathname: "/item/[itemId]",
                      params: { itemId: item.id, source: "vault" }
                    });
                  }}
                  testID={`vault.itemCell.${item.id}`}
                />
              </View>
            ))}
          </View>
        ) : items.length > 0 ? (
          <EmptyState
            title={t("vault.search_empty.title")}
            message={t("vault.search_empty.message")}
            actionTitle={t("vault.search.clear")}
            onAction={() => setSearchText("")}
            testID="vault.emptyState"
          />
        ) : (
          <EmptyState
            title={t("vault.empty.title")}
            message={t("vault.empty.message")}
            actionTitle={t("vault.empty.action")}
            onAction={() => router.navigate("/scan")}
            testID="vault.emptyState"
          />
        )}
      </Panel>
    </ScrollScreen>
  );
}
