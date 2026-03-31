import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Image, Text, View } from "react-native";

import { useAppState } from "@src/app/AppProvider";
import type { ProcessingStageSnapshot } from "@src/domain/models";
import {
  EmptyState,
  HeaderAction,
  InfoRow,
  Panel,
  ProgressRow,
  Screen,
  ScreenHeader,
  SectionLabel,
  StickyActionBar
} from "@src/shared/design-system/primitives";
import { colors, spacing, textStyles } from "@src/shared/design-system/tokens";
import { t } from "@src/shared/i18n/strings";

const TITLE_BY_STAGE: Record<string, string> = {
  objectRecognition: t("processing.stage.object_recognition"),
  conditionAssessment: t("processing.stage.condition_assessment"),
  priceLookup: t("processing.stage.price_lookup"),
  historicalRecords: t("processing.stage.historical_records")
};

export function ProcessingScreen() {
  const router = useRouter();
  const { currentSession, setCurrentSession, setLatestResult, setSelectedItem, setSelectedItemID, container } =
    useAppState();
  const [steps, setSteps] = useState<ProcessingStageSnapshot[]>([
    { kind: "objectRecognition", status: "pending" },
    { kind: "conditionAssessment", status: "pending" },
    { kind: "priceLookup", status: "pending" },
    { kind: "historicalRecords", status: "pending" }
  ]);
  const [sourcesLine, setSourcesLine] = useState(t("processing.searching.start"));

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!currentSession) {
        return;
      }

      for await (const update of container.scanProcessingPipeline.process(currentSession)) {
        if (cancelled) {
          break;
        }

        if (update.snapshots) {
          setSteps(update.snapshots);
        }

        if (update.searchingSource) {
          setSourcesLine(update.searchingSource);
        }

        if (update.completedResult) {
          setLatestResult(update.completedResult);
          setSelectedItem({
            id: update.completedResult.id,
            title: update.completedResult.name,
            subtitle: update.completedResult.origin ?? t("common.unknown_origin"),
            categoryText: update.completedResult.category,
            valueText: `${update.completedResult.priceData?.mid ?? 0}`,
            timestampText: update.completedResult.scannedAt,
            noteText: update.completedResult.historySummary,
            thumbnailText: update.completedResult.name.slice(0, 2).toUpperCase(),
            photoUri: currentSession.capturedImages[0]?.uri
          });
          setSelectedItemID(update.completedResult.id);
          router.replace(`/result/${update.completedResult.id}`);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [container.scanProcessingPipeline, currentSession, router, setLatestResult, setSelectedItem, setSelectedItemID]);

  const retake = async () => {
    await setCurrentSession(null);
    setLatestResult(null);
    setSelectedItem(null);
    setSelectedItemID(null);
    router.replace("/(tabs)/scan");
  };

  const previewUri = currentSession?.capturedImages[0]?.uri;

  return (
    <Screen testID="processing.screen">
      <View style={{ flex: 1, paddingHorizontal: spacing.lg, paddingTop: 20, paddingBottom: 140, gap: spacing.lg }}>
        <ScreenHeader
          title={t("processing.title")}
          leftAction={
            <HeaderAction
              icon="chevron-back"
              onPress={() => {
                void retake();
              }}
              testID="processing.backButton"
            />
          }
          testID="processing.headerTitle"
        />

        {currentSession ? (
          <>
            <Panel>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <SectionLabel>{t("processing.capture.section")}</SectionLabel>
                <View style={{ flex: 1 }} />
                <Text
                  onPress={() => {
                    void retake();
                  }}
                  style={[textStyles.micro, { color: colors.foregroundSubtle }]}
                  testID="processing.retakeButton"
                >
                  {t("common.retake")}
                </Text>
              </View>

              {previewUri ? (
                <Image
                  source={{ uri: previewUri }}
                  style={{ width: "100%", height: 260, borderWidth: 1, borderColor: colors.borderDefault }}
                  resizeMode="cover"
                  testID="processing.imagePreview"
                />
              ) : null}

              <InfoRow label={t("processing.mode")} value={currentSession.mode.toUpperCase()} />
              <InfoRow label={t("processing.captures")} value={t("processing.captures.count").replace("%d", String(currentSession.capturedImages.length))} />
            </Panel>

            <Panel>
              <SectionLabel>{t("processing.section")}</SectionLabel>
              {steps.map((step) => (
                <ProgressRow
                  key={step.kind}
                  title={TITLE_BY_STAGE[step.kind]}
                  status={step.status}
                  testID={`processing.step.${step.kind}`}
                />
              ))}
            </Panel>
          </>
        ) : (
          <EmptyState
            title={t("processing.empty.title")}
            message={t("processing.empty.message")}
            actionTitle={t("common.retake")}
            onAction={() => {
              void retake();
            }}
            testID="processing.emptyState"
          />
        )}
      </View>

      <StickyActionBar>
        <Text
          style={[textStyles.micro, { color: colors.foregroundSubtle, textAlign: "center" }]}
          testID="processing.sourcesLine"
        >
          {sourcesLine}
        </Text>
      </StickyActionBar>
    </Screen>
  );
}
