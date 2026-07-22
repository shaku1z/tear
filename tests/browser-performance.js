const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const buildRoot = path.resolve(projectRoot, "dist", "standalone");
const budgets = JSON.parse(fs.readFileSync(path.resolve(projectRoot, "config", "browser-performance-budgets.json"), "utf8"));
const port = Number(process.env.TEAR_PERF_PORT || 8126);
const baseUrl = `http://127.0.0.1:${port}`;
const selectedScenario = process.env.TEAR_PERF_SCENARIO || "all";

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

async function spawnRepresentativeEnemies(page, commandCount, onSample) {
  for (let index = 1; index <= commandCount; index++) {
    const key = String(index);
    await page.keyboard.down(key);
    await page.waitForTimeout(40);
    await page.keyboard.up(key);
    await page.waitForTimeout(35);
    if (onSample) await onSample(await diagnostics(page));
  }
}

function gauge(snapshot, name) {
  return snapshot.gauges[name] || 0;
}

function assertAtMost(actual, budget, label) {
  assert.ok(actual <= budget, `${label}: ${actual} exceeded budget ${budget}`);
}

async function exerciseCombat(page, durationMs, onSample) {
  const startedAt = Date.now();
  let direction = "d";
  await page.keyboard.down(direction);
  let iteration = 0;
  try {
    while (Date.now() - startedAt < durationMs) {
      if (iteration % 4 === 0) await page.mouse.click(800, 450, { button: "right" });
      else await page.mouse.click(800, 450);
      if (iteration > 0 && iteration % 12 === 0) {
        await page.keyboard.up(direction);
        direction = direction === "d" ? "a" : "d";
        await page.keyboard.down(direction);
      }
      await page.waitForTimeout(90);
      if (onSample) await onSample(await diagnostics(page));
      iteration++;
    }
  } finally {
    await page.keyboard.up(direction);
  }
}

async function activeGameplayScenario(browser, pageErrors, scenario, label) {
  const page = await openInstrumentedPage(browser, pageErrors);
  if (scenario.cpuThrottleRate) {
    const session = await page.context().newCDPSession(page);
    await session.send("Emulation.setCPUThrottlingRate", { rate: scenario.cpuThrottleRate });
  }
  await startPlayground(page);
  const longTasksBefore = (await diagnostics(page)).longTasks;
  const peakGauges = { enemies: 0, projectiles: 0, effects: 0 };
  const samplePeak = (snapshot) => {
    for (const name of Object.keys(peakGauges)) peakGauges[name] = Math.max(peakGauges[name], gauge(snapshot, name));
  };
  await spawnRepresentativeEnemies(page, scenario.enemySpawnCommands, samplePeak);
  await exerciseCombat(page, scenario.durationMs, samplePeak);
  const snapshot = await diagnostics(page);
  const result = {
    simulation: snapshot.simulation,
    render: snapshot.render,
    frame: snapshot.frame,
    newLongTasks: snapshot.longTasks - longTasksBefore,
    peakGauges,
  };
  assert.ok(snapshot.frame.samples >= scenario.minimumSamples,
    `${label} produced ${snapshot.frame.samples}/${scenario.minimumSamples} required frame samples`);
  assertAtMost(snapshot.simulation.p95Ms, scenario.simulationP95Ms, `${label} simulation p95 ms`);
  assertAtMost(snapshot.render.p95Ms, scenario.renderP95Ms, `${label} render p95 ms`);
  assertAtMost(snapshot.frame.p95Ms, scenario.frameP95Ms, `${label} frame-work p95 ms`);
  assertAtMost(result.newLongTasks, scenario.newLongTasksMax, `${label} new >50 ms frames`);
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
    const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
    browser = await chromium.launch({
      headless: budgets.referenceProfile.headless,
      args: ["--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--enable-precise-memory-info"],
      ...(fs.existsSync(chromePath) ? { executablePath: chromePath } : {}),
    });
    const pageErrors = [];
    assert.ok(["all", "active", "constrained", "cycles"].includes(selectedScenario),
      `unknown TEAR_PERF_SCENARIO: ${selectedScenario}`);
    const activeGameplay = selectedScenario === "all" || selectedScenario === "active"
      ? await activeGameplayScenario(browser, pageErrors, budgets.activeGameplay, "desktop gameplay")
      : undefined;
    const constrainedGameplay = selectedScenario === "all" || selectedScenario === "constrained"
      ? await activeGameplayScenario(browser, pageErrors, budgets.constrainedGameplay, "4x constrained gameplay")
      : undefined;
    const runCycles = selectedScenario === "all" || selectedScenario === "cycles"
      ? await repeatedRunScenario(browser, pageErrors)
      : undefined;
    assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join("\n")}`);
    const report = { capturedAt: new Date().toISOString(), referenceProfile: budgets.referenceProfile,
      ...(activeGameplay && { activeGameplay }), ...(constrainedGameplay && { constrainedGameplay }), ...(runCycles && { runCycles }) };
    const output = path.resolve(projectRoot, "test-results", "browser-performance.json");
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
