import * as FileSystem from "expo-file-system/legacy";

import type { ImagePersistenceService } from "@src/domain/contracts";
import type { ScanImage } from "@src/domain/models";
import { createID } from "@src/shared/utils/id";

const IMAGE_DIRECTORY = `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory}vault-react-images/`;

export class LocalImagePersistenceService implements ImagePersistenceService {
  async persistImages(images: ScanImage[]): Promise<string[]> {
    if (!IMAGE_DIRECTORY) {
      return images.map((image) => image.uri);
    }

    await FileSystem.makeDirectoryAsync(IMAGE_DIRECTORY, { intermediates: true }).catch(() => null);

    const persisted = await Promise.all(
      images.map(async (image) => {
        if (image.uri.startsWith("file://")) {
          const destination = `${IMAGE_DIRECTORY}${createID("capture")}.jpg`;
          await FileSystem.copyAsync({ from: image.uri, to: destination }).catch(() => null);
          return destination;
        }

        if (image.base64) {
          const destination = `${IMAGE_DIRECTORY}${createID("capture")}.jpg`;
          await FileSystem.writeAsStringAsync(destination, image.base64, {
            encoding: FileSystem.EncodingType.Base64
          }).catch(() => null);
          return destination;
        }

        return image.uri;
      })
    );

    return persisted;
  }
}
