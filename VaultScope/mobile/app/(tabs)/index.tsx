import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CameraView, type CameraCapturedPicture, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { CameraOverlay } from "@/components/CameraOverlay";
import { LoadingSteps } from "@/components/LoadingSteps";
import { ScanButton } from "@/components/ScanButton";
import { ScanPipeline } from "@/lib/scan/pipeline";
import type { ScanProgressState, ScanResult } from "@/lib/scan/types";

const CAPTURE_STEPS = ["Capture front", "Capture back"] as const;

type CameraRefHandle = {
  takePictureAsync: (options?: {
    quality?: number;
    skipProcessing?: boolean;
  }) => Promise<CameraCapturedPicture | undefined>;
};

export default function ScannerScreen() {
  const cameraRef = useRef<CameraRefHandle | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [galleryPermission, requestGalleryPermission] = ImagePicker.useMediaLibraryPermissions();
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [flashMode, setFlashMode] = useState<"on" | "off">("off");
  const [isBusy, setIsBusy] = useState(false);
  const [progress, setProgress] = useState<ScanProgressState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);

  const currentCaptureIndex = Math.min(capturedImages.length, CAPTURE_STEPS.length - 1);
  const currentCaptureLabel = CAPTURE_STEPS[currentCaptureIndex];
  const canCapture = cameraPermission?.granted && !isBusy;

  const pipeline = useMemo(
    () =>
      new ScanPipeline({
        onProgress: setProgress,
      }),
    [],
  );

  useEffect(() => {
    if (!cameraPermission) {
      return;
    }

    if (!cameraPermission.granted && cameraPermission.canAskAgain) {
      void requestCameraPermission();
    }
  }, [cameraPermission, requestCameraPermission]);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || !canCapture) {
      return;
    }

    try {
      setErrorMessage(null);
      const photo = (await cameraRef.current.takePictureAsync({
        quality: 0.9,
        skipProcessing: false,
      })) as CameraCapturedPicture | undefined;

      if (!photo?.uri) {
        return;
      }

      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setCapturedImages((current) => {
        const next = [...current, photo.uri];
        return next.slice(0, CAPTURE_STEPS.length);
      });
    } catch (error) {
      console.warn("[Scanner] Capture failed.", error);
      setErrorMessage("We couldn't capture that photo. Try again with steadier framing.");
    }
  }, [canCapture]);

  const handlePickFromGallery = useCallback(async () => {
    setErrorMessage(null);

    if (!galleryPermission?.granted) {
      const permissionResult = await requestGalleryPermission();

      if (!permissionResult.granted) {
        setErrorMessage("Photo library access is needed to import reference images.");
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: 2,
      quality: 0.9,
    });

    if (result.canceled) {
      return;
    }

    const nextUris = result.assets.map((asset) => asset.uri).filter(Boolean).slice(0, 2);

    if (nextUris.length === 0) {
      return;
    }

    setCapturedImages(nextUris);
  }, [galleryPermission?.granted, requestGalleryPermission]);

  const handleRunScan = useCallback(async () => {
    if (capturedImages.length === 0) {
      setErrorMessage("Add at least one clear photo before starting analysis.");
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);

    try {
      const result = await pipeline.executeScan(capturedImages, "antique");
      setLastResult(result);
      router.push(`/scan-result/${result.id}`);
      setCapturedImages([]);
    } catch (error) {
      console.warn("[Scanner] Pipeline failed.", error);
      setErrorMessage(
        error instanceof Error && "userMessage" in error
          ? String((error as { userMessage?: string }).userMessage ?? error.message)
          : "We couldn't finish the scan. Try another photo or import from your gallery.",
      );
    } finally {
      setIsBusy(false);
    }
  }, [capturedImages, pipeline]);

  const handleReset = useCallback(() => {
    setCapturedImages([]);
    setProgress(null);
    setErrorMessage(null);
  }, []);

  if (cameraPermission && !cameraPermission.granted && !cameraPermission.canAskAgain) {
    return (
      <SafeAreaView style={styles.permissionShell}>
        <View style={styles.permissionCard}>
          <Text style={styles.permissionTitle}>Camera access is blocked</Text>
          <Text style={styles.permissionBody}>
            VaultScope needs camera access to guide captures and detect barcodes. You can still
            import from the gallery, or reopen permissions in Settings.
          </Text>
          <View style={styles.permissionActions}>
            <Pressable onPress={() => void Linking.openSettings()} style={styles.primaryAction}>
              <Text style={styles.primaryActionText}>Open Settings</Text>
            </Pressable>
            <Pressable onPress={() => void handlePickFromGallery()} style={styles.secondaryAction}>
              <Text style={styles.secondaryActionText}>Use Gallery Instead</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.cameraShell}>
        <CameraView
          ref={cameraRef as never}
          style={styles.camera}
          facing="back"
          flash={flashMode}
          barcodeScannerSettings={{
            barcodeTypes: ["qr", "ean13", "code128", "upc_a", "upc_e"],
          }}
        />
        <CameraOverlay
          category="antique"
          captureLabel={currentCaptureLabel}
          flashEnabled={flashMode === "on"}
          currentStep={Math.min(capturedImages.length + 1, CAPTURE_STEPS.length)}
          totalSteps={CAPTURE_STEPS.length}
        />
      </View>

      <View style={styles.controlsPanel}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title} testID="scanner-title">Scan your item</Text>
            <Text style={styles.subtitle}>
              Capture both sides when possible to improve OCR, maker marks, and pricing matches.
            </Text>
          </View>
          <Pressable
            onPress={() => setFlashMode((current) => (current === "on" ? "off" : "on"))}
            style={styles.iconButton}
            testID="flash-toggle"
          >
            <Ionicons color="#F5EFE4" name={flashMode === "on" ? "flash" : "flash-off"} size={18} />
          </Pressable>
        </View>

        <View style={styles.progressRow}>
          {CAPTURE_STEPS.map((label, index) => {
            const complete = index < capturedImages.length;

            return (
              <View key={label} style={styles.progressPill}>
                <View style={[styles.progressDot, complete && styles.progressDotComplete]} />
                <Text style={[styles.progressLabel, complete && styles.progressLabelComplete]}>
                  {label}
                </Text>
              </View>
            );
          })}
        </View>

        {progress ? <LoadingSteps currentStep={progress.step} status={progress.status} /> : null}

        {errorMessage ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.previewRow}
        >
          {capturedImages.length === 0 ? (
            <View style={styles.emptyPreview}>
              <Text style={styles.emptyPreviewTitle}>No captures yet</Text>
              <Text style={styles.emptyPreviewBody}>
                Start with the front, then flip the item for the back or hallmark side.
              </Text>
            </View>
          ) : (
            capturedImages.map((imageUri, index) => (
              <View key={imageUri} style={styles.previewCard}>
                <Image source={{ uri: imageUri }} style={styles.previewImage} />
                <Text style={styles.previewLabel}>{CAPTURE_STEPS[index] ?? `Photo ${index + 1}`}</Text>
              </View>
            ))
          )}
        </ScrollView>

        {isBusy ? (
          <View style={styles.busyRow}>
            <ActivityIndicator color="#1E3A34" />
            <Text style={styles.busyText}>{progress?.label ?? "Working..."}</Text>
          </View>
        ) : null}

        <View style={styles.actionRow}>
          <Pressable
            disabled={!canCapture}
            onPress={() => void handleCapture()}
            style={[styles.captureButton, !canCapture && styles.captureButtonDisabled]}
            testID="capture-button"
          >
            <View style={styles.captureButtonCore} />
          </Pressable>

          <View style={styles.sideActions}>
            <Pressable
              onPress={() => void handlePickFromGallery()}
              style={styles.utilityButton}
              testID="gallery-button"
            >
              <Ionicons color="#2B261F" name="images-outline" size={18} />
              <Text style={styles.utilityButtonText}>Gallery</Text>
            </Pressable>
            <Pressable onPress={handleReset} style={styles.utilityButton} testID="reset-button">
              <Ionicons color="#2B261F" name="refresh-outline" size={18} />
              <Text style={styles.utilityButtonText}>Reset</Text>
            </Pressable>
          </View>
        </View>

        <ScanButton
          title={capturedImages.length >= 1 ? "Run Scan" : "Capture to Start"}
          onPress={() => void handleRunScan()}
          disabled={isBusy || capturedImages.length === 0}
          testID="run-scan-button"
        />

        {lastResult ? (
          <View style={styles.lastResultCard}>
            <Text style={styles.lastResultTitle}>Last scan saved</Text>
            <Text style={styles.lastResultBody}>
              {lastResult.identification.name} with{" "}
              {Math.round(lastResult.identification.confidence * 100)}% confidence.
            </Text>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0C1112",
  },
  cameraShell: {
    ...StyleSheet.absoluteFillObject,
  },
  camera: {
    flex: 1,
  },
  controlsPanel: {
    marginTop: "auto",
    backgroundColor: "#F4EFE4",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
    gap: 16,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#171612",
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: "#625744",
    maxWidth: 280,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: "#1E3A34",
    alignItems: "center",
    justifyContent: "center",
  },
  progressRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  progressPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#EAE1D0",
  },
  progressDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
    backgroundColor: "#B8AE9F",
  },
  progressDotComplete: {
    backgroundColor: "#2C6C59",
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#5D533F",
  },
  progressLabelComplete: {
    color: "#2C6C59",
  },
  errorCard: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: "#F9E0DA",
    borderWidth: 1,
    borderColor: "#EAB5AA",
  },
  errorText: {
    color: "#8D3028",
    fontSize: 14,
    lineHeight: 20,
  },
  previewRow: {
    gap: 12,
  },
  emptyPreview: {
    width: 230,
    borderRadius: 22,
    padding: 18,
    backgroundColor: "#FFFCF7",
    borderWidth: 1,
    borderColor: "#E6DAC6",
    gap: 8,
  },
  emptyPreviewTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1F1C16",
  },
  emptyPreviewBody: {
    fontSize: 13,
    lineHeight: 18,
    color: "#6E624E",
  },
  previewCard: {
    width: 140,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#FFF9F0",
    borderWidth: 1,
    borderColor: "#E6DAC6",
  },
  previewImage: {
    width: "100%",
    height: 110,
  },
  previewLabel: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 12,
    fontWeight: "700",
    color: "#403625",
  },
  busyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  busyText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#403625",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  captureButton: {
    width: 78,
    height: 78,
    borderRadius: 999,
    backgroundColor: "#EDE4D4",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  captureButtonDisabled: {
    opacity: 0.5,
  },
  captureButtonCore: {
    width: 58,
    height: 58,
    borderRadius: 999,
    backgroundColor: "#1E3A34",
  },
  sideActions: {
    flexDirection: "row",
    gap: 10,
  },
  utilityButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#E8DECF",
  },
  utilityButtonText: {
    color: "#2B261F",
    fontSize: 13,
    fontWeight: "700",
  },
  lastResultCard: {
    borderRadius: 18,
    padding: 16,
    backgroundColor: "#13211F",
    gap: 6,
  },
  lastResultTitle: {
    color: "#E8DECF",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  lastResultBody: {
    color: "#F7F3EA",
    fontSize: 14,
    lineHeight: 20,
  },
  permissionShell: {
    flex: 1,
    backgroundColor: "#F4EFE4",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  permissionCard: {
    width: "100%",
    borderRadius: 28,
    padding: 24,
    backgroundColor: "#FFF9F0",
    borderWidth: 1,
    borderColor: "#E4D9C7",
    gap: 14,
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1F1A15",
  },
  permissionBody: {
    fontSize: 15,
    lineHeight: 22,
    color: "#5D5444",
  },
  permissionActions: {
    gap: 10,
  },
  primaryAction: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#1E3A34",
  },
  primaryActionText: {
    color: "#F7F3EA",
    fontWeight: "700",
    fontSize: 15,
  },
  secondaryAction: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#E8DECF",
  },
  secondaryActionText: {
    color: "#312A21",
    fontWeight: "700",
    fontSize: 15,
  },
});
