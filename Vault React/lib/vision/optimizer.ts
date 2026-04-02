import * as FileSystem from "expo-file-system/legacy";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";

const BYTES_IN_MB = 1024 * 1024;
const fileSystemBridge = (FileSystem as typeof FileSystem & { default?: typeof FileSystem }).default ?? FileSystem;

async function getFileSize(uri: string): Promise<number> {
  const info = await fileSystemBridge.getInfoAsync(uri, { size: true });
  return info.exists && typeof info.size === "number" ? info.size : 0;
}

export class ImageOptimizer {
  async compressImage(uri: string, maxSizeMB: number): Promise<string> {
    let workingUri = uri;
    let compression = 0.82;
    let currentSize = await getFileSize(workingUri);

    while (currentSize > maxSizeMB * BYTES_IN_MB && compression >= 0.3) {
      const result = await manipulateAsync(
        workingUri,
        [],
        {
          compress: compression,
          format: SaveFormat.JPEG,
          base64: false,
        },
      );

      workingUri = result.uri;
      currentSize = await getFileSize(workingUri);
      compression -= 0.12;
    }

    return workingUri;
  }

  async resizeToFit(uri: string, maxDim: number): Promise<string> {
    const file = await manipulateAsync(uri, [], { base64: false });
    const longestSide = Math.max(file.width, file.height);

    if (longestSide <= maxDim) {
      return file.uri;
    }

    const scale = maxDim / longestSide;
    const width = Math.max(1, Math.round(file.width * scale));
    const height = Math.max(1, Math.round(file.height * scale));
    const resized = await manipulateAsync(
      uri,
      [{ resize: { width, height } }],
      {
        compress: 0.92,
        format: SaveFormat.JPEG,
        base64: false,
      },
    );

    return resized.uri;
  }

  async convertToBase64(uri: string): Promise<string> {
    return fileSystemBridge.readAsStringAsync(uri, {
      encoding: fileSystemBridge.EncodingType.Base64,
    });
  }
}

export const imageOptimizer = new ImageOptimizer();
