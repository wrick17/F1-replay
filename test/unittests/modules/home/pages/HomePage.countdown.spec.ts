import { describe, expect, it } from "bun:test";
import { toCountdown } from "modules/home/pages/HomePage";

describe("toCountdown", () => {
  it("returns a decreasing countdown as time moves forward", () => {
    const target = "2026-04-10T10:00:00.000Z";
    const now = Date.parse("2026-04-10T08:00:00.000Z");
    const oneMinuteLater = now + 60_000;

    expect(toCountdown(target, now)).toBe("0d 2h 0m");
    expect(toCountdown(target, oneMinuteLater)).toBe("0d 1h 59m");
  });
});
