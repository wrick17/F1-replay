import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { buildSessionArchive } from "../../src/modules/archive";
import type { CarTelemetryPayload } from "../../src/modules/replay/types/carTelemetry.types";
import type { ReplaySessionData } from "../../src/modules/replay/types/openf1.types";

const args = Object.fromEntries(
  process.argv.slice(2).reduce<[string, string][]>((entries, value, index, values) => {
    if (value.startsWith("--") && values[index + 1] && !values[index + 1].startsWith("--")) {
      entries.push([value.slice(2), values[index + 1]]);
    }
    return entries;
  }, []),
);

if (!args.replay || !args.out || !args.round) {
  throw new Error(
    "Usage: bun scripts/archive/build.ts --replay replay.json --out archive --round 1 [--car car.json]",
  );
}

const replay = (await Bun.file(args.replay).json()) as ReplaySessionData;
const car = args.car ? ((await Bun.file(args.car).json()) as CarTelemetryPayload) : undefined;
const archive = await buildSessionArchive(replay, {
  round: Number(args.round),
  car,
  updatedAt: args["updated-at"],
});

for (const [path, content] of archive.files) {
  const destination = join(args.out, path);
  await mkdir(dirname(destination), { recursive: true });
  await Bun.write(destination, content);
}

console.log(
  JSON.stringify({
    sessionKey: archive.manifest.sessionKey,
    files: archive.files.size,
    locationChunks: archive.manifest.locations.length,
    carChunks: archive.manifest.car?.chunks.length ?? 0,
    bytes: [...archive.files.values()].reduce(
      (total, content) => total + new TextEncoder().encode(content).byteLength,
      0,
    ),
  }),
);
