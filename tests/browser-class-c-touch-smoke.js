/* eslint-disable @typescript-eslint/no-require-imports -- direct Node browser evidence script. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");
const { assertCleanProductionUrl, createClassCControls, serveProductionBuild, writeClassCArtifact } = require("./class-c-browser-harness");
const { decodePng } = require("./class-c-png");

function sampleDifference(left, right) {
  let changed = 0;
  for (let index = 0; index < Math.min(left.length, right.length); index += Math.max(1, Math.floor(left.length / 8192))) if (left[index] !== right[index]) changed += 1;
  return changed;
}

async function main() {
  const { createServer } = await import("vite");
  const observerServer = await createServer({ root: path.resolve(__dirname, ".."), server: { middlewareMode: true } });
  const { TearPixelTemporalTracker } = await observerServer.ssrLoadModule("/src/agents/pixel-observation.ts");
  const { TearClassCVisualPolicy } = await observerServer.ssrLoadModule("/src/agents/black-box-policy.ts");
  const root = path.resolve(__dirname, "..", "dist", "standalone");
  assert.ok(fs.existsSync(path.join(root, "index.html")), "dist/standalone is missing; run pnpm build first");
  const host = await serveProductionBuild(root);
  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const browser = await chromium.launch({ headless: true, ...(fs.existsSync(chromePath) ? { executablePath: chromePath } : {}) });
  const context = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const record = {
    format: "tear-class-c-touch-smoke", version: 1, executionClass: "black-box", observationClass: "pixel-only", certified: false,
    target: "standalone", url: `${host.origin}/`, viewport: { width: 960, height: 540, dpr: 1, touch: true }, inputs: [], frames: [], browserErrors: [], result: "incomplete",
  };
  page.on("pageerror", (error) => record.browserErrors.push(error.stack || error.message));
  await page.route("**/*", (route) => route.request().url().startsWith(host.origin) ? route.continue() : route.abort());
  try {
    await page.goto(record.url, { waitUntil: "domcontentloaded", timeout: 30_000 }); assertCleanProductionUrl(page.url());
    const controls = createClassCControls(page, record.viewport, record);
    await controls.wait(1_000);
    const menu = await controls.screenshot("touch-main-menu");
    const perception = new TearPixelTemporalTracker({ logicalWidth: 1600, logicalHeight: 900 });
    const policy = new TearClassCVisualPolicy("touch");
    const decision = policy.decide(perception.observe(decodePng(menu)));
    assert.ok(decision.intents.every((intent) => intent.device === "touch"), "touch policy emitted a non-touch gesture");
    for (const intent of decision.intents) await controls.touch({ x: intent.x, y: intent.y }, intent.phase, intent.identifier);
    await controls.wait(700);
    const setup = await controls.screenshot("touch-setup");
    assert.ok(sampleDifference(menu, setup) > 20, "touch gesture did not visibly activate the shipped menu affordance");
    assert.deepEqual(record.browserErrors, [], `production Class-C touch smoke browser errors: ${record.browserErrors.join("\n")}`);
    record.result = "partial-production-touch-journey";
  } finally {
    writeClassCArtifact("production-touch-smoke", record);
    await context.close(); await browser.close(); await host.close(); await observerServer.close();
  }
  console.log("C25 clean-production pixel/touch smoke passed (non-certifying partial journey)");
}

main().catch((error) => { console.error(error); process.exit(1); });
