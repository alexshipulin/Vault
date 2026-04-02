import type { CollectionRepository } from "@src/domain/contracts";
import type { CollectibleItem } from "@src/domain/models";

import { readJSON, STORAGE_KEYS, writeJSON } from "./storage";

export class AsyncStorageCollectionRepository implements CollectionRepository {
  async fetchAll(): Promise<CollectibleItem[]> {
    const items = await readJSON<CollectibleItem[]>(STORAGE_KEYS.collection, []);

    return items.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async save(item: CollectibleItem): Promise<void> {
    const items = await this.fetchAll();
    const index = items.findIndex((existing) => existing.id === item.id);

    if (index >= 0) {
      items[index] = item;
    } else {
      items.push(item);
    }

    await writeJSON(STORAGE_KEYS.collection, items);
  }

  async update(item: CollectibleItem): Promise<void> {
    await this.save(item);
  }

  async delete(itemID: string): Promise<void> {
    const items = await this.fetchAll();
    await writeJSON(
      STORAGE_KEYS.collection,
      items.filter((item) => item.id !== itemID)
    );
  }

  async search(query: string): Promise<CollectibleItem[]> {
    const normalized = query.trim().toLowerCase();
    const items = await this.fetchAll();

    if (!normalized) {
      return items;
    }

    return items.filter((item) => {
      return (
        item.name.toLowerCase().includes(normalized) ||
        (item.origin ?? "").toLowerCase().includes(normalized) ||
        String(item.category).toLowerCase().includes(normalized) ||
        item.historySummary.toLowerCase().includes(normalized)
      );
    });
  }

  async totalValue(): Promise<number> {
    const items = await this.fetchAll();
    return items.reduce((sum, item) => sum + (item.priceMid ?? item.priceHigh ?? item.priceLow ?? 0), 0);
  }
}
