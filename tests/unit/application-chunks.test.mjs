// The chunk rule of vite.config.ts (scripts/application-chunks.mjs): which chunk an application module joins.
// The module graph here is a small stand-in for the bundler's, so the rule is checked without a build.
import { describe, expect, it } from "vitest";
import {
  applicationChunk,
  ON_DEMAND_SHARED_CHUNK,
  reachedOnlyDynamically,
  SMALL_SHARED_MODULE_CHARS,
} from "../../scripts/application-chunks.mjs";

const ROOT = "/repo/src/app/shell/composition.ts";

/** modules: id -> { importers, dynamicImporters, code, isEntry } (missing fields default to none). */
function graph(modules) {
  return {
    getModuleInfo: (id) => {
      const module = modules[id];
      if (module === undefined) return null;
      return { isEntry: false, importers: [], dynamicImporters: [], code: "x", ...module };
    },
  };
}

const small = "x".repeat(SMALL_SHARED_MODULE_CHARS);
const large = "x".repeat(SMALL_SHARED_MODULE_CHARS + 1);
const lazyA = "/repo/src/presentation/lazy-a.ts";
const lazyB = "/repo/src/presentation/lazy-b.ts";
const shared = "/repo/src/presentation/shared-helper.ts";

/** Two on-demand chunks (each imported dynamically from the composition) that both import `shared`. */
function twoOnDemandChunks(sharedModule) {
  return graph({
    [ROOT]: {},
    [lazyA]: { dynamicImporters: [ROOT] },
    [lazyB]: { dynamicImporters: [ROOT] },
    [shared]: { importers: [lazyA, lazyB], ...sharedModule },
  });
}

describe("application chunk rule", () => {
  it("puts a small module shared by two on-demand chunks in the one named group", () => {
    expect(applicationChunk(shared, twoOnDemandChunks({ code: small }))).toBe(ON_DEMAND_SHARED_CHUNK);
  });

  it("leaves a large shared module to the bundler's default splitting", () => {
    expect(applicationChunk(shared, twoOnDemandChunks({ code: large }))).toBeUndefined();
  });

  it("leaves a module with no code available to default splitting, never to the group", () => {
    expect(applicationChunk(shared, twoOnDemandChunks({ code: null }))).toBeUndefined();
  });

  it("leaves a small module used by only one on-demand chunk with that chunk", () => {
    const meta = graph({
      [ROOT]: {},
      [lazyA]: { dynamicImporters: [ROOT] },
      [shared]: { importers: [lazyA], code: small },
    });
    expect(applicationChunk(shared, meta)).toBeUndefined();
  });

  it("counts on-demand chunks through intermediate static importers", () => {
    const middle = "/repo/src/presentation/middle.ts";
    const meta = graph({
      [ROOT]: {},
      [lazyA]: { dynamicImporters: [ROOT] },
      [lazyB]: { dynamicImporters: [ROOT] },
      [middle]: { importers: [lazyA, lazyB] },
      [shared]: { importers: [middle], code: small },
    });
    expect(applicationChunk(shared, meta)).toBe(ON_DEMAND_SHARED_CHUNK);
  });

  it("keeps a small shared module out of the group when it imports an on-demand module, directly or not", () => {
    // The replay engine is a deferred module; a small adapter that two on-demand chunks share imports it. In
    // the group, the adapter would bring the whole engine, so the engine's own fetch would hold nothing back.
    const engine = "/repo/src/app/world/detached/replay-composition.ts";
    const middle = "/repo/src/app/replay/middle.ts";
    const direct = graph({
      [ROOT]: {},
      [lazyA]: { dynamicImporters: [ROOT] },
      [lazyB]: { dynamicImporters: [ROOT] },
      [engine]: { dynamicImporters: [ROOT], importers: [shared], code: large },
      [shared]: { importers: [lazyA, lazyB], importedIds: [engine], code: small },
    });
    expect(applicationChunk(shared, direct)).toBeUndefined();
    const through = graph({
      [ROOT]: {},
      [lazyA]: { dynamicImporters: [ROOT] },
      [lazyB]: { dynamicImporters: [ROOT] },
      [engine]: { dynamicImporters: [ROOT], importers: [middle], code: large },
      [middle]: { importers: [shared], importedIds: [engine], code: large },
      [shared]: { importers: [lazyA, lazyB], importedIds: [middle], code: small },
    });
    expect(applicationChunk(shared, through)).toBeUndefined();
  });

  it("still groups a small shared module whose imports the startup path already loads", () => {
    const startup = "/repo/src/domain/records.ts";
    const meta = graph({
      [ROOT]: { importedIds: [startup] },
      [lazyA]: { dynamicImporters: [ROOT] },
      [lazyB]: { dynamicImporters: [ROOT] },
      [startup]: { importers: [ROOT, shared] },
      [shared]: { importers: [lazyA, lazyB], importedIds: [startup], code: small },
    });
    expect(applicationChunk(shared, meta)).toBe(ON_DEMAND_SHARED_CHUNK);
  });

  it("never gives the group a module the startup path loads", () => {
    const meta = graph({
      [ROOT]: {},
      [lazyA]: { dynamicImporters: [ROOT] },
      [lazyB]: { dynamicImporters: [ROOT] },
      [shared]: { importers: [ROOT, lazyA, lazyB], code: small },
    });
    expect(reachedOnlyDynamically(shared, meta)).toBe(false);
    expect(applicationChunk(shared, meta)).toBe("runtime-presentation");
  });

  it("names the group after every group the startup path loads, so it takes none of their dependencies", () => {
    const meta = graph({ [ROOT]: {} });
    const startupGroups = [
      "/repo/src/app/library/a.ts",
      "/repo/src/app/combat/a.ts",
      "/repo/src/app/shell/a.ts",
      "/repo/src/gameplay/training/a.ts",
      "/repo/src/gameplay/run/a.ts",
      "/repo/src/domain/a.ts",
      "/repo/src/input/a.ts",
      "/repo/src/presentation/a.ts",
    ].map((id) => applicationChunk(id, meta));
    expect(startupGroups.every((name) => typeof name === "string" && name < ON_DEMAND_SHARED_CHUNK)).toBe(true);
  });

  it("names the tutorial corpus chunk the budget, precache and runtime cache look for, even when only an on-demand module imports it", () => {
    const corpus = "/repo/src/gameplay/training/tutorial-gold-reference-data.json";
    const reader = "/repo/src/gameplay/training/tutorial-gold-corpus.ts";
    const meta = graph({
      [ROOT]: {},
      [reader]: { dynamicImporters: [ROOT] },
      [corpus]: { importers: [reader], code: large },
    });
    expect(reachedOnlyDynamically(corpus, meta)).toBe(true);
    expect(applicationChunk(corpus, meta)).toBe("tutorial-gold-reference");
  });

  it("folds a listed gameplay folder into another folder's chunk and gives the others their own", () => {
    const meta = graph({ [ROOT]: {} });
    expect(applicationChunk("/repo/src/gameplay/snapshot/state-codec.ts", meta)).toBe("gameplay-run");
    expect(applicationChunk("/repo/src/gameplay/combat/a.ts", meta)).toBe("gameplay-combat");
  });

  it("keeps the folder groups for startup modules and ignores modules outside src", () => {
    const meta = graph({ [ROOT]: {} });
    expect(applicationChunk(ROOT, meta)).toBe("runtime-app-core");
    expect(applicationChunk("/repo/node_modules/pkg/index.js", meta)).toBeUndefined();
  });
});
