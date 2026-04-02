import * as FileSystem from "expo-file-system/legacy";

import type { ImagePersistenceService } from "@src/domain/contracts";
import type { ScanImage } from "@src/domain/models";
import { createID } from "@src/shared/utils/id";

const IMAGE_DIRECTORY = `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory}vault-react-images/`;
const fileSystemBridge = (FileSystem as typeof FileSystem & { default?: typeof FileSystem }).default ?? FileSystem;

export class LocalImagePersistenceService implements ImagePersistenceService {
  async persistImages(images: ScanImage[]): Promise<string[]> {
    if (!IMAGE_DIRECTORY) {
      return images.map((image) => image.uri);
    }

    if (typeof fileSystemBridge.makeDirectoryAsync === "function") {
      await fileSystemBridge.makeDirectoryAsync(IMAGE_DIRECTORY, { intermediates: true }).catch(() => null);
    }

    const persisted = await Promise.all(
      images.map(async (image) => {
        if (image.uri.startsWith("file://")) {
          const destination = `${IMAGE_DIRECTORY}${createID("capture")}.jpg`;
          try {
            await fileSystemBridge.copyAsync({ from: image.uri, to: destination });
            return destination;
          } catch (error) {
            console.warn("Failed to persist image copy", error);
            return image.uri;
          }
        }

        if (image.base64) {
          const destination = `${IMAGE_DIRECTORY}${createID("capture")}.jpg`;
          try {
            await fileSystemBridge.writeAsStringAsync(destination, image.base64, {
              encoding: fileSystemBridge.EncodingType.Base64
            });
            return destination;
          } catch (error) {
            console.warn("Failed to persist image bytes", error);
            return image.uri;
          }
        }

        return image.uri;
      })
    );

    return persisted;
  }
}
