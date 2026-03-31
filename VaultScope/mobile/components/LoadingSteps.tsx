import { StyleSheet, Text, View } from "react-native";

import type { ScanProgressState } from "@/lib/scan/types";

const STEP_ORDER: Array<ScanProgressState["step"]> = [
  "processing",
  "identifying",
  "pricing",
  "saving",
];

const STEP_LABELS: Record<ScanProgressState["step"], string> = {
  processing: "Processing image...",
  identifying: "Identifying item...",
  pricing: "Finding prices...",
  saving: "Almost done...",
  done: "Done",
};

type LoadingStepsProps = {
  currentStep: ScanProgressState["step"] | null;
  status: ScanProgressState["status"];
};

export function LoadingSteps({ currentStep, status }: LoadingStepsProps) {
  if (!currentStep || currentStep === "done") {
    return null;
  }

  const currentIndex = STEP_ORDER.indexOf(currentStep);

  return (
    <View style={styles.container}>
      {STEP_ORDER.map((step, index) => {
        const isComplete = index < currentIndex || (index === currentIndex && status === "complete");
        const isActive = index === currentIndex && status === "active";
        const isError = index === currentIndex && status === "error";

        return (
          <View key={step} style={styles.row}>
            <View
              style={[
                styles.dot,
                isComplete && styles.dotComplete,
                isActive && styles.dotActive,
                isError && styles.dotError,
              ]}
            />
            <Text
              style={[
                styles.label,
                isComplete && styles.labelComplete,
                isActive && styles.labelActive,
                isError && styles.labelError,
              ]}
            >
              {STEP_LABELS[step]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
    padding: 18,
    borderRadius: 22,
    backgroundColor: "#FFF9F0",
    borderWidth: 1,
    borderColor: "#E8DCC8",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dot: {
    width: 11,
    height: 11,
    borderRadius: 999,
    backgroundColor: "#D8CDBA",
  },
  dotComplete: {
    backgroundColor: "#2C6C59",
  },
  dotActive: {
    backgroundColor: "#C88C3E",
  },
  dotError: {
    backgroundColor: "#A9413D",
  },
  label: {
    fontSize: 14,
    color: "#817662",
  },
  labelComplete: {
    color: "#2C6C59",
    fontWeight: "600",
  },
  labelActive: {
    color: "#3A352A",
    fontWeight: "700",
  },
  labelError: {
    color: "#A9413D",
    fontWeight: "700",
  },
});
