import { describe, expect, it } from "bun:test";
import {
  buildQuery,
  fetchChunked,
  fetchOpenF1,
  fetchOpenF1OrEmpty,
} from "modules/replay/api/openf1.client";

describe("openf1.client", () => {
  it("builds a query string with operators", () => {
    const query = buildQuery({
      session_key: 123,
      "date>=": "2023-01-01T00:00:00Z",
    });
    expect(query).toContain("session_key=123");
    expect(query).toContain("date>=2023-01-01T00%3A00%3A00Z");
  });

  it("retries on 429 using retry-after without throwing ReferenceError", async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(null, { status: 429, headers: { "retry-after": "0" } });
      }
      return new Response(JSON.stringify([{ ok: true }]), { status: 200 });
    }) as typeof fetch;

    try {
      const result = await fetchOpenF1<{ ok: boolean }[]>("drivers", { session_key: 1 });
      expect(result).toEqual([{ ok: true }]);
      expect(calls).toBe(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns an empty array on 404 for optional endpoints", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(null, { status: 404 })) as typeof fetch;

    try {
      const result = await fetchOpenF1OrEmpty<unknown[]>("team_radio", { session_key: 1 });
      expect(result).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("treats 404 chunk responses as empty data", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(null, { status: 404 })) as typeof fetch;

    try {
      const result = await fetchChunked(
        "position",
        { session_key: 1 },
        Date.parse("2026-03-07T05:00:00Z"),
        Date.parse("2026-03-07T05:20:00Z"),
        600_000,
      );
      expect(result).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
