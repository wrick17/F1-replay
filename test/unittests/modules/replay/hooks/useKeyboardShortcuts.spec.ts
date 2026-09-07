import { expect, it, mock } from "bun:test";
import { handleReplayShortcut } from "modules/replay/hooks/useKeyboardShortcuts";

it("replay hotkeys override focused controls and native navigation, preserving browser combinations", () => {
  const actions = {
    currentTimeMs: 100000, skipIntervalMs: 10000,
    togglePlay: mock(() => {}), seekTo: mock((_time: number) => {}),
    cycleSpeed: mock(() => {}), toggleRadio: mock(() => {}),
    cycleSkipInterval: mock(() => {}), toggleTimelineExpanded: mock(() => {}),
    nextRound: mock(() => {}), prevRound: mock(() => {}),
    nextYear: mock(() => {}), prevYear: mock(() => {}),
    nextSession: mock(() => {}), prevSession: mock(() => {}),
  };
  const press = (key: string, extra = {}) => {
    const e = { key, target: { tagName: "INPUT", type: "range" },
      preventDefault: mock(() => {}), stopPropagation: mock(() => {}), ...extra };
    handleReplayShortcut(e as unknown as KeyboardEvent, actions);
    return e;
  };
  expect(press(" ").preventDefault).toHaveBeenCalled();
  expect(actions.togglePlay).toHaveBeenCalledTimes(1);
  press(" ", { repeat: true });
  expect(actions.togglePlay).toHaveBeenCalledTimes(1);
  press("ArrowRight");
  expect(actions.seekTo).toHaveBeenLastCalledWith(110000);
  press("ArrowLeft");
  expect(actions.seekTo).toHaveBeenLastCalledWith(90000);
  for (const key of ["Tab", "Enter", "Home", "End"]) {
    const e = press(key);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(e.stopPropagation).toHaveBeenCalled();
  }
  press("ArrowUp", { shiftKey: true, metaKey: true });
  expect(actions.nextSession).toHaveBeenCalledTimes(1);
  expect(press("s", { metaKey: true }).preventDefault).not.toHaveBeenCalled();
  expect(actions.cycleSpeed).not.toHaveBeenCalled();
});
