import { AsyncStorageItemChatSessionStore } from "@src/data/local/AsyncStorageItemChatSessionStore";
import { AsyncStoragePreferencesStore } from "@src/data/local/AsyncStoragePreferencesStore";
import { AsyncStorageScanModeStore } from "@src/data/local/AsyncStorageScanModeStore";
import { AsyncStorageTemporaryScanSessionStore } from "@src/data/local/AsyncStorageTemporaryScanSessionStore";
import { clearVaultReactStorage } from "@src/data/local/storage";
import { seededItems } from "@src/data/seeds/seededItems";
import { DEFAULT_PREFERENCES, type ChatMessage } from "@src/domain/models";
import { scansThisMonth, totalCollectionValue } from "@src/shared/utils/formatters";
import { seededTemporarySession } from "@src/test/fixtures/mockData";

describe("local stores and aggregate utilities", () => {
  beforeEach(async () => {
    await clearVaultReactStorage();
  });

  it("persists scan mode and restores default when empty", async () => {
    const store = new AsyncStorageScanModeStore();

    await expect(store.load()).resolves.toBe("standard");
    await store.save("mystery");
    await expect(store.load()).resolves.toBe("mystery");
  });

  it("persists user preferences", async () => {
    const store = new AsyncStoragePreferencesStore();

    await expect(store.load()).resolves.toEqual(DEFAULT_PREFERENCES);

    const next = {
      ...DEFAULT_PREFERENCES,
      preferredCurrency: "eur" as const,
      notificationsEnabled: false,
      categoriesOfInterest: ["coin", "vinyl"] as const
    };

    await store.save({
      ...next,
      categoriesOfInterest: [...next.categoriesOfInterest]
    });

    await expect(store.load()).resolves.toEqual({
      preferredCurrency: "eur",
      notificationsEnabled: false,
      categoriesOfInterest: ["coin", "vinyl"]
    });
  });

  it("persists and clears temporary scan sessions", async () => {
    const store = new AsyncStorageTemporaryScanSessionStore();
    const session = seededTemporarySession("mystery");

    await expect(store.load()).resolves.toBeNull();
    await store.save(session);
    await expect(store.load()).resolves.toEqual(session);
    await store.clear();
    await expect(store.load()).resolves.toBeNull();
  });

  it("isolates chat sessions per item", async () => {
    const store = new AsyncStorageItemChatSessionStore();
    const one: ChatMessage[] = [{ id: "1", role: "assistant", content: "one", createdAt: new Date().toISOString() }];
    const two: ChatMessage[] = [{ id: "2", role: "assistant", content: "two", createdAt: new Date().toISOString() }];

    await store.save("item-1", one);
    await store.save("item-2", two);

    await expect(store.load("item-1")).resolves.toEqual(one);
    await expect(store.load("item-2")).resolves.toEqual(two);
  });

  it("computes scans this month and total collection value from saved items", () => {
    const now = new Date("2026-03-31T12:00:00.000Z");

    expect(scansThisMonth(seededItems, now)).toBeGreaterThan(0);
    expect(totalCollectionValue(seededItems)).toBe(
      seededItems.reduce((sum, item) => sum + (item.priceMid ?? item.priceHigh ?? item.priceLow ?? 0), 0)
    );
  });
});
