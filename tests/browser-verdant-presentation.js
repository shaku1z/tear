const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { withJourney } = require("./browser-journey-harness");

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

  const directory = path.resolve(__dirname, "..", "artifacts", "tearbench", "verdant-c9");
  fs.mkdirSync(directory, { recursive: true });
  const viewports = [
    ["desktop-1600x900", 1_600, 900],
    ["laptop-2048x1024", 2_048, 1_024],
    ["hidpi-shape-1200x900", 1_200, 900],
    ["touch-landscape-896x414", 896, 414],
  ];
  for (const [label, width, height] of viewports) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: path.join(directory, `${label}.png`) });
  }
  fs.writeFileSync(path.join(directory, "evidence.json"), `${JSON.stringify({
    format: "tear-verdant-c9-browser-evidence", schemaVersion: 1,
    engineeringOnly: true, certifying: false, build: buildInfo,
    stage: "verdant-sanctum", wave: 31, bloomWells: state.bloom.length,
    screenshots: viewports.map(([label, width, height]) => ({ label, width, height, file: `${label}.png` })),
  }, null, 2)}\n`);
  console.log(`Verdant C9 presentation passed at ${buildInfo.sha}`);
});
