import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { performanceMonitor } from "@/lib/performance/monitoring";
import type { ScanLookupProgress } from "@/lib/scan/types";
import { useAppState } from "@src/core/app/AppProvider";
import type { ProcessingStageKind, ScanResult } from "@src/domain/models";
import type { ScanProgressUpdate } from "@src/domain/services";
import { Screen } from "@src/shared/design-system/primitives";
import { colors } from "@src/shared/design-system/tokens";
import { t } from "@src/shared/i18n/strings";

type DisplayStepStatus = "active" | "done" | "error";
type DisplayRowId = ProcessingStageKind | ScanLookupProgress["sourceKey"] | "valueEstimate";

type DisplayRow = {
  id: DisplayRowId;
  label: string;
  status: DisplayStepStatus;
};

const STAGE_LABELS: Record<ProcessingStageKind | "valueEstimate", string> = {
  objectRecognition: t("processing.stage.object_recognition"),
  conditionAssessment: t("processing.stage.condition_assessment"),
  priceLookup: t("processing.stage.price_lookup"),
  historicalRecords: t("processing.stage.historical_records"),
  valueEstimate: t("processing.stage.value_estimate"),
};

const SOURCE_TO_ROW_ID: Record<ScanLookupProgress["sourceKey"], DisplayRowId> = {
  image_preparation: "objectRecognition",
  gemini: "objectRecognition",
  condition: "conditionAssessment",
  marketplace: "marketplace",
  auction_records: "auction_records",
  pcgs: "pcgs",
  discogs: "discogs",
  ebay: "ebay",
  metals: "metals",
  final_estimate: "valueEstimate",
  saving: "saving",
};

const SOURCE_LABEL_OVERRIDES: Partial<Record<ScanLookupProgress["sourceKey"], string>> = {
  image_preparation: STAGE_LABELS.objectRecognition,
  gemini: STAGE_LABELS.objectRecognition,
  condition: STAGE_LABELS.conditionAssessment,
  marketplace: "Marketplace Sales",
  auction_records: "Auction Records",
  pcgs: "PCGS CoinFacts",
  discogs: "Discogs",
  ebay: "eBay Browse",
  metals: "Metals API",
  final_estimate: STAGE_LABELS.valueEstimate,
  saving: "Result Storage",
};

const ACTIVE_RING_SIZE = 16;
const ACTIVE_DOT_SIZE = 8;

