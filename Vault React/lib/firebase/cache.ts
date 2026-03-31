import AsyncStorage from "@react-native-async-storage/async-storage";

import type { SearchCacheEntry, SearchResult } from "@/lib/firebase/types";

const SEARCH_CACHE_PREFIX = "vaultscope:search";
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;

function normalizeValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item));
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = normalizeValue((value as Record<string, unknown>)[key]);
        return accumulator;
      }, {});
  }

  return value;
}

export function buildSearchCacheKey(namespace: string, payload: unknown): string {
  return `${SEARCH_CACHE_PREFIX}:${namespace}:${JSON.stringify(normalizeValue(payload))}`;
}

export async function getCachedSearchResult(cacheKey: string): Promise<SearchResult | null> {
  const rawValue = await AsyncStorage.getItem(cacheKey);

  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as SearchCacheEntry;
    const expiresAt = new Date(parsed.expiresAt).getTime();

    if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
      await AsyncStorage.removeItem(cacheKey);
      return null;
    }

    return parsed.items;
  } catch {
    await AsyncStorage.removeItem(cacheKey);
    return null;
  }
}

export async function setCachedSearchResult(
  cacheKey: string,
  items: SearchResult,
): Promise<void> {
  const now = Date.now();
  const entry: SearchCacheEntry = {
    items,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SEARCH_CACHE_TTL_MS).toISOString(),
  };

  await AsyncStorage.setItem(cacheKey, JSON.stringify(entry));
}

export async function clearCachedSearchResult(cacheKey: string): Promise<void> {
  await AsyncStorage.removeItem(cacheKey);
}
