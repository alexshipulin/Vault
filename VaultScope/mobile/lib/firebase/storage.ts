import { getDownloadURL, ref, uploadString } from "firebase/storage";

import { getVaultScopeStorage } from "@/lib/firebase/config";

function normalizeBase64(input: string): { data: string; contentType: string } {
  const match = input.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);

  if (match) {
    return {
      contentType: match[1],
      data: match[2],
    };
  }

  return {
    contentType: "image/jpeg",
    data: input,
  };
}

export async function uploadScanImage(userId: string, base64Image: string): Promise<string> {
  const { data, contentType } = normalizeBase64(base64Image.trim());
  const extension = contentType.includes("png") ? "png" : "jpg";
  const path = `scans/${userId}/${Date.now()}.${extension}`;
  const storageRef = ref(getVaultScopeStorage(), path);

  await uploadString(storageRef, data, "base64", {
    contentType,
  });

  return getDownloadURL(storageRef);
}
