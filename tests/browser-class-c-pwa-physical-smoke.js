/* eslint-disable @typescript-eslint/no-require-imports -- direct Node browser evidence script. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");
const { assertCleanProductionUrl, createClassCControls, serveProductionBuild, writeClassCArtifact } = require("./class-c-browser-harness");
const { decodePng } = require("./class-c-png");

function sampledDifference(left, right) {
  let changed = 0;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += Math.max(1, Math.floor(length / 8192))) if (left[index] !== right[index]) changed += 1;
  return changed;
}

/**
 * This is a clean-PWA engineering journey: no test URL, globals, DOM state,
 * or service-worker inspection is exposed to the policy.  Offline reload and
 * screenshot continuity are observable browser behavior, not Class-C success.
 */
async function main() {
  const { createServer } = await import("vite");
  const observerServer = await createServer({ root: path.resolve(__dirname, ".."), server: { middlewareMode: true } });
  const { TearPixelTemporalTracker } = await observerServer.ssrLoadModule("/src/agents/pixel-observation.ts");
  const { TearClassCVisualPolicy } = await observerServer.ssrLoadModule("/src/agents/black-box-policy.ts");
  const root = path.resolve(__dirname, "..", "dist", "standalone");
  assert.ok(fs.existsSync(path.join(root, "sw.js")), "standalone PWA service worker is missing; run pnpm build first");
  const host = await serveProductionBuild(root);
  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const browser = await chromium.launch({ headless: true, ...(fs.existsSync(chromePath) ? { executablePath: chromePath } : {}) });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1, serviceWorkers: "allow" });
  const page = await context.newPage();
  const record = {
    format: "tear-class-c-pwa-physical-smoke", version: 1,
    executionClass: "engineering", observationClass: "pixel-only", certified: false,
    limitations: ["Offline browser continuity is engineering evidence, not a Class-C Normal Adventure completion."],
    target: "standalone-pwa", url: `${host.origin}/`, viewport: { width: 1600, height: 900, dpr: 1 },
    inputs: [], frames: [], browserErrors: [], result: "incomplete",
  };
  page.on("pageerror", (error) => record.browserErrors.push(error.stack || error.message));
  await page.route("**/*", (route) => route.request().url().startsWith(host.origin) ? route.continue() : route.abort());
  try {
    await page.goto(record.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    assertCleanProductionUrl(page.url());
    const controls = createClassCControls(page, record.viewport, record);
    // The service worker registration is intentionally not inspected.  Give
    // normal production registration time before the browser goes offline.
    await controls.wait(1_500);
    const online = await controls.screenshot("pwa-online-main-menu");
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
    assertCleanProductionUrl(page.url());
    await controls.wait(600);
    const offline = await controls.screenshot("pwa-offline-main-menu");
    assert.ok(offline.length > 1_000, "clean standalone PWA did not render after an offline reload");
    const perception = new TearPixelTemporalTracker({ logicalWidth: 1600, logicalHeight: 900 });
    const policy = new TearClassCVisualPolicy();
    const decision = policy.decide(perception.observe(decodePng(offline)));
    for (const intent of decision.intents) {
      if (intent.type === "key") await controls.key(intent.code, intent.phase);
      else if (intent.type === "pointer") await controls.pointer({ x: intent.x, y: intent.y }, intent.phase === "move" ? "move" : intent.phase, intent.button === 0 ? "left" : intent.button === 1 ? "middle" : "right");
      else throw new Error("keyboard/mouse PWA policy unexpectedly emitted touch");
    }
    await controls.wait(650);
    const setup = await controls.screenshot("pwa-offline-setup");
    assert.ok(sampledDifference(offline, setup) > 20, "physical pixel-guided input did not activate the offline production PWA menu");
    record.onlineFrameChangedAfterOfflineReload = sampledDifference(online, offline) > 0;
    record.result = "offline-production-pwa-physical-journey";
    assert.deepEqual(record.browserErrors, [], `PWA Class-C browser errors: ${record.browserErrors.join("\n")}`);
  } finally {
    writeClassCArtifact("pwa-physical-smoke", record);
    await context.close(); await browser.close(); await host.close(); await observerServer.close();
  }
  console.log("C25 clean-production PWA offline physical smoke passed (engineering-only, non-certifying)");
}

main().catch((error) => { console.error(error); process.exit(1); });
