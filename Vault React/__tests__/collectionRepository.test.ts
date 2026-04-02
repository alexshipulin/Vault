import { AsyncStorageCollectionRepository } from "@src/data/local/AsyncStorageCollectionRepository";
import { clearVaultReactStorage } from "@src/data/local/storage";
import type { CollectibleItem } from "@src/domain/models";

function makeItem(overrides: Partial<CollectibleItem> = {}): CollectibleItem {
  return {
    id: "test-item",
    name: "Test Coin",
    category: "coin",
    conditionRaw: 6,
    year: 1909,
    origin: "United States",
    notes: "",
    photoUris: [],
    priceLow: 100,
    priceMid: 150,
    priceHigh: 220,
    priceSource: "pcgs",
    priceFetchedAt: new Date().toISOString(),
    historySummary: "Test summary",
    addedAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-02T00:00:00.000Z",
    isSyncedToCloud: false,
    ...overrides
  };
}

describe("AsyncStorageCollectionRepository", () => {
  beforeEach(async () => {
    await clearVaultReactStorage();
  });

  it("saves, reloads, updates, and deletes items", async () => {
    const repository = new AsyncStorageCollectionRepository();
    const created = makeItem();

    await repository.save(created);
    let items = await repository.fetchAll();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(created.id);

    await repository.update(makeItem({ id: created.id, name: "Updated Coin", updatedAt: "2026-03-05T00:00:00.000Z" }));
    items = await repository.fetchAll();
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("Updated Coin");

    await repository.delete(created.id);
    items = await repository.fetchAll();
    expect(items).toHaveLength(0);
  });

  it("prevents broken duplicates by replacing existing ids", async () => {
    const repository = new AsyncStorageCollectionRepository();

    await repository.save(makeItem({ id: "same-id", name: "Original" }));
    await repository.save(makeItem({ id: "same-id", name: "Replacement", priceMid: 999 }));

    const items = await repository.fetchAll();
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("Replacement");
    expect(items[0].priceMid).toBe(999);
  });

  it("preserves optional valuation diagnostics fields", async () => {
    const repository = new AsyncStorageCollectionRepository();

    await repository.save(
      makeItem({
        id: "diagnostic-item",
        confidence: 0.82,
        sourceLabel: "AI approximation used because no market matches were found.",
        matchedSources: ["ebay", "heritage"],
        comparableCount: 2,
        needsReview: true,
        valuationWarnings: ["Comparable items only weakly matched the detected object."],
      }),
    );

    const items = await repository.fetchAll();
    expect(items[0]).toEqual(
      expect.objectContaining({
        confidence: 0.82,
        sourceLabel: "AI approximation used because no market matches were found.",
        matchedSources: ["ebay", "heritage"],
        comparableCount: 2,
        needsReview: true,
        valuationWarnings: ["Comparable items only weakly matched the detected object."],
      }),
    );
  });

  it("searches by title, origin, category, and history summary", async () => {
    const repository = new AsyncStorageCollectionRepository();
    await repository.save(makeItem({ id: "coin-1", name: "Lincoln Cent", historySummary: "Key date penny" }));
    await repository.save(makeItem({ id: "vinyl-1", category: "vinyl", name: "Blue Note LP", origin: "US" }));

    expect((await repository.search("lincoln")).map((item) => item.id)).toEqual(["coin-1"]);
    expect((await repository.search("vinyl")).map((item) => item.id)).toEqual(["vinyl-1"]);
    expect((await repository.search("key date")).map((item) => item.id)).toEqual(["coin-1"]);
    expect((await repository.search("")).map((item) => item.id)).toHaveLength(2);
  });

  it("calculates total value from mid, high, or low values", async () => {
    const repository = new AsyncStorageCollectionRepository();
    await repository.save(makeItem({ id: "one", priceLow: 100, priceMid: 150, priceHigh: 200 }));
    await repository.save(makeItem({ id: "two", priceLow: 50, priceMid: null, priceHigh: 90 }));
    await repository.save(makeItem({ id: "three", priceLow: 25, priceMid: null, priceHigh: null }));

    await expect(repository.totalValue()).resolves.toBe(265);
  });
});
