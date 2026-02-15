import { ApiError, FatalAuthError, isAuthStatus } from "./errors";

type RetryOptions = {
  label: string;
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  appendLog: (line: string) => void;
};

const jitter = (ms: number) => {
  // +/- 20% jitter
  const delta = ms * 0.2;
  const r = (Math.random() * 2 - 1) * delta;
  return Math.max(0, Math.round(ms + r));
};

export const retry = async <T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> => {
  const { label, maxAttempts, baseDelayMs, maxDelayMs, appendLog } = options;

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt += 1;
    try {
      return await fn();
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      if (apiErr && isAuthStatus(apiErr.status)) {
        // Hard stop: credentials/permissions are broken, continuing would just spam.
        throw new FatalAuthError(apiErr.status, apiErr.url);
      }

      if (attempt >= maxAttempts) {
        throw err;
      }

      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const waitMs = jitter(delay);
      const suffix = apiErr ? ` status=${apiErr.status} url=${apiErr.url}` : "";
      appendLog(`[Retry] ${label} attempt=${attempt}/${maxAttempts} waitMs=${waitMs}${suffix}`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
};

