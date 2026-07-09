/**
 * Ultra-light local cache for instant paints (messages, feed, etc.).
 * Uses sessionStorage so it dies with the tab and stays fresh across sessions
 * once the user re-opens the app.
 */
const PREFIX = "bdyk:cache:v1:";
const MAX_ITEM_BYTES = 512 * 1024; // 512KB per cache entry

export function readCache<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { t: number; d: T };
    return parsed?.d ?? null;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, data: T) {
  try {
    const payload = JSON.stringify({ t: Date.now(), d: data });
    if (payload.length > MAX_ITEM_BYTES) return;
    sessionStorage.setItem(PREFIX + key, payload);
  } catch {
    // quota exceeded — drop silently
  }
}

export function cacheAge(key: string): number | null {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { t: number };
    return Date.now() - (parsed?.t ?? 0);
  } catch {
    return null;
  }
}

export function clearCache(prefix?: string) {
  try {
    const p = PREFIX + (prefix ?? "");
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(p)) sessionStorage.removeItem(k);
    }
  } catch {
    // ignore
  }
}
