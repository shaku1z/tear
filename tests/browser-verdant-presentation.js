const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { withJourney } = require("./browser-journey-harness");
const { decodePng } = require("./class-c-png");

function paintedPixelRatio(png) {
  const { rgba } = decodePng(png);
  let sampled = 0;
  let painted = 0;
  for (let offset = 0; offset < rgba.length; offset += 4 * 97) {
    sampled += 1;
    if (Math.max(rgba[offset], rgba[offset + 1], rgba[offset + 2]) >= 64) painted += 1;
  }
  return painted / sampled;
}

const resolved = Object.freeze({
  document: Object.freeze({
    format: "tearsdl", schemaVersion: 1, id: "verdant-stage-wave-31-engineering",
    stateClass: "reconstructed-reachable", seed: "verdant-stage-wave-31",
    start: Object.freeze({ mode: "campaign", difficulty: "normal", weapon: "sword", stage: "verdant-sanctum", wave: 31 }),
    constraints: Object.freeze({ legalProgression: true }),
    tags: Object.freeze(["verdant-sanctum", "stage", "state-forge", "engineering-only", "non-publishable", "c9"]),
    maxTicks: 1_440,
  }),
  scenario: Object.freeze({
    format: "tear-contract", kind: "scenario", schemaVersion: 1, id: "verdant-stage-wave-31-engineering", version: 1,
    description: "Resolved TearSDL scenario verdant-stage-wave-31-engineering",
    stateClass: "reconstructed-reachable", executionClass: "engineering", seed: "verdant-stage-wave-31",
    start: Object.freeze({ mode: "campaign", difficulty: "normal", weapon: "sword", stage: "verdant-sanctum", wave: 31 }),
    maxTicks: 1_440,
    assertions: Object.freeze(["runtime.finite-state", "entity.unique-id", "entity.valid-owner", "player.valid-health", "world.legal-bounds", "boss.valid-phase", "runtime.no-softlock"]),
    tags: Object.freeze(["verdant-sanctum", "stage", "state-forge", "engineering-only", "non-publishable", "c9"]),
  }),
  structural: Object.freeze({ valid: true, issues: Object.freeze([]) }),
  reachability: Object.freeze({ reachable: true, reasons: Object.freeze([]) }),
  plausibility: Object.freeze({ plausible: true, provisional: false, reasons: Object.freeze([]) }),
  resolvedHash: "verdant-stage-wave-31-engineering",
});

withJourney({ name: "Verdant C9 presentation", port: 8298 }, async ({ page, buildInfo }) => {
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__, undefined, { timeout: 15_000 });
  const state = await page.evaluate((scenario) => {
    const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    window.__VERDANT_C9_ENVIRONMENT__ = environment;
    const launched = environment.forgeResolvedScenario(scenario);
    for (let index = 0; index < 12; index += 1) environment.renderFrame(1 / 60);
    const snapshot = environment.captureSnapshot("verdant-c9-browser");
    return {
      launched,
      run: snapshot.state["tear.run.v1"],
      hazard: snapshot.state["tear.hazard.v1"],
      bloom: environment.bloomWellPresentation({ highContrast: false, reducedMotion: false, lowGraphics: false }),
    };
  }, resolved);
  assert.equal(state.launched.ok, true, JSON.stringify(state.launched));
  assert.equal(state.run.wave, 31);
  assert.equal(state.run.stage, 3);
  assert.equal(state.hazard.stageId, "verdant-sanctum");
  assert.equal(state.bloom.length, 2);

  const directory = path.resolve(__dirname, "..", "artifacts", "tearbench", "checkpoints", "verdant-sanctum", "VS3-C9", "presentation");
  fs.mkdirSync(directory, { recursive: true });
  const viewports = [
    ["desktop-1600x900", 1_600, 900],
    ["laptop-2048x1024", 2_048, 1_024],
    ["hidpi-shape-1200x900", 1_200, 900],
    ["touch-landscape-896x414", 896, 414],
  ];
  const screenshots = [];
  for (const [label, width, height] of viewports) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => {
      const environment = window.__VERDANT_C9_ENVIRONMENT__;
      environment.renderFrame(1 / 60);
      environment.renderFrame(1 / 60);
      return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    const png = await page.screenshot({ path: path.join(directory, `${label}.png`) });
    const decoded = decodePng(png);
    const paintedRatio = paintedPixelRatio(png);
    assert.deepEqual([decoded.width, decoded.height], [width, height], `${label}: screenshot dimensions`);
    assert.ok(paintedRatio >= 0.6, `${label}: world presentation did not paint the viewport (${paintedRatio.toFixed(3)})`);
    screenshots.push({ label, width, height, file: `${label}.png`, paintedPixelRatio: Number(paintedRatio.toFixed(4)) });
  }
  await page.evaluate(() => window.__PANTHEON_TEST.setOptions({
    flash: 0, reducedMotion: true, highContrast: true, gfx: "low", masterMuted: true,
  }));
  const accessibility = await page.evaluate(() => window.__PANTHEON_TEST.state());
  assert.equal(accessibility.reducedMotion, true);
  assert.equal(accessibility.highContrast, true);
  assert.equal(accessibility.lowEffects, true);
  assert.equal(accessibility.settings.masterMuted, true);
  const accessibilityDirectory = path.resolve(__dirname, "..", "artifacts", "tearbench", "checkpoints",
    "verdant-sanctum", "VS3-C20", "accessibility");
  fs.mkdirSync(accessibilityDirectory, { recursive: true });
  const accessibilityScreenshots = [];
  for (const [label, width, height] of [
    ["desktop-1600x900", 1_600, 900], ["touch-landscape-896x414", 896, 414],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => {
      const environment = window.__VERDANT_C9_ENVIRONMENT__;
      environment.renderFrame(1 / 60);
      environment.renderFrame(1 / 60);
      return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    const file = `${label}-contrast-motion-low-audio-off.png`;
    const png = await page.screenshot({ path: path.join(accessibilityDirectory, file) });
    const decoded = decodePng(png), paintedRatio = paintedPixelRatio(png);
    assert.deepEqual([decoded.width, decoded.height], [width, height], `${label}: accessible screenshot dimensions`);
    assert.ok(paintedRatio >= 0.6, `${label}: accessible world presentation did not paint the viewport (${paintedRatio.toFixed(3)})`);
    accessibilityScreenshots.push({ label, width, height, file, paintedPixelRatio: Number(paintedRatio.toFixed(4)) });
  }
  fs.writeFileSync(path.join(accessibilityDirectory, "evidence.json"), `${JSON.stringify({
    format: "tear-verdant-c20-accessibility-evidence", schemaVersion: 1,
    engineeringOnly: true, certifying: false, build: buildInfo,
    profile: { highContrast: true, reducedMotion: true, lowGraphics: true, flashScale: 0, audioEnabled: false },
    stage: "verdant-sanctum", wave: 31, screenshots: accessibilityScreenshots,
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(directory, "evidence.json"), `${JSON.stringify({
    format: "tear-verdant-c9-browser-evidence", schemaVersion: 1,
    engineeringOnly: true, certifying: false, build: buildInfo,
    stage: "verdant-sanctum", wave: 31, bloomWells: state.bloom.length,
    screenshots,
  }, null, 2)}\n`);
  console.log(`Verdant C9 presentation passed at ${buildInfo.sha}`);
});
