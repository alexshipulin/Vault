import type { ScanImage, ScanMode } from "@src/domain/models";
import { createID } from "@src/shared/utils/id";

export function mockCapturedImage(mode: ScanMode = "standard"): ScanImage {
  return {
    id: createID("image"),
    uri: `file:///mock/${mode}.jpg`,
    mimeType: "image/jpeg",
    base64: mode === "mystery" ? "bXlzdGVyeS1pbWFnZQ==" : "c3RhbmRhcmQtaW1hZ2U="
  };
}
