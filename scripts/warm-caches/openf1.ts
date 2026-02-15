import { ApiError } from "./errors";
import type { QueryParams } from "../warm-replay-cache/types";

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const createRateLimiter = (minIntervalMs: number) => {
  let chain = Promise.resolve(0);
  const rateLimit = () => {
    chain = chain.then(async (lastRequestAt) => {
      const now = Date.now();
      const elapsed = now - lastRequestAt;
      if (elapsed < minIntervalMs) {
        await sleep(minIntervalMs - elapsed);
      }
      return Date.now();
    });
    return chain;
  };
  return { rateLimit };
};

// Warmer is intentionally slower than the in-app client to reduce OpenF1 5xx/503 bursts.
const { rateLimit } = createRateLimiter(750);

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

export const createOpenF1Client = (apiBaseUrl: string, appendLog: (line: string) => void) => {
  const fetchOpenF1 = async <T>(path: string, params: QueryParams, signal?: AbortSignal) => {
    const key = `${path}${buildQuery(params)}`;
    const url = `${apiBaseUrl}/${key}`;
    appendLog(`[OpenF1] GET ${url}`);

    let attempt = 0;
    while (attempt < 4) {
      await rateLimit();
      const response = await fetch(url, { signal });
      if (!response.ok) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const retryAfterMs = Number.isNaN(retryAfter) ? null : retryAfter * 1000;

        // OpenF1 throttling
        if (response.status === 429 && attempt < 3) {
          const waitMs = retryAfterMs ?? 1500 * (attempt + 1);
          await sleep(waitMs);
          attempt += 1;
          continue;
        }

        // Transient server errors: use slower exponential backoff. 503 in particular is common during load.
        if (response.status >= 500 && response.status < 600 && attempt < 3) {
          const waitMs = retryAfterMs ?? Math.min(20000, 2000 * 2 ** attempt);
          await sleep(waitMs);
          attempt += 1;
          continue;
        }
        throw new ApiError(`OpenF1 request failed: ${response.status}`, response.status, url);
      }
      return (await response.json()) as T;
    }
    throw new ApiError("OpenF1 request failed after retries", 599, url);
  };

  const fetchChunked = async <T extends { date?: string }>(
    path: string,
    params: QueryParams,
    startMs: number,
    endMs: number,
    windowMs: number,
    onChunk: (chunk: T[], chunkEndMs: number) => void,
    signal?: AbortSignal,
  ): Promise<number> => {
    let total = 0;
    let cursor = startMs;
    while (cursor < endMs) {
      const chunkEnd = Math.min(cursor + windowMs, endMs);
      const chunkParams: QueryParams = {
        ...params,
        "date>=": new Date(cursor).toISOString(),
        "date<=": new Date(chunkEnd).toISOString(),
      };
      appendLog(`[OpenF1] GET ${path} ${chunkParams["date>="]} -> ${chunkParams["date<="]}`);
      const chunk = await fetchOpenF1<T[]>(path, chunkParams, signal);
      total += chunk.length;
      onChunk(chunk, chunkEnd);
      appendLog(`[OpenF1] ${path} chunk size=${chunk.length}`);
      cursor = chunkEnd;
    }
    return total;
  };

  return { fetchOpenF1, fetchChunked };
};
