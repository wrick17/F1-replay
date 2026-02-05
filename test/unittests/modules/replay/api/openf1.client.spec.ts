import { describe, expect, it } from "bun:test";
import { buildQuery } from "modules/replay/api/openf1.client";

describe("openf1.client", () => {
  it("builds a query string with operators", () => {
    const query = buildQuery({
      session_key: 123,
      "date>=": "2023-01-01T00:00:00Z",
    });
    expect(query).toContain("session_key=123");
    expect(query).toContain("date>=2023-01-01T00%3A00%3A00Z");
  });
});
