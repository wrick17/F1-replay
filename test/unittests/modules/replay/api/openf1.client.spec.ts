import { describe, expect, it } from "bun:test";
import {
  buildQuery,
  fetchChunked,
  fetchOpenF1,
  fetchOpenF1OrEmpty,
  fetchReplayFromWorker,
  uploadReplayToWorker,
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

  it("keeps retrying transient 429 responses until a later attempt succeeds", async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls < 7) {
        return new Response(null, { status: 429, headers: { "retry-after": "0" } });
      }
      return new Response(JSON.stringify([{ ok: true }]), { status: 200 });
    }) as typeof fetch;

    try {
      const result = await fetchOpenF1<{ ok: boolean }[]>("sessions", { year: 2026 });
      expect(result).toEqual([{ ok: true }]);
      expect(calls).toBe(7);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("stops retrying 429 responses when the request is aborted", async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(null, { status: 429, headers: { "retry-after": "0" } });
    }) as typeof fetch;

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 0);

    try {
      await expect(
        fetchOpenF1("sessions", { year: 2026 }, controller.signal),
      ).rejects.toMatchObject({
        name: "AbortError",
      });
      expect(calls).toBeGreaterThan(0);
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

  it("treats replay worker fetch failures as cache misses", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;

    try {
      const result = await fetchReplayFromWorker(11230);
      expect(result).toEqual({
        status: "miss",
        uploadToken: "",
        expiresAt: "",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("skips replay cache uploads when no upload token is available", async () => {
    const originalFetch = globalThis.fetch;
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response(null, { status: 204 });
    }) as typeof fetch;

    try {
      await uploadReplayToWorker(
        11230,
        {
          meeting: {
            meeting_key: 1279,
            meeting_name: "Australian Grand Prix",
            meeting_official_name: "FORMULA 1 AUSTRALIAN GRAND PRIX 2026",
            year: 2026,
            country_name: "Australia",
            circuit_short_name: "Melbourne",
            date_start: "2026-03-06T01:30:00Z",
            date_end: "2026-03-08T06:00:00Z",
          },
          session: {
            session_key: 11230,
            meeting_key: 1279,
            session_name: "Qualifying",
            session_type: "Qualifying",
            date_start: "2026-03-07T05:00:00Z",
            date_end: "2026-03-07T06:00:00Z",
            year: 2026,
          },
          drivers: [],
          telemetryByDriver: {},
          sessionStartMs: Date.parse("2026-03-07T05:00:00Z"),
          sessionEndMs: Date.parse("2026-03-07T06:00:00Z"),
          teamRadios: [],
          overtakes: [],
          weather: [],
          raceControl: [],
          pits: [],
        },
        "",
      );
      expect(called).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
