const minIntervalMs = 400;
let rateLimitChain = Promise.resolve(0);

const createAbortError = () => new DOMException("The operation was aborted.", "AbortError");

export const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }

    const timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, ms);

    const handleAbort = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", handleAbort);
      reject(createAbortError());
    };

    signal?.addEventListener("abort", handleAbort, { once: true });
  });

export const rateLimit = () => {
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
