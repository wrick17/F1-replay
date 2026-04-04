import { describe, expect, test } from "bun:test";
import { isAllowedOrigin, parseAllowedOrigins } from "../../../../workers/openf1-cache-warmer/src/cors";

describe("openf1-cache-warmer cors helpers", () => {
  test("falls back to defaults when unset", () => {
    const allowlist = parseAllowedOrigins(undefined);
    expect(allowlist).toEqual([
      "http://localhost:3000",
      "http://localhost:3001",
      "https://f1.wrick17.com",
      "https://www.f1.wrick17.com",
    ]);
  });

  test("falls back to defaults when var is blank", () => {
    const allowlist = parseAllowedOrigins("   ");
    expect(allowlist).toContain("https://f1.wrick17.com");
    expect(allowlist).toContain("http://localhost:3000");
  });

  test("parses configured allowlist values", () => {
    const allowlist = parseAllowedOrigins("https://f1.wrick17.com, https://ops.example.com ");
    expect(allowlist).toEqual(["https://f1.wrick17.com", "https://ops.example.com"]);
  });

  test("matches origin only when exact string is allowlisted", () => {
    const allowlist = ["https://f1.wrick17.com"];
    expect(isAllowedOrigin("https://f1.wrick17.com", allowlist)).toBe(true);
    expect(isAllowedOrigin("https://www.f1.wrick17.com", allowlist)).toBe(false);
    expect(isAllowedOrigin(null, allowlist)).toBe(false);
  });
});

