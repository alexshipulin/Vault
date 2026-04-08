import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { performanceMonitor } from "@/lib/performance/monitoring";
import type { ScanLookupProgress } from "@/lib/scan/types";
import { useAppState } from "@src/core/app/AppProvider";
import type { ProcessingStageKind, ScanResult } from "@src/domain/models";
import { Screen } from "@src/shared/design-system/primitives";
import { colors } from "@src/shared/design-system/tokens";
import { t } from "@src/shared/i18n/strings";

type DisplayStepKind = ProcessingStageKind | "valueEstimate";
type DisplayStepStatus = "pending" | "active" | "complete";

type DisplayStep = {
  kind: DisplayStepKind;
  label: string;
  status: DisplayStepStatus;
};

const DISPLAY_STAGE_ORDER: DisplayStepKind[] = [
  "objectRecognition",
  "conditionAssessment",
  "priceLookup",
  "historicalRecords",
  "valueEstimate"
];

const TITLE_BY_STAGE: Record<DisplayStepKind, string> = {
  objectRecognition: t("processing.stage.object_recognition"),
  conditionAssessment: t("processing.stage.condition_assessment"),
  priceLookup: t("processing.stage.price_lookup"),
  historicalRecords: t("processing.stage.historical_records"),
  valueEstimate: t("processing.stage.value_estimate")
};

const ACTIVE_RING_SIZE = 16;
const ACTIVE_DOT_SIZE = 8;

function deriveSteps(
  currentStage: ProcessingStageKind | null,
  progress: number,
  finalizing: boolean,
  completed: boolean,
  activeLookupSourceKey: ScanLookupProgress["sourceKey"] | null
): DisplayStep[] {
  if (completed) {
    return DISPLAY_STAGE_ORDER.map((kind) => ({
      kind,
      label: TITLE_BY_STAGE[kind],
      status: "complete"
    }));
  }

  if (finalizing) {
    return DISPLAY_STAGE_ORDER.map((kind) => ({
      kind,
      label: TITLE_BY_STAGE[kind],
      status: kind === "valueEstimate" ? "active" : "complete"
    }));
  }

  const activeIndex = currentStage ? DISPLAY_STAGE_ORDER.indexOf(currentStage) : -1;
  const valueEstimateOverrideActive =
    activeLookupSourceKey === "final_estimate" || activeLookupSourceKey === "saving";

  return DISPLAY_STAGE_ORDER.map((kind, index) => {
    let status: DisplayStepStatus = "pending";

    if (kind === "valueEstimate" && valueEstimateOverrideActive) {
      status = "active";
    } else if (kind === "valueEstimate") {
      if (currentStage === "historicalRecords" && progress >= 1) {
        status = "active";
      }
    } else if (valueEstimateOverrideActive && kind === "historicalRecords") {
      status = "complete";
    } else if (index < activeIndex) {
      status = "complete";
    } else if (index === activeIndex) {
      status = "active";
    }

    return {
      kind,
      label: TITLE_BY_STAGE[kind],
      status
    };
  });
}

