/**
 * Report-only runtime cost profile (refactor plan step 15).
 *
 * It measures where simulation and render cost goes in eight representative
 * scenes of a test build, as three separate passes so instrumentation never
 * contaminates the timing numbers:
 *
 * - timing: the test-build `PerformanceMonitor` windows (simulation/render per
 *   frame, one canonical tick) plus its test-only cost counters (authoritative
 *   snapshots and their cost, environment cleanup actor sets, ticks).
 * - counters: an init script counts Canvas text measurement, gradient/pattern
 *   creation, font and shadow assignments, `Object.freeze`, `structuredClone`
 *   and DOM writes (style properties, attributes, classes, text) while the
 *   window is open.
 * - allocation: Chrome's sampling heap profiler with objects collected by
 *   minor and major GC included, so the sum of sampled sizes estimates every
 *   byte allocated in the window rather than what survived it. Bytes are
 *   divided by frames and by canonical ticks. With a source-mapped build the
 *   samples are also attributed to source files.
 *
 * Each scene runs on a fresh page, and each pass repeats TEAR_PROFILE_REPEATS
 * times; the report keeps every run and the median, minimum and maximum.
 * Nothing here is a budget yet: see docs/PERFORMANCE_BUDGETS.md for the path
 * from these reported metrics to checked ceilings.
 */
const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const buildRoot = path.resolve(projectRoot, process.env.TEAR_PROFILE_BUILD || path.join("dist", "test-standalone"));
const port = Number(process.env.TEAR_PROFILE_PORT || 8197);
const baseUrl = `http://127.0.0.1:${String(port)}`;
const repeats = Number(process.env.TEAR_PROFILE_REPEATS || 3);
const windowMs = Number(process.env.TEAR_PROFILE_WINDOW_MS || 4000);
const warmupMs = Number(process.env.TEAR_PROFILE_WARMUP_MS || 1500);
const viewport = { width: 1600, height: 900 };
const output = path.resolve(projectRoot, process.env.TEAR_PROFILE_OUTPUT || "artifacts/tearbench/generated/runtime-cost-profile.json");
const recordCallSites = process.env.TEAR_PROFILE_CALLSITES === "1";
const rawProfileDirectory = process.env.TEAR_PROFILE_RAW_DIR ? path.resolve(process.env.TEAR_PROFILE_RAW_DIR) : null;
const PASSES = Object.freeze(["timing", "counters", "allocation"]);
const selectedPasses = (process.env.TEAR_PROFILE_PASSES || PASSES.join(",")).split(",");
assert.ok(Number.isSafeInteger(repeats) && repeats >= 1, "TEAR_PROFILE_REPEATS must be a positive integer");
assert.ok(selectedPasses.every((pass) => PASSES.includes(pass)), `TEAR_PROFILE_PASSES accepts ${PASSES.join(", ")}`);

function contentType(file) {
  if (file.endsWith(".js")) return "text/javascript";
  if (file.endsWith(".html")) return "text/html";
  if (file.endsWith(".css")) return "text/css";
  if (file.endsWith(".json") || file.endsWith(".webmanifest")) return "application/json";
  if (file.endsWith(".woff2")) return "font/woff2";
  return "application/octet-stream";
}

