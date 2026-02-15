import { describe, expect, test } from "bun:test";
import { ApiError, FatalAuthError } from "../../../../scripts/warm-caches/errors";
import { retry } from "../../../../scripts/warm-caches/retry";

describe("warm-caches retry", () => {
  test("retries and eventually succeeds", async () => {
    let calls = 0;
    const result = await retry(
      async () => {
        calls += 1;
        if (calls < 3) {
          throw new Error("transient");
        }
        return 42;
      },
      {
        label: "unit",
        maxAttempts: 5,
        baseDelayMs: 1,
        maxDelayMs: 5,
        appendLog: () => undefined,
      },
    );
    expect(result).toBe(42);
    expect(calls).toBe(3);
  });

  test("stops immediately on 401", async () => {
    await expect(
      retry(
        async () => {
          throw new ApiError("unauthorized", 401, "https://example.test");
        },
        {
          label: "unit",
          maxAttempts: 5,
          baseDelayMs: 1,
          maxDelayMs: 5,
          appendLog: () => undefined,
        },
      ),
    ).rejects.toBeInstanceOf(FatalAuthError);
  });
});

