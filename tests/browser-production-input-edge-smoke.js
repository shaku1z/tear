/* eslint-disable @typescript-eslint/no-require-imports -- direct Node browser evidence script. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");
const { assertCleanProductionUrl, createClassCControls, serveProductionBuild, writeClassCArtifact } = require("./class-c-browser-harness");

function sampleDifference(left, right) {
  let changed = 0;
  for (let index = 0; index < Math.min(left.length, right.length); index += Math.max(1, Math.floor(left.length / 8192))) {
    if (left[index] !== right[index]) changed += 1;
  }
  return changed;
}

/**
 * This is deliberately engineering evidence, not a Class-C certification run.
 * It exercises real production keyboard and touch events without test globals,
 * but it does not establish hardware-controller availability, campaign success,
 * or the statistically meaningful Class-C distribution required by C25.
 */
async function main() {
  const root = path.resolve(__dirname, "..", "dist", "standalone");
  assert.ok(fs.existsSync(path.join(root, "index.html")), "dist/standalone is missing; run pnpm build first");
  const host = await serveProductionBuild(root);
  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const browser = await chromium.launch({ headless: true, ...(fs.existsSync(chromePath) ? { executablePath: chromePath } : {}) });
  const record = {
    format: "tear-c25-production-input-edge-engineering", version: 1,
    executionClass: "engineering", observationClass: "visible-frame-difference", certified: false,
    limitations: [
      "No virtual controller is represented as physical Class-C evidence.",
      "This checks production input recovery, not a full Normal campaign distribution.",
    ],
    target: "standalone", url: `${host.origin}/`, cases: [], browserErrors: [], result: "incomplete",
  };

  async function open(context, viewport, label) {
    const page = await context.newPage();
    page.on("pageerror", (error) => record.browserErrors.push(`${label}: ${error.stack || error.message}`));
    await page.route("**/*", (route) => route.request().url().startsWith(host.origin) ? route.continue() : route.abort());
    await page.goto(record.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    assertCleanProductionUrl(page.url());
    await page.waitForTimeout(900);
    return { page, controls: createClassCControls(page, viewport, { inputs: [], frames: [] }) };
  }

  try {
    const desktopViewport = { width: 1600, height: 900, dpr: 1 };
    const desktop = await browser.newContext({ viewport: desktopViewport, deviceScaleFactor: 1 });
    const { page, controls } = await open(desktop, desktopViewport, "keyboard-focus");
    const menu = await controls.screenshot("keyboard-main-menu");
    await controls.key("Enter", "down"); await controls.key("Enter", "up"); await controls.wait(650);
    const setup = await controls.screenshot("keyboard-enter-setup");
    assert.ok(sampleDifference(menu, setup) > 20, "physical Enter did not activate the shipped menu's focused action");

    // Opening a second browser tab causes a real browser focus transition. The
    // returned tab is then controlled only through a fresh physical keyboard edge.
    const background = await desktop.newPage();
    await background.goto("about:blank");
    await background.waitForTimeout(120);
    await page.bringToFront(); await controls.wait(120);
    await controls.key("ArrowDown", "down"); await controls.key("ArrowDown", "up"); await controls.wait(250);
    const recovered = await controls.screenshot("keyboard-after-focus-recovery");
    assert.ok(sampleDifference(setup, recovered) > 20, "keyboard focus recovery did not visibly accept a fresh directional input");
    record.cases.push({ name: "keyboard-focus-recovery", device: "physical-keyboard", frames: [menu.length, setup.length, recovered.length] });
    await background.close(); await desktop.close();

    const touchViewport = { width: 800, height: 360, dpr: 3, touch: true };
    const touch = await browser.newContext({ viewport: touchViewport, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
    const mobile = await open(touch, touchViewport, "touch-high-dpr-landscape");
    const touchMenu = await mobile.controls.screenshot("touch-high-dpr-main-menu");
    await mobile.controls.touch({ x: 260, y: 360 }, "start"); await mobile.controls.touch({ x: 260, y: 360 }, "end");
    await mobile.controls.wait(700);
    const touchSetup = await mobile.controls.screenshot("touch-high-dpr-setup");
    assert.ok(sampleDifference(touchMenu, touchSetup) > 20, "physical high-DPR touch tap did not activate the shipped menu affordance");
    record.cases.push({ name: "touch-high-dpr-landscape", device: "physical-touch", viewport: touchViewport, frames: [touchMenu.length, touchSetup.length] });
    await touch.close();

    // A portrait phone has a materially different responsive composition from
    // the landscape high-DPR surface above. The same logical player tap must
    // still reach the visible menu affordance after production coordinate
    // scaling, without relying on a DOM target or test runtime.
    const portraitViewport = { width: 390, height: 844, dpr: 3, touch: true };
    const portrait = await browser.newContext({ viewport: portraitViewport, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
    const portraitSession = await open(portrait, portraitViewport, "touch-high-dpr-portrait");
    const portraitMenu = await portraitSession.controls.screenshot("touch-high-dpr-portrait-main-menu");
    await portraitSession.controls.touch({ x: 260, y: 360 }, "start"); await portraitSession.controls.touch({ x: 260, y: 360 }, "end");
    await portraitSession.controls.wait(700);
    const portraitSetup = await portraitSession.controls.screenshot("touch-high-dpr-portrait-setup");
    assert.ok(sampleDifference(portraitMenu, portraitSetup) > 20, "physical portrait touch tap did not activate the responsive shipped menu affordance");
    record.cases.push({ name: "touch-high-dpr-portrait", device: "physical-touch", viewport: portraitViewport, frames: [portraitMenu.length, portraitSetup.length] });
    await portrait.close();

    // Browser accessibility preference is exercised at the real production
    // surface; the agent still receives only the rendered frame and sends a
    // normal keyboard edge.
    const reducedViewport = { width: 1600, height: 900, dpr: 1, reducedMotion: true };
    const reduced = await browser.newContext({ viewport: reducedViewport, deviceScaleFactor: 1, reducedMotion: "reduce" });
    const reducedSession = await open(reduced, reducedViewport, "reduced-motion");
    const reducedMenu = await reducedSession.controls.screenshot("reduced-motion-main-menu");
    await reducedSession.controls.key("Enter", "down"); await reducedSession.controls.key("Enter", "up"); await reducedSession.controls.wait(650);
    const reducedSetup = await reducedSession.controls.screenshot("reduced-motion-setup");
    assert.ok(sampleDifference(reducedMenu, reducedSetup) > 20, "reduced-motion production surface did not accept a physical focused menu action");
    record.cases.push({ name: "reduced-motion-menu", device: "physical-keyboard", viewport: reducedViewport, frames: [reducedMenu.length, reducedSetup.length] });
    await reduced.close();

    assert.deepEqual(record.browserErrors, [], `production input edge browser errors: ${record.browserErrors.join("\n")}`);
    record.result = "production-input-edge-coverage-passed";
  } finally {
    writeClassCArtifact("production-input-edge-engineering", record);
    await browser.close(); await host.close();
  }
  console.log("C25 production physical input edge coverage passed (engineering-only, non-certifying)");
}

main().catch((error) => { console.error(error); process.exit(1); });