function staticServer() {
  return http.createServer((request, response) => {
    const pathname = new URL(request.url, baseUrl).pathname;
    const file = path.resolve(buildRoot, pathname === "/" ? "index.html" : pathname.slice(1));
    if (!file.startsWith(buildRoot) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader("Content-Type", contentType(file));
    fs.createReadStream(file).pipe(response);
  });
}

/**
 * Page init script for the counter pass. Counting is off until `start()` so setup work is excluded.
 * With `recordSites`, each counted call also records its calling frame (attribution only; it slows the page).
 */
function installCostCounters(recordSites) {
  const counts = Object.create(null);
  const sites = Object.create(null);
  let counting = false;
  const bump = (key) => {
    if (!counting) return;
    counts[key] = (counts[key] || 0) + 1;
    if (!recordSites) return;
    const caller = (new Error().stack || "").split(String.fromCharCode(10))[3] || "";
    const site = `${key} ${caller.trim()}`;
    sites[site] = (sites[site] || 0) + 1;
  };
  const wrapMethod = (owner, name, key) => {
    const original = owner[name];
    if (typeof original !== "function") return;
    owner[name] = function countedMethod(...args) { bump(key); return Reflect.apply(original, this, args); };
  };
  const wrapSetter = (owner, name, key) => {
    const descriptor = Object.getOwnPropertyDescriptor(owner, name);
    if (descriptor?.set === undefined || descriptor.configurable !== true) return;
    Object.defineProperty(owner, name, { ...descriptor, set(value) { bump(key); descriptor.set.call(this, value); } });
  };
  const canvas = CanvasRenderingContext2D.prototype;
  wrapMethod(canvas, "measureText", "measureText");
  for (const name of ["createLinearGradient", "createRadialGradient", "createConicGradient", "createPattern"]) wrapMethod(canvas, name, "gradients");
  wrapMethod(canvas, "fillText", "fillText");
  wrapSetter(canvas, "font", "fontAssignments");
  wrapSetter(canvas, "shadowBlur", "shadowBlurAssignments");
  wrapMethod(Object, "freeze", "objectFreeze");
  wrapMethod(globalThis, "structuredClone", "structuredClone");
  // Chromium exposes CSS properties as own accessors of each declaration, so count through a proxy on `element.style`.
  const styleAccessor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "style");
  const styleProxies = new WeakMap();
  Object.defineProperty(HTMLElement.prototype, "style", { ...styleAccessor, get() {
    const style = styleAccessor.get.call(this);
    if (!styleProxies.has(style)) styleProxies.set(style, new Proxy(style, {
      set(target, key, value) { bump("domWrites"); return Reflect.set(target, key, value); },
      get(target, key) { const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value; },
    }));
    return styleProxies.get(style);
  } });
  for (const name of ["setProperty", "removeProperty"]) wrapMethod(CSSStyleDeclaration.prototype, name, "domWrites");
  for (const name of ["setAttribute", "removeAttribute", "toggleAttribute"]) wrapMethod(Element.prototype, name, "domWrites");
  for (const name of ["add", "remove", "toggle", "replace"]) wrapMethod(DOMTokenList.prototype, name, "domWrites");
  for (const [owner, name] of [[Node.prototype, "textContent"], [Element.prototype, "className"], [Element.prototype, "innerHTML"],
    [HTMLElement.prototype, "innerText"], [HTMLElement.prototype, "hidden"]]) wrapSetter(owner, name, "domWrites");
  Object.defineProperty(window, "__TEAR_COST_COUNTERS__", { value: Object.freeze({
    start() {
      for (const key of Object.keys(counts)) Reflect.deleteProperty(counts, key);
      for (const key of Object.keys(sites)) Reflect.deleteProperty(sites, key);
      counting = true;
    },
    stop() { counting = false; return { ...counts, sites: { ...sites } }; },
  }) });
}

async function openPage(browser, pass) {
  const page = await browser.newPage({ viewport });
  if (pass === "counters") await page.addInitScript(installCostCounters, recordCallSites);
  const pageErrors = [];
  page.on("pageerror", (error) => { pageErrors.push(error.stack || error.message); });
  await page.route("**/*", (route) => (route.request().url().startsWith(`${baseUrl}/`) ? route.continue() : route.abort()));
  await page.goto(`${baseUrl}/index.html?test=1&bossdebug=1`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => window.__TEAR_DIAGNOSTICS__ && window.__PANTHEON_TEST);
  await page.keyboard.press("Shift");
  await page.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__.audio.snapshot().state === "running", undefined, { timeout: 20000 });
  await waitScreen(page, "menu");
  return { page, pageErrors };
}

const screen = (page) => page.evaluate(() => window.__PANTHEON_TEST.state().game);

