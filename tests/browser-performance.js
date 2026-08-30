const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const buildRoot = path.resolve(projectRoot, "dist", process.env.TEAR_BROWSER_BUILD_DIR || "test-standalone");
const budgets = JSON.parse(fs.readFileSync(path.resolve(projectRoot, "config", "browser-performance-budgets.json"), "utf8"));
const buildInfoPath = path.resolve(buildRoot, "build-info.json");
const buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, "utf8"));
assert.equal(buildInfo.format, "tear-build-info", "performance evidence requires an attributed Tear build");
assert.equal(buildInfo.schemaVersion, 1, "performance evidence requires the supported build-info schema");
assert.equal(buildInfo.target, "standalone", "performance evidence must exercise a standalone build");
assert.match(buildInfo.artifactHash, /^[a-f0-9]{64}$/u, "performance evidence requires the served artifact hash");
const port = Number(process.env.TEAR_PERF_PORT || 8126);
const baseUrl = `http://127.0.0.1:${port}`;
const selectedScenario = process.env.TEAR_PERF_SCENARIO || "all";

function installedStableChromePath() {
  const candidates = process.platform === "win32"
    ? ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"]
    : process.platform === "linux"
      ? ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"]
      : process.platform === "darwin"
        ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
        : [];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

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
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    const file = path.resolve(buildRoot, relative);
    if (!file.startsWith(buildRoot) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader("Content-Type", contentType(file));
    fs.createReadStream(file).pipe(response);
  });
}

async function openInstrumentedPage(browser, pageErrors) {
  const page = await browser.newPage({ viewport: budgets.referenceProfile.viewport });
  page.on("pageerror", (error) => pageErrors.push(error.stack || error.message));
  await page.route("**/*", (route) => {
    if (route.request().url().startsWith(`${baseUrl}/`)) route.continue();
    else route.abort();
  });
  await page.goto(`${baseUrl}/index.html?test=1&bossdebug=1`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => window.__TEAR_DIAGNOSTICS__ && window.__PANTHEON_TEST);
  // Programmatic debug starts can dispatch wave audio before the first combat
  // pointer input. Give every measured page the same user activation required
  // by production so audio initialization cannot race the workload setup.
  await page.keyboard.press("Shift");
  await page.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__.audio.snapshot().state === "running",
    undefined, { timeout: 20000 });
  return page;
}

async function diagnostics(page) {
  return page.evaluate(() => window.__TEAR_DIAGNOSTICS__.snapshot());
}

async function waitForGameState(page, state) {
  await page.waitForFunction((expected) => window.__PANTHEON_TEST.state().game === expected, state);
}

async function startPlayground(page) {
  await page.evaluate(() => window.__PANTHEON_TEST.startMode("playground"));
  await page.waitForFunction(() => {
    const runtime = window.__PANTHEON_TEST.state();
    const gauges = window.__TEAR_DIAGNOSTICS__.snapshot().gauges;
    return runtime.game === "playing" && runtime.enemyCount === 0
      && (gauges.enemies || 0) === 0 && (gauges.projectiles || 0) === 0;
  });
}

async function warmPlaygroundRuntime(page) {
  await spawnRepresentativeEnemies(page, 1);
  await startPlayground(page);
}

