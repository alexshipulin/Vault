import { getDownloadURL, ref, uploadBytes, uploadString } from "firebase/storage";

import { getVaultScopeStorage } from "@/lib/firebase/config";

function normalizeBase64(input: string): { data: string; contentType: string } {
  const match = input.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);

  if (match) {
    return {
      contentType: match[1],
      data: match[2].replace(/\s+/g, ""),
    };
  }

  return {
    contentType: "image/jpeg",
    data: input.replace(/\s+/g, ""),
  };
}

export async function uploadScanImage(
  userId: string,
  base64Image: string,
  localImageUri?: string,
): Promise<string> {
  const { data, contentType } = normalizeBase64(base64Image.trim());
  const extension = contentType.includes("png") ? "png" : "jpg";
  const path = `scans/${userId}/${Date.now()}.${extension}`;
  const storageRef = ref(getVaultScopeStorage(), path);

  try {
    await uploadString(storageRef, data, "base64", {
      contentType,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const shouldRetryAsDataUrl =
      message.includes("ArrayBuffer") ||
      message.includes("ArrayBufferView") ||
      message.toLowerCase().includes("blob");

    if (!shouldRetryAsDataUrl) {
      throw error;
    }

    const dataUrl = `data:${contentType};base64,${data}`;
    try {
      await uploadString(storageRef, dataUrl, "data_url", {
        contentType,
      });
    } catch (dataUrlError) {
      const dataUrlMessage =
        dataUrlError instanceof Error ? dataUrlError.message : String(dataUrlError);
      const shouldRetryAsBlob =
        dataUrlMessage.includes("ArrayBuffer") ||
        dataUrlMessage.includes("ArrayBufferView") ||
        dataUrlMessage.toLowerCase().includes("blob");

      if (!shouldRetryAsBlob) {
        throw dataUrlError;
      }

      // React Native fallback: get a native Blob via fetch(file://...) or fetch(data-url).
      const blobSourceCandidates = [localImageUri, dataUrl].filter(
        (candidate): candidate is string =>
          typeof candidate === "string" && candidate.trim().length > 0,
      );
      let lastBlobError: unknown = null;

      for (const blobSource of blobSourceCandidates) {
        try {
          const blobResponse = await fetch(blobSource);
          const blob = await blobResponse.blob();
          await uploadBytes(storageRef, blob, {
            contentType,
          });
          lastBlobError = null;
          break;
        } catch (blobError) {
          lastBlobError = blobError;
        }
      }

      if (lastBlobError) {
        throw lastBlobError;
      }
    }
  }

  return getDownloadURL(storageRef);
}