async function waitScreen(page, expected, timeout = 15000) {
  await page.waitForFunction((value) => window.__PANTHEON_TEST.state().game === value, expected, { timeout });
}

async function waitEnemies(page, minimum, timeout = 20000) {
  await page.waitForFunction((count) => window.__PANTHEON_TEST.state().enemyCount >= count, minimum, { timeout });
}

async function startBossPhaseTwo(page, boss) {
  await page.evaluate((id) => window.__PANTHEON_TEST.startBoss(id, "normal"), boss);
  await page.waitForFunction((id) => window.TEAR_WEAPON_DEBUG?.().enemies
    .some((enemy) => enemy.bossId === id && enemy.spawnT <= 0 && enemy.introT === 0), boss, { timeout: 15000 });
  await page.evaluate(() => window.__PANTHEON_TEST.setBossHealthFraction(0.5));
  await page.waitForFunction((id) => window.TEAR_WEAPON_DEBUG?.().enemies.find((enemy) => enemy.bossId === id)?.phase === 2,
    boss, { timeout: 5000 });
}

/** Holds a direction, alternates it, and swings or throws on a fixed cadence, like the gate's active workload. */
async function driveCombat(page, durationMs) {
  const startedAt = Date.now();
  let direction = "d";
  let iteration = 0;
  await page.keyboard.down(direction);
  try {
    while (Date.now() - startedAt < durationMs) {
      await page.mouse.click(800, 450, iteration % 4 === 0 ? { button: "right" } : {});
      if (iteration > 0 && iteration % 12 === 0) {
        await page.keyboard.up(direction);
        direction = direction === "d" ? "a" : "d";
        await page.keyboard.down(direction);
      }
      await page.waitForTimeout(90);
      iteration += 1;
    }
  } finally {
    await page.keyboard.up(direction);
  }
}

async function idle(page, durationMs) {
  await page.waitForTimeout(durationMs);
}

/** Every scene composes its state through the shipped debug/test API, then is driven for the window. */
const SCENES = Object.freeze({
  "menu-attract": { screen: "menu", drive: idle, async setup() { /* the live attract scene runs behind the menu */ } },
  "adventure-wave-1": { screen: "playing", drive: driveCombat, async setup(page) {
    await page.evaluate(() => window.__PANTHEON_TEST.startMode("campaign", "normal"));
    // The chapter-one page waits for the player; skip it the way a player would.
    await page.waitForFunction(() => {
      if (window.__PANTHEON_TEST.state().cinema !== null) window.__PANTHEON_TEST.skip();
      return window.__PANTHEON_TEST.state().game === "playing" && window.__PANTHEON_TEST.state().enemyCount > 0;
    }, undefined, { timeout: 30000, polling: 250 });
  } },
  "endless-wave-9": { screen: "playing", drive: driveCombat, async setup(page) {
    await page.evaluate(() => window.__PANTHEON_TEST.startMode("endless", "normal"));
    await waitScreen(page, "playing");
    await page.evaluate(() => window.__PANTHEON_TEST.prepareWaveCompositionScenario(9));
    await waitEnemies(page, 6);
  } },
  "verdant-rootbinder": { screen: "playing", drive: driveCombat, async setup(page) {
    await startBossPhaseTwo(page, "rootbound");
    await page.evaluate(() => window.__PANTHEON_TEST.prepareVerdantPerformanceScenario());
    await page.waitForFunction(() => {
      const kinds = Object.keys(window.__PANTHEON_TEST.performanceEnvironmentSnapshot().kinds);
      return ["bloom-well:", "graft-anchor:", "root-link:"].every((prefix) => kinds.some((key) => key.startsWith(prefix)));
    }, undefined, { timeout: 10000 });
  } },
  "boss-phase-2": { screen: "playing", drive: driveCombat, async setup(page) {
    await startBossPhaseTwo(page, "white-hart");
    await page.evaluate(() => {
      window.__PANTHEON_TEST.preparePalePerformanceScenario();
      window.__PANTHEON_TEST.prepareWhiteHartAttack("ghost-tracks");
    });
  } },
  "tutorial-lesson": { screen: "playing", drive: driveCombat, async setup(page) {
    await page.evaluate(() => window.__PANTHEON_TEST.startMode("tutorial", "normal"));
    await page.waitForFunction(() => window.__PANTHEON_TEST.state().game === "playing" && window.__PANTHEON_TEST.tutorial().active === true,
      undefined, { timeout: 30000 });
  } },
  "shop-sheet": { screen: "shop", drive: idle, async setup(page) {
    // The hub arms pointer input only after the cursor settles on it, as the navigation journeys do.
    await page.mouse.move(260, 452);
    await page.waitForTimeout(300);
    await page.mouse.click(260, 452);
    await waitScreen(page, "shop");
  } },
  "draft-overlay": { screen: "draft", drive: idle, async setup(page) {
    await page.evaluate(() => window.__PANTHEON_TEST.openDraft());
    await waitScreen(page, "draft");
  } },
});
const selectedScenes = (process.env.TEAR_PROFILE_SCENES || Object.keys(SCENES).join(",")).split(",");
assert.ok(selectedScenes.every((scene) => scene in SCENES), `TEAR_PROFILE_SCENES accepts ${Object.keys(SCENES).join(", ")}`);

