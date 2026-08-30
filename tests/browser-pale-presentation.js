const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { withJourney } = require("./browser-journey-harness");
const { decodePng } = require("./class-c-png");

function paintedPixelRatio(png) {
  const { rgba } = decodePng(png);
  let sampled = 0, painted = 0;
  for (let offset = 0; offset < rgba.length; offset += 4 * 97) {
    sampled += 1;
    if (Math.max(rgba[offset], rgba[offset + 1], rgba[offset + 2]) >= 64) painted += 1;
  }
  return painted / sampled;
}

const resolved = Object.freeze({
  document: Object.freeze({
    format: "tearsdl", schemaVersion: 1, id: "pale-stage-wave-41-engineering",
    stateClass: "reconstructed-reachable", seed: "pale-stage-wave-41",
    start: Object.freeze({ mode: "playground", difficulty: "normal", weapon: "sword", stage: "pale-traverse", wave: 41 }),
    constraints: Object.freeze({ legalProgression: false,
      paleComposition: Object.freeze({ profile: "entry", localWave: 1, provisional: true }) }),
    tags: Object.freeze(["pale-traverse", "stage", "presentation", "state-forge", "engineering-only", "non-publishable", "pt3-c5"]),
    maxTicks: 1_440,
  }),
  scenario: Object.freeze({
    format: "tear-contract", kind: "scenario", schemaVersion: 1,
    id: "pale-stage-wave-41-engineering", version: 1,
    description: "Resolved TearSDL scenario pale-stage-wave-41-engineering",
    stateClass: "reconstructed-reachable", executionClass: "engineering", seed: "pale-stage-wave-41",
    start: Object.freeze({ mode: "playground", difficulty: "normal", weapon: "sword", stage: "pale-traverse", wave: 41 }),
    maxTicks: 1_440,
    assertions: Object.freeze(["runtime.finite-state", "entity.unique-id", "entity.valid-owner", "player.valid-health", "world.legal-bounds", "boss.valid-phase", "runtime.no-softlock"]),
    tags: Object.freeze(["pale-traverse", "stage", "presentation", "state-forge", "engineering-only", "non-publishable", "pt3-c5"]),
  }),
  structural: Object.freeze({ valid: true, issues: Object.freeze([]) }),
  reachability: Object.freeze({ reachable: true, reasons: Object.freeze([]) }),
  plausibility: Object.freeze({ plausible: true, provisional: false, reasons: Object.freeze([]) }),
  resolvedHash: "pale-stage-wave-41-engineering",
});

withJourney({ name: "Pale PT3-C5 presentation", port: 8355 }, async ({ page, buildInfo }) => {
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__, undefined, { timeout: 15_000 });
  const state = await page.evaluate((scenario) => {
    const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    window.__PALE_C5_ENVIRONMENT__ = environment;
    const launched = environment.forgeResolvedScenario(scenario);
    for (let index = 0; index < 12; index += 1) environment.renderFrame(1 / 60);
    const snapshot = environment.captureSnapshot("pale-c5-browser");
    return { launched, run: snapshot.state["tear.run.v1"], hazard: snapshot.state["tear.hazard.v1"] };
  }, resolved);
  assert.equal(state.launched.ok, true, JSON.stringify(state.launched));
  assert.equal(state.run.wave, 41);
  assert.equal(state.run.stage, 6);
  assert.equal(state.hazard.stageId, "pale-traverse");
  assert.deepEqual(state.hazard.fields.map((field) => [field.kind, field.direction]), [
    ["aurora-track", 1], ["aurora-track", -1], ["aurora-track", 1],
  ]);
  // The detached State Forge renderer is not the active input owner, so it
  // cannot acquire browser pointer lock. Suppress only the unrelated DOM hint;
  // the captured canvas remains the exact rendered gameplay frame.
  await page.evaluate(() => {
    const style = document.createElement("style");
    style.dataset.paleEvidenceCapture = "true";
    style.textContent = "#lockhint { display: none !important; }";
    document.head.append(style);
  });

  const directory = path.resolve(__dirname, "..", "artifacts", "tearbench", "checkpoints", "pale-traverse", "PT3-C5", "presentation");
  fs.mkdirSync(directory, { recursive: true });
  const captures = [];
  async function capture(label, width, height, profile) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => {
      window.__PALE_C5_ENVIRONMENT__.renderFrame(1 / 60);
      window.__PALE_C5_ENVIRONMENT__.renderFrame(1 / 60);
      return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    const file = `${label}.png`;
    const png = await page.screenshot({ path: path.join(directory, file) });
    const decoded = decodePng(png), ratio = paintedPixelRatio(png);
    assert.deepEqual([decoded.width, decoded.height], [width, height], `${label}: dimensions`);
    assert.ok(ratio >= 0.6, `${label}: presentation did not paint viewport (${ratio.toFixed(3)})`);
    captures.push({ label, width, height, file, profile, paintedPixelRatio: Number(ratio.toFixed(4)) });
  }

  for (const [label, width, height] of [
    ["desktop-1600x900", 1_600, 900],
    ["laptop-2048x1024", 2_048, 1_024],
    ["hidpi-shape-1200x900", 1_200, 900],
    ["touch-landscape-896x414", 896, 414],
  ]) await capture(label, width, height, "normal");

  await page.evaluate(() => window.__PANTHEON_TEST.setOptions({
    flash: 0, reducedMotion: true, highContrast: true, gfx: "low", masterMuted: true,
  }));
  const accessibility = await page.evaluate(() => window.__PANTHEON_TEST.state());
  assert.equal(accessibility.reducedMotion, true);
  assert.equal(accessibility.highContrast, true);
  assert.equal(accessibility.lowEffects, true);
  assert.equal(accessibility.settings.masterMuted, true);
  await capture("desktop-1600x900-accessible", 1_600, 900, "high-contrast-reduced-motion-low-graphics-audio-off");
  await capture("touch-landscape-896x414-accessible", 896, 414, "high-contrast-reduced-motion-low-graphics-audio-off");

  fs.writeFileSync(path.join(directory, "evidence.json"), `${JSON.stringify({
    format: "tear-pale-pt3-c5-browser-evidence", schemaVersion: 1,
    engineeringOnly: true, certifying: false, build: buildInfo,
    stage: "pale-traverse", wave: 41, auroraTracks: state.hazard.fields.length,
    accessibilityProfile: { highContrast: true, reducedMotion: true, lowGraphics: true, flashScale: 0, audioEnabled: false },
    captureOverlayPolicy: "detached-state-forge-pointer-lock-hint-suppressed",
    screenshots: captures,
  }, null, 2)}\n`);
  console.log(`Pale PT3-C5 presentation passed at ${buildInfo.sha}`);
}).catch((error) => { console.error(error); process.exit(1); });
