type CacheEntry<T> = {
  value: T;
  expiresAt: number | null;
};

type LruCacheOptions = {
  maxSize?: number;
  ttlMs?: number | null;
};

export class LruCache<K, V> {
  private readonly store = new Map<K, CacheEntry<V>>();

  private readonly maxSize: number;

  private readonly ttlMs: number | null;

  constructor(options: LruCacheOptions = {}) {
    this.maxSize = options.maxSize ?? 50;
    this.ttlMs = options.ttlMs ?? null;
  }

  get size(): number {
    return this.store.size;
  }

  get(key: K): V | undefined {
    const entry = this.store.get(key);

    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }

    this.store.delete(key);
    this.store.set(key, entry);

    return entry.value;
  }

  set(key: K, value: V): void {
    const expiresAt = this.ttlMs === null ? null : Date.now() + this.ttlMs;

    if (this.store.has(key)) {
      this.store.delete(key);
    }

    this.store.set(key, {
      value,
      expiresAt,
    });

    while (this.store.size > this.maxSize) {
      const oldestKey = this.store.keys().next().value as K | undefined;

      if (oldestKey === undefined) {
        break;
      }

      this.store.delete(oldestKey);
    }
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: K): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}