/** Minimal source-map reader: generated (line, column) -> source path, for attribution only. */
function loadSourceMap(file) {
  const mapFile = `${file}.map`;
  if (!fs.existsSync(mapFile)) return null;
  const map = JSON.parse(fs.readFileSync(mapFile, "utf8"));
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const lines = [];
  let source = 0, sourceLine = 0;
  for (const line of map.mappings.split(";")) {
    const segments = [];
    let column = 0;
    for (const segment of line.split(",")) {
      if (segment === "") continue;
      const values = [];
      let value = 0, shift = 0;
      for (const character of segment) {
        const digit = alphabet.indexOf(character);
        value += (digit & 31) << shift;
        if (digit & 32) { shift += 5; continue; }
        values.push(value & 1 ? -(value >>> 1) : value >>> 1);
        value = 0;
        shift = 0;
      }
      column += values[0];
      if (values.length > 1) {
        source += values[1];
        sourceLine += values[2];
      }
      segments.push([column, source, sourceLine]);
    }
    lines.push(segments);
  }
  return { sources: map.sources, lines };
}

const sourceMaps = new Map();
function sourceOf(url, lineNumber, columnNumber, withLine = false) {
  if (!url.startsWith(`${baseUrl}/`)) return "(browser)";
  const file = path.resolve(buildRoot, new URL(url).pathname.slice(1));
  if (!sourceMaps.has(file)) sourceMaps.set(file, loadSourceMap(file));
  const map = sourceMaps.get(file);
  if (map === null) return path.basename(file);
  let match;
  for (const segment of map.lines[lineNumber] || []) if (segment[0] <= columnNumber) match = segment;
  if (match === undefined) return path.basename(file);
  const source = map.sources[match[1]];
  const index = source.lastIndexOf("src/");
  const original = index >= 0 ? source.slice(index) : source.replace(/^(\.\.\/)+/u, "");
  return withLine ? `${original}:${String(match[2] + 1)}` : original;
}

/** Sums sampled bytes, total and per source file of the allocating frame. */
function summarizeAllocation(profile) {
  let total = 0;
  const bySource = new Map();
  const visit = (node) => {
    if (node.selfSize > 0) {
      total += node.selfSize;
      const frame = node.callFrame;
      const source = sourceOf(frame.url, frame.lineNumber, frame.columnNumber);
      bySource.set(source, (bySource.get(source) || 0) + node.selfSize);
    }
    for (const child of node.children) visit(child);
  };
  visit(profile.head);
  const top = [...bySource].sort((left, right) => right[1] - left[1]).slice(0, 15);
  return { totalBytes: total, topSources: Object.fromEntries(top) };
}