function statusLabel(status: DisplayStepStatus) {
  if (status === "complete") {
    return "DONE";
  }

  if (status === "active") {
    return "IN PROGRESS";
  }

  return "WAITING";
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function ProcessingScreen() {
  const { replace, back } = useRouter();
  const insets = useSafeAreaInsets();
  const { currentSession, setCurrentSession, setLatestResult, setSelectedItem, setSelectedItemID, container } =
    useAppState();
  const [currentStage, setCurrentStage] = useState<ProcessingStageKind | null>(null);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [finalizing, setFinalizing] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [currentLookupProgress, setCurrentLookupProgress] = useState<ScanLookupProgress | null>(null);
  const currentLookupProgressRef = useRef<ScanLookupProgress | null>(null);

  const resetProgressState = useCallback(() => {
    setCurrentStage(null);
    setCurrentProgress(0);
    setFinalizing(false);
    setCompleted(false);
    setCurrentLookupProgress(null);
    currentLookupProgressRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const finishWithResult = async (result: ScanResult) => {
      setFinalizing(true);
      await wait(280);

      if (cancelled) {
        return;
      }

      setCompleted(true);
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
        photoUri: currentSession?.capturedImages[0]?.uri
      });
      setSelectedItemID(result.id);
      await setCurrentSession(null);
      replace({
        pathname: "/result/[resultId]",
        params: { resultId: result.id }
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

          if (update.stage) {
            setCurrentStage(update.stage);
            setCurrentProgress(update.progress);
          }

          if (update.currentSearchSource) {
            const nextLookupProgress =
              update.lookupProgress ?? {
                sourceKey: "marketplace",
                sourceLabel: update.currentSearchSource,
                message: update.currentSearchSource,
              };
            currentLookupProgressRef.current = nextLookupProgress;
            setCurrentLookupProgress(nextLookupProgress);
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
          mode: currentSession.mode
        });
        setLatestResult(null);
        setSelectedItem(null);
        setSelectedItemID(null);
        const latestLookupProgress = currentLookupProgressRef.current;
        const lastStepLabel = latestLookupProgress?.sourceLabel?.trim();
        const lastStepMessage = latestLookupProgress?.message?.trim();
        const failureContext = [lastStepLabel, lastStepMessage].filter(Boolean).join(" — ");
        const errorMessage = failureContext
          ? `${t("processing.error.message")}\n\nLast step: ${failureContext}`
          : t("processing.error.message");
        Alert.alert(t("processing.error.title"), errorMessage, [
          {
            text: t("common.retry"),
            onPress: () => {
              setRetryNonce((value) => value + 1);
            }
          },
          { text: t("common.back"), style: "cancel", onPress: () => back() }
        ]);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [
    container.scanOrchestrator,
    currentSession,
    resetProgressState,
    back,
    replace,
    retryNonce,
    setCurrentSession,
    setLatestResult,
    setSelectedItem,
    setSelectedItemID
  ]);

  const retake = async () => {
    await setCurrentSession(null);
    setLatestResult(null);
    setSelectedItem(null);
    setSelectedItemID(null);
    replace("/scan");
  };

  const steps = useMemo(
    () =>
      deriveSteps(
        currentStage,
        currentProgress,
        finalizing,
        completed,
        currentLookupProgress?.sourceKey ?? null,
      ),
    [completed, currentProgress, currentLookupProgress?.sourceKey, currentStage, finalizing]
  );

  const previewUri = currentSession?.capturedImages[0]?.uri;
  const activeLookupProgress = currentLookupProgress
    ? {
        label: currentLookupProgress.sourceLabel?.trim() || null,
        message: currentLookupProgress.message?.trim() || null,
      }
    : null;

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
          {steps.map((step, index) => (
            <React.Fragment key={step.kind}>
              <ProcessingStepRow
                title={step.label}
                status={step.status}
                detail={step.status === "active" ? activeLookupProgress : null}
                testID={
                  step.kind === "valueEstimate"
                    ? "processing.step.valueEstimate"
                    : `processing.step.${step.kind}`
                }
              />
              {index < steps.length - 1 ? <View style={styles.divider} /> : null}
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
  detail,
  testID
}: {
  title: string;
  status: DisplayStepStatus;
  detail?: { label: string | null; message: string | null } | null;
  testID?: string;
}) {
  return (
    <View style={styles.stepRow} testID={testID}>
      <View style={styles.stepLeft}>
        <StepIndicator status={status} />
        <View style={styles.stepTextWrap}>
          <Text style={[styles.stepText, status === "pending" && styles.stepTextPending]}>{title}</Text>
          {status === "active" && detail?.label ? (
            <Text style={styles.stepDetailLabel}>{detail.label.toUpperCase()}</Text>
          ) : null}
          {status === "active" && detail?.message ? <Text style={styles.stepDetail}>{detail.message}</Text> : null}
        </View>
      </View>
      <Text
        style={[
          styles.stepStatus,
          status === "complete" && styles.stepStatusComplete,
          status === "active" && styles.stepStatusActive,
          status === "pending" && styles.stepStatusPending
        ]}
      >
        {statusLabel(status)}
      </Text>
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
          useNativeDriver: true
        }),
        Animated.timing(pulse, {
          toValue: 0.35,
          duration: 850,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        })
      ])
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

  return <View style={[styles.dot, status === "complete" ? styles.dotComplete : styles.dotPending]} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background
  },
  topBar: {
    height: 52,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  backButton: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center"
  },
  topTitle: {
    color: colors.foreground,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 3
  },
  topSpacer: {
    width: 20,
    height: 20
  },
  previewWrap: {
    width: "100%",
    height: 280,
    backgroundColor: "#050505"
  },
  previewImage: {
    width: "100%",
    height: "100%"
  },
  previewFallback: {
    backgroundColor: "#111111"
  },
  stageSection: {
    flex: 1,
    paddingTop: 24,
    paddingHorizontal: 24
  },
  stageTitle: {
    color: "#444444",
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 3,
    marginBottom: 18
  },
  divider: {
    height: 1,
    backgroundColor: "#1A1A1A"
  },
  stepRow: {
    minHeight: 64,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between"
  },
  stepLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 14
  },
  stepTextWrap: {
    flex: 1,
    gap: 5,
  },
  stepDetailLabel: {
    color: "#D0D0D0",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999
  },
  dotComplete: {
    backgroundColor: colors.foreground
  },
  dotPending: {
    backgroundColor: "#333333"
  },
  activeIndicatorWrap: {
    width: ACTIVE_RING_SIZE,
    height: ACTIVE_RING_SIZE,
    alignItems: "center",
    justifyContent: "center"
  },
  activeIndicatorRing: {
    position: "absolute",
    width: ACTIVE_RING_SIZE,
    height: ACTIVE_RING_SIZE,
    borderRadius: 999,
    borderWidth: 4,
    borderColor: "#333333"
  },
  activeIndicatorDot: {
    width: ACTIVE_DOT_SIZE,
    height: ACTIVE_DOT_SIZE,
    borderRadius: 999,
    backgroundColor: colors.foreground
  },
  stepText: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "500"
  },
  stepTextPending: {
    color: "#444444"
  },
  stepDetail: {
    color: "#E0E0E0",
    fontSize: 13,
    fontWeight: "400",
    lineHeight: 18,
  },
  stepStatus: {
    color: "#888888",
    fontSize: 12,
    fontWeight: "400",
    alignSelf: "center",
  },
  stepStatusComplete: {
    color: "#444444",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 2
  },
  stepStatusActive: {
    color: "#7A7A7A",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 2
  },
  stepStatusPending: {
    color: "#333333",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 2
  },
  emptyRoot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 12
  },
  emptyTitle: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: "700"
  },
  emptyMessage: {
    color: colors.foregroundSubtle,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20
  },
  emptyButton: {
    marginTop: 8,
    width: 180,
    height: 48,
    backgroundColor: colors.foreground,
    alignItems: "center",
    justifyContent: "center"
  },
  emptyButtonText: {
    color: colors.inverseForeground,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 1
  }
});
