import type { ReplaySessionData } from "../types/openf1.types";
import type { CacheMode } from "./cache";
import { getPersisted, inFlight, responseCache, setPersisted } from "./cache";
import { rateLimit, sleep } from "./rateLimiter";

const API_BASE_URL = "https://api.openf1.org/v1";
const WORKER_BASE_URL =
  import.meta.env.RSBUILD_WORKER_URL ??
  import.meta.env.VITE_WORKER_URL ??
  "https://openf1-proxy.wrick17worker.workers.dev";
const MAX_TRANSIENT_ERROR_ATTEMPTS = 5;
const MAX_RATE_LIMIT_ATTEMPTS = 5;

const getRetryDelayMs = (response: Response, attempt: number) => {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000;
    }
    const dateMs = Date.parse(retryAfter);
    if (Number.isFinite(dateMs)) {
      return Math.max(0, dateMs - Date.now());
    }
  }
  return Math.min(1000 * 2 ** attempt, 8000);
};

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
    if (!signal) {
      const existing = inFlight.get(key);
      if (existing) {
        return existing as Promise<T>;
      }
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
    while (true) {
      await rateLimit();
      const response = await fetch(`${API_BASE_URL}/${key}`, { signal });
      if (!response.ok) {
        if (response.status === 429) {
          if (attempt >= MAX_RATE_LIMIT_ATTEMPTS - 1) {
            throw new Error("OpenF1 request failed: 429");
          }
          await sleep(getRetryDelayMs(response, attempt), signal);
          attempt += 1;
          continue;
        }
        // OpenF1 occasionally returns transient 5xxs; retry a couple times to avoid failing large chunk builds.
        if (
          response.status >= 500 &&
          response.status < 600 &&
          attempt < MAX_TRANSIENT_ERROR_ATTEMPTS - 1
        ) {
          await sleep(Math.min(500 * 2 ** attempt, 4000), signal);
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
  })();
  const trackedRequest = request.finally(() => {
    if (inFlight.get(key) === trackedRequest) {
      inFlight.delete(key);
    }
  });
  if (cacheMode !== "no-store") {
    inFlight.set(key, trackedRequest);
  }
  return trackedRequest;
};

export const fetchOpenF1OrEmpty = async <T extends unknown[]>(
  path: string,
  params: QueryParams,
  signal?: AbortSignal,
  cacheMode: CacheMode = "no-store",
): Promise<T> => {
  try {
    return await fetchOpenF1<T>(path, params, signal, cacheMode);
  } catch (error) {
    if (error instanceof Error && error.message === "OpenF1 request failed: 404") {
      return [] as unknown as T;
    }
    throw error;
  }
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
    const chunk = await fetchOpenF1OrEmpty<T[]>(path, chunkParams, signal, cacheMode);
    if (chunk.length) {
      results.push(...chunk);
    }
    onChunk?.(chunk, chunkEnd);
    cursor = chunkEnd;
  }
  return results;
};

type WorkerReplayHit = {
  status: "hit";
  payload: ReplaySessionData;
};

type WorkerReplayMiss = {
  status: "miss";
  uploadToken: string;
  expiresAt: string;
};

export const fetchReplayFromWorker = async (
  sessionKey: number,
  signal?: AbortSignal,
): Promise<WorkerReplayHit | WorkerReplayMiss> => {
  const url = `${WORKER_BASE_URL}/replay${buildQuery({ session_key: sessionKey })}`;
  const response = await fetch(url, { signal });
  if (response.status === 200) {
    const payload = (await response.json()) as ReplaySessionData;
    return { status: "hit", payload };
  }
  if (response.status === 202) {
    const data = (await response.json()) as { uploadToken: string; expiresAt: string };
    return { status: "miss", uploadToken: data.uploadToken, expiresAt: data.expiresAt };
  }
  throw new Error(`Replay cache request failed: ${response.status}`);
};

export const uploadReplayToWorker = async (
  sessionKey: number,
  payload: ReplaySessionData,
  uploadToken: string,
  signal?: AbortSignal,
): Promise<void> => {
  if (!uploadToken) {
    return;
  }
  const url = `${WORKER_BASE_URL}/replay${buildQuery({ session_key: sessionKey })}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${uploadToken}`,
    },
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok && response.status !== 204) {
    throw new Error(`Replay cache upload failed: ${response.status}`);
  }
};
