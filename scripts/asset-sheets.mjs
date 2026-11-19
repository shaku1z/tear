// Reference images of everything the game draws, from the game's own drawing code: each picture as SVG
// (vector, any size) and PNG (1x and 3x), all with no background, plus a true-scale SVG sheet per asset.
//
//   pnpm assets:sheets                 draw what changed since the last run (everything, the first time)
//   pnpm assets:sheets --all           draw everything again
//   pnpm assets:sheets --only <prefix> draw scenes whose id starts with this (bosses, bosses/rootbound ...)
//   pnpm assets:sheets --watch         keep running and redraw what an edit changes
//   pnpm assets:sheets --list          list every scene and whether its pictures are up to date
//   pnpm assets:sheets --verify        draw the chosen scenes twice and fail if any byte differs
//   pnpm assets:sheets --out <dir>     write somewhere else (must be outside the repository)
//
// It serves the repository with Vite (no build needed), drives scripts/asset-sheets/page.html in headless
// Chrome and writes what the page draws. What is drawn: config/asset-manifest.json, read by
// scripts/asset-sheets/manifest.ts. See docs/ASSET_SHEETS.md.
/* global window */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createFingerprints } from "./asset-sheets/fingerprint.mjs";
import {
  assetSheet,
  checkFiles,
  FORMAT,
  indexHtml,
  loadIndex,
  mergeAssets,
  pictureFiles,
  writeFiles,
} from "./asset-sheets/output.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const flags = {
  all: args.includes("--all"),
  verify: args.includes("--verify"),
  watch: args.includes("--watch"),
  list: args.includes("--list"),
  only: option("--only"),
};

