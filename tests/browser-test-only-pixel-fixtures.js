/* eslint-disable @typescript-eslint/no-require-imports -- direct Node browser fixture characterisation. */
/**
 * TEST-ONLY visual fixture characterisation.
 *
 * The debug harness below is intentionally used only to prepare canonical
 * screens.  It is never loaded by the Class-C production policy, and its
 * state is never passed to the image-only observer.  The observer receives
 * only the PNG screenshot returned by Playwright.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { withJourney } = require("./browser-journey-harness");
const { decodePng } = require("./class-c-png");

const outputDirectory = path.resolve(__dirname, "..", "artifacts", "tearbench", "c25", "test-only-pixel-fixtures");

function recordObservation(name, png, observation) {
  const compactRegions = observation.brightRegions.slice(0, 12).map((region) => ({
    x: Math.round(region.x), y: Math.round(region.y), width: Math.round(region.width), height: Math.round(region.height),
    density: Number(region.density.toFixed(4)), confidence: Number(region.confidence.toFixed(4)),
  }));
  return {
    name,
    kind: observation.kind,
    confidence: Number(observation.confidence.toFixed(4)),
    bands: {
      top: Number(observation.topBandDensity.toFixed(5)),
      centre: Number(observation.centreBandDensity.toFixed(5)),
      bottom: Number(observation.bottomBandDensity.toFixed(5)),
    },
    brightRegionCount: observation.brightRegions.length,
    regions: compactRegions,
    pngBytes: png.length,
  };
}

async function main() {
  const { createServer } = await import("vite");
  const observerServer = await createServer({ root: path.resolve(__dirname, ".."), server: { middlewareMode: true } });
  const { observePixels } = await observerServer.ssrLoadModule("/src/agents/pixel-observation.ts");
  const report = { format: "tear-test-only-pixel-fixtures", version: 1, testOnly: true, screens: [] };
  try {
    await withJourney({ name: "test-only pixel fixtures", port: 8165 }, async ({ page, waitScreen }) => {
      const capture = async (name) => {
        // Capture a completed render turn rather than an opening transition.
        // The production temporal observer similarly declines unstable frames.
        await page.waitForTimeout(300);
        const png = await page.screenshot({ type: "png" });
        const observation = observePixels(decodePng(png), { logicalWidth: 1600, logicalHeight: 900, maximumFrames: 4 });
        fs.mkdirSync(outputDirectory, { recursive: true });
        fs.writeFileSync(path.join(outputDirectory, `${name}.png`), png);
        report.screens.push(recordObservation(name, png, observation));
      };

      await capture("menu-initial");
      // This is a physical navigation sample, not a semantic screen read.
      // It characterises the adjacent visible setup layout so menu detection
      // cannot be broadened blindly to hide a regression.
      await page.mouse.click(260, 360);
      await waitScreen("setup");
      await capture("setup");
      await page.evaluate(() => window.__PANTHEON_TEST.openDraft({ expanded: true, rerolls: 2, reserve: true }));
      await waitScreen("draft");
      await capture("draft");
      await page.evaluate(() => window.__PANTHEON_TEST.openTerminal("gameover"));
      await waitScreen("gameover");
      await capture("gameover");
      await page.evaluate(() => window.__PANTHEON_TEST.openTerminal("win"));
      await waitScreen("win");
      await capture("win");
      await page.evaluate(() => window.__PANTHEON_TEST.openTerminal("gameover"));
      await waitScreen("gameover");
      await page.mouse.click(220, 409);
      await waitScreen("menu");
      await capture("menu-return");
    });
  } finally {
    fs.mkdirSync(outputDirectory, { recursive: true });
    fs.writeFileSync(path.join(outputDirectory, "characterisation.json"), `${JSON.stringify(report, null, 2)}\n`);
    await observerServer.close();
  }
  assert.equal(report.screens.length, 6, "test fixture capture did not reach every requested visible screen");
  assert.deepEqual(report.screens.map((screen) => [screen.name, screen.kind]), [
    ["menu-initial", "menu-like"],
    ["setup", "setup-like"],
    ["draft", "draft-like"],
    ["gameover", "terminal-like"],
    ["win", "terminal-like"],
    ["menu-return", "menu-like"],
  ], "test-only PNG fixtures no longer map to their generic visual layouts");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
