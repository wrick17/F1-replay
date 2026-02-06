import { type CacheMode, getPersisted, inFlight, responseCache, setPersisted } from "./cache";
import { rateLimit, sleep } from "./rateLimiter";

const API_BASE_URL = "https://api.openf1.org/v1";

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

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
          const waitMs = Number.isNaN(retryAfter) ? 1000 * (attempt + 1) : retryAfter * 1000;
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
  })().finally(() => {
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
    const chunk = await fetchOpenF1<T[]>(path, chunkParams, signal, cacheMode);
    if (chunk.length) {
      results.push(...chunk);
    }
    onChunk?.(chunk, chunkEnd);
    cursor = chunkEnd;
  }
  return results;
};
