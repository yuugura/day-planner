type CacheEntry<T> = {
  expiresAt: number;
  value: Promise<T>;
};

const caches = new Map<string, Map<string, CacheEntry<unknown>>>();

export function getCached<T>(namespace: string, key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const cache = caches.get(namespace) ?? new Map<string, CacheEntry<unknown>>();
  caches.set(namespace, cache);

  const existing = cache.get(key) as CacheEntry<T> | undefined;
  if (existing && existing.expiresAt > now) return existing.value;

  const value = load().catch((error) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, { expiresAt: now + ttlMs, value });

  return value;
}

export function stableCacheKey(value: unknown) {
  return JSON.stringify(sortForCache(value));
}

export function clearCache(namespace?: string) {
  if (namespace) {
    caches.delete(namespace);
    return;
  }

  caches.clear();
}

function sortForCache(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForCache);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortForCache(item)])
  );
}
