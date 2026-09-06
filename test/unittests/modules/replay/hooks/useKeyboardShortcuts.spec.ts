import { describe, expect, it } from "bun:test";
import { shouldIgnoreKeyboardShortcutTarget } from "modules/replay/hooks/useKeyboardShortcuts";

describe("shouldIgnoreKeyboardShortcutTarget", () => {
  it("ignores interactive and editable targets", () => {
    for (const tagName of ["A", "BUTTON", "FORM", "INPUT", "SELECT", "TEXTAREA"]) {
      expect(shouldIgnoreKeyboardShortcutTarget({ tagName } as EventTarget)).toBe(true);
    }
    expect(
      shouldIgnoreKeyboardShortcutTarget({ tagName: "DIV", isContentEditable: true } as EventTarget),
    ).toBe(true);
  });

  it("allows shortcuts from the page itself", () => {
    expect(shouldIgnoreKeyboardShortcutTarget({ tagName: "DIV" } as EventTarget)).toBe(false);
    expect(shouldIgnoreKeyboardShortcutTarget(null)).toBe(false);
  });
});
