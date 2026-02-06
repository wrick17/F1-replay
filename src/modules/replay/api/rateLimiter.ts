const minIntervalMs = 400;
let rateLimitChain = Promise.resolve(0);

export const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
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
