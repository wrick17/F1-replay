import { describe, expect, it } from "bun:test";
import {
  buildEventDetailsHref,
  buildReplayHref,
  getEventRouteParams,
  getReplayRouteParams,
  hasReplaySearchParams,
  readLegacyReplayRoute,
  resolveAppRoute,
} from "../../../src/app/routing";

describe("app routing helpers", () => {
  it("routes root to home", () => {
    expect(resolveAppRoute("/", "")).toBe("home");
  });

  it("routes /replay to replay bootstrap", () => {
    expect(resolveAppRoute("/replay", "")).toBe("replay");
  });

  it("routes /ops/cache to ops dashboard", () => {
    expect(resolveAppRoute("/ops/cache", "")).toBe("ops-cache");
  });

  it("routes /ops/cache/auth/callback to ops dashboard", () => {
    expect(resolveAppRoute("/ops/cache/auth/callback", "")).toBe("ops-cache");
  });

  it("routes clean details paths", () => {
    expect(resolveAppRoute("/2026/3/race", "")).toBe("event-details");
  });

  it("routes clean replay paths", () => {
    expect(resolveAppRoute("/2026/3/race/replay", "")).toBe("replay");
  });

  it("routes legacy replay query urls to redirect route", () => {
    expect(resolveAppRoute("/replay", "?year=2026&round=3&session=Race")).toBe(
      "legacy-replay-redirect",
    );
  });

  it("detects replay search params", () => {
    expect(hasReplaySearchParams("?year=2026&round=1&session=Race")).toBe(true);
    expect(hasReplaySearchParams("?year=2026")).toBe(false);
  });

  it("builds clean details and replay hrefs", () => {
    expect(buildEventDetailsHref(2026, 3, "Race")).toBe("/2026/3/race");
    expect(buildReplayHref(2026, 3, "Race")).toBe("/2026/3/race/replay");
  });

  it("parses route params and rejects invalid session slugs", () => {
    expect(getEventRouteParams("/2026/3/race")).toEqual({
      year: 2026,
      round: 3,
      sessionType: "Race",
    });
    expect(getReplayRouteParams("/2026/3/sprint/replay")).toEqual({
      year: 2026,
      round: 3,
      sessionType: "Sprint",
    });
    expect(getEventRouteParams("/2026/3/practice")).toBeNull();
  });

  it("reads legacy replay search state", () => {
    expect(readLegacyReplayRoute("?year=2026&round=5&session=race")).toEqual({
      year: 2026,
      round: 5,
      sessionType: "Race",
    });
  });
});
