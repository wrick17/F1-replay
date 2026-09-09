import {
  findChunkAt,
  loadCarChunk,
  loadCatalog,
  loadLocationChunk,
  loadManifest,
  loadReplayCore,
} from "../../src/modules/archive";
import { appendLocations } from "../../src/modules/archive/codec";
import { computeDriverStates } from "../../src/modules/replay/services/driverState.service";
import { buildTrack } from "../../src/modules/replay/services/trackBuilder.service";
import type { CarTelemetrySample } from "../../src/modules/replay/types/carTelemetry.types";
import { interpolateLocationMotion } from "../../src/modules/replay/utils/telemetry.util";

const catalogUrl = "https://data.f1.wrick17.com/catalog.json";

const session = async (sessionKey: number) => {
  const catalog = await loadCatalog(catalogUrl, { networkOnly: true });
  const entry = catalog.sessions.find((candidate) => candidate.sessionKey === sessionKey);
  if (!entry) throw new Error(`Session ${sessionKey} is not archived`);
  const manifest = await loadManifest(catalogUrl, entry);
  const data = await loadReplayCore(catalogUrl, manifest);
  return { manifest, data };
};

const sampleIndexAt = <T extends { timestampMs: number }>(samples: T[], timestampMs: number) => {
  let left = 0;
  let right = samples.length - 1;
  while (left < right - 1) {
    const middle = Math.floor((left + right) / 2);
    if (samples[middle].timestampMs <= timestampMs) left = middle;
    else right = middle;
  }
  return left;
};

const speedAt = (samples: CarTelemetrySample[], timestampMs: number) => {
  const index = sampleIndexAt(samples, timestampMs);
  const left = samples[index];
  const right = samples[index + 1] ?? left;
  const ratio = right === left ? 0 : (timestampMs - left.timestampMs) / (right.timestampMs - left.timestampMs);
  return left.speed + (right.speed - left.speed) * ratio;
};

const checkQualifyingContinuity = async () => {
  const { manifest, data } = await session(11295);
  const startMs = manifest.sessionStartMs + 600_000;
  const locationDescriptor = findChunkAt(manifest.locations, startMs);
  const carDescriptor = manifest.car && findChunkAt(manifest.car.chunks, startMs);
  if (!locationDescriptor || !carDescriptor) throw new Error("Qualifying motion window is missing");
  const locations = (
    await loadLocationChunk(
      catalogUrl,
      manifest,
      locationDescriptor,
      new Set(data.drivers.map((driver) => driver.driver_number)),
    )
  )[1];
  const speeds = (await loadCarChunk(catalogUrl, manifest, carDescriptor))[1];
  const ratios: number[] = [];
  for (let index = 1; index < locations.length; index += 1) {
    const previous = locations[index - 1];
    const current = locations[index];
    const elapsedMs = current.timestampMs - previous.timestampMs;
    const speed = speedAt(speeds, (previous.timestampMs + current.timestampMs) / 2);
    if (elapsedMs >= 50 && elapsedMs <= 1_000 && speed > 20) {
      ratios.push(
        Math.hypot(current.x - previous.x, current.y - previous.y) /
          ((speed * elapsedMs) / 3_600),
      );
    }
  }
  ratios.sort((a, b) => a - b);
  const unitsPerMeter = ratios[Math.floor(ratios.length / 2)];
  const linear = (timestampMs: number) => {
    const index = sampleIndexAt(locations, timestampMs);
    const left = locations[index];
    const right = locations[index + 1];
    const ratio = (timestampMs - left.timestampMs) / (right.timestampMs - left.timestampMs);
    return {
      x: left.x + (right.x - left.x) * ratio,
      y: left.y + (right.y - left.y) * ratio,
    };
  };
  const metric = (positionAt: (timestampMs: number) => { x: number; y: number }) => {
    const ratios: number[] = [];
    let previous = positionAt(startMs);
    for (let timestampMs = startMs + 20; timestampMs <= startMs + 60_000; timestampMs += 20) {
      const current = positionAt(timestampMs);
      const speed =
        (Math.hypot(current.x - previous.x, current.y - previous.y) / 20) *
        (3_600 / unitsPerMeter);
      const recorded = speedAt(speeds, timestampMs - 10);
      if (recorded > 20) ratios.push(speed / recorded);
      previous = current;
    }
    const mean = ratios.reduce((sum, value) => sum + value, 0) / ratios.length;
    const cv =
      Math.sqrt(ratios.reduce((sum, value) => sum + (value - mean) ** 2, 0) / ratios.length) /
      mean;
    const jumps = ratios
      .slice(1)
      .map((value, index) => Math.abs(value - ratios[index]))
      .sort((a, b) => a - b);
    return { cv, maxFrameJump: jumps[jumps.length - 1] };
  };
  const baseline = metric(linear);
  const fixed = metric(
    (timestampMs) => interpolateLocationMotion(locations, timestampMs, speeds)!.location,
  );
  if (fixed.cv >= baseline.cv || fixed.maxFrameJump >= baseline.maxFrameJump) {
    throw new Error(`Motion continuity regressed: ${JSON.stringify({ baseline, fixed })}`);
  }
  return { baseline, fixed, unitsPerMeter };
};

const checkRaceGap = async () => {
  const { manifest, data } = await session(11299);
  const knownDrivers = new Set(data.drivers.map((driver) => driver.driver_number));
  for (const descriptor of manifest.locations) {
    appendLocations(data, await loadLocationChunk(catalogUrl, manifest, descriptor, knownDrivers));
  }
  for (const telemetry of Object.values(data.telemetryByDriver)) {
    telemetry.locations.sort((left, right) => left.timestampMs - right.timestampMs);
  }
  const cursorMs = manifest.sessionStartMs + 993_000;
  const selected = manifest.car && findChunkAt(manifest.car.chunks, cursorMs);
  if (!manifest.car || !selected) throw new Error("Race car telemetry window is missing");
  const selectedIndex = manifest.car.chunks.indexOf(selected);
  const byDriver: Record<number, CarTelemetrySample[]> = {};
  for (const descriptor of manifest.car.chunks.slice(selectedIndex - 1, selectedIndex + 2)) {
    const chunk = await loadCarChunk(catalogUrl, manifest, descriptor);
    for (const [driver, samples] of Object.entries(chunk)) {
      byDriver[Number(driver)] = [...(byDriver[Number(driver)] ?? []), ...samples];
    }
  }
  const payload = {
    sessionKey: manifest.sessionKey,
    sampleIntervalMs: manifest.car.sampleIntervalMs,
    createdAt: manifest.car.createdAt,
    byDriver,
  };
  const normalization = buildTrack(data).normalization;
  const first = computeDriverStates(data, cursorMs, normalization, payload);
  const second = computeDriverStates(data, cursorMs + 3_000, normalization, payload);
  const estimated = Object.keys(first).filter((driver) => first[Number(driver)].locationStatus === "estimated");
  const moved = estimated.filter((driver) => {
    const before = first[Number(driver)].position;
    const after = second[Number(driver)].position;
    return before && after && Math.hypot(after.x - before.x, after.y - before.y) > 0;
  });
  if (estimated.length < 19 || moved.length !== estimated.length) {
    throw new Error(`Race gap is still frozen: ${estimated.length} estimated, ${moved.length} moved`);
  }
  return { estimated: estimated.length, moved: moved.length };
};

const [qualifying, race] = await Promise.all([checkQualifyingContinuity(), checkRaceGap()]);
console.log(JSON.stringify({ qualifying, race }, null, 2));
