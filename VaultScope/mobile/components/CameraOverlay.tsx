import { StyleSheet, Text, View } from "react-native";

type CameraOverlayProps = {
  category: string;
  captureLabel: string;
  flashEnabled: boolean;
  currentStep: number;
  totalSteps: number;
};

function isCircularCategory(category: string): boolean {
  return category.toLowerCase().includes("coin");
}

export function CameraOverlay({
  category,
  captureLabel,
  flashEnabled,
  currentStep,
  totalSteps,
}: CameraOverlayProps) {
  const useCircle = isCircularCategory(category);

  return (
    <View pointerEvents="none" style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.metaChip}>
          <Text style={styles.metaText}>
            {captureLabel} {currentStep}/{totalSteps}
          </Text>
        </View>
        <View style={styles.metaChip}>
          <Text style={styles.metaText}>{flashEnabled ? "Flash on" : "Flash off"}</Text>
        </View>
      </View>

      <View style={styles.center}>
        <View style={[styles.guide, useCircle ? styles.circleGuide : styles.rectangleGuide]} />
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerTitle}>
          {useCircle ? "Center the item inside the circle." : "Align the item with the frame."}
        </Text>
        <Text style={styles.footerBody}>
          Keep the item flat, fill most of the guide, and avoid glare or clipped edges.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  metaChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(13, 16, 18, 0.48)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  metaText: {
    color: "#F4F0E8",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  guide: {
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.92)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  circleGuide: {
    width: 260,
    height: 260,
    borderRadius: 999,
  },
  rectangleGuide: {
    width: 290,
    height: 210,
    borderRadius: 28,
  },
  footer: {
    alignItems: "center",
    gap: 6,
  },
  footerTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  footerBody: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    maxWidth: 320,
  },
});
