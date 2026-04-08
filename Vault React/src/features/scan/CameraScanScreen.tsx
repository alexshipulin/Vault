import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, usePathname, useRouter } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppState } from "@src/core/app/AppProvider";
import type { ScanImage, ScanMode } from "@src/domain/models";
import { borders, colors, spacing, textStyles } from "@src/shared/design-system/tokens";
import { createID } from "@src/shared/utils/id";
import { t } from "@src/shared/i18n/strings";

const MAX_CAPTURE_IMAGES = 3;
const CAMERA_HORIZONTAL_PADDING = 24;
const CAMERA_BOTTOM_HORIZONTAL_PADDING = 21;

export function CameraScanScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const { container, preferredScanMode, setPreferredScanMode, setCurrentSession } = useAppState();
  const [busyAction, setBusyAction] = useState<"capture" | "gallery" | "analyse" | null>(null);
  const [pendingImages, setPendingImages] = useState<ScanImage[]>([]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        cameraRef.current = null;
        setPendingImages([]);
        setBusyAction(null);
      };
    }, [])
  );

  useEffect(() => {
    if (pathname === "/scan") {
      return;
    }

    cameraRef.current = null;
    setPendingImages([]);
    setBusyAction(null);
  }, [pathname]);

  const isCapturing = busyAction === "capture";
  const isBusy = busyAction !== null;
  const isScanRouteActive = pathname === "/scan";
  const cameraEnabled = permission?.granted && !container.runtimeConfig.flags.forceMockCamera;
  const cameraPreviewEnabled = isScanRouteActive && isFocused && cameraEnabled;
  const remainingSlots = MAX_CAPTURE_IMAGES - pendingImages.length;
  const canCaptureMore = remainingSlots > 0 && !isBusy;
  const canPickFromGallery = remainingSlots > 0 && !isBusy;
  const canAnalyse = pendingImages.length > 0 && !isBusy;

  const removeLastPendingImage = useCallback(() => {
    setPendingImages((currentImages) => currentImages.slice(0, -1));
  }, []);

  const ensurePermission = useCallback(async () => {
    if (permission?.granted) {
      return true;
    }

    const response = await requestPermission();
    return response.granted;
  }, [permission?.granted, requestPermission]);

  const startAnalysis = useCallback(
    async (images: ScanImage[]) => {
      if (!images.length) {
        return;
      }

      await setCurrentSession({
        id: createID("session"),
        mode: preferredScanMode,
        capturedImages: images,
        createdAt: new Date().toISOString()
      });
      router.push("/processing");
    },
    [preferredScanMode, router, setCurrentSession]
  );

  const appendImages = useCallback((images: ScanImage[]) => {
    if (images.length === 0) {
      return;
    }

    setPendingImages((currentImages) => {
      const openSlots = MAX_CAPTURE_IMAGES - currentImages.length;
      if (openSlots <= 0) {
        return currentImages;
      }

      return [...currentImages, ...images.slice(0, openSlots)];
    });
  }, []);

  const analysePendingImages = useCallback(async () => {
    if (!pendingImages.length) {
      return;
    }

    setBusyAction("analyse");

    try {
      await startAnalysis(pendingImages);
    } finally {
      setBusyAction(null);
    }
  }, [pendingImages, startAnalysis]);

  const capture = useCallback(async () => {
    if (!canCaptureMore) {
      return;
    }

    setBusyAction("capture");
    try {
      let image: ScanImage;

        if (!cameraEnabled || !cameraRef.current || !isScanRouteActive) {
        const granted = await ensurePermission();
        if (!granted && !container.runtimeConfig.flags.forceMockCamera) {
          setBusyAction(null);
          return;
        }

        image = await container.mockCaptureService.capture(preferredScanMode);
      } else {
        const captured = await cameraRef.current.takePictureAsync({
          base64: true,
          quality: 0.85,
          skipProcessing: true
        });
        image = {
          id: createID("image"),
          uri: captured?.uri ?? "file:///mock/capture.jpg",
          mimeType: "image/jpeg",
          base64: captured?.base64
        };
      }

      appendImages([image]);
    } catch {
      Alert.alert(t("scan.error.title"), t("scan.error.message"));
    } finally {
      setBusyAction(null);
    }
  }, [
    appendImages,
    canCaptureMore,
    cameraEnabled,
    container.mockCaptureService,
    container.runtimeConfig.flags.forceMockCamera,
    ensurePermission,
    isScanRouteActive,
    preferredScanMode
  ]);

  const openSettings = useCallback(() => {
    void Linking.openSettings();
  }, []);

  const pickFromGallery = useCallback(async () => {
    if (!canPickFromGallery) {
      return;
    }

    setBusyAction("gallery");

    try {
      const permissionResponse = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResponse.granted) {
        Alert.alert(t("scan.gallery.permission.title"), t("scan.gallery.permission.message"), [
          { text: t("common.cancel"), style: "cancel" },
          { text: t("common.settings"), onPress: openSettings }
        ]);
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        allowsMultipleSelection: true,
        base64: true,
        mediaTypes: ["images"],
        orderedSelection: true,
        quality: 0.85,
        selectionLimit: remainingSlots
      });

      if (result.canceled || result.assets.length === 0) {
        return;
      }

      appendImages(
        result.assets.map((asset) => ({
          id: createID("image"),
          uri: asset.uri,
          mimeType: asset.mimeType ?? "image/jpeg",
          base64: asset.base64 ?? undefined
        }))
      );
    } catch {
      Alert.alert(t("scan.error.title"), t("scan.gallery.error.message"));
    } finally {
      setBusyAction(null);
    }
  }, [appendImages, canPickFromGallery, openSettings, remainingSlots]);

  const captureHint = useMemo(() => {
    if (pendingImages.length === 0) {
      return t("scan.capture.sequence.initial");
    }

    return t("scan.capture.sequence.ready", { count: pendingImages.length });
  }, [pendingImages.length]);

  const previewContent = useMemo(() => {
    if (cameraPreviewEnabled) {
      return (
        <CameraView
          active={isFocused}
          ref={cameraRef}
          facing="back"
          style={StyleSheet.absoluteFillObject}
        />
      );
    }

    if (!isScanRouteActive || !isFocused) {
      return <View style={styles.previewInactive} />;
    }

    return (
      <View style={styles.previewFallback} testID="scan.permissionDeniedState">
        <Text style={styles.previewFallbackTitle}>
          {container.runtimeConfig.flags.forceMockCamera ? t("scan.simulator.title") : t("scan.permission.title")}
        </Text>
        <Text style={styles.previewFallbackBody}>
          {container.runtimeConfig.flags.forceMockCamera ? t("scan.simulator.message") : t("scan.permission.message")}
        </Text>
        {!container.runtimeConfig.flags.forceMockCamera ? (
          <Pressable onPress={() => void ensurePermission()} style={styles.previewFallbackButton}>
            <Text style={styles.previewFallbackButtonText}>{t("scan.permission.retry")}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }, [
    cameraPreviewEnabled,
    container.runtimeConfig.flags.forceMockCamera,
    ensurePermission,
    isFocused,
    isScanRouteActive
  ]);

  return (
    <View style={styles.screen} testID="scan.screen">
      {previewContent}

      <View style={[styles.topBar, { top: insets.top }]}>
        <Pressable
          onPress={() => {
            setPendingImages([]);
            setBusyAction(null);
            router.navigate("/");
          }}
          style={styles.closeButton}
          testID="scan.closeButton"
        >
          <Ionicons color={colors.foreground} name="arrow-back" size={28} />
        </Pressable>
      </View>

      <OverlayGuides />

      <View style={[styles.bottomDock, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        <View style={styles.modeToggle}>
          <ModeCard
            mode="standard"
            selected={preferredScanMode === "standard"}
            onPress={() => void setPreferredScanMode("standard")}
            subtitle={t("scan.mode.standard.subtitle")}
          />
          <ModeCard
            mode="mystery"
            selected={preferredScanMode === "mystery"}
            onPress={() => void setPreferredScanMode("mystery")}
            subtitle={t("scan.mode.mystery.subtitle")}
          />
        </View>

        <Text style={styles.captureHint}>{captureHint}</Text>

        <View style={styles.captureRow}>
          <IconActionButton
            disabled={pendingImages.length === 0 || isBusy}
            icon="layers-outline"
            onPress={removeLastPendingImage}
            testID="scan.multiButton"
          />

          <Pressable
            disabled={!canCaptureMore}
            onPress={() => void capture()}
            style={({ pressed }) => [
              styles.captureButton,
              (!canCaptureMore || pressed || isCapturing) && styles.captureButtonPressed
            ]}
            testID="scan.captureButton"
          >
            <View style={styles.captureButtonInner} />
          </Pressable>

          <IconActionButton
            disabled={!canPickFromGallery}
            icon="image-outline"
            onPress={() => void pickFromGallery()}
            testID="scan.galleryButton"
          />
        </View>

        <Pressable
          disabled={!canAnalyse}
          onPress={() => void analysePendingImages()}
          style={({ pressed }) => [
            styles.analyseButton,
            (!canAnalyse || pressed || busyAction === "analyse") && styles.analyseButtonPressed
          ]}
          testID="scan.analyseButton"
        >
          <Ionicons color={colors.inverseForeground} name="scan-outline" size={20} />
          <Text style={styles.analyseButtonText}>{t("scan.analyse")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function OverlayGuides() {
  return <View pointerEvents="none" style={styles.overlayRoot} testID="scan.overlay" />;
}

function ModeCard({
  mode,
  selected,
  subtitle,
  onPress
}: {
  mode: ScanMode;
  selected: boolean;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.modeCard, selected ? styles.modeCardSelected : styles.modeCardUnselected]}
      testID={`scan.mode.${mode}`}
    >
      <Text style={[styles.modeTitle, selected ? styles.modeTitleSelected : styles.modeTitleUnselected]}>
        {mode.toUpperCase()}
      </Text>
      <Text style={[styles.modeSubtitle, selected ? styles.modeSubtitleSelected : styles.modeSubtitleUnselected]}>
        {subtitle}
      </Text>
    </Pressable>
  );
}

function IconActionButton({
  disabled,
  icon,
  onPress,
  testID
}: {
  disabled?: boolean;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.sideActionButton,
        disabled && styles.sideActionButtonDisabled,
        pressed && !disabled && styles.sideActionButtonPressed
      ]}
      testID={testID}
    >
      <Ionicons color={colors.foreground} name={icon} size={18} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background
  },
  topBar: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingHorizontal: CAMERA_HORIZONTAL_PADDING,
    flexDirection: "row",
    alignItems: "center"
  },
  closeButton: {
    width: 35,
    height: 35,
    alignItems: "center",
    justifyContent: "center"
  },
  modeToggle: {
    flexDirection: "row",
    gap: 0
  },
  modeCard: {
    width: 116,
    height: 52,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    gap: 3
  },
  modeCardSelected: {
    backgroundColor: colors.foreground
  },
  modeCardUnselected: {
    backgroundColor: "rgba(0,0,0,0.4)",
    borderWidth: 1,
    borderColor: colors.foreground
  },
  modeTitle: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 2
  },
  modeTitleSelected: {
    color: colors.inverseForeground
  },
  modeTitleUnselected: {
    color: colors.foreground
  },
  modeSubtitle: {
    fontSize: 8,
    lineHeight: 10,
    textAlign: "center"
  },
  modeSubtitleSelected: {
    color: "#555555"
  },
  modeSubtitleUnselected: {
    color: colors.foreground
  },
  bottomDock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: CAMERA_BOTTOM_HORIZONTAL_PADDING,
    paddingTop: 16,
    gap: 16,
    alignItems: "center"
  },
  captureHint: {
    color: "rgba(119,119,119,1)",
    fontSize: 8,
    fontWeight: "600",
    letterSpacing: 2,
    textAlign: "center"
  },
  captureRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 40
  },
  sideActionButton: {
    width: 40,
    height: 40,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: "rgba(68,68,68,1)",
    alignItems: "center",
    justifyContent: "center"
  },
  sideActionButtonDisabled: {
    opacity: 0.35
  },
  sideActionButtonPressed: {
    opacity: 0.85
  },
  captureButton: {
    width: 64,
    height: 64,
    backgroundColor: colors.foreground,
    alignItems: "center",
    justifyContent: "center"
  },
  captureButtonPressed: {
    opacity: 0.45
  },
  captureButtonInner: {
    width: 52,
    height: 52,
    backgroundColor: colors.foreground,
    borderWidth: 2,
    borderColor: colors.inverseForeground
  },
  previewFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.76)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    gap: spacing.sm
  },
  previewFallbackTitle: {
    ...textStyles.bodyStrong,
    color: colors.foreground
  },
  previewFallbackBody: {
    ...textStyles.body,
    color: colors.foregroundMuted,
    textAlign: "center"
  },
  previewFallbackButton: {
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: borders.hairline,
    borderColor: colors.borderDefault
  },
  previewFallbackButtonText: {
    ...textStyles.micro,
    color: colors.foreground
  },
  previewInactive: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background
  },
  overlayRoot: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0
  },
  analyseButton: {
    width: 348,
    height: 56,
    backgroundColor: colors.fillSelected,
    borderWidth: borders.hairline,
    borderColor: colors.borderStrong,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10
  },
  analyseButtonPressed: {
    opacity: 0.45
  },
  analyseButtonText: {
    ...textStyles.button,
    color: colors.inverseForeground,
    letterSpacing: 2
  }
});