function createInitialRows(): DisplayRow[] {
  return [
    {
      id: "objectRecognition",
      label: STAGE_LABELS.objectRecognition,
      status: "active",
    },
  ];
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function statusLabel(status: DisplayStepStatus) {
  if (status === "error") {
    return "ERROR";
  }

  if (status === "done") {
    return "DONE";
  }

  return "IN PROGRESS";
}

function toRowTestID(rowId: DisplayRowId): string {
  const safe = rowId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `processing.step.${safe}`;
}

function fallbackRowLabel(rowId: DisplayRowId): string {
  if (rowId === "objectRecognition") {
    return STAGE_LABELS.objectRecognition;
  }
  if (rowId === "conditionAssessment") {
    return STAGE_LABELS.conditionAssessment;
  }
  if (rowId === "historicalRecords") {
    return STAGE_LABELS.historicalRecords;
  }
  if (rowId === "priceLookup") {
    return STAGE_LABELS.priceLookup;
  }
  if (rowId === "valueEstimate") {
    return STAGE_LABELS.valueEstimate;
  }

  return rowId
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function resolveRowMeta(
  update: ScanProgressUpdate,
  hasRows: boolean,
): { rowId: DisplayRowId; label: string } | null {
  if (update.lookupProgress?.sourceKey) {
    const sourceKey = update.lookupProgress.sourceKey;
    const rowId = SOURCE_TO_ROW_ID[sourceKey];

    if (rowId === "objectRecognition") {
      return { rowId, label: STAGE_LABELS.objectRecognition };
    }
    if (rowId === "conditionAssessment") {
      return { rowId, label: STAGE_LABELS.conditionAssessment };
    }
    if (rowId === "valueEstimate") {
      return { rowId, label: STAGE_LABELS.valueEstimate };
    }

    const incomingLabel = update.lookupProgress.sourceLabel?.trim();
    const label = SOURCE_LABEL_OVERRIDES[sourceKey] ?? incomingLabel ?? fallbackRowLabel(rowId);
    return { rowId, label };
  }

  if (!hasRows && update.stage) {
    return { rowId: update.stage, label: STAGE_LABELS[update.stage] };
  }

  return null;
}

function activateRow(current: DisplayRow[], rowId: DisplayRowId, label: string): DisplayRow[] {
  let found = false;

  const next = current.map((row): DisplayRow => {
    if (row.id === rowId) {
      found = true;
      return {
        ...row,
        label: label || row.label,
        status: "active",
      };
    }

    if (row.status === "active") {
      return { ...row, status: "done" };
    }

    return row;
  });

  if (!found) {
    next.push({
      id: rowId,
      label,
      status: "active",
    });
  }

  return next;
}

function markRowsDone(current: DisplayRow[]): DisplayRow[] {
  return current.map((row): DisplayRow => ({
    ...row,
    status: "done",
  }));
}

function markRowError(current: DisplayRow[], rowId: DisplayRowId, label: string): DisplayRow[] {
  if (current.length === 0) {
    return [{ id: rowId, label, status: "error" }];
  }

  let found = false;
  const next = current.map((row): DisplayRow => {
    if (row.id === rowId) {
      found = true;
      return {
        ...row,
        label: label || row.label,
        status: "error",
      };
    }

    if (row.status === "active") {
      return { ...row, status: "done" };
    }

    return row;
  });

  if (!found) {
    next.push({ id: rowId, label, status: "error" });
  }

  return next;
}

export function ProcessingScreen() {
  const { replace, back } = useRouter();
  const { currentSession, setCurrentSession, setLatestResult, setSelectedItem, setSelectedItemID, container } =
    useAppState();
  const [rows, setRows] = useState<DisplayRow[]>(createInitialRows);
  const [retryNonce, setRetryNonce] = useState(0);
  const rowsRef = useRef<DisplayRow[]>(createInitialRows());
  const activeRowIdRef = useRef<DisplayRowId>("objectRecognition");
  const lastProgressMessageRef = useRef<string | null>(null);
  const lastStepLabelRef = useRef<string>(STAGE_LABELS.objectRecognition);

  const applyRows = useCallback((producer: (current: DisplayRow[]) => DisplayRow[]) => {
    const next = producer(rowsRef.current);
    rowsRef.current = next;
    const active = next.find((row) => row.status === "active");
    activeRowIdRef.current = active?.id ?? activeRowIdRef.current;
    if (active?.label) {
      lastStepLabelRef.current = active.label;
    }
    setRows(next);
  }, []);

  const resetProgressState = useCallback(() => {
    const initialRows = createInitialRows();
    rowsRef.current = initialRows;
    activeRowIdRef.current = "objectRecognition";
    lastProgressMessageRef.current = null;
    lastStepLabelRef.current = STAGE_LABELS.objectRecognition;
    setRows(initialRows);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const finishWithResult = async (result: ScanResult) => {
      applyRows(markRowsDone);
      await wait(280);

      if (cancelled) {
        return;
      }

      await wait(180);

      if (cancelled) {
        return;
      }

      setLatestResult(result);
      setSelectedItem({
        id: result.id,
        title: result.name,
        subtitle: result.origin ?? t("common.unknown_origin"),
        categoryText: result.category,
        valueText: `${result.priceData?.mid ?? 0}`,
        timestampText: result.scannedAt,
        noteText: result.historySummary,
        thumbnailText: result.name.slice(0, 2).toUpperCase(),
        photoUri: currentSession?.capturedImages[0]?.uri,
      });
      setSelectedItemID(result.id);
      await setCurrentSession(null);
      replace({
        pathname: "/result/[resultId]",
        params: { resultId: result.id },
      });
    };

    const run = async () => {
      if (!currentSession) {
        return;
      }

      resetProgressState();

      try {
        for await (const update of container.scanOrchestrator.process(currentSession)) {
          if (cancelled) {
            break;
          }

          const message = update.lookupProgress?.message?.trim() ?? update.currentSearchSource?.trim() ?? null;
          if (message) {
            lastProgressMessageRef.current = message;
          }

          const rowMeta = resolveRowMeta(update, rowsRef.current.length > 0);
          if (rowMeta) {
            lastStepLabelRef.current = rowMeta.label;
            applyRows((current) => activateRow(current, rowMeta.rowId, rowMeta.label));
          }

          if (update.completedResult) {
            await finishWithResult(update.completedResult);
            return;
          }
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        performanceMonitor.captureError(error, {
          area: "processing.screen",
          mode: currentSession.mode,
        });
        setLatestResult(null);
        setSelectedItem(null);
        setSelectedItemID(null);

        const failedRowId = activeRowIdRef.current ?? rowsRef.current[rowsRef.current.length - 1]?.id ?? "objectRecognition";
        const fallbackLabel = fallbackRowLabel(failedRowId);
        applyRows((current) => markRowError(current, failedRowId, fallbackLabel));

        const failedRow = rowsRef.current.find((row) => row.id === failedRowId);
        const lastStepSource = failedRow?.label ?? lastStepLabelRef.current ?? fallbackLabel;
        const lastStepMessage = lastProgressMessageRef.current;
        const failureContext = [lastStepSource, lastStepMessage].filter(Boolean).join(" — ");
        const errorMessage = failureContext
          ? `${t("processing.error.message")}\n\nLast step: ${failureContext}`
          : t("processing.error.message");
        Alert.alert(t("processing.error.title"), errorMessage, [
          {
            text: t("common.retry"),
            onPress: () => {
              setRetryNonce((value) => value + 1);
            },
          },
          { text: t("common.back"), style: "cancel", onPress: () => back() },
        ]);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [
    applyRows,
    container.scanOrchestrator,
    currentSession,
    resetProgressState,
    back,
    replace,
    retryNonce,
    setCurrentSession,
    setLatestResult,
    setSelectedItem,
    setSelectedItemID,
  ]);

  const retake = async () => {
    await setCurrentSession(null);
    setLatestResult(null);
    setSelectedItem(null);
    setSelectedItemID(null);
    replace("/scan");
  };

  const previewUri = currentSession?.capturedImages[0]?.uri;

  if (!currentSession) {
    return (
      <Screen testID="processing.screen">
        <View style={styles.emptyRoot}>
          <Text style={styles.emptyTitle}>{t("processing.empty.title")}</Text>
          <Text style={styles.emptyMessage}>{t("processing.empty.message")}</Text>
          <Pressable
            onPress={() => {
              void retake();
            }}
            style={styles.emptyButton}
            testID="processing.retakeButton"
          >
            <Text style={styles.emptyButtonText}>{t("common.retake")}</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen testID="processing.screen">
      <View style={styles.screen}>
        <View style={styles.topBar}>
          <Pressable
            onPress={() => {
              void retake();
            }}
            style={styles.backButton}
            testID="processing.backButton"
          >
            <Ionicons color={colors.foreground} name="arrow-back" size={20} />
          </Pressable>
          <Text style={styles.topTitle} testID="processing.headerTitle">
            {t("processing.title")}
          </Text>
          <View style={styles.topSpacer} />
        </View>

        <View style={styles.previewWrap}>
          {previewUri ? (
            <Image
              source={{ uri: previewUri }}
              style={styles.previewImage}
              resizeMode="cover"
              testID="processing.imagePreview"
            />
          ) : (
            <View style={[styles.previewImage, styles.previewFallback]} testID="processing.imagePreview" />
          )}
        </View>

        <View style={styles.stageSection}>
          <Text style={styles.stageTitle}>{t("processing.section")}</Text>
          <View style={styles.divider} />
          {rows.map((row, index) => (
            <React.Fragment key={row.id}>
              <ProcessingStepRow title={row.label} status={row.status} testID={toRowTestID(row.id)} />
              {index < rows.length - 1 ? <View style={styles.divider} /> : null}
            </React.Fragment>
          ))}
        </View>
      </View>
    </Screen>
  );
}

function ProcessingStepRow({
  title,
  status,
  testID,
}: {
  title: string;
  status: DisplayStepStatus;
  testID?: string;
}) {
  return (
    <View style={styles.stepRow} testID={testID}>
      <View style={styles.stepHeader}>
        <View style={styles.stepLeft}>
          <StepIndicator status={status} />
          <Text style={styles.stepText} numberOfLines={1}>
            {title}
          </Text>
        </View>
        <Text
          style={[
            styles.stepStatus,
            status === "done" && styles.stepStatusDone,
            status === "active" && styles.stepStatusActive,
            status === "error" && styles.stepStatusError,
          ]}
        >
          {statusLabel(status)}
        </Text>
      </View>
    </View>
  );
}

function StepIndicator({ status }: { status: DisplayStepStatus }) {
  const pulse = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    if (status !== "active") {
      pulse.stopAnimation();
      pulse.setValue(0.35);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 850,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.35,
          duration: 850,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();

    return () => {
      loop.stop();
    };
  }, [pulse, status]);

  if (status === "active") {
    return (
      <View style={styles.activeIndicatorWrap}>
        <Animated.View style={[styles.activeIndicatorRing, { opacity: pulse }]} />
        <View style={styles.activeIndicatorDot} />
      </View>
    );
  }

  if (status === "error") {
    return <View style={[styles.dot, styles.dotError]} />;
  }

  return <View style={[styles.dot, styles.dotDone]} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    height: 52,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: {
    color: colors.foreground,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 3,
  },
  topSpacer: {
    width: 20,
    height: 20,
  },
  previewWrap: {
    width: "100%",
    height: 280,
    backgroundColor: "#050505",
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  previewFallback: {
    backgroundColor: "#111111",
  },
  stageSection: {
    flex: 1,
    paddingTop: 24,
    paddingHorizontal: 24,
  },
  stageTitle: {
    color: "#444444",
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 3,
    marginBottom: 18,
  },
  divider: {
    height: 1,
    backgroundColor: "#1A1A1A",
  },
  stepRow: {
    minHeight: 56,
    justifyContent: "center",
    paddingVertical: 14,
  },
  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stepLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginRight: 16,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  dotDone: {
    backgroundColor: colors.foreground,
  },
  dotError: {
    backgroundColor: "#C56464",
  },
  activeIndicatorWrap: {
    width: ACTIVE_RING_SIZE,
    height: ACTIVE_RING_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  activeIndicatorRing: {
    position: "absolute",
    width: ACTIVE_RING_SIZE,
    height: ACTIVE_RING_SIZE,
    borderRadius: 999,
    borderWidth: 4,
    borderColor: "#333333",
  },
  activeIndicatorDot: {
    width: ACTIVE_DOT_SIZE,
    height: ACTIVE_DOT_SIZE,
    borderRadius: 999,
    backgroundColor: colors.foreground,
  },
  stepText: {
    flex: 1,
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "500",
  },
  stepStatus: {
    color: "#888888",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 3,
    alignSelf: "center",
  },
  stepStatusDone: {
    color: "#444444",
  },
  stepStatusActive: {
    color: "#7A7A7A",
  },
  stepStatusError: {
    color: "#C56464",
  },
  emptyRoot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 12,
  },
  emptyTitle: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: "700",
  },
  emptyMessage: {
    color: colors.foregroundSubtle,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  emptyButton: {
    marginTop: 8,
    width: 180,
    height: 48,
    backgroundColor: colors.foreground,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyButtonText: {
    color: colors.inverseForeground,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 1,
  },
});
