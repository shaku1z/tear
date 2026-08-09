const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");

const resolved = Object.freeze({
  document: Object.freeze({
    format: "tearsdl", schemaVersion: 1, id: "c40.source-phase-two-void",
    stateClass: "reconstructed-reachable", seed: "c40-source-void",
    start: Object.freeze({ mode: "bossonly", difficulty: "normal", weapon: "sword", boss: "source" }),
    state: Object.freeze({ boss: Object.freeze({ hp: 4100 }) }),
    constraints: Object.freeze({ legalProgression: true }), tags: Object.freeze(["c40", "state-forge", "source", "void"]), maxTicks: 720,
  }),
  scenario: Object.freeze({
    format: "tear-contract", kind: "scenario", schemaVersion: 1, id: "c40.source-phase-two-void", version: 1,
    description: "Source phase-two State Forge cinematic handoff", stateClass: "reconstructed-reachable", executionClass: "engineering",
    seed: "c40-source-void", start: Object.freeze({ mode: "bossonly", difficulty: "normal", weapon: "sword", wave: 1, boss: "source" }),
    maxTicks: 720, assertions: Object.freeze(["runtime.finite-state", "boss.valid-phase"]), tags: Object.freeze(["c40", "state-forge", "source", "void"]),
  }),
  structural: Object.freeze({ valid: true, issues: Object.freeze([]) }),
  reachability: Object.freeze({ reachable: true, reasons: Object.freeze([]) }),
  plausibility: Object.freeze({ plausible: true, provisional: false, reasons: Object.freeze([]) }),
  resolvedHash: "c40-source-phase-two-void",
});

withJourney({ name: "C40 State Forge Source void", port: 8291 }, async ({ page }) => {
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__, undefined, { timeout: 15_000 });
  const result = await page.evaluate((scenario) => {
    const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    const launched = environment.forgeResolvedScenario(scenario);
    if (!launched.ok) return { launched };
    let collapseFrame;
    for (let index = 0; index < 120; index += 1) {
      collapseFrame = environment.advanceApplicationFrame(1 / 60);
      const boss = environment.captureSnapshot(`c40-source-intro-${String(index)}`).state["tear.boss.v1"]
        .find((entry) => entry.factoryId === "source");
      if (boss?.mode === "collapse") break;
    }
    const collapse = environment.captureSnapshot("c40-source-collapse");
    const advances = [];
    for (let index = 0; index < 6; index += 1) {
      advances.push(environment.advanceStateForgeCinematicBeat());
      environment.advanceApplicationFrame(1 / 60);
    }
    for (let index = 0; index < 90; index += 1) environment.advanceApplicationFrame(1 / 60);
    const voidSnapshot = environment.captureSnapshot("c40-source-void");
    return { launched, collapseFrame, advances, collapse, voidSnapshot, metrics: environment.metrics() };
  }, resolved);

  assert.equal(result.launched.ok, true, JSON.stringify(result.launched));
  const collapseBoss = result.collapse.state["tear.boss.v1"].find((entry) => entry.factoryId === "source");
  assert.equal(collapseBoss.mode, "collapse", "State Forge phase-two launch must enter Source collapse before cinema advancement");
  assert.ok(result.advances.every((entry) => entry.advanced), "each bounded advancement must consume one real director beat");
  const voidBoss = result.voidSnapshot.state["tear.boss.v1"].find((entry) => entry.factoryId === "source");
  const voidPlatforms = result.voidSnapshot.state["tear.platform.v1"].filter((entry) => entry.void === true);
  assert.equal(voidBoss.mode, "void", "semantic director advancement must hand Source into production void combat");
  assert.ok(voidPlatforms.length > 0, "void handoff must produce authoritative hazard/navigation platforms");
  assert.ok(result.voidSnapshot.tick > result.collapse.tick, "real application frames must continue authoritative ticks after the handoff");
  assert.ok(result.metrics.fixedTicks >= result.voidSnapshot.tick, "Class-A metrics must account for authoritative continuation ticks");
  console.log("C40 State Forge Source collapse-to-void semantic advancement passed");
});
