import { describe, expect, it } from "bun:test";
import {
  byMissingThenNewestUpdate,
  byNewestUpdate,
  filterDashboardRows,
  hasMissingCache,
  shouldShowRowError,
} from "modules/ops/services/opsDashboard.service";
import type { DashboardSessionRow } from "modules/ops/api/cacheWarmer.client";

const makeRow = (overrides: Partial<DashboardSessionRow> = {}): DashboardSessionRow => ({
  session_key: 123,
  meeting_key: 999,
  year: 2026,
  round: 3,
  session_type: "Race",
  session_name: "Race",
  meeting_name: "Japanese Grand Prix",
  date_end: "2026-03-29T07:00:00.000Z",
  replay_status: "hit",
  telemetry_status: "pending",
  attempt_count: 2,
  warm_in_progress: 0,
  warm_started_at: null,
  last_attempt_at: "2026-03-29T08:00:00.000Z",
  next_retry_at: "2026-03-29T09:00:00.000Z",
  last_error: null,
  completed_at: null,
  updated_at: "2026-03-29T08:00:00.000Z",
  ...overrides,
});

describe("opsDashboard.service", () => {
  it("returns all rows for empty search", () => {
    const rows = [makeRow(), makeRow({ session_key: 456 })];
    expect(filterDashboardRows(rows, "").length).toBe(2);
  });

  it("filters by meeting/session/status text", () => {
    const rows = [
      makeRow({ session_key: 123, meeting_name: "Japanese Grand Prix", replay_status: "failed" }),
      makeRow({ session_key: 456, meeting_name: "Bahrain Grand Prix", session_type: "Qualifying" }),
    ];

    expect(filterDashboardRows(rows, "japanese")).toHaveLength(1);
    expect(filterDashboardRows(rows, "qualifying")).toHaveLength(1);
    expect(filterDashboardRows(rows, "failed")).toHaveLength(1);
  });

  it("sort comparator orders newest updated first", () => {
    const older = makeRow({ updated_at: "2026-03-29T07:00:00.000Z" });
    const newer = makeRow({ session_key: 124, updated_at: "2026-03-29T09:00:00.000Z" });
    const sorted = [older, newer].sort(byNewestUpdate);
    expect(sorted[0].session_key).toBe(124);
  });

  it("flags rows with non-ready cache states as missing", () => {
    expect(hasMissingCache(makeRow({ replay_status: "hit", telemetry_status: "warmed" }))).toBe(false);
    expect(hasMissingCache(makeRow({ replay_status: "missing", telemetry_status: "hit" }))).toBe(true);
    expect(hasMissingCache(makeRow({ replay_status: "pending", telemetry_status: "hit" }))).toBe(true);
  });

  it("sorts rows with missing cache before fully ready rows", () => {
    const readyNewest = makeRow({
      session_key: 1,
      replay_status: "hit",
      telemetry_status: "warmed",
      updated_at: "2026-03-29T11:00:00.000Z",
    });
    const missingOlder = makeRow({
      session_key: 2,
      replay_status: "missing",
      telemetry_status: "hit",
      updated_at: "2026-03-29T10:00:00.000Z",
    });
    const sorted = [readyNewest, missingOlder].sort(byMissingThenNewestUpdate);
    expect(sorted[0].session_key).toBe(2);
  });

  it("shows row error only when cache is missing", () => {
    const staleErrorReady = makeRow({
      replay_status: "hit",
      telemetry_status: "warmed",
      last_error: "Replay cache request failed: 404",
    });
    const realErrorMissing = makeRow({
      replay_status: "missing",
      telemetry_status: "hit",
      last_error: "Replay cache request failed: 404",
    });

    expect(shouldShowRowError(staleErrorReady)).toBe(false);
    expect(shouldShowRowError(realErrorMissing)).toBe(true);
  });
});