/** Maps recorded `kind at fn (url:line:col)` stack frames to source lines, per frame, most frequent first. */
function callSiteSummary(sites, frames) {
  const bySource = new Map();
  for (const [site, count] of Object.entries(sites || {})) {
    const match = /^(\S+) .*?(http:\/\/[^\s)]+):(\d+):(\d+)\)?$/u.exec(site);
    const key = match === null ? site : `${match[1]} ${sourceOf(match[2], Number(match[3]) - 1, Number(match[4]) - 1, true)}`;
    bySource.set(key, (bySource.get(key) || 0) + count);
  }
  const top = [...bySource].sort((left, right) => right[1] - left[1]).slice(0, 30);
  return Object.fromEntries(top.map(([key, count]) => [key, Number((count / Math.max(1, frames)).toFixed(2))]));
}

/** Self time per source file from a CPU profile, as a share of all sampled time (attribution only, not a timing metric). */
function summarizeCpu(profile) {
  const selfTime = new Map();
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  for (let index = 0; index < profile.samples.length; index += 1) {
    const frame = nodes.get(profile.samples[index]).callFrame;
    const source = frame.url === "" ? `(${frame.functionName || "program"})` : sourceOf(frame.url, frame.lineNumber, frame.columnNumber);
    selfTime.set(source, (selfTime.get(source) || 0) + (profile.timeDeltas[index] || 0));
  }
  const total = [...selfTime.values()].reduce((sum, value) => sum + value, 0);
  const top = [...selfTime].sort((left, right) => right[1] - left[1]).slice(0, 15);
  return Object.fromEntries(top.map(([source, micros]) => [source, Number((micros / total).toFixed(4))]));
}

