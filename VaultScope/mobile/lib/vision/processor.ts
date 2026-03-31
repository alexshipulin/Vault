import { manipulateAsync, SaveFormat } from "expo-image-manipulator";

import type { VisionBarcode, VisionResult } from "@/lib/scan/types";
import { imageOptimizer, ImageOptimizer } from "@/lib/vision/optimizer";

type MlKitTextRecognitionModule = {
  recognize: (uri: string) => Promise<{ text?: string } | string>;
};

type CameraModule = {
  Camera?: {
    scanFromURLAsync?: (uri: string) => Promise<Array<{ type: string; data: string }>>;
  };
};

function getMlKitTextRecognitionModule(): MlKitTextRecognitionModule | null {
  try {
    return require("@react-native-ml-kit/text-recognition") as MlKitTextRecognitionModule;
  } catch {
    return null;
  }
}

export class VisionProcessor {
  constructor(private readonly optimizer: ImageOptimizer = imageOptimizer) {}

  async processImage(imageUri: string): Promise<VisionResult> {
    const croppedUri = await this.cropToObject(imageUri);
    const text = await this.extractText(croppedUri);
    const barcodes = await this.detectBarcode(croppedUri);
    const optimizedUri = await this.optimizeForUpload(croppedUri);
    const base64 = await this.optimizer.convertToBase64(optimizedUri);

    return {
      originalUri: imageUri,
      croppedUri,
      optimizedUri,
      base64,
      text,
      barcodes,
    };
  }

  async cropToObject(imageUri: string): Promise<string> {
    const source = await manipulateAsync(imageUri, [], { base64: false });
    const insetRatio = 0.08;
    const width = Math.max(1, Math.round(source.width * (1 - insetRatio * 2)));
    const height = Math.max(1, Math.round(source.height * (1 - insetRatio * 2)));
    const originX = Math.max(0, Math.round((source.width - width) / 2));
    const originY = Math.max(0, Math.round((source.height - height) / 2));

    const cropped = await manipulateAsync(
      imageUri,
      [{ crop: { originX, originY, width, height } }],
      {
        compress: 1,
        format: SaveFormat.JPEG,
        base64: false,
      },
    );

    return cropped.uri;
  }

  async extractText(imageUri: string): Promise<string> {
    const prepared = await this.optimizer.resizeToFit(imageUri, 1600);
    const module = getMlKitTextRecognitionModule();

    if (!module) {
      return "";
    }

    try {
      const result = await module.recognize(prepared);

      if (typeof result === "string") {
        return result.trim();
      }

      return typeof result.text === "string" ? result.text.trim() : "";
    } catch (error) {
      console.warn("[Vision] OCR failed.", error);
      return "";
    }
  }

  async detectBarcode(imageUri: string): Promise<VisionBarcode[]> {
    try {
      const cameraModule = require("expo-camera") as CameraModule;
      const scanFromUrl = cameraModule.Camera?.scanFromURLAsync;

      if (typeof scanFromUrl !== "function") {
        return [];
      }

      const results = await scanFromUrl(imageUri);
      return results.map((item) => ({
        type: item.type,
        data: item.data,
      }));
    } catch (error) {
      console.warn("[Vision] Barcode scan failed.", error);
      return [];
    }
  }

  async optimizeForUpload(imageUri: string): Promise<string> {
    const resized = await this.optimizer.resizeToFit(imageUri, 2048);
    return this.optimizer.compressImage(resized, 2);
  }
}

export const visionProcessor = new VisionProcessor();