function git(...parameters) {
  const result = spawnSync("git", parameters, { cwd: repo, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${parameters.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}

/** Beside the main checkout, so every worktree writes to the same place and nothing lands in a repository. */
function defaultOut() {
  const common = path.resolve(repo, git("rev-parse", "--git-common-dir"));
  return path.join(path.dirname(path.dirname(common)), "asset-sheets");
}
const out = path.resolve(option("--out") ?? defaultOut());
const inside = path.relative(repo, out);
if (inside === "" || (!inside.startsWith("..") && !path.isAbsolute(inside)))
  throw new Error(`--out must be outside the repository (got ${out})`);

const require = createRequire(path.join(repo, "package.json"));
const { chromium } = require("@playwright/test");
const { createServer } = await import(pathToFileURL(path.join(repo, "node_modules/vite/dist/node/index.js")).href);
const fingerprints = createFingerprints(repo);

/**
 * Which scenes to draw, and the fingerprint each scene has now. A scene that photographed a stage object or
 * projectile last time also depends on the files that draw it.
 */
function ownedSources(catalogue, assets) {
  const byproduct = new Set(catalogue.categories.filter((entry) => entry.byproduct).map((entry) => entry.id));
  const owned = new Map();
  for (const asset of assets) {
    if (!byproduct.has(asset.category)) continue;
    const sources = catalogue.assets.find((entry) => entry.id === asset.id)?.sources ?? [];
    for (const state of asset.states) owned.set(state.scene, [...(owned.get(state.scene) ?? []), ...sources]);
  }
  return owned;
}

/** A scene's fingerprint: its drawing files, those of what it photographed from play, and what they import. */
function fingerprintOf(scene, owned) {
  return fingerprints.of([...new Set([...scene.sources, ...(owned.get(scene.id) ?? [])])], scene);
}

function plan(catalogue, previous) {
  const owned = ownedSources(catalogue, previous?.assets ?? []);
  return catalogue.scenes.map((scene) => {
    const { fingerprint, files } = fingerprintOf(scene, owned);
    const fresh = previous?.scenes?.[scene.id]?.fingerprint === fingerprint;
    const chosen = flags.only !== undefined ? scene.id.startsWith(flags.only) : flags.all || !fresh;
    return { scene, fingerprint, inputs: files.length, fresh, chosen };
  });
}

async function renderScenes(page, entries, taken) {
  const pictures = [];
  const empty = [];
  const failed = [];
  for (const { scene } of entries) {
    const started = Date.now();
    try {
      const result = await page.evaluate(
        ([id, keys]) => window.assetSheets.renderScene(id, keys),
        [scene.id, [...taken]],
      );
      for (const key of result.taken) taken.add(key);
      pictures.push(...result.pictures);
      empty.push(...result.empty.map((key) => `${key} (in ${scene.id})`));
      console.log(`${scene.id}: ${String(result.pictures.length)} pictures, ${String(Date.now() - started)} ms`);
    } catch (error) {
      // One scene that cannot run must not lose the rest; it is reported and fails the run at the end.
      const reason = String(error instanceof Error ? error.message : error).split(/\r?\n/u)[0];
      failed.push(`${scene.id} could not run: ${reason}`);
      console.error(`${scene.id}: FAILED, ${reason}`);
    }
  }
  return { pictures, empty, failed };
}

/**
 * What is missing. Every recorded scene has pictures; once every scene has run, every manifest asset has
 * pictures and every picture belongs to a manifest asset; a boss whose moves are data shows each of them.
 */
function checkComplete(catalogue, recorded, assets, wholeCatalogue) {
  const problems = [];
  const has = (id) => assets.some((asset) => asset.id === id && asset.states.length > 0);
  for (const scene of recorded) if (!has(scene.asset)) problems.push(`no picture of ${scene.id}`);
  if (wholeCatalogue) {
    for (const asset of catalogue.assets)
      if (!has(asset.id))
        problems.push(`${asset.id} (${asset.category} "${asset.subject}") never appeared in any scene`);
    for (const asset of assets)
      if (!catalogue.assets.some((entry) => entry.id === asset.id))
        problems.push(`${asset.id} was drawn but has no row in config/asset-manifest.json`);
  }
  for (const { asset, moves } of catalogue.bossMoves) {
    const states = (assets.find((entry) => entry.id === asset)?.states ?? []).map((state) => state.state);
    for (const move of moves)
      for (const phase of move.phases)
        if (recorded.some((scene) => scene.asset === asset && scene.setup.phase === phase))
          if (!states.some((state) => state.startsWith(`phase-${String(phase)}-`) && state.includes(move.id)))
            problems.push(`${asset} phase ${String(phase)} never used "${move.id}" in its scene`);
  }
  return problems;
}

/** One pass: plan, draw, merge with the last run, write. Returns whether everything is complete. */
async function runOnce(page, catalogue) {
  const { scenes } = catalogue;
  const assetById = new Map(catalogue.assets.map((asset) => [asset.id, asset]));
  const previous = flags.all ? null : loadIndex(out);
  if (previous === null && !flags.list) clearOut();
  const planned = plan(catalogue, previous);
  if (flags.list) {
    for (const entry of planned)
      console.log(`${entry.fresh ? "up to date" : "stale     "}  ${entry.scene.id}  (${String(entry.inputs)} files)`);
    return true;
  }
  const chosen = planned.filter((entry) => entry.chosen);
  if (chosen.length === 0) {
    console.log("Every picture is up to date. Use --all to draw everything again.");
    return true;
  }
  console.log(`Drawing ${String(chosen.length)} of ${String(scenes.length)} scenes.`);
  const drawnScenes = new Set(chosen.map((entry) => entry.scene.id));
  // Stage objects and projectiles already pictured by scenes that are kept are not taken again.
  const byproduct = new Set(catalogue.categories.filter((entry) => entry.byproduct).map((entry) => entry.id));
  const keptKeys = (previous?.assets ?? []).flatMap((asset) =>
    byproduct.has(asset.category)
      ? asset.states
          .filter((state) => !drawnScenes.has(state.scene))
          .map((state) => `${asset.category}/${asset.id}/${state.state}`)
      : [],
  );
  const rendered = await renderScenes(page, chosen, new Set(keptKeys));
  let identical = true;
  if (flags.verify) {
    await page.reload();
    await page.waitForFunction(() => window.assetSheets !== undefined, null, { timeout: 120_000 });
    const first = new Map(rendered.pictures.flatMap((picture) => [...pictureFiles(picture)]));
    const again = await renderScenes(page, chosen, new Set(keptKeys));
    const second = new Map(again.pictures.flatMap((picture) => [...pictureFiles(picture)]));
    const differing = [...new Set([...first.keys(), ...second.keys()])].filter(
      (file) => second.get(file)?.equals(first.get(file) ?? Buffer.alloc(0)) !== true,
    );
    identical = differing.length === 0;
    if (identical) console.log(`verify: ${String(first.size)} files identical across two runs`);
    else {
      console.error(`verify: ${String(differing.length)} of ${String(first.size)} files differ between two runs:`);
      for (const file of differing.slice(0, 40)) console.error(`  ${file}`);
    }
  }

  const describe = (picture) => ({
    name: assetById.get(picture.asset)?.name ?? picture.asset,
    subject: assetById.get(picture.asset)?.subject ?? "",
    sources: assetById.get(picture.asset)?.sources ?? [],
    sheet: `${picture.category}/${picture.asset}/sheet.svg`,
  });
  const { assets, stale, accepted } = mergeAssets({
    previous,
    pictures: rendered.pictures,
    drawnScenes,
    sceneOrder: new Map(scenes.map((scene, order) => [scene.id, order])),
    describe,
  });
  const files = new Map(accepted.flatMap((picture) => [...pictureFiles(picture)]));
  writeFiles(out, files, stale);

  // Sheets of every asset this run touched, then the overview of every category it touched.
  const touched = new Set(rendered.pictures.map((picture) => picture.asset));
  for (const asset of previous?.assets ?? [])
    if (asset.states.some((state) => drawnScenes.has(state.scene))) touched.add(asset.id);
  const sheets = new Map();
  for (const asset of assets)
    if (touched.has(asset.id)) sheets.set(asset.sheet, Buffer.from(assetSheet(out, asset), "utf8"));
  const categories = catalogue.categories.map(({ id, about }) => ({
    id,
    about,
    overview: `${id}/overview.png`,
    assets: assets.filter((asset) => asset.category === id).length,
    pictures: assets.filter((asset) => asset.category === id).reduce((sum, asset) => sum + asset.states.length, 0),
  }));
  const touchedCategories = new Set(assets.filter((asset) => touched.has(asset.id)).map((asset) => asset.category));
  for (const category of categories) {
    if (category.assets === 0) continue;
    if (!touchedCategories.has(category.id) && existsSync(path.join(out, category.overview))) continue;
    const cells = assets
      .filter((asset) => asset.category === category.id)
      .flatMap((asset) =>
        asset.states.map((state) => ({
          label: asset.id,
          sub: state.state,
          image: `data:image/png;base64,${(files.get(state.files.png) ?? readPng(state.files.png)).toString("base64")}`,
        })),
      );
    const sheet = await page.evaluate((list) => window.assetSheets.overviewSheet(list), cells);
    sheets.set(category.overview, Buffer.from(sheet.slice(sheet.indexOf(",") + 1), "base64"));
  }
  writeFiles(out, sheets, []);

  // Stage objects and projectiles are checked only when every scene has run at some point.
  const wholeCatalogue = scenes.every(
    (scene) => drawnScenes.has(scene.id) || previous?.scenes?.[scene.id] !== undefined,
  );
  const recorded = scenes.filter((scene) => drawnScenes.has(scene.id) || previous?.scenes?.[scene.id] !== undefined);
  const sizes = checkFiles(out, assets, (id) => assetById.get(id)?.budget ?? catalogue.budget, catalogue.budget);
  const missing = checkComplete(catalogue, recorded, assets, wholeCatalogue);
  const problems = [...rendered.failed, ...missing, ...sizes.problems];
  // A scene drawn now records its fingerprint; a kept scene keeps its record; a scene that failed or was never
  // drawn has none, so the next run draws it.
  const failedScenes = new Set(rendered.failed.map((line) => line.split(" ")[0]));
  // A drawn scene's fingerprint counts what it photographed this time, so the next run finds it fresh.
  const owned = ownedSources(catalogue, assets);
  const sceneRecords = {};
  for (const entry of planned) {
    const id = entry.scene.id;
    if (failedScenes.has(id)) continue;
    if (drawnScenes.has(id)) {
      const { fingerprint, files: inputs } = fingerprintOf(entry.scene, owned);
      sceneRecords[id] = { fingerprint, inputs: inputs.length };
    } else if (previous?.scenes?.[id] !== undefined) sceneRecords[id] = previous.scenes[id];
  }
  const index = {
    format: FORMAT,
    commit: git("rev-parse", "HEAD"),
    dirty: git("status", "--porcelain") !== "",
    manifest: "config/asset-manifest.json",
    view: { width: 1600, height: 900, ticksPerSecond: 120 },
    bytes: sizes.measured,
    files: {
      svg: "vector, any size; shadows and the additive blend are SVG equivalents (listed per picture)",
      png: "1x, one pixel per game unit, no background",
      png3x: "drawn at 3x, not enlarged, no background",
    },
    categories,
    assets,
    scenes: sceneRecords,
    notes: [
      "The game has no pickups (rewards are menu cards) and no icon set, so there are no sheets for them. The HUD is not covered.",
      "Bosses whose moves are not data (every boss but the Rootbound) show the states one fixed 40-second run per phase visited, not a proven complete list.",
      ...rendered.empty.map((key) => `Nothing was drawn for ${key}.`),
      ...problems.map((problem) => `PROBLEM: ${problem}`),
    ],
  };
  writeFileSync(path.join(out, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
  writeFileSync(path.join(out, "index.html"), indexHtml(index));
  const pictureCount = assets.reduce((sum, asset) => sum + asset.states.length, 0);
  console.log(`${String(rendered.pictures.length)} pictures drawn, ${String(pictureCount)} in all, in ${out}`);
  console.log(`bytes: ${JSON.stringify(sizes.measured)}`);
  for (const problem of problems) console.error(problem);
  return problems.length === 0 && identical;
}

/**
 * Empties the output folder before drawing everything, so no file from an older run or format is left behind.
 * Only a folder this tool wrote (it holds an index.json) or an empty one is cleared.
 */
function clearOut() {
  if (!existsSync(out)) return;
  const entries = readdirSync(out);
  if (entries.length === 0) return;
  if (!entries.includes("index.json"))
    throw new Error(
      `${out} is not empty and has no index.json, so it was not written by this tool; choose another --out`,
    );
  rmSync(out, { recursive: true, force: true });
}

function readPng(file) {
  return readFileSync(path.join(out, file));
}

// File watching only with --watch; otherwise an edit during a run must not change what the page loads.
const server = await createServer({
  root: repo,
  configFile: false,
  logLevel: "error",
  server: { port: 0, hmr: false, ...(flags.watch ? {} : { watch: null }) },
});
await server.listen();
const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
// Canvases are drawn on the CPU: Chrome otherwise moves large canvases between GPU and software drawing as
// memory fills during a long run, and the two anti-alias differently, so the same frame would not give the same bytes.
const browser = await chromium.launch({
  headless: true,
  args: ["--disable-gpu", "--disable-accelerated-2d-canvas"],
  ...(existsSync(chrome) ? { executablePath: chrome } : {}),
});
let ok;
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  page.on("pageerror", (error) => console.error("page error:", error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("404")) console.error("page console:", message.text());
  });
  const open = async () => {
    await page.goto(`http://localhost:${String(server.httpServer.address().port)}/scripts/asset-sheets/page.html`, {
      timeout: 180_000,
    });
    await page.waitForFunction(() => window.assetSheets !== undefined, null, { timeout: 120_000 });
    const catalogue = await page.evaluate(() => window.assetSheets.catalogue());
    if (catalogue.problems.length > 0)
      throw new Error(`config/asset-manifest.json has problems:\n  ${catalogue.problems.join("\n  ")}`);
    if (flags.only !== undefined && !catalogue.scenes.some((scene) => scene.id.startsWith(flags.only)))
      throw new Error(`--only ${flags.only} matches no scene`);
    return catalogue;
  };
  ok = await runOnce(page, await open());
  if (flags.watch) {
    console.log("Watching for changes (Ctrl+C to stop).");
    flags.all = false;
    flags.only = undefined;
    let timer;
    let running = Promise.resolve();
    server.watcher.on("all", (_event, file) => {
      const relative = path.relative(repo, file);
      if (!/^(?:src|scripts|config)[\\/]/u.test(relative)) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        running = running.then(async () => {
          fingerprints.forget();
          await runOnce(page, await open());
        });
      }, 400);
    });
    // Runs until stopped.
    await new Promise(() => undefined);
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(ok ? 0 : 1);