async function measureScene(browser, sceneId, pass) {
  const scene = SCENES[sceneId];
  const { page, pageErrors } = await openPage(browser, pass);
  try {
    await scene.setup(page);
    await scene.drive(page, warmupMs);
    const startScreen = await screen(page);
    let heapSession = null;
    if (pass === "allocation") {
      heapSession = await page.context().newCDPSession(page);
      await heapSession.send("HeapProfiler.enable");
      await heapSession.send("HeapProfiler.collectGarbage");
      await heapSession.send("HeapProfiler.startSampling", { samplingInterval: 4096,
        includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
      await heapSession.send("Profiler.enable");
      await heapSession.send("Profiler.setSamplingInterval", { interval: 200 });
      await heapSession.send("Profiler.start");
    }
    await page.evaluate((counting) => {
      window.__TEAR_DIAGNOSTICS__.resetTimingSamples();
      window.__TEAR_DIAGNOSTICS__.resetCounters();
      if (counting) window.__TEAR_COST_COUNTERS__.start();
    }, pass === "counters");
    await scene.drive(page, windowMs);
    const browserCounters = await page.evaluate((counting) => (counting ? window.__TEAR_COST_COUNTERS__.stop() : {}), pass === "counters");
    const profile = heapSession === null ? undefined : (await heapSession.send("HeapProfiler.stopSampling")).profile;
    const cpu = heapSession === null ? undefined : (await heapSession.send("Profiler.stop")).profile;
    if (profile !== undefined && rawProfileDirectory !== null) {
      const stem = path.join(rawProfileDirectory, `${sceneId}-${String(Date.now())}`);
      fs.mkdirSync(rawProfileDirectory, { recursive: true });
      fs.writeFileSync(`${stem}.heapprofile`, JSON.stringify(profile));
      fs.writeFileSync(`${stem}.cpuprofile`, JSON.stringify(cpu));
    }
    const allocation = profile === undefined ? undefined : { ...summarizeAllocation(profile), cpuTopSources: summarizeCpu(cpu) };
    const diagnostics = await page.evaluate(() => window.__TEAR_DIAGNOSTICS__.snapshot());
    const endScreen = await screen(page);
    assert.deepEqual(pageErrors, [], `${sceneId} page errors`);
    assert.deepEqual([startScreen, endScreen], [scene.screen, scene.screen], `${sceneId} left its measured screen`);
    return measurement(sceneId, pass, startScreen, endScreen, diagnostics, browserCounters, allocation);
  } finally {
    await page.close();
  }
}

function measurement(sceneId, pass, startScreen, endScreen, diagnostics, browserCounters, allocation) {
  const frames = diagnostics.frame.samples;
  const counters = diagnostics.counters;
  const ticks = counters.ticks || 0;
  const perFrame = (value) => (frames > 0 ? value / frames : null);
  const perTick = (value) => (ticks > 0 ? value / ticks : null);
  const result = { scene: sceneId, pass, screens: [startScreen, endScreen], frames, ticks, gauges: diagnostics.gauges };
  if (pass === "timing") Object.assign(result, {
    simulationP50Ms: diagnostics.simulation.p50Ms, simulationP95Ms: diagnostics.simulation.p95Ms,
    renderP50Ms: diagnostics.render.p50Ms, renderP95Ms: diagnostics.render.p95Ms,
    canonicalTickP50Ms: diagnostics.canonicalTick.p50Ms, canonicalTickMeanMs: perTick(counters.canonicalTickMs || 0),
    snapshotsPerSecond: (counters.authoritativeSnapshots || 0) / (windowMs / 1000),
    snapshotMeanMs: counters.authoritativeSnapshots ? counters.authoritativeSnapshotMs / counters.authoritativeSnapshots : null,
    environmentCleanupSetsPerTick: perTick(counters.environmentCleanupSets || 0),
  });
  if (pass === "counters" && recordCallSites) result.callSitesPerFrame = callSiteSummary(browserCounters.sites, frames);
  if (pass === "counters") Object.assign(result, Object.fromEntries(
    ["measureText", "gradients", "fillText", "fontAssignments", "shadowBlurAssignments", "domWrites", "objectFreeze", "structuredClone"]
      .map((key) => [`${key}PerFrame`, perFrame(browserCounters[key] || 0)])));
  if (pass === "allocation") Object.assign(result, { allocatedBytesPerFrame: perFrame(allocation.totalBytes),
    allocatedBytesPerTick: perTick(allocation.totalBytes), allocationTopSources: allocation.topSources,
    cpuSelfShareTopSources: allocation.cpuTopSources });
  return result;
}

const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/** Median and range of every numeric metric across repeats. */
function aggregate(runs) {
  const metrics = {};
  for (const key of Object.keys(runs[0])) {
    const values = runs.map((run) => run[key]).filter((value) => typeof value === "number" && Number.isFinite(value));
    if (values.length === runs.length) metrics[key] = { median: median(values), min: Math.min(...values), max: Math.max(...values) };
  }
  return metrics;
}

(async () => {
  assert.ok(fs.existsSync(path.join(buildRoot, "index.html")), `${buildRoot} is missing; run pnpm build:test:standalone first`);
  const server = staticServer();
  await new Promise((resolve) => { server.listen(port, "127.0.0.1", resolve); });
  const browser = await chromium.launch({ headless: true,
    args: ["--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--enable-precise-memory-info"] });
  const report = { format: "tear-runtime-cost-profile.v1", capturedAt: new Date().toISOString(), build: buildRoot,
    browser: browser.version(), viewport, windowMs, warmupMs, repeats, scenes: {} };
  try {
    for (const sceneId of selectedScenes) {
      report.scenes[sceneId] = {};
      for (const pass of selectedPasses) {
        const runs = [];
        for (let repeat = 0; repeat < repeats; repeat += 1) runs.push(await measureScene(browser, sceneId, pass));
        report.scenes[sceneId][pass] = { runs, summary: aggregate(runs) };
        console.log(JSON.stringify({ scene: sceneId, pass, summary: report.scenes[sceneId][pass].summary }));
      }
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => { server.close(resolve); });
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`runtime cost profile written: ${output}`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
