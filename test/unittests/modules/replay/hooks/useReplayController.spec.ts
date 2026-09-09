import { describe, expect, it, mock } from "bun:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  isReplayTimeLoaded,
  useReplayController,
} from "modules/replay/hooks/useReplayController";

describe("useReplayController", () => {
  it("exports a hook", () => {
    expect(typeof useReplayController).toBe("function");
  });

  it("uses the active chunk range independently from the final session end", () => {
    expect(isReplayTimeLoaded(150, 100, 200)).toBe(true);
    expect(isReplayTimeLoaded(900, 100, 200)).toBe(false);
    expect(isReplayTimeLoaded(100, 0, 0)).toBe(false);
  });

  it("keeps every animation-frame delta when React renders late", async () => {
    let cursor = 0;
    const state: unknown[] = [];
    const refs: Array<{ current: unknown }> = [];
    const memos: Array<{ value: unknown; deps?: unknown[] }> = [];
    const effectDeps: Array<unknown[] | undefined> = [];
    let pendingEffects: Array<() => void | (() => void)> = [];
    let frames: FrameRequestCallback[] = [];
    const sameDeps = (left?: unknown[], right?: unknown[]) =>
      left?.length === right?.length && left?.every((value, index) => Object.is(value, right[index]));

    mock.module("react", () => ({
      ...React,
      useState: (initial: unknown) => {
        const index = cursor++;
        if (!(index in state)) state[index] = initial;
        return [state[index], (value: unknown) => {
          state[index] = typeof value === "function" ? value(state[index]) : value;
        }];
      },
      useRef: (initial: unknown) => {
        const index = cursor++;
        return (refs[index] ??= { current: initial });
      },
      useCallback: (callback: unknown, deps: unknown[]) => {
        const index = cursor++;
        if (!memos[index] || !sameDeps(memos[index].deps, deps))
          memos[index] = { value: callback, deps };
        return memos[index].value;
      },
      useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
        const index = cursor++;
        if (!sameDeps(effectDeps[index], deps)) {
          effectDeps[index] = deps;
          pendingEffects.push(effect);
        }
      },
    }));

    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
    globalThis.requestAnimationFrame = (callback) => {
      frames.push(callback);
      return frames.length;
    };
    globalThis.cancelAnimationFrame = () => {};
    try {
      const { useReplayController: useDelayedController } = await import(
        "../../../../../src/modules/replay/hooks/useReplayController.ts?delayed-render"
      );
      const render = () => {
        cursor = 0;
        pendingEffects = [];
        const controller = useDelayedController({
          startTimeMs: 1000,
          endTimeMs: 10_000,
          loadedStartMs: 1,
          loadedEndMs: 10_000,
        });
        pendingEffects.forEach((effect) => effect());
        return controller;
      };
      const frame = (timestamp: number) => frames.shift()?.(timestamp);

      let controller = render();
      controller.togglePlay();
      render();
      frame(0);
      frame(16);
      frame(32);
      controller = render();

      expect(controller.currentTimeMs).toBe(1032);
    } finally {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
      mock.module("react", () => React);
    }
  });

  it("restores React after the delayed-render harness", () => {
    const Probe = () => {
      const [value] = React.useState(7);
      const ref = React.useRef("ok");
      return React.createElement("span", null, `${value}:${ref.current}`);
    };
    expect(renderToStaticMarkup(React.createElement(Probe))).toBe("<span>7:ok</span>");
  });
});
