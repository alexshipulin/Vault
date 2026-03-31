import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";

import { useAppState } from "@src/app/AppProvider";
import type { ScanImage } from "@src/domain/models";
import {
  EmptyState,
  HeaderAction,
  Screen,
  ScreenHeader,
  SegmentedModeSwitch,
  StickyActionBar
} from "@src/shared/design-system/primitives";
import { borders, colors, spacing, textStyles } from "@src/shared/design-system/tokens";
import { createID } from "@src/shared/utils/id";
import { t } from "@src/shared/i18n/strings";

export function CameraScanScreen() {
  const router = useRouter();
  const cameraRef = useRef<CameraView | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const { container, preferredScanMode, setPreferredScanMode, setCurrentSession } = useAppState();
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturePreview, setCapturePreview] = useState<string | null>(null);

  const isFallbackMode = container.runtimeConfig.flags.forceMockCamera || !permission?.granted;
  const helperText =
    preferredScanMode === "mystery" ? t("scan.helper.mystery") : t("scan.helper.standard");

  const ensurePermission = useCallback(async () => {
    if (permission?.granted) {
      return true;
    }

    const response = await requestPermission();
    return response.granted;
  }, [permission?.granted, requestPermission]);

  const capture = useCallback(async () => {
    setIsCapturing(true);
    try {
      let image: ScanImage;

      if (isFallbackMode || !cameraRef.current) {
        image = await container.cameraService.captureMockImage(preferredScanMode);
      } else {
        const captured = await cameraRef.current.takePictureAsync({
          base64: true,
          quality: 0.85
        });
        image = {
          id: createID("image"),
          uri: captured?.uri ?? "file:///mock/capture.jpg",
          mimeType: "image/jpeg",
          base64: captured?.base64
        };
      }

      setCapturePreview(image.uri);
      await setCurrentSession({
        id: createID("session"),
        mode: preferredScanMode,
        capturedImages: [image],
        createdAt: new Date().toISOString()
      });
      router.push("/processing");
    } finally {
      setIsCapturing(false);
    }
  }, [container.cameraService, isFallbackMode, preferredScanMode, router, setCurrentSession]);

  const previewContent = useMemo(() => {
    if (!permission) {
      return (
        <EmptyState
          title={t("scan.loading.title")}
          message={t("scan.loading.message")}
        />
      );
    }

    if (!permission.granted && !container.runtimeConfig.flags.forceMockCamera) {
      return (
        <EmptyState
          title={t("scan.permission.title")}
          message={t("scan.permission.message")}
          actionTitle={t("scan.permission.retry")}
          onAction={() => {
            void ensurePermission();
          }}
          testID="scan.permissionDeniedState"
        />
      );
    }

    if (container.runtimeConfig.flags.forceMockCamera) {
      return (
        <EmptyState
          title={t("scan.simulator.title")}
          message={t("scan.simulator.message")}
          actionTitle={t("scan.capture")}
          onAction={() => {
            void capture();
          }}
          testID="scan.simulatorFallbackState"
        />
      );
    }

    return (
      <>
        <CameraView
          ref={cameraRef}
          facing="back"
          style={StyleSheet.absoluteFillObject}
        />
        <OverlayGuides />
      </>
    );
  }, [capture, ensurePermission, permission, container.runtimeConfig.flags.forceMockCamera]);

  return (
    <Screen testID="scan.screen">
      <View style={styles.root}>
        <ScreenHeader
          title={t("scan.title")}
          leftAction={
            <HeaderAction
              icon="close"
              onPress={() => router.navigate("/(tabs)")}
              testID="scan.closeButton"
            />
          }
        />

        <SegmentedModeSwitch
          value={preferredScanMode}
          onChange={setPreferredScanMode}
          testPrefix="scan.mode"
        />

        <View style={styles.previewFrame}>
          {previewContent}
          {capturePreview ? (
            <Image source={{ uri: capturePreview }} style={styles.debugPreview} />
          ) : null}
        </View>

        <Text style={styles.helperText}>{helperText}</Text>
      </View>

      <StickyActionBar>
        <View style={styles.captureBar}>
          <Text style={styles.captureMeta}>{preferredScanMode.toUpperCase()}</Text>
          <Pressable disabled={isCapturing} onPress={() => void capture()} testID="scan.captureButton">
            <View style={styles.captureOuter}>
              <View style={styles.captureInner} />
            </View>
          </Pressable>
          <Text style={styles.captureMeta}>{t("scan.shot.count")}</Text>
        </View>
      </StickyActionBar>
    </Screen>
  );
}

function OverlayGuides() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="scan.overlay">
      {[
        { top: 28, left: 28 },
        { top: 28, right: 28 },
        { bottom: 28, left: 28 },
        { bottom: 28, right: 28 }
      ].map((position, index) => (
        <View key={index} style={[styles.guideCorner, position]}>
          <View style={styles.guideHorizontal} />
          <View style={styles.guideVertical} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: 20,
    paddingBottom: spacing.lg,
    gap: spacing.md
  },
  previewFrame: {
    flex: 1,
    borderWidth: borders.hairline,
    borderColor: colors.borderDefault,
    overflow: "hidden",
    backgroundColor: colors.surface
  },
  helperText: {
    ...textStyles.micro,
    color: colors.foregroundSubtle,
    textAlign: "center"
  },
  captureBar: {
    flexDirection: "row",
    alignItems: "center"
  },
  captureMeta: {
    flex: 1,
    ...textStyles.micro,
    color: colors.foregroundSubtle,
    textAlign: "center"
  },
  captureOuter: {
    width: 72,
    height: 72,
    borderWidth: borders.emphasis,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center"
  },
  captureInner: {
    width: 54,
    height: 54,
    backgroundColor: colors.fillSelected
  },
  guideCorner: {
    position: "absolute",
    width: 28,
    height: 28
  },
  guideHorizontal: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 28,
    height: borders.hairline,
    backgroundColor: colors.foreground
  },
  guideVertical: {
    position: "absolute",
    top: 0,
    left: 0,
    width: borders.hairline,
    height: 28,
    backgroundColor: colors.foreground
  },
  debugPreview: {
    position: "absolute",
    right: 12,
    bottom: 12,
    width: 52,
    height: 52,
    borderWidth: borders.hairline,
    borderColor: colors.borderStrong
  }
});
