import { useLocalSearchParams, useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Share } from "react-native";

import { useAppState } from "@src/core/app/AppProvider";
import type { CollectibleItem, PreferredCurrency } from "@src/domain/models";
import {
  ResultPresentationScreen,
  type ResultPresentationAction,
} from "@src/features/results/ResultPresentationScreen";
import { buildResultPresentationFromScanResult } from "@src/features/results/resultPresentation";
import { t } from "@src/shared/i18n/strings";
import { collectibleListItemFromResult } from "@src/shared/utils/formatters";

export function ScanResultScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ resultId: string }>();
  const {
    latestResult,
    currentSession,
    selectedItem,
    setSelectedItem,
    setSelectedItemID,
    container,
    bumpCollectionVersion,
  } = useAppState();
  const [isSaved, setIsSaved] = useState(false);
  const [preferredCurrency, setPreferredCurrency] = useState<PreferredCurrency>("usd");

  const result = latestResult?.id === params.resultId ? latestResult : null;

  useEffect(() => {
    const load = async () => {
      const [items, preferences] = await Promise.all([
        container.collectionRepository.fetchAll(),
        container.preferencesStore.load(),
      ]);
      setIsSaved(items.some((item) => item.id === result?.id));
      setPreferredCurrency(preferences.preferredCurrency);
    };

    void load();
  }, [container, result?.id]);

  const previewUri = useMemo(() => {
    if (!result) {
      return undefined;
    }

    if (selectedItem?.id === result.id && selectedItem.photoUri) {
      return selectedItem.photoUri;
    }

    return currentSession?.capturedImages[0]?.uri;
  }, [currentSession?.capturedImages, result, selectedItem]);

  const presentation = useMemo(() => {
    if (!result) {
      return null;
    }

    return buildResultPresentationFromScanResult(result, preferredCurrency, previewUri);
  }, [preferredCurrency, previewUri, result]);

  const shareText = useMemo(() => {
    if (!result || !presentation) {
      return "";
    }

    return [
      result.name,
      presentation.subtitle,
      `${t("result.value")}: ${presentation.valueText}`,
      `${presentation.confidenceLabel ?? t("result.confidence")}: ${Math.round((presentation.confidence ?? result.confidence) * 100)}%`,
    ].join("\n");
  }, [presentation, result]);

  const logCopyText = result?.analysisLog?.copyText?.trim() ?? "";

  const copyLogs = useCallback(async () => {
    if (!logCopyText) {
      return;
    }

    await Clipboard.setStringAsync(logCopyText);
    Alert.alert(t("result.copy_logs_done.title"), t("result.copy_logs_done.message"));
  }, [logCopyText]);

  const save = useCallback(async () => {
    if (!result || isSaved) {
      return;
    }

    const fallbackPhotoUris =
      selectedItem?.id === result.id && selectedItem.photoUri ? [selectedItem.photoUri] : [];
    const photoUris =
      currentSession?.capturedImages?.length
        ? await container.imagePersistenceService.persistImages(currentSession.capturedImages)
        : fallbackPhotoUris;

    const savedItem: CollectibleItem = {
      id: result.id,
      name: result.name,
      category: result.category,
      conditionRaw: result.condition,
      year: result.year ?? null,
      origin: result.origin ?? null,
      notes: result.historySummary,
      photoUris,
      priceLow: result.priceData?.low ?? null,
      priceMid: result.priceData?.mid ?? null,
      priceHigh: result.priceData?.high ?? null,
      priceSource: result.priceData?.source ?? null,
      sourceLabel: result.priceData?.sourceLabel ?? null,
      priceFetchedAt: result.priceData?.fetchedAt ?? null,
      confidence: result.confidence,
      valuationConfidence: result.priceData?.valuationConfidence ?? null,
      valuationMode: result.priceData?.valuationMode ?? null,
      evidenceStrength: result.priceData?.evidenceStrength ?? null,
      appliedValueCeiling: result.priceData?.appliedValueCeiling ?? null,
      sourceBreakdown: result.priceData?.sourceBreakdown ?? null,
      matchedSources: result.priceData?.matchedSources ?? null,
      comparableCount: result.priceData?.comparableCount ?? null,
      needsReview: result.priceData?.needsReview ?? null,
      valuationWarnings: result.priceData?.valuationWarnings ?? null,
      historySummary: result.historySummary,
      addedAt: result.scannedAt,
      updatedAt: result.scannedAt,
      isSyncedToCloud: false,
    };

    await container.collectionRepository.save(savedItem);
    if (container.runtimeConfig.flags.remoteBackend) {
      void container.remoteCollectionMirror.mirrorItem(savedItem);
    }
    setSelectedItem({
      ...collectibleListItemFromResult(result, preferredCurrency),
      photoUri: previewUri,
    });
    setSelectedItemID(result.id);
    setIsSaved(true);
    bumpCollectionVersion();
  }, [
    bumpCollectionVersion,
    container.collectionRepository,
    container.imagePersistenceService,
    container.remoteCollectionMirror,
    container.runtimeConfig.flags.remoteBackend,
    currentSession?.capturedImages,
    isSaved,
    preferredCurrency,
    previewUri,
    result,
    selectedItem,
    setSelectedItem,
    setSelectedItemID,
  ]);

  const actions = useMemo<ResultPresentationAction[]>(() => {
    if (!result) {
      return [];
    }

    return [
      {
        icon: isSaved ? "bookmark" : "bookmark-outline",
        title: isSaved ? t("result.saved_cta") : t("result.save_cta"),
        onPress: () => {
          void save();
        },
        selected: true,
        disabled: isSaved,
        testID: "result.saveButton",
      },
      {
        icon: "chatbubble-outline",
        title: t("common.ask_ai"),
        onPress: () => {
          setSelectedItem({
            ...collectibleListItemFromResult(result, preferredCurrency),
            photoUri: previewUri,
          });
          setSelectedItemID(result.id);
          router.push({
            pathname: "/chat/[itemId]",
            params: { itemId: result.id, source: "result" },
          });
        },
        testID: "result.askAIButton",
      },
      {
        icon: "share-outline",
        title: t("common.share"),
        onPress: () => {
          void Share.share({ message: shareText });
        },
        testID: "result.shareButton",
      },
    ];
  }, [isSaved, preferredCurrency, previewUri, result, router, save, setSelectedItem, setSelectedItemID, shareText]);

  return (
    <ResultPresentationScreen
      headerTitle={t("result.title")}
      model={presentation}
      onBack={() => router.back()}
      actions={actions}
      footerSecondaryAction={
        logCopyText
          ? {
              title: t("result.copy_logs"),
              onPress: () => {
                void copyLogs();
              },
              testID: "result.copyLogsButton",
            }
          : undefined
      }
      emptyStateText="Result unavailable."
      testIDs={{
        screen: "result.screen",
        backButton: "result.backButton",
        headerTitle: "result.headerTitle",
        image: "result.image",
        title: "result.title",
        subtitle: "result.subtitle",
        confidence: "result.confidence",
        valueRange: "result.valueRange",
        diagnostics: "result.diagnostics",
        summary: "result.summary",
        disclaimer: "result.disclaimer",
        footerSecondaryAction: "result.copyLogsButton",
      }}
    />
  );
}
