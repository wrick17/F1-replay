// Rebuild the small circuit reference from full replay exports. No network or cloud writes.
// Usage: bun scripts/archive/build-pit-lanes.ts /path/to/replay-json-directory
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { buildPitLaneGeometry, buildTrackGeometry } from "../../src/modules/replay/services/trackBuilder.service";
import type { ReplaySessionData } from "../../src/modules/replay/types/openf1.types";

const directory = process.argv[2];
if (!directory) throw new Error("Pass the directory containing full replay JSON exports");
const references: Record<string, unknown> = {};
for (const file of (await readdir(directory)).filter((name) => name.endsWith(".json")).sort()) {
  const data = await Bun.file(join(directory, file)).json() as ReplaySessionData;
  if (!data.meeting?.circuit_key || data.session?.session_name !== "Race") continue;
  const key = `${data.meeting.year}:${data.meeting.circuit_key}`;
  if (references[key]) continue;
  const points = buildPitLaneGeometry(data);
  if (!points.length) { console.warn(`No complete pit traversal: ${key} session ${data.session.session_key}`); continue; }
  const track = buildTrackGeometry(data)!.points;
  references[key] = { year: data.meeting.year, circuitKey: data.meeting.circuit_key, sessionKey: data.session.session_key,
    points: points.map(([x, y]) => [Math.round(x), Math.round(y)]),
    anchors: Array.from({ length: 12 }, (_, i) => track[Math.floor(i * track.length / 12)]).map(([x, y]) => [Math.round(x), Math.round(y)]) };
  console.log(`${key}: ${points.length} pit points`);
}
await Bun.write(new URL("../../src/modules/replay/data/pitLanes.json", import.meta.url), `${JSON.stringify(references)}\n`);
console.log(`${Object.keys(references).length} circuit-year references`);
