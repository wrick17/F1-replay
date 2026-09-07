// Run in the DevTools console on a freshly loaded replay, or invoke through
// chrome-devtools-mcp evaluate_script. Uses the page's current archived session.
async function checkReplay3D() {
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const waitFor = async (condition, message) => {
    const deadline = Date.now() + 30000;
    while (!condition()) {
      check(Date.now() < deadline, message);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };
  const button = (name) => document.querySelector(`button[aria-label="${name}"]`);
  const mode = () => document.querySelector(".replay-shell")?.dataset.view;
  const timeline = () => document.querySelector('input[aria-label="Replay timeline"]');
  const click = (name) => {
    const element = button(name);
    check(element && !element.disabled, `Missing enabled control: ${name}`);
    element.click();
  };
  const sceneFrames = () => Number(document.querySelector(".replay-spatial canvas")?.dataset.renderFrames ?? 0);

  check(mode() === "2d", "Fresh replays must default to 2D");
  check(!document.querySelector(".replay-spatial canvas"), "2D must not create a WebGL canvas");
  await waitFor(() => button("Play replay"), "Replay data did not load");
  const time = timeline().value;
  const speed = button("Cycle playback speed").textContent;
  click("Switch to 3D view");
  await waitFor(() => mode() === "3d", "3D did not become ready");
  check(document.querySelectorAll(".replay-spatial canvas").length === 1, "Expected one 3D canvas");
  await waitFor(() => sceneFrames() > 0, "3D did not render its first frame");
  const firstFrames = sceneFrames();
  check(button("Switch to 2D view").textContent.trim() === "3D", "Mode button must show only3D");
  check(document.querySelector(".game-inspector"), "3D entry must show the data inspector");
  check(timeline().value === time, "Switching to 3D changed the paused replay time");
  check(document.querySelector(".replay-flat").inert, "Hidden 2D markers must not receive focus");
  click("Hide replay panels");
  await waitFor(() => !document.querySelector(".game-tower"), "Panels did not hide");
  click("Show replay panels");
  click("Switch to 2D view");
  await waitFor(() => mode() === "2d", "Could not return to 2D");
  check(timeline().value === time, "Returning to 2D changed the paused replay time");
  check(document.querySelector(".replay-spatial").inert, "Hidden 3D controls must not receive focus");

  click("Play replay");
  await waitFor(() => Number(timeline().value) > Number(time), "Replay clock did not advance");
  click("Switch to 3D view");
  await waitFor(() => mode() === "3d", "Second 3D activation failed");
  await waitFor(() => sceneFrames() > firstFrames, "3D rendering did not resume after switching back");
  check(button("Pause replay"), "Switching to 3D stopped playback");
  click("Switch to 2D view");
  await waitFor(() => mode() === "2d", "Second return to 2D failed");
  check(button("Pause replay"), "Returning to 2D stopped playback");
  click("Pause replay");
  check(button("Cycle playback speed").textContent === speed, "View changes reset speed");
  check(document.querySelectorAll(".replay-spatial canvas").length === 1, "View changes leaked canvases");
  check(document.documentElement.scrollWidth <= window.innerWidth + 1, "Page overflows horizontally");
  return { passed: true, viewport: [window.innerWidth, window.innerHeight], checks: "default 2D, current-mode label, deferred canvas, real render frames, paused time, continuous playback, speed, panel visibility, hidden focus, repeated toggle, overflow" };
}
