import { resolve, sep } from "node:path";
import {
  loadCarChunk,
  loadCatalog,
  loadLocationChunk,
  loadManifest,
  loadReplayCore,
} from "../../src/modules/archive";

const argv = process.argv.slice(2);
const option = (name: string) => {
  const index = argv.indexOf(name);
  return index < 0 ? undefined : argv[index + 1];
};

const directory = option("--dir");
let server: ReturnType<typeof Bun.serve> | undefined;
let catalogUrl =
  option("--catalog") ?? `https://data.f1.wrick17.com/catalog.json?validate=${Date.now()}`;

if (directory) {
  const root = resolve(directory);
  server = Bun.serve({
    port: 0,
    async fetch(request) {
      const path = resolve(root, decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, ""));
      if (path !== root && !path.startsWith(`${root}${sep}`)) return new Response("invalid", { status: 400 });
      const file = Bun.file(path);
      return (await file.exists()) ? new Response(file) : new Response("missing", { status: 404 });
    },
  });
  catalogUrl = `${server.url}catalog.json`;
}

const failures: Array<{ sessionKey: number; error: string }> = [];
let locationChunks = 0;
let carChunks = 0;

try {
  const catalog = await loadCatalog(catalogUrl, { networkOnly: true, retries: 2 });
  const validateSession = async (session: (typeof catalog.sessions)[number]) => {
    const manifest = await loadManifest(catalogUrl, session, { retries: 2 });
    const core = await loadReplayCore(catalogUrl, manifest, { retries: 2 });
    const knownDrivers = new Set(Object.keys(core.telemetryByDriver).map(Number));
    for (let index = 0; index < manifest.locations.length; index += 8) {
      await Promise.all(
        manifest.locations
          .slice(index, index + 8)
          .map((chunk) =>
            loadLocationChunk(catalogUrl, manifest, chunk, knownDrivers, { retries: 2 }),
          ),
      );
    }
    for (let index = 0; index < (manifest.car?.chunks.length ?? 0); index += 8) {
      await Promise.all(
        (manifest.car?.chunks ?? [])
          .slice(index, index + 8)
          .map((chunk) => loadCarChunk(catalogUrl, manifest, chunk, { retries: 2 })),
      );
    }
    locationChunks += manifest.locations.length;
    carChunks += manifest.car?.chunks.length ?? 0;
    console.log(`Validated session_key=${session.sessionKey}`);
  };
  for (let index = 0; index < catalog.sessions.length; index += 4) {
    await Promise.all(
      catalog.sessions.slice(index, index + 4).map(async (session) => {
        try {
          await validateSession(session);
        } catch (error) {
          failures.push({ sessionKey: session.sessionKey, error: String(error) });
        }
      }),
    );
  }
  console.log(
    JSON.stringify({
      catalogUrl,
      sessions: catalog.sessions.length,
      locationChunks,
      carChunks,
      failures,
    }),
  );
} finally {
  server?.stop(true);
}

if (failures.length) process.exit(1);
