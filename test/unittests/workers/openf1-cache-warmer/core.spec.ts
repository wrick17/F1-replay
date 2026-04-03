import { describe, expect, test } from "bun:test";
import {
  deriveWarmActions,
  getNextRetryAt,
  getRetryWindowMsForRow,
  isAuthStatus,
  isEligibleRow,
  isOpenF1NoDataError,
  isRetryableStatus,
  OPENF1_NO_DATA_ERROR_PREFIX,
  OPENF1_NO_DATA_RETRY_INTERVAL_MS,
  type WarmAttemptRow,
} from "../../../../workers/openf1-cache-warmer/src/core";

const makeRow = (overrides: Partial<WarmAttemptRow> = {}): WarmAttemptRow => ({
  session_key: 1001,
  meeting_key: 5001,
  meeting_name: "Test Grand Prix",
  year: 2026,
  round: 2,
  session_type: "Race",
  session_name: "Race",
  date_end: "2026-04-01T10:00:00.000Z",
  replay_status: "pending",
  telemetry_status: "pending",
  attempt_count: 0,
  warm_in_progress: 0,
  warm_started_at: null,
  last_attempt_at: null,
  next_retry_at: "2026-04-01T10:30:00.000Z",
  last_error: null,
  completed_at: null,
  created_at: "2026-04-01T10:30:00.000Z",
  updated_at: "2026-04-01T10:30:00.000Z",
  ...overrides,
});

describe("openf1-cache-warmer core", () => {
  test("isEligibleRow allows ended supported sessions before retry window closes", () => {
    const row = makeRow({
      session_type: "Sprint",
      date_end: "2026-04-01T10:00:00.000Z",
      next_retry_at: "2026-04-01T11:00:00.000Z",
    });
    const now = Date.parse("2026-04-01T11:00:00.000Z");
    expect(isEligibleRow(row, now)).toBe(true);
  });

  test("isEligibleRow blocks completed rows", () => {
    const row = makeRow({ completed_at: "2026-04-01T11:05:00.000Z" });
    const now = Date.parse("2026-04-01T11:30:00.000Z");
    expect(isEligibleRow(row, now)).toBe(false);
  });

  test("isEligibleRow blocks rows already warming", () => {
    const row = makeRow({ warm_in_progress: 1 });
    const now = Date.parse("2026-04-01T11:30:00.000Z");
    expect(isEligibleRow(row, now)).toBe(false);
  });

  test("isEligibleRow blocks rows outside 12h retry window", () => {
    const row = makeRow({
      date_end: "2026-04-01T00:00:00.000Z",
      next_retry_at: "2026-04-01T11:00:00.000Z",
    });
    const now = Date.parse("2026-04-01T12:01:00.000Z");
    expect(isEligibleRow(row, now)).toBe(false);
  });

  test("isEligibleRow allows OPENF1_NO_DATA rows beyond 12h but within extended window", () => {
    const row = makeRow({
      date_end: "2026-04-01T00:00:00.000Z",
      next_retry_at: "2026-04-02T01:00:00.000Z",
      last_error: `${OPENF1_NO_DATA_ERROR_PREFIX} Replay payload has no drivers yet`,
    });
    const now = Date.parse("2026-04-02T01:00:00.000Z");
    expect(isEligibleRow(row, now)).toBe(true);
    expect(getRetryWindowMsForRow(row)).toBeGreaterThan(12 * 60 * 60 * 1000);
  });

  test("isEligibleRow blocks rows before next_retry_at", () => {
    const row = makeRow({ next_retry_at: "2026-04-01T12:00:00.000Z" });
    const now = Date.parse("2026-04-01T11:59:00.000Z");
    expect(isEligibleRow(row, now)).toBe(false);
  });

  test("deriveWarmActions warms only missing cache side", () => {
    expect(deriveWarmActions({ replayHit: true, telemetryHit: false })).toEqual({
      warmReplay: false,
      warmTelemetry: true,
      complete: false,
    });
    expect(deriveWarmActions({ replayHit: false, telemetryHit: true })).toEqual({
      warmReplay: true,
      warmTelemetry: false,
      complete: false,
    });
  });

  test("deriveWarmActions reports complete when both caches are hits", () => {
    expect(deriveWarmActions({ replayHit: true, telemetryHit: true })).toEqual({
      warmReplay: false,
      warmTelemetry: false,
      complete: true,
    });
  });

  test("status helpers classify auth and retryable errors correctly", () => {
    expect(isAuthStatus(401)).toBe(true);
    expect(isAuthStatus(403)).toBe(false);
    expect(isRetryableStatus(404)).toBe(true);
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(400)).toBe(false);
  });

  test("getNextRetryAt advances by one hour by default", () => {
    const now = Date.parse("2026-04-01T10:00:00.000Z");
    expect(getNextRetryAt(now)).toBe("2026-04-01T11:00:00.000Z");
  });

  test("OpenF1 no-data helpers classify marker and 24h cadence correctly", () => {
    const row = makeRow({ last_error: `${OPENF1_NO_DATA_ERROR_PREFIX} OpenF1 returned 404` });
    expect(isOpenF1NoDataError(row.last_error)).toBe(true);
    expect(getNextRetryAt(Date.parse("2026-04-01T10:00:00.000Z"), OPENF1_NO_DATA_RETRY_INTERVAL_MS)).toBe(
      "2026-04-02T10:00:00.000Z",
    );
  });
});