async function spawnRepresentativeEnemies(page, commandCount, onSample) {
  for (let attempt = 0; attempt < 12; attempt++) {
    await page.keyboard.press("KeyE");
    try {
      await page.waitForFunction(() => window.__PANTHEON_TEST.state().game === "pgmenu", undefined, { timeout: 500 });
      break;
    } catch (error) {
      if (error?.name !== "TimeoutError") throw error;
    }
  }
  assert.equal(await page.evaluate(() => window.__PANTHEON_TEST.state().game), "pgmenu",
    "performance fixture could not open the Playground build menu");
  await page.waitForLoadState("networkidle", { timeout: 10000 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  for (let index = 0; index < commandCount; index++) {
    const before = await page.evaluate(() => window.__PANTHEON_TEST.state().enemyCount);
    const column = index % 3, row = Math.floor(index / 3);
    await page.mouse.click(278 + column * 206, 229 + row * 52);
    await page.waitForFunction((count) => window.__PANTHEON_TEST.state().enemyCount > count, before, { timeout: 5000 });
    if (onSample) await onSample(await diagnostics(page));
  }
  await page.mouse.click(800, 780); // RESUME from the Playground build menu
  await waitForGameState(page, "playing");
}

function gauge(snapshot, name) {
  return snapshot.gauges[name] || 0;
}

function assertAtMost(actual, budget, label) {
  assert.ok(actual <= budget, `${label}: ${actual} exceeded budget ${budget}`);
}

async function exerciseCombat(page, durationMs, onSample, minimumSamples = 0, minimumCollectionRateFps = 10) {
  const startedAt = Date.now();
  const sampleCollectionBoundMs = Math.ceil(minimumSamples / minimumCollectionRateFps * 1000);
  const deadline = startedAt + Math.max(durationMs + 20_000, sampleCollectionBoundMs);
  let direction = "d";
  let frameSamples = 0;
  await page.keyboard.down(direction);
  let iteration = 0;
  try {
    while (Date.now() - startedAt < durationMs || frameSamples < minimumSamples) {
      assert.ok(Date.now() < deadline,
        `active combat produced ${frameSamples}/${minimumSamples} required frame samples before the bounded deadline`);
      if (iteration % 4 === 0) await page.mouse.click(800, 450, { button: "right" });
      else await page.mouse.click(800, 450);
      if (iteration > 0 && iteration % 12 === 0) {
        await page.keyboard.up(direction);
        direction = direction === "d" ? "a" : "d";
        await page.keyboard.down(direction);
      }
      await page.waitForTimeout(90);
      const snapshot = await diagnostics(page);
      frameSamples = snapshot.frame.samples;
      if (onSample) await onSample(snapshot);
      iteration++;
    }
  } finally {
    await page.keyboard.up(direction);
  }
  return frameSamples;
}

async function activeGameplayScenario(browser, pageErrors, scenario, label) {
  const page = await openInstrumentedPage(browser, pageErrors);
  if (scenario.cpuThrottleRate) {
    const session = await page.context().newCDPSession(page);
    await session.send("Emulation.setCPUThrottlingRate", { rate: scenario.cpuThrottleRate });
  }
  await startPlayground(page);
  await warmPlaygroundRuntime(page);
  const longTasksBefore = (await diagnostics(page)).longTasks;
  const peakGauges = { enemies: 0, projectiles: 0, effects: 0 };
  const samplePeak = (snapshot) => {
    for (const name of Object.keys(peakGauges)) peakGauges[name] = Math.max(peakGauges[name], gauge(snapshot, name));
  };
  await spawnRepresentativeEnemies(page, scenario.enemySpawnCommands, samplePeak);
  await page.evaluate(() => window.__TEAR_DIAGNOSTICS__.resetTimingSamples());
  const activeFrameSamples = await exerciseCombat(
    page,
    scenario.durationMs,
    samplePeak,
    scenario.minimumSamples,
    scenario.minimumCollectionRateFps,
  );
  const snapshot = await diagnostics(page);
  const result = {
    simulation: snapshot.simulation,
    render: snapshot.render,
    frame: snapshot.frame,
    newLongTasks: snapshot.longTasks - longTasksBefore,
    peakGauges,
  };
  assert.ok(activeFrameSamples >= scenario.minimumSamples,
    `${label} produced ${activeFrameSamples}/${scenario.minimumSamples} required active frame samples`);
  assertAtMost(snapshot.simulation.p95Ms, scenario.simulationP95Ms, `${label} simulation p95 ms`);
  assertAtMost(snapshot.render.p95Ms, scenario.renderP95Ms, `${label} render p95 ms`);
  assertAtMost(snapshot.frame.p95Ms, scenario.frameP95Ms, `${label} frame-work p95 ms`);
  assertAtMost(result.newLongTasks, scenario.newLongTasksMax, `${label} new >50 ms frames`);
  assert.ok(peakGauges.enemies > 0, `${label} did not exercise representative enemies`);
  await page.close();
  return result;
}

async function verdantGameplayScenario(browser, pageErrors) {
  const scenario = budgets.verdantGameplay;
  const page = await openInstrumentedPage(browser, pageErrors);
  await page.evaluate(() => window.__PANTHEON_TEST.startBoss("rootbound", "normal"));
  await page.waitForFunction(() => window.TEAR_WEAPON_DEBUG?.().enemies
    .some((enemy) => enemy.bossId === "rootbound" && enemy.spawnT <= 0 && enemy.introT === 0), undefined, { timeout: 10000 });
  await page.evaluate(() => window.__PANTHEON_TEST.setBossHealthFraction(0.5));
  await page.waitForFunction(() => window.TEAR_WEAPON_DEBUG?.().enemies
    .find((enemy) => enemy.bossId === "rootbound")?.phase === 2, undefined, { timeout: 5000 });
  await page.evaluate(() => {
    window.__PANTHEON_TEST.prepareVerdantPerformanceScenario();
    Object.defineProperty(window, "__VS3_PERFORMANCE_ENVIRONMENT__", {
      configurable: true,
      value: window.__TEAR_RUNTIME_ENVIRONMENT__.create("A"),
    });
  });
  const environmentSnapshot = () => page.evaluate(() => window.__VS3_PERFORMANCE_ENVIRONMENT__.environment().snapshot());
  await page.waitForFunction(() => {
    const snapshot = window.__VS3_PERFORMANCE_ENVIRONMENT__.environment().snapshot();
    return snapshot.fields.some((entry) => entry.kind === "bloom-well")
      && snapshot.combatObjects.some((entry) => entry.kind === "graft-anchor")
      && snapshot.combatObjects.some((entry) => entry.kind === "root-link");
  }, undefined, { timeout: 10000 });
  const longTasksBefore = (await diagnostics(page)).longTasks;
  const peakGauges = { enemies: 0, projectiles: 0, effects: 0, fields: 0, combatObjects: 0, routes: 0 };
  const peakEnvironmentKinds = {};
  const samplePeak = async () => {
    const [snapshot, environment] = await Promise.all([diagnostics(page), environmentSnapshot()]);
    peakGauges.enemies = Math.max(peakGauges.enemies, gauge(snapshot, "enemies"));
    peakGauges.projectiles = Math.max(peakGauges.projectiles, gauge(snapshot, "projectiles"));
    peakGauges.effects = Math.max(peakGauges.effects, gauge(snapshot, "effects"));
    peakGauges.fields = Math.max(peakGauges.fields, environment.fields.length);
    peakGauges.combatObjects = Math.max(peakGauges.combatObjects, environment.combatObjects.length);
    peakGauges.routes = Math.max(peakGauges.routes, environment.routes.length);
    for (const object of environment.combatObjects) {
      const key = `${object.kind}:${object.state}`;
      peakEnvironmentKinds[key] = Math.max(peakEnvironmentKinds[key] || 0,
        environment.combatObjects.filter((candidate) => `${candidate.kind}:${candidate.state}` === key).length);
    }
  };
  await page.evaluate(() => window.__TEAR_DIAGNOSTICS__.resetTimingSamples());
  const activeFrameSamples = await exerciseCombat(page, scenario.durationMs, samplePeak,
    scenario.minimumSamples, scenario.minimumCollectionRateFps);
  const snapshot = await diagnostics(page);
  await samplePeak();
  const result = { simulation: snapshot.simulation, render: snapshot.render, frame: snapshot.frame,
    newLongTasks: snapshot.longTasks - longTasksBefore, peakGauges, peakEnvironmentKinds };
  assert.ok(activeFrameSamples >= scenario.minimumSamples,
    `Verdant workload produced ${activeFrameSamples}/${scenario.minimumSamples} required active frame samples`);
  assertAtMost(snapshot.simulation.p95Ms, scenario.simulationP95Ms, "Verdant simulation p95 ms");
  assertAtMost(snapshot.render.p95Ms, scenario.renderP95Ms, "Verdant render p95 ms");
  assertAtMost(snapshot.frame.p95Ms, scenario.frameP95Ms, "Verdant frame-work p95 ms");
  assertAtMost(result.newLongTasks, scenario.newLongTasksMax, "Verdant new >50 ms frames");
  for (const [name, limit] of Object.entries(scenario.ceilings)) {
    assertAtMost(peakGauges[name], limit, `Verdant peak ${name} (${JSON.stringify(peakEnvironmentKinds)})`);
  }
  assert.ok(peakGauges.enemies >= 4, "Verdant workload did not retain Rootbound, Rootbinder, and ordinary enemies");
  assert.ok(peakGauges.fields > 0 && peakGauges.combatObjects >= 4,
    "Verdant workload did not exercise Bloom, Grafts, and Rootbinder relationships together");
  await page.evaluate(() => { delete window.__VS3_PERFORMANCE_ENVIRONMENT__; });
  await page.close();
  return result;
}

async function paleGameplayScenario(browser, pageErrors) {
  const scenario = budgets.paleGameplay;
  const page = await openInstrumentedPage(browser, pageErrors);
  await page.evaluate(() => window.__PANTHEON_TEST.startBoss("white-hart", "normal"));
  await page.waitForFunction(() => window.TEAR_WEAPON_DEBUG?.().enemies
    .some((enemy) => enemy.bossId === "white-hart" && enemy.spawnT <= 0 && enemy.introT === 0), undefined,
  { timeout: 10000 });
  await page.evaluate(() => window.__PANTHEON_TEST.setBossHealthFraction(0.5));
  await page.waitForFunction(() => window.TEAR_WEAPON_DEBUG?.().enemies
    .find((enemy) => enemy.bossId === "white-hart")?.phase === 2, undefined, { timeout: 5000 });
  await page.evaluate(() => {
    window.__PANTHEON_TEST.preparePalePerformanceScenario();
    window.__PANTHEON_TEST.prepareWhiteHartAttack("ghost-tracks");
    Object.defineProperty(window, "__PT3_PERFORMANCE_ENVIRONMENT__", {
      configurable: true,
      value: window.__TEAR_RUNTIME_ENVIRONMENT__.create("A"),
    });
  });
  const environmentSnapshot = () => page.evaluate(() => window.__PT3_PERFORMANCE_ENVIRONMENT__.environment().snapshot());
  try {
    await page.waitForFunction(() => {
      const snapshot = window.__PT3_PERFORMANCE_ENVIRONMENT__.environment().snapshot();
      return snapshot.fields.filter((entry) => entry.kind === "aurora-track").length >= 3
        && snapshot.routes.some((entry) => entry.kind === "ghost-track");
    }, undefined, { timeout: 10000 });
  } catch (error) {
    const snapshot = await environmentSnapshot();
    throw new Error(`Pale performance environment did not compose: ${JSON.stringify(snapshot)}`, { cause: error });
  }
  const roster = await page.evaluate(() => window.TEAR_WEAPON_DEBUG().enemies.map((enemy) => ({
    kind: enemy.kind, variant: enemy.variant, bossId: enemy.bossId,
  })));
  assert.equal(roster.filter((enemy) => enemy.kind === "rimehound").length, 2,
    "Pale workload did not compose both Rimehounds");
  assert.deepEqual(new Set(roster.map((enemy) => enemy.variant).filter(Boolean)), new Set([
    "rime-runner", "prism-seer", "snowfall-kite", "hailcaster", "glacier-guard",
  ]), "Pale workload did not compose all five native variants");
  assert.ok(roster.some((enemy) => enemy.bossId === "white-hart"), "Pale workload did not retain White Hart");

  const longTasksBefore = (await diagnostics(page)).longTasks;
  const peakGauges = { enemies: 0, projectiles: 0, effects: 0, fields: 0, combatObjects: 0, routes: 0 };
  const peakEnvironmentKinds = {};
  const samplePeak = async () => {
    const [snapshot, environment] = await Promise.all([diagnostics(page), environmentSnapshot()]);
    peakGauges.enemies = Math.max(peakGauges.enemies, gauge(snapshot, "enemies"));
    peakGauges.projectiles = Math.max(peakGauges.projectiles, gauge(snapshot, "projectiles"));
    peakGauges.effects = Math.max(peakGauges.effects, gauge(snapshot, "effects"));
    peakGauges.fields = Math.max(peakGauges.fields, environment.fields.length);
    peakGauges.combatObjects = Math.max(peakGauges.combatObjects, environment.combatObjects.length);
    peakGauges.routes = Math.max(peakGauges.routes, environment.routes.length);
    for (const entry of [...environment.fields, ...environment.combatObjects, ...environment.routes]) {
      const key = `${entry.kind}:${entry.state}`;
      peakEnvironmentKinds[key] = Math.max(peakEnvironmentKinds[key] || 0,
        [...environment.fields, ...environment.combatObjects, ...environment.routes]
          .filter((candidate) => `${candidate.kind}:${candidate.state}` === key).length);
    }
  };
  await samplePeak();
  await page.evaluate(() => window.__TEAR_DIAGNOSTICS__.resetTimingSamples());
  const activeFrameSamples = await exerciseCombat(page, scenario.durationMs, samplePeak,
    scenario.minimumSamples, scenario.minimumCollectionRateFps);
  const snapshot = await diagnostics(page);
  await samplePeak();
  const result = { simulation: snapshot.simulation, render: snapshot.render, frame: snapshot.frame,
    newLongTasks: snapshot.longTasks - longTasksBefore, peakGauges, peakEnvironmentKinds, roster };
  assert.ok(activeFrameSamples >= scenario.minimumSamples,
    `Pale workload produced ${activeFrameSamples}/${scenario.minimumSamples} required active frame samples`);
  assertAtMost(snapshot.simulation.p95Ms, scenario.simulationP95Ms, "Pale simulation p95 ms");
  assertAtMost(snapshot.render.p95Ms, scenario.renderP95Ms, "Pale render p95 ms");
  assertAtMost(snapshot.frame.p95Ms, scenario.frameP95Ms, "Pale frame-work p95 ms");
  assertAtMost(result.newLongTasks, scenario.newLongTasksMax, "Pale new >50 ms frames");
  for (const [name, limit] of Object.entries(scenario.ceilings)) {
    assertAtMost(peakGauges[name], limit, `Pale peak ${name} (${JSON.stringify(peakEnvironmentKinds)})`);
  }
  assert.equal(peakGauges.enemies, 8, "Pale workload did not retain its exact integrated roster");
  assert.ok(peakGauges.fields >= 3 && peakGauges.routes > 0,
    "Pale workload did not exercise Aurora and Ghost Tracks together");
  await page.evaluate(() => { delete window.__PT3_PERFORMANCE_ENVIRONMENT__; });
  await page.close();
  return result;
}

async function repeatedRunScenario(browser, pageErrors) {
  const page = await openInstrumentedPage(browser, pageErrors);
  const session = await page.context().newCDPSession(page);
  await session.send("HeapProfiler.enable");
  const cycles = [];
  for (let cycle = 0; cycle < budgets.runCycles.count; cycle++) {
    await startPlayground(page);
    const resetSnapshot = await diagnostics(page);
    const reset = {};
    for (const [name, limit] of Object.entries(budgets.runCycles.resetGauges)) {
      reset[name] = gauge(resetSnapshot, name);
      assertAtMost(reset[name], limit, `cycle ${cycle + 1} reset ${name}`);
    }
    const peak = { enemies: 0, projectiles: 0, effects: 0 };
    const samplePeak = (snapshot) => {
      for (const name of Object.keys(peak)) peak[name] = Math.max(peak[name], gauge(snapshot, name));
    };
    await spawnRepresentativeEnemies(page, budgets.runCycles.enemySpawnCommands, samplePeak);
    await exerciseCombat(page, budgets.runCycles.activeDurationMs, samplePeak);
    for (const [name, limit] of Object.entries(budgets.runCycles.peakGauges)) {
      assertAtMost(peak[name], limit, `cycle ${cycle + 1} peak ${name}`);
    }
    await page.keyboard.press("p");
    await waitForGameState(page, "paused");
    await page.mouse.click(300, 430);
    await waitForGameState(page, "confirmquit");
    await page.keyboard.press("Enter");
    await waitForGameState(page, "menu");
    await session.send("HeapProfiler.collectGarbage");
    const heap = await session.send("Runtime.getHeapUsage");
    cycles.push({ cycle: cycle + 1, reset, peak, afterQuit: (await diagnostics(page)).gauges, heapUsedBytes: heap.usedSize });
  }
  const heapGrowth = Math.max(0, cycles.at(-1).heapUsedBytes - cycles[0].heapUsedBytes);
  assertAtMost(heapGrowth, budgets.runCycles.maxHeapGrowthBytes, "five-cycle retained JavaScript heap growth");
  await page.close();
  return { heapGrowthBytes: heapGrowth, cycles };
}

(async () => {
  assert.ok(fs.existsSync(path.resolve(buildRoot, "index.html")), "dist/standalone is missing; run pnpm build:standalone first");
  const server = staticServer();
  let browser;
  try {
    await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
    const chromePath = installedStableChromePath();
    browser = await chromium.launch({
      headless: budgets.referenceProfile.headless,
      args: ["--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--enable-precise-memory-info"],
      ...(chromePath ? { executablePath: chromePath } : {}),
    });
    const pageErrors = [];
    assert.ok(["all", "active", "constrained", "verdant", "pale", "cycles"].includes(selectedScenario),
      `unknown TEAR_PERF_SCENARIO: ${selectedScenario}`);
    const activeGameplay = selectedScenario === "all" || selectedScenario === "active"
      ? await activeGameplayScenario(browser, pageErrors, budgets.activeGameplay, "desktop gameplay")
      : undefined;
    const constrainedGameplay = selectedScenario === "all" || selectedScenario === "constrained"
      ? await activeGameplayScenario(browser, pageErrors, budgets.constrainedGameplay, "4x constrained gameplay")
      : undefined;
    const verdantGameplay = selectedScenario === "all" || selectedScenario === "verdant"
      ? await verdantGameplayScenario(browser, pageErrors)
      : undefined;
    const paleGameplay = selectedScenario === "all" || selectedScenario === "pale"
      ? await paleGameplayScenario(browser, pageErrors)
      : undefined;
    const runCycles = selectedScenario === "all" || selectedScenario === "cycles"
      ? await repeatedRunScenario(browser, pageErrors)
      : undefined;
    assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join("\n")}`);
    const report = { capturedAt: new Date().toISOString(), referenceProfile: budgets.referenceProfile,
      build: buildInfo,
      browserRuntime: { version: browser.version(), executable: chromePath || "playwright-bundled-chromium" },
      ...(activeGameplay && { activeGameplay }), ...(constrainedGameplay && { constrainedGameplay }),
      ...(verdantGameplay && { verdantGameplay }), ...(paleGameplay && { paleGameplay }),
      ...(runCycles && { runCycles }) };
    const output = path.resolve(projectRoot, process.env.TEAR_PERF_OUTPUT
      || "artifacts/tearbench/generated/browser-performance.json");
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    console.log(`browser performance regression passed; report: ${output}`);
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
