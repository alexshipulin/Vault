import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Share } from "react-native";

import { useAppState } from "@src/core/app/AppProvider";
import type { CollectibleItem, CollectibleListItem, PreferredCurrency } from "@src/domain/models";
import {
  ResultPresentationScreen,
  type ResultPresentationAction,
} from "@src/features/results/ResultPresentationScreen";
import {
  type ResultPresentationModel,
  buildResultPresentationFromScanResult,
  buildResultPresentationFromCollectionItem,
} from "@src/features/results/resultPresentation";
import { t } from "@src/shared/i18n/strings";
import { collectibleListItemFromItem, collectibleListItemFromResult } from "@src/shared/utils/formatters";

function buildFallbackPresentation(item: CollectibleListItem): ResultPresentationModel {
  return {
    imageUri: item.photoUri,
    fallbackText: item.thumbnailText || item.title.slice(0, 2).toUpperCase(),
    title: item.title,
    subtitle: [item.categoryText, item.subtitle].filter(Boolean).join(" · "),
    originText: item.subtitle || t("common.unknown"),
    eraText: t("common.unknown"),
    conditionText: t("details.condition.unknown"),
    confidence: null,
    valueText: item.valueText || t("details.market.unavailable"),
    sourceText: t("details.market.saved"),
    updatedText: "",
    diagnostics: [],
    summaryText: item.noteText || t("details.description.empty"),
    disclaimerText: t("result.disclaimer"),
  };
}

export function ItemDetailsScreen() {
  const params = useLocalSearchParams<{ itemId: string; source?: string }>();
  const router = useRouter();
  const { container, collectionVersion, latestResult, selectedItem, setSelectedItem, setSelectedItemID } = useAppState();
  const [item, setItem] = useState<CollectibleItem | null>(null);
  const [currency, setCurrency] = useState<PreferredCurrency>("usd");
  const [hasLoaded, setHasLoaded] = useState(false);

  const load = useCallback(async () => {
    const [items, preferences] = await Promise.all([
      container.collectionRepository.fetchAll(),
      container.preferencesStore.load(),
    ]);
    const found = items.find((entry) => entry.id === params.itemId) ?? null;
    setItem(found);
    setCurrency(preferences.preferredCurrency);
    setHasLoaded(true);
  }, [container, params.itemId]);

  useFocusEffect(
    useCallback(() => {
      void collectionVersion;
      setHasLoaded(false);
      void load();
    }, [load, collectionVersion]),
  );

  const fallback = selectedItem;
  const freshestResult = latestResult?.id === params.itemId ? latestResult : null;
  const presentation = useMemo(() => {
    if (freshestResult) {
      const persistedPhotoUri = item?.photoUris.find((uri) => Boolean(uri)) || fallback?.photoUri;
      return buildResultPresentationFromScanResult(freshestResult, currency, persistedPhotoUri);
    }

    if (item) {
      return buildResultPresentationFromCollectionItem(item, currency);
    }

    if (fallback) {
      return buildFallbackPresentation(fallback);
    }

    return null;
  }, [currency, fallback, freshestResult, item]);

  const shareText = useMemo(() => {
    if (!presentation) {
      return "";
    }

    return [
      presentation.title,
      presentation.subtitle,
      `${t("result.value")}: ${presentation.valueText}`,
    ].join("\n");
  }, [presentation]);

  const actions = useMemo<ResultPresentationAction[]>(() => {
    const displayItem: CollectibleListItem | null = freshestResult
      ? {
          ...collectibleListItemFromResult(freshestResult, currency),
          photoUri: item?.photoUris.find((uri) => Boolean(uri)) || fallback?.photoUri,
        }
      : item
        ? collectibleListItemFromItem(item, currency)
        : fallback;

    return [
      {
        icon: "bookmark",
        title: t("result.saved_cta"),
        onPress: () => {},
        selected: true,
        disabled: true,
        testID: "details.savedButton",
      },
      {
        icon: "chatbubble-outline",
        title: t("common.ask_ai"),
        onPress: () => {
          if (displayItem) {
            setSelectedItem(displayItem);
            setSelectedItemID(displayItem.id);
          }
          router.push({
            pathname: "/chat/[itemId]",
            params: { itemId: params.itemId, source: params.source ?? "vault" },
          });
        },
        testID: "details.askAIButton",
      },
      {
        icon: "share-outline",
        title: t("common.share"),
        onPress: () => {
          void Share.share({ message: shareText });
        },
        testID: "details.shareButton",
      },
    ];
  }, [currency, fallback, freshestResult, item, params.itemId, params.source, router, setSelectedItem, setSelectedItemID, shareText]);

  return (
    <ResultPresentationScreen
      headerTitle={t("result.title")}
      model={presentation}
      onBack={() => router.back()}
      actions={actions}
      emptyStateText={hasLoaded ? "Item unavailable." : "Loading item..."}
      testIDs={{
        screen: "details.screen",
        backButton: "details.backButton",
        headerTitle: "details.headerTitle",
        image: "details.image",
        title: "details.title",
        subtitle: "details.subtitle",
        confidence: "details.confidence",
        valueRange: "details.valueRange",
        diagnostics: "details.diagnostics",
        summary: "details.summary",
        disclaimer: "details.disclaimer",
      }}
    />
  );
}
