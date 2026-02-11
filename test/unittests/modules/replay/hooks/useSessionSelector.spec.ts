import { describe, expect, it } from "bun:test";
import {
  useSessionAutoCorrect,
  useSessionState,
} from "modules/replay/hooks/useSessionSelector";

describe("useSessionSelector", () => {
  it("exports session hooks", () => {
    expect(typeof useSessionState).toBe("function");
    expect(typeof useSessionAutoCorrect).toBe("function");
  });
});
