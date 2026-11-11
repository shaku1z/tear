import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { verifyReleaseArtifact } from "./release-artifact.mjs";

const root = resolve(import.meta.dirname, "..");
/** Worker bundles are fetched only when their feature starts a worker. */
const WORKER_CHUNK = /-worker-[\w-]+\.js$/u;
/** The tutorial demonstration corpus is fetched only by training preflight (and a lazy worker copy). */
const TUTORIAL_GOLD_CHUNK = /^(?:tutorial-gold-reference|worker-tutorial-gold)-[\w-]+\.js$/u;

const localPath = (url) => url.replace(/^(?:\.\/|\/)/u, "");

/** Sizes of one built target directory: JS chunk classes, startup scripts, and the PWA precache. */
export async function measureBundleTarget(directory) {
  const assets = join(directory, "assets");
  const names = (await readdir(assets)).filter((file) => file.endsWith(".js"));
  const chunks = await Promise.all(names.map(async (file) => {
    const contents = await readFile(join(assets, file));
    return { file, bytes: contents.byteLength, gzipBytes: gzipSync(contents).byteLength };
  }));
  const largest = (items) => items.sort((left, right) => right.gzipBytes - left.gzipBytes)[0];
  const html = await readFile(join(directory, "index.html"), "utf8");
  const startupFiles = [...new Set([
    ...[...html.matchAll(/<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"/gu)].map((match) => localPath(match[1])),
    ...[...html.matchAll(/<link\b[^>]*\brel="modulepreload"[^>]*\bhref="([^"]+)"/gu)].map((match) => localPath(match[1])),
  ])];
  const startupBytes = (await Promise.all(startupFiles.map(async (file) => (await stat(join(directory, file))).size)))
    .reduce((total, bytes) => total + bytes, 0);
  let precache;
  const serviceWorker = join(directory, "sw.js");
  if (existsSync(serviceWorker)) {
    const urls = [...(await readFile(serviceWorker, "utf8")).matchAll(/\{url:"([^"]+)",revision:/gu)].map((match) => localPath(match[1]));
    const sizes = await Promise.all(urls.map(async (url) => existsSync(join(directory, url)) ? (await stat(join(directory, url))).size : 0));
    precache = { urls, entries: urls.length, bytes: sizes.reduce((total, bytes) => total + bytes, 0) };
  }
  return {
    main: largest(chunks.filter((chunk) => !WORKER_CHUNK.test(chunk.file) && !TUTORIAL_GOLD_CHUNK.test(chunk.file))),
    worker: largest(chunks.filter((chunk) => WORKER_CHUNK.test(chunk.file))),
    tutorialGold: largest(chunks.filter((chunk) => /^tutorial-gold-reference-/u.test(chunk.file))),
    startup: { files: startupFiles, bytes: startupBytes },
    ...(precache === undefined ? {} : { precache }),
  };
}

/** Pure budget decisions for one target's measurements; each result is [label, ok, detail]. */
export function evaluateBundleBudgets(label, measured, budgets, { pwa }) {
  const gzip = (name, chunk, budget) => [`${label} ${name}`, chunk !== undefined && chunk.gzipBytes <= budget,
    `${String(chunk?.gzipBytes ?? "missing")}/${String(budget)} gzip bytes (${chunk?.file ?? "none"})`];
  const startupGold = measured.startup.files.filter((file) => TUTORIAL_GOLD_CHUNK.test(file.split("/").at(-1) ?? ""));
  const results = [
    gzip("main", measured.main, budgets.mainGzipBytes),
    gzip("largest worker", measured.worker, budgets.workerGzipBytes),
    gzip("on-demand tutorial corpus", measured.tutorialGold, budgets.tutorialGoldGzipBytes),
    [`${label} startup scripts`, measured.startup.bytes <= budgets.startupScriptBytes && startupGold.length === 0,
      `${String(measured.startup.bytes)}/${String(budgets.startupScriptBytes)} bytes in ${String(measured.startup.files.length)} entry/modulepreload files${startupGold.length === 0 ? "" : `; preloads on-demand ${startupGold.join(", ")}`}`],
  ];
  if (pwa) {
    const precache = measured.precache;
    const precachedGold = precache?.urls.filter((url) => TUTORIAL_GOLD_CHUNK.test(url.split("/").at(-1) ?? "")) ?? [];
    results.push([`${label} precache`, precache !== undefined && precache.entries <= budgets.precacheEntries
      && precache.bytes <= budgets.precacheBytes && precachedGold.length === 0,
    precache === undefined ? "sw.js missing" : `${String(precache.entries)}/${String(budgets.precacheEntries)} entries, ${String(precache.bytes)}/${String(budgets.precacheBytes)} bytes${precachedGold.length === 0 ? "" : `; precaches on-demand ${precachedGold.join(", ")}`}`]);
  }
  return results;
}

async function staticGzip(vendor, file) {
  return gzipSync(await readFile(resolve(root, "public", "vendor", vendor, file))).byteLength;
}

async function main() {
  const budgets = JSON.parse(await readFile(resolve(root, "config/bundle-budgets.json"), "utf8"));
  const results = [];
  for (const target of ["standalone", "crazygames"]) {
    const directory = resolve(root, "dist", target), info = JSON.parse(await readFile(resolve(directory, "build-info.json"), "utf8"));
    await verifyReleaseArtifact({ directory, expectedRepository: info.repository, expectedSha: info.sha,
      expectedTarget: target, expectedMode: target, sourceDirectory: root, allowDirty: true });
    results.push(...evaluateBundleBudgets(target === "standalone" ? "standalone" : "CrazyGames", await measureBundleTarget(directory), {
      ...budgets, mainGzipBytes: target === "standalone" ? budgets.standaloneMainGzipBytes : budgets.crazygamesMainGzipBytes,
    }, { pwa: target === "standalone" }));
  }
  for (const [label, vendor, file, budget] of [
    ["TearScore", "tear-score", "tear-score.esm.js", budgets.tearScoreGzipBytes],
    ["Adaptive Soundtrack", "tear-music", "adaptive-soundtrack.esm.js", budgets.adaptiveSoundtrackGzipBytes],
    ["Tone host", "tear-score", "tone-host-14.9.17.esm.js", budgets.toneGzipBytes],
    ["Adaptive Soundtrack Tone host", "tear-music", "tone-host-14.9.17.esm.js", budgets.toneGzipBytes],
  ]) {
    const bytes = await staticGzip(vendor, file);
    results.push([label, bytes <= budget, `${String(bytes)}/${String(budget)} gzip bytes (${file})`]);
  }
  let failed = false;
  for (const [label, ok, detail] of results) {
    console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${detail}`);
    failed ||= !ok;
  }
  if (failed) process.exitCode = 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
