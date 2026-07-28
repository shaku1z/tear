/* eslint-disable @typescript-eslint/no-require-imports -- direct Node browser evidence script. */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");
const { assertCleanProductionUrl, createClassCControls, serveProductionBuild, writeClassCArtifact } = require("./class-c-browser-harness");
const { decodePng } = require("./class-c-png");

function frameDifference(left, right) {
  const length = Math.min(left.length, right.length);
  let changed = 0;
  for (let index = 0; index < length; index += Math.max(1, Math.floor(length / 8192))) if (left[index] !== right[index]) changed += 1;
  return changed;
}

async function main() {
  const { createServer } = await import("vite");
  const observerServer = await createServer({ root: path.resolve(__dirname, ".."), server: { middlewareMode: true } });
  const { TearPixelTemporalTracker } = await observerServer.ssrLoadModule("/src/agents/pixel-observation.ts");
  const { TearClassCVisualPolicy } = await observerServer.ssrLoadModule("/src/agents/black-box-policy.ts");
  const { createTearObservationSession } = await observerServer.ssrLoadModule("/src/tearbench/observation-channels.ts");
  const root = path.resolve(__dirname, "..", "dist", "standalone");
  assert.ok(fs.existsSync(path.join(root, "index.html")), "dist/standalone is missing; run pnpm build first");
  const host = await serveProductionBuild(root);
  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const browser = await chromium.launch({ headless: true, ...(fs.existsSync(chromePath) ? { executablePath: chromePath } : {}) });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const record = {
    format: "tear-class-c-production-smoke", version: 1,
    executionClass: "black-box", observationClass: "pixel-only", certified: false,
    target: "standalone", url: `${host.origin}/`, viewport: { width: 1600, height: 900, dpr: 1 },
    inputs: [], frames: [], browserErrors: [], result: "incomplete",
  };
  page.on("pageerror", (error) => record.browserErrors.push(error.stack || error.message));
  await page.route("**/*", (route) => route.request().url().startsWith(host.origin) ? route.continue() : route.abort());
  try {
    await page.goto(record.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    assertCleanProductionUrl(page.url());
    const controls = createClassCControls(page, record.viewport, record);
    const perception = new TearPixelTemporalTracker({ logicalWidth: 1600, logicalHeight: 900, maximumFrames: 4 });
    const policy = new TearClassCVisualPolicy();
    // This ledger is part of the evidence: screenshot pixels are the sole
    // observation channel available to the external Class-C policy process.
    const observations = createTearObservationSession({
      executionClass: "black-box", observationClass: "pixel-only",
      enabled: { pixel: true, "semantic-ui": false, "structured-state": false, events: false },
    });
    let observationTick = 0;
    const observe = async (name) => {
      const png = await controls.screenshot(name);
      observations.read("pixel", observationTick, `screenshot:${name}`);
      observationTick += 1;
      const result = perception.observe(decodePng(png));
      record.pixelObservations ??= [];
      record.pixelObservations.push({
        name, kind: result.observation.kind, confidence: result.observation.confidence,
        frameDifference: result.frameDifference, stable: result.stable, occluded: result.occluded,
        topBandDensity: result.observation.topBandDensity,
        centreBandDensity: result.observation.centreBandDensity,
        bottomBandDensity: result.observation.bottomBandDensity,
        brightRegionCount: result.observation.brightRegions.length,
      });
      return { png, result };
    };
    const enact = async (intents) => {
      for (const intent of intents) {
        if (intent.type === "key") await controls.key(intent.code, intent.phase);
        else await controls.pointer({ x: intent.x, y: intent.y }, intent.phase === "move" ? "move" : intent.phase, intent.button === 0 ? "left" : intent.button === 1 ? "middle" : "right");
      }
    };
    await controls.wait(1_000);
    const { png: menu, result: menuObservation } = await observe("main-menu");
    assert.ok(menu.length > 1_000, "pixel-only agent did not receive a rendered production frame");
    await enact(policy.decide(menuObservation).intents);
    await controls.wait(600);
    const { png: setup } = await observe("setup");
    assert.ok(frameDifference(menu, setup) > 20, "physical menu activation did not visibly change the shipped frame");
    for (let index = 0; index < 4; index += 1) {
      const { result } = await observe(`setup-${String(index)}`);
      await enact(policy.decide(result).intents); await controls.wait(100);
    }
    await controls.wait(1_200);
    const { png: playing, result: playingObservation } = await observe("playing");
    assert.ok(frameDifference(setup, playing) > 20, "physical setup controls did not visibly enter a run");
    await enact(policy.decide(playingObservation).intents);
    await controls.wait(700);
    const { png: active } = await observe("physical-play");
    assert.ok(frameDifference(playing, active) > 20, "physical keyboard/mouse play did not visibly advance the frame");
    await controls.key("Escape", "down"); await controls.key("Escape", "up"); await controls.wait(450);
    const { png: paused } = await observe("physical-pause");
    assert.ok(frameDifference(active, paused) > 20, "physical pause did not visibly enter the shipped pause surface");
    await controls.key("Escape", "down"); await controls.key("Escape", "up"); await controls.wait(450);
    const { png: resumed } = await observe("physical-resume");
    assert.ok(frameDifference(paused, resumed) > 20, "physical pause resume did not visibly restore the shipped play surface");
    await controls.key("KeyD", "up");
    record.observationLedger = observations.records();
    assert.ok(record.observationLedger.every((entry) => entry.channel === "pixel"), "Class-C smoke observed a non-pixel channel");
    record.result = "partial-production-physical-journey";
    record.buildDigest = crypto.createHash("sha256").update(fs.readFileSync(path.join(root, "index.html"))).digest("hex");
    assert.deepEqual(record.browserErrors, [], `production Class-C smoke browser errors: ${record.browserErrors.join("\n")}`);
  } finally {
    writeClassCArtifact("production-physical-smoke", record);
    await context.close(); await browser.close(); await host.close(); await observerServer.close();
  }
  console.log("C25 clean-production pixel/physical smoke passed (non-certifying partial journey)");
}

main().catch((error) => { console.error(error); process.exit(1); });
