// Run checkReplaySeeking() in DevTools on a loaded replay.
async function checkReplaySeeking() {
  const button = (name) => document.querySelector(`button[aria-label="${name}"]`);
  const timeline = () => document.querySelector('input[aria-label="Replay timeline"]');
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const until = async (condition) => {
    const deadline = Date.now() + 30000;
    while (!condition()) {
      if (Date.now() > deadline) throw new Error('Playback did not settle after seeking');
      await wait(50);
    }
  };
  const seek = (offset) => {
    const range = timeline();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(range, String(Number(range.min) + offset));
    range.dispatchEvent(new Event('input', { bubbles: true }));
    range.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const checkState = async (playing) => {
    await until(() => button(playing ? 'Pause replay' : 'Play replay'));
    const before = Number(timeline().value);
    if (playing) await until(() => Number(timeline().value) > before);
    else await wait(1100);
    const advanced = Number(timeline().value) > before;
    if (advanced !== playing) throw new Error(`Seek changed playback intent: expected playing=${playing}`);
  };
  await until(() => timeline() && button('Play replay'));
  for (const view of ['2d', '3d']) {
    if (view === '3d') {
      button('Switch to 3D view').click();
      await until(() => document.querySelector('.replay-shell')?.dataset.view === '3d');
    }
    seek(600000);
    await wait(40);
    seek(1200000);
    await checkState(false);
    button('Play replay').click();
    await checkState(true);
    // Cross multiple unloaded windows before the first seek finishes buffering.
    seek(2400000);
    await wait(40);
    seek(3600000);
    await wait(40);
    seek(1800000);
    await checkState(true);
    // An already loaded seek must keep playing too.
    seek(1801000);
    await checkState(true);
    button('Pause replay').click();
    await until(() => button('Play replay'));
    seek(1802000);
    await checkState(false);
  }
  return { passed: true, checks: 'paused and playing seeks, repeated buffering seeks, forward and reverse seeks, 2D and 3D' };
}
