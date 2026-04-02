import AsyncStorage from "@react-native-async-storage/async-storage";

import type { GeminiCacheEntry, GeminiIdentifyResponse } from "@/lib/gemini/types";
import type { AppraisalMode } from "@/lib/types";

const CACHE_PREFIX = "vaultscope:gemini:identify";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function hashString(input: string): string {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function sanitizeBase64(value: string): string {
  return value.replace(/^data:[^;]+;base64,/, "").replace(/\s+/g, "");
}

function fingerprintImage(base64Image: string): string {
  const normalized = sanitizeBase64(base64Image);
  const head = normalized.slice(0, 512);
  const middleStart = Math.max(0, Math.floor(normalized.length / 2) - 256);
  const middle = normalized.slice(middleStart, middleStart + 512);
  const tail = normalized.slice(-512);
  const sample = `${normalized.length}:${head}:${middle}:${tail}`;

  return hashString(sample);
}

function buildCacheKey(images: string[], category: string, appraisalMode: AppraisalMode): string {
  const imageFingerprint = images
    .map((image) => fingerprintImage(image))
    .sort()
    .join("-");

  return `${CACHE_PREFIX}:${appraisalMode}:${category.trim().toLowerCase()}:${imageFingerprint}`;
}

export async function getCachedIdentification(
  images: string[],
  category: string,
  appraisalMode: AppraisalMode = "standard",
): Promise<GeminiIdentifyResponse | null> {
  const cacheKey = buildCacheKey(images, category, appraisalMode);
  const rawValue = await AsyncStorage.getItem(cacheKey);

  if (!rawValue) {
    return null;
  }

  try {
    const entry = JSON.parse(rawValue) as GeminiCacheEntry<GeminiIdentifyResponse>;
    const expiresAt = new Date(entry.expiresAt).getTime();

    if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
      await AsyncStorage.removeItem(cacheKey);
      return null;
    }

    return entry.value;
  } catch {
    await AsyncStorage.removeItem(cacheKey);
    return null;
  }
}

export async function setCachedIdentification(
  images: string[],
  category: string,
  appraisalMode: AppraisalMode,
  value: GeminiIdentifyResponse,
): Promise<void> {
  const cacheKey = buildCacheKey(images, category, appraisalMode);
  const now = Date.now();
  const entry: GeminiCacheEntry<GeminiIdentifyResponse> = {
    value,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + CACHE_TTL_MS).toISOString(),
  };

  await AsyncStorage.setItem(cacheKey, JSON.stringify(entry));
}
