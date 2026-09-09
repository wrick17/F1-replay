// Run through DevTools evaluate_script on a loaded replay in either view.
// Monaco 2026 Race previously froze all 22 cars at 16:33 despite a running clock.
async function checkReplayMotion(elapsedMs = 993_000) {
  const button = (name) => document.querySelector(`button[aria-label="${name}"]`);
  const timeline = document.querySelector('input[aria-label="Replay timeline"]');
  if (!timeline || !button("Play replay") && !button("Pause replay")) {
    throw new Error("Load a replay before checking motion");
  }
  button("Pause replay")?.click();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(
    timeline, String(Number(timeline.min) + elapsedMs),
  );
  timeline.dispatchEvent(new Event("input", { bubbles: true }));
  timeline.dispatchEvent(new Event("change", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const markers = () => [...document.querySelectorAll(
    'svg[aria-label="F1 circuit and driver positions"] [role="button"]',
  )].map((marker) => marker.getAttribute("transform"));
  const before = markers();
  const started = Number(timeline.value);
  const speed = Number.parseFloat(button("Cycle playback speed").textContent);
  const wallStarted = performance.now();
  button("Play replay").click();
  try {
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    const wallElapsed = performance.now() - wallStarted;
    const replayElapsed = Number(timeline.value) - started;
    const after = markers();
    const moved = before.filter((point, index) => after[index] && point !== after[index]).length;
    // The timeline is rounded to whole seconds; allow that plus a delayed frame.
    if (Math.abs(replayElapsed - wallElapsed * speed) > 1000 + wallElapsed * speed * 0.05) {
      throw new Error(`Replay clock drift: ${replayElapsed}ms replay / ${wallElapsed}ms wall at ${speed}x`);
    }
    if (!before.length || !moved) throw new Error(`Cars frozen: ${before.length} unchanged positions`);
    return { passed: true, url: location.href, cars: before.length, moved, replayElapsed, wallElapsed, speed };
  } finally {
    button("Pause replay")?.click();
  }
}
