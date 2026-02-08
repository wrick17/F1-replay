import { rateLimit, sleep } from "../../src/modules/replay/api/rateLimiter";
import type { QueryParams } from "./types";

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
  const fetchOpenF1 = async <T>(
    path: string,
    params: QueryParams,
    signal?: AbortSignal,
  ): Promise<T> => {
    const key = `${path}${buildQuery(params)}`;
    appendLog(`[OpenF1] GET ${apiBaseUrl}/${key}`);
    let attempt = 0;
    while (attempt < 3) {
      await rateLimit();
      const response = await fetch(`${apiBaseUrl}/${key}`, { signal });
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
      return (await response.json()) as T;
    }
    throw new Error("OpenF1 request failed after retries");
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
      appendLog(
        `[OpenF1] GET ${path} ${chunkParams["date>="]} -> ${chunkParams["date<="]}`,
      );
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
