import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, Image, Share, Text, View } from "react-native";

import { useAppState } from "@src/app/AppProvider";
import type { CollectibleItem, CollectibleListItem, PreferredCurrency } from "@src/domain/models";
import {
  Divider,
  HeaderAction,
  InfoRow,
  Panel,
  Screen,
  ScreenHeader,
  SectionLabel,
  SecondaryButton,
  StickyActionBar,
  Thumbnail
} from "@src/shared/design-system/primitives";
import { borders, colors, spacing, textStyles } from "@src/shared/design-system/tokens";
import { t } from "@src/shared/i18n/strings";
import {
  categoryDisplayName,
  collectibleListItemFromItem,
  conditionDisplayLabel,
  eraText,
  formatCurrency,
  formatDate,
  priceSourceDisplayName,
  valueRangeText
} from "@src/shared/utils/formatters";

export function ItemDetailsScreen() {
  const params = useLocalSearchParams<{ itemId: string; source?: string }>();
  const router = useRouter();
  const { container, collectionVersion, selectedItem, setSelectedItem, setSelectedItemID } = useAppState();
  const [item, setItem] = useState<CollectibleItem | null>(null);
  const [currency, setCurrency] = useState<PreferredCurrency>("usd");

  const load = useCallback(async () => {
    const [items, preferences] = await Promise.all([
      container.collectionRepository.fetchAll(),
      container.preferencesStore.load()
    ]);
    const found = items.find((entry) => entry.id === params.itemId) ?? null;
    setItem(found);
    setCurrency(preferences.preferredCurrency);
  }, [container, params.itemId]);

  useFocusEffect(
    useCallback(() => {
      void collectionVersion;
      void load();
    }, [load, collectionVersion])
  );

  const fallback = selectedItem;
  const itemTitle = item?.name ?? fallback?.title ?? "Unknown item";
  const secondary = [categoryDisplayName(item?.category ?? fallback?.categoryText ?? ""), eraText(item?.year), item?.origin ?? fallback?.subtitle ?? t("common.unknown_origin")].join(" · ");
  const valueText = item ? valueRangeText(item, currency) : fallback?.valueText ?? formatCurrency(0, currency);
  const shareText = [itemTitle, secondary, `${t("details.market_value")}: ${valueText}`].join("\n");
  const trend = item ? container.marketTrendProvider.trendFor(item) : null;
  const displayItem: CollectibleListItem | null = item ? collectibleListItemFromItem(item, currency) : fallback;

  return (
    <Screen testID="details.screen">
      <View style={{ flex: 1, paddingHorizontal: spacing.lg, paddingTop: 20, paddingBottom: 164, gap: spacing.lg }}>
        <ScreenHeader
          title={t("details.title")}
          leftAction={<HeaderAction icon="chevron-back" onPress={() => router.back()} testID="details.backButton" />}
          rightAction={
            <HeaderAction
              icon="ellipsis-horizontal"
              onPress={() => {
                void Share.share({ message: shareText });
              }}
              testID="details.moreButton"
            />
          }
          testID="details.headerTitle"
        />

        <View
          style={{
            width: "100%",
            height: 260,
            borderWidth: borders.hairline,
            borderColor: colors.borderDefault,
            backgroundColor: colors.surface,
            alignItems: "center",
            justifyContent: "center"
          }}
          testID="details.image"
        >
          {item?.photoUris[0] || displayItem?.photoUri ? (
            <Image
              source={{ uri: item?.photoUris[0] ?? displayItem?.photoUri }}
              style={{ width: "100%", height: "100%" }}
              resizeMode="cover"
            />
          ) : (
            <Thumbnail text={displayItem?.thumbnailText ?? itemTitle.slice(0, 2).toUpperCase()} size={96} />
          )}
        </View>

        <Panel>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ gap: spacing.xxs }}>
              <SectionLabel>{t("details.scanned")}</SectionLabel>
              <Text style={[textStyles.body, { color: colors.foreground }]}>
                {item ? formatDate(item.addedAt) : fallback?.timestampText ?? formatDate(new Date().toISOString())}
              </Text>
            </View>
            <View style={{ flex: 1 }} />
            <Text
              style={[textStyles.micro, { color: colors.foregroundSubtle }]}
              onPress={() =>
                Alert.alert(t("details.edit_placeholder.title"), t("details.edit_placeholder.message"))
              }
            >
              {t("details.edit")}
            </Text>
          </View>
        </Panel>

        <Panel>
          <Text style={[textStyles.screenTitle, { color: colors.foreground }]} testID="details.title">
            {itemTitle}
          </Text>
          <Text style={[textStyles.body, { color: colors.foregroundMuted }]}>{secondary}</Text>
        </Panel>

        <Panel>
          <InfoRow label={t("details.category")} value={categoryDisplayName(item?.category ?? fallback?.categoryText ?? "")} />
          <Divider />
          <InfoRow label={t("details.origin")} value={item?.origin ?? fallback?.subtitle ?? t("common.unknown_origin")} />
          <Divider />
          <InfoRow label={t("details.era")} value={eraText(item?.year)} />
          <Divider />
          <InfoRow label={t("details.condition")} value={conditionDisplayLabel(item?.conditionRaw)} />
        </Panel>

        <Panel>
          <SectionLabel>{t("details.market_value")}</SectionLabel>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={[textStyles.screenTitle, { color: colors.foreground }]} testID="details.valueRange">
              {valueText}
            </Text>
            <View style={{ flex: 1 }} />
            {trend ? (
              <Text style={[textStyles.micro, { color: colors.foregroundSubtle }]}>
                {`${trend.percentage > 0 ? "+" : ""}${trend.percentage}% VS ${trend.comparisonMonths} MO`}
              </Text>
            ) : null}
          </View>
          <Text style={[textStyles.micro, { color: colors.foregroundSubtle }]}>
            {item?.priceSource && item.priceFetchedAt
              ? `${priceSourceDisplayName(item.priceSource)} · updated ${formatDate(item.priceFetchedAt)}`
              : t("details.market.saved")}
          </Text>
        </Panel>

        <Panel>
          <SectionLabel>{t("details.notes")}</SectionLabel>
          <Text style={[textStyles.body, { color: colors.foregroundMuted }]}>
            {item?.historySummary || item?.notes || fallback?.noteText || t("details.description.empty")}
          </Text>
        </Panel>
      </View>

      <StickyActionBar>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <SecondaryButton
            title={t("common.ask_ai")}
            onPress={() => {
              if (displayItem) {
                setSelectedItem(displayItem);
                setSelectedItemID(displayItem.id);
              }
              router.push(`/chat/${params.itemId}?source=${params.source ?? "vault"}`);
            }}
            testID="details.askAIButton"
          />
          <SecondaryButton
            title={t("common.share")}
            onPress={() => {
              void Share.share({ message: shareText });
            }}
            testID="details.shareButton"
          />
        </View>
      </StickyActionBar>
    </Screen>
  );
}
