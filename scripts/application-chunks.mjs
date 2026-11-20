// Which chunk each application module goes into (the `manualChunks` rule of vite.config.ts).
// A module that returns undefined is left to the bundler's own splitting.

const TUTORIAL_GOLD_DATA = "gameplay/training/tutorial-gold-reference-data.json";

/**
 * `src/app/<folder>/` -> chunk; other folders and the app root go to runtime-app-core.
 * A group also takes the static dependencies of its modules that an earlier group
 * (in name order) has not taken, so catalog and combat hold their folders' closures
 * and core holds the rest of the application.
 */
const APPLICATION_FOLDER_CHUNKS = Object.freeze({
  library: "runtime-app-catalog",
  combat: "runtime-app-combat",
  world: "runtime-app-combat",
});

/** The entry points import the application composition dynamically; it is where the startup path begins. */
const STARTUP_ROOT = "/src/app/shell/composition.ts";

/**
 * One chunk for the small modules that several on-demand chunks share.
 * The bundler gives a group the static dependencies of its modules that no earlier group (in name order)
 * has taken, so the name must sort after every group the startup path loads (runtime-*, gameplay-*): a name
 * that sorts earlier takes their shared dependencies, and the startup path then loads this chunk.
 */
export const ON_DEMAND_SHARED_CHUNK = "shared-on-demand";

/**
 * A module this small (characters of its code) costs less to ship inside a chunk that its importers
 * already fetch than as a file of its own: a request has a fixed cost and the precache has an entry.
 */
export const SMALL_SHARED_MODULE_CHARS = 8192;

/**
 * True when every path from the application composition to the module crosses a dynamic import.
 * Such a module is fetched on demand, so no named group may pull it into a
 * chunk that the startup path loads (a group would merge it with static code).
 */
export function reachedOnlyDynamically(id, meta, memo = new Map()) {
  const known = memo.get(id);
  if (known !== undefined) return known;
  if (id.replaceAll("\\", "/").endsWith(STARTUP_ROOT)) return false;
  memo.set(id, false); // a cycle through static importers is not evidence of a dynamic-only path
  const info = meta.getModuleInfo(id);
  const dynamicOnly =
    info !== null &&
    !info.isEntry &&
    info.dynamicImporters.length + info.importers.length > 0 &&
    info.importers.every((importer) => reachedOnlyDynamically(importer, meta, memo));
  memo.set(id, dynamicOnly);
  return dynamicOnly;
}

/** The on-demand entries (modules that something imports dynamically) whose static imports reach the module. */
function onDemandEntries(id, meta, entries = new Set(), visited = new Set()) {
  if (visited.has(id)) return entries;
  visited.add(id);
  const info = meta.getModuleInfo(id);
  if (info === null) return entries;
  if (info.dynamicImporters.length > 0) entries.add(id);
  for (const importer of info.importers) onDemandEntries(importer, meta, entries, visited);
  return entries;
}

/**
 * The shared on-demand chunk for a small module that two or more on-demand chunks use; otherwise undefined,
 * which leaves the module with the one chunk that uses it, or in a chunk of its own when the shared module is large.
 * The module is reached only through dynamic imports, so it never joins a chunk the startup path loads.
 */
function sharedOnDemandChunk(id, meta) {
  const code = meta.getModuleInfo(id)?.code;
  if (typeof code !== "string" || code.length > SMALL_SHARED_MODULE_CHARS) return undefined;
  return onDemandEntries(id, meta).size >= 2 ? ON_DEMAND_SHARED_CHUNK : undefined;
}

/** Keep the async application composition below the release transfer budget. */
export function applicationChunk(id, meta) {
  const normalized = id.replaceAll("\\", "/");
  const source = normalized.indexOf("/src/");
  if (source < 0) return undefined;
  const relative = normalized.slice(source + "/src/".length);
  // The ~1.5 MB tutorial demonstration corpus has its own chunk, named here because the bundle budget, the
  // precache ignore list and the runtime cache all recognise it by that name. It is a leaf with no imports, so
  // naming it cannot merge it with startup code; this comes first so that being reached only dynamically (the
  // normal case) does not hand it the name of the module that imports it.
  if (relative === TUTORIAL_GOLD_DATA) return "tutorial-gold-reference";
  if (reachedOnlyDynamically(id, meta)) return sharedOnDemandChunk(id, meta);
  const topLevel = relative.split("/")[0] ?? "";
  if (topLevel === "app") return APPLICATION_FOLDER_CHUNKS[relative.split("/")[1] ?? ""] ?? "runtime-app-core";
  if (topLevel === "gameplay") {
    const area = relative.split("/").slice(1, 2)[0] ?? "core";
    return `gameplay-${area}`;
  }
  if (
    [
      "presentation",
      "audio",
      "ghost",
      "tearbench",
      "agents",
      "input",
      "persistence",
      "platform",
      "replay",
      "simulation",
      "diagnostics",
      "domain",
      "config",
    ].includes(topLevel)
  )
    return `runtime-${topLevel}`;
  return undefined;
}
