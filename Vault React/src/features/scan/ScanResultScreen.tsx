import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Image, Share, Text, View } from "react-native";

import { useAppState } from "@src/app/AppProvider";
import type { CollectibleItem, PreferredCurrency } from "@src/domain/models";
import {
  Divider,
  HeaderAction,
  InfoRow,
  Panel,
  PrimaryButton,
  Screen,
  ScreenHeader,
  SectionLabel,
  SecondaryButton,
  StickyActionBar
} from "@src/shared/design-system/primitives";
import { borders, colors, spacing, textStyles } from "@src/shared/design-system/tokens";
import { t } from "@src/shared/i18n/strings";
import {
  categoryDisplayName,
  collectibleListItemFromResult,
  conditionDisplayLabel,
  eraText,
  formatCurrency,
  formatDate,
  priceSourceDisplayName
} from "@src/shared/utils/formatters";

export function ScanResultScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ resultId: string }>();
  const {
    latestResult,
    currentSession,
    setSelectedItem,
    setSelectedItemID,
    container,
    bumpCollectionVersion
  } = useAppState();
  const [isSaved, setIsSaved] = useState(false);
  const [preferredCurrency, setPreferredCurrency] = useState<PreferredCurrency>("usd");

  const result = latestResult && latestResult.id === params.resultId ? latestResult : latestResult;

  useEffect(() => {
    const load = async () => {
      const [items, preferences] = await Promise.all([
        container.collectionRepository.fetchAll(),
        container.preferencesStore.load()
      ]);
      setIsSaved(items.some((item) => item.id === result?.id));
      setPreferredCurrency(preferences.preferredCurrency);
    };

    void load();
  }, [container, result?.id]);

  const shareText = useMemo(() => {
    if (!result) {
      return "";
    }

    return [
      result.name,
      `${categoryDisplayName(result.category)} · ${result.origin ?? t("common.unknown_origin")}`,
      `${t("result.value")}: ${formatCurrency(result.priceData?.low ?? 0, preferredCurrency)} - ${formatCurrency(result.priceData?.high ?? 0, preferredCurrency)}`,
      `${t("result.confidence")}: ${Math.round(result.confidence * 100)}%`
    ].join("\n");
  }, [preferredCurrency, result]);

  if (!result) {
    return (
      <Screen testID="result.screen">
        <View style={{ flex: 1, padding: spacing.lg }}>
          <Text style={[textStyles.body, { color: colors.foregroundMuted }]}>Result unavailable.</Text>
        </View>
      </Screen>
    );
  }

  const save = async () => {
    if (isSaved) {
      return;
    }

    const photoUris = await container.imagePersistenceService.persistImages(currentSession?.capturedImages ?? []);
    const savedItem: CollectibleItem = {
      id: result.id,
      name: result.name,
      category: result.category,
      conditionRaw: result.condition,
      year: result.year ?? null,
      origin: result.origin ?? null,
      notes: "",
      photoUris,
      priceLow: result.priceData?.low ?? null,
      priceMid: result.priceData?.mid ?? null,
      priceHigh: result.priceData?.high ?? null,
      priceSource: result.priceData?.source ?? null,
      priceFetchedAt: result.priceData?.fetchedAt ?? null,
      historySummary: result.historySummary,
      addedAt: result.scannedAt,
      updatedAt: result.scannedAt,
      isSyncedToCloud: false
    };

    await container.collectionRepository.save(savedItem);
    if (container.runtimeConfig.flags.remoteBackend) {
      void container.remoteCollectionMirror.mirrorItem(savedItem);
    }
    setSelectedItem(collectibleListItemFromResult(result, preferredCurrency));
    setSelectedItemID(result.id);
    setIsSaved(true);
    bumpCollectionVersion();
  };

  const previewUri = currentSession?.capturedImages[0]?.uri;

  return (
    <Screen testID="result.screen">
      <View style={{ flex: 1, paddingHorizontal: spacing.lg, paddingTop: 20, paddingBottom: 164, gap: spacing.lg }}>
        <ScreenHeader
          title={t("result.title")}
          leftAction={
            <HeaderAction icon="chevron-back" onPress={() => router.back()} testID="result.backButton" />
          }
          rightAction={
            <HeaderAction
              icon="share-outline"
              onPress={() => {
                void Share.share({ message: shareText });
              }}
              testID="result.headerShareButton"
            />
          }
          testID="result.headerTitle"
        />

        <View
          style={{
            width: "100%",
            height: 260,
            borderWidth: borders.hairline,
            borderColor: colors.borderDefault,
            backgroundColor: colors.surface
          }}
          testID="result.image"
        >
          {previewUri ? (
            <Image source={{ uri: previewUri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm }}>
              <Text style={[textStyles.screenTitle, { color: colors.foreground }]}>
                {result.name.slice(0, 2).toUpperCase()}
              </Text>
              <Text style={[textStyles.micro, { color: colors.foregroundSubtle }]}>
                {conditionDisplayLabel(result.condition)}
              </Text>
            </View>
          )}
        </View>

        <Panel>
          <Text style={[textStyles.screenTitle, { color: colors.foreground }]} testID="result.title">
            {result.name}
          </Text>
          <Text style={[textStyles.body, { color: colors.foregroundMuted }]} testID="result.subtitle">
            {[categoryDisplayName(result.category), eraText(result.year), result.origin ?? t("common.unknown_origin")].join(" · ")}
          </Text>
        </Panel>

        <Panel>
          <InfoRow label={t("result.origin")} value={result.origin ?? t("common.unknown_origin")} />
          <Divider />
          <InfoRow label={t("result.era")} value={eraText(result.year)} />
          <Divider />
          <InfoRow label={t("result.condition")} value={conditionDisplayLabel(result.condition)} />
        </Panel>

        <Panel>
          <SectionLabel>{t("result.confidence")}</SectionLabel>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={[textStyles.screenTitle, { color: colors.foreground }]} testID="result.confidence">
              {Math.round(result.confidence * 100)}%
            </Text>
            <View style={{ flex: 1 }} />
            <Text style={[textStyles.micro, { color: colors.foregroundSubtle }]}>
              {t("result.confidence.note")}
            </Text>
          </View>
          <View style={{ height: 10, borderWidth: borders.hairline, borderColor: colors.borderDefault, backgroundColor: colors.surfaceElevated }}>
            <View style={{ width: `${Math.max(0, Math.min(result.confidence * 100, 100))}%`, height: "100%", backgroundColor: colors.foreground }} />
          </View>
        </Panel>

        <Panel>
          <SectionLabel>{t("result.value")}</SectionLabel>
          <Text style={[textStyles.screenTitle, { color: colors.foreground }]} testID="result.valueRange">
            {formatCurrency(result.priceData?.low ?? 0, preferredCurrency)} - {formatCurrency(result.priceData?.high ?? 0, preferredCurrency)}
          </Text>
          <Text style={[textStyles.micro, { color: colors.foregroundSubtle }]}>
            {(result.priceData && priceSourceDisplayName(result.priceData.source))
              ? `${priceSourceDisplayName(result.priceData.source)} · updated ${formatDate(result.priceData.fetchedAt)}`
              : t("result.source.pending")}
          </Text>
        </Panel>

        <Panel>
          <SectionLabel>{t("result.history")}</SectionLabel>
          <Text style={[textStyles.body, { color: colors.foregroundMuted }]} testID="result.summary">
            {result.historySummary}
          </Text>
        </Panel>

        <Text style={[textStyles.micro, { color: colors.foregroundFaint }]} testID="result.disclaimer">
          {t("result.disclaimer")}
        </Text>
      </View>

      <StickyActionBar>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {isSaved ? (
            <SecondaryButton title={t("result.saved_cta")} onPress={() => {}} disabled testID="result.saveButton" />
          ) : (
            <PrimaryButton title={t("result.save_cta")} onPress={() => void save()} testID="result.saveButton" />
          )}
          <SecondaryButton
            title={t("common.ask_ai")}
            onPress={() => {
              setSelectedItem(collectibleListItemFromResult(result, preferredCurrency));
              setSelectedItemID(result.id);
              router.push(`/chat/${result.id}?source=result`);
            }}
            testID="result.askAIButton"
          />
          <SecondaryButton
            title={t("common.share")}
            onPress={() => {
              void Share.share({ message: shareText });
            }}
            testID="result.shareButton"
          />
        </View>
      </StickyActionBar>
    </Screen>
  );
}
