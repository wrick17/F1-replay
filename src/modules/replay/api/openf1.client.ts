const API_BASE_URL = "https://api.openf1.org/v1";

type CacheMode = "memory" | "no-store" | "persist";

const responseCache = new Map<string, unknown>();
const inFlight = new Map<string, Promise<unknown>>();
const minIntervalMs = 400;
let rateLimitChain = Promise.resolve(0);

const IDB_NAME = "openf1-cache";
const IDB_STORE = "responses";
let idbPromise: Promise<IDBDatabase> | null = null;

const getDb = () => {
  if (idbPromise) {
    return idbPromise;
  }
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  idbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  return idbPromise;
};

const getPersisted = async <T>(key: string): Promise<T | null> => {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const store = tx.objectStore(IDB_STORE);
    const request = store.get(key);
    request.onsuccess = () => resolve((request.result as T) ?? null);
    request.onerror = () => reject(request.error);
  });
};

const setPersisted = async (key: string, value: unknown) => {
  const db = await getDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const store = tx.objectStore(IDB_STORE);
    const request = store.put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const rateLimit = () => {
  rateLimitChain = rateLimitChain.then(async (lastRequestAt) => {
    const now = Date.now();
    const elapsed = now - lastRequestAt;
    if (elapsed < minIntervalMs) {
      await sleep(minIntervalMs - elapsed);
    }
    return Date.now();
  });
  return rateLimitChain;
};

export type QueryParams = Record<
  string,
  string | number | boolean | null | undefined
>;

export const buildQuery = (params: QueryParams) => {
  const entries = Object.entries(params).filter(
    ([, value]) => value !== undefined && value !== null,
  );
  if (!entries.length) {
    return "";
  }
  const query = entries
    .map(([key, value]) => {
      const encodedValue = encodeURIComponent(String(value));
      if (key.includes(">") || key.includes("<")) {
        return `${key}${encodedValue}`;
      }
      return `${key}=${encodedValue}`;
    })
    .join("&");
  return `?${query}`;
};

export const fetchOpenF1 = <T>(
  path: string,
  params: QueryParams,
  signal?: AbortSignal,
  cacheMode: CacheMode = "no-store",
): Promise<T> => {
  const key = `${path}${buildQuery(params)}`;
  if (cacheMode !== "no-store") {
    if (responseCache.has(key)) {
      return Promise.resolve(responseCache.get(key) as T);
    }
    const existing = inFlight.get(key);
    if (existing) {
      return existing as Promise<T>;
    }
  }
  const request = (async () => {
    if (cacheMode === "persist") {
      const persisted = await getPersisted<T>(key).catch(() => null);
      if (persisted) {
        responseCache.set(key, persisted);
        return persisted;
      }
    }
    let attempt = 0;
    while (attempt < 3) {
      await rateLimit();
      const response = await fetch(`${API_BASE_URL}/${key}`, { signal });
      if (!response.ok) {
        if (response.status === 429 && attempt < 2) {
          const retryAfter = Number(response.headers.get("retry-after"));
          const waitMs = Number.isNaN(retryAfter)
            ? 1000 * (attempt + 1)
            : retryAfter * 1000;
          await sleep(waitMs);
          attempt += 1;
          continue;
        }
        throw new Error(`OpenF1 request failed: ${response.status}`);
      }
      const payload = (await response.json()) as T;
      if (cacheMode !== "no-store") {
        responseCache.set(key, payload);
      }
      if (cacheMode === "persist") {
        await setPersisted(key, payload).catch(() => undefined);
      }
      return payload;
    }
    throw new Error("OpenF1 request failed after retries");
  })()
    .finally(() => {
      inFlight.delete(key);
    });
  if (cacheMode !== "no-store") {
    inFlight.set(key, request);
  }
  return request;
};

export const fetchChunked = async <T extends { date?: string }>(
  path: string,
  params: QueryParams,
  startMs: number,
  endMs: number,
  windowMs: number,
  onChunk?: (chunk: T[], chunkEndMs: number) => void,
  signal?: AbortSignal,
  cacheMode: CacheMode = "no-store",
): Promise<T[]> => {
  const results: T[] = [];
  let cursor = startMs;
  while (cursor < endMs) {
    const chunkEnd = Math.min(cursor + windowMs, endMs);
    const chunkParams: QueryParams = {
      ...params,
      "date>=": new Date(cursor).toISOString(),
      "date<=": new Date(chunkEnd).toISOString(),
    };
    const chunk = await fetchOpenF1<T[]>(
      path,
      chunkParams,
      signal,
      cacheMode,
    );
    if (chunk.length) {
      results.push(...chunk);
    }
    onChunk?.(chunk, chunkEnd);
    cursor = chunkEnd;
  }
  return results;
};
