import { describe, expect, test } from "bun:test";
import {
  buildShooAudience,
  isAllowedEmailClaim,
  normalizeEmail,
  parseEmailAllowlist,
} from "../../../../workers/openf1-cache-warmer/src/auth";

describe("openf1-cache-warmer auth helpers", () => {
  test("normalizes emails using trim + lowercase", () => {
    expect(normalizeEmail("  WrIcK17@GMAIL.COM ")).toBe("wrick17@gmail.com");
  });

  test("parses allowlist from comma-separated secret", () => {
    const allowlist = parseEmailAllowlist("wrick17@gmail.com, TEAM@Example.com , ");
    expect(allowlist.has("wrick17@gmail.com")).toBe(true);
    expect(allowlist.has("team@example.com")).toBe(true);
    expect(allowlist.size).toBe(2);
  });

  test("checks allowlisted claim case-insensitively", () => {
    const allowlist = parseEmailAllowlist("wrick17@gmail.com");
    expect(isAllowedEmailClaim("Wrick17@gmail.com", allowlist)).toBe(true);
    expect(isAllowedEmailClaim("other@gmail.com", allowlist)).toBe(false);
    expect(isAllowedEmailClaim(undefined, allowlist)).toBe(false);
  });

  test("builds origin-scoped Shoo audience", () => {
    expect(buildShooAudience("https://example.com")).toBe("origin:https://example.com");
  });
});
