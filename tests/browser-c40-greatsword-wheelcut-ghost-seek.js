/* eslint-disable @typescript-eslint/no-require-imports -- browser proof is executed directly by Node. */
const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");

// State Forge supplies only a legal normal Greatsword/charger encounter. The
// center-pivoting Wheel Cut, explicit recall, and catch are live semantics.
const resolved = Object.freeze({
  document: Object.freeze({
    format: "tearsdl", schemaVersion: 1, id: "c40.greatsword-wheelcut-catch-seek",
    stateClass: "reconstructed-reachable", seed: "c40-greatsword-wheelcut",
    start: Object.freeze({ mode: "endless", difficulty: "normal", weapon: "greatsword" }),
    state: Object.freeze({ player: Object.freeze({ x: 500, y: 620, vx: 0, vy: 0 }),
      enemyComposition: Object.freeze([Object.freeze({ kind: "charger", count: 1, x: 400, y: 620 })]) }),
    constraints: Object.freeze({ legalProgression: true }), tags: Object.freeze(["c40", "greatsword", "wheelcut", "catch", "seek"]), maxTicks: 720,
  }),
  scenario: Object.freeze({
    format: "tear-contract", kind: "scenario", schemaVersion: 1, id: "c40.greatsword-wheelcut-catch-seek", version: 1,
    description: "Greatsword Wheel Cut to recall to catch Ghost V3 seek proof", stateClass: "reconstructed-reachable", executionClass: "engineering",
    seed: "c40-greatsword-wheelcut", start: Object.freeze({ mode: "endless", difficulty: "normal", weapon: "greatsword", wave: 1 }),
    maxTicks: 720, assertions: Object.freeze(["runtime.finite-state", "player.valid-health", "runtime.no-softlock"]), tags: Object.freeze(["c40", "greatsword", "wheelcut", "catch", "seek"]),
  }),
  structural: Object.freeze({ valid: true, issues: Object.freeze([]) }), reachability: Object.freeze({ reachable: true, reasons: Object.freeze([]) }),
  plausibility: Object.freeze({ plausible: true, provisional: false, reasons: Object.freeze([]) }), resolvedHash: "c40-greatsword-wheelcut",
});

withJourney({ name: "C40 Greatsword Wheel Cut Ghost seek", port: 8303, query: { "ghost-v3-profile": "forensic-qa" } }, async ({ page }) => {
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__ && window.__TEAR_GHOST_V3__, undefined, { timeout: 15_000 });
  const result = await page.evaluate((scenario) => {
    const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    const launched = environment.forgeResolvedScenario(scenario);
    if (!launched.ok) return { launched };
    let id = 1;
    const command = (value) => environment.step([{ kind: "command", tick: environment.observe().tick + 1, id: id++, command: value }]);
    const preThrow = environment.captureSnapshot("c40-greatsword-prethrow");
    while (environment.observe().tick < 56) environment.advanceApplicationFrame(1 / 120);
    command({ type: "aim", turn: 500000, magnitude: 1000 });
    command({ type: "weapon", intent: "throw", phase: "pressed" });
    let wheelCut = null;
    for (let frame = 0; frame < 360; frame += 1) {
      environment.advanceApplicationFrame(1 / 120);
      const run = environment.captureSnapshot("c40-greatsword-probe").state["tear.run.v1"];
      // The Wheel Cut owns center-pivoting solid collision, so a terrain hit
      // is the canonical proof edge even when the authored charger moves away.
      if (environment.observe().blade.state === "embedded") {
        while (environment.observe().tick < 120) environment.advanceApplicationFrame(1 / 120);
        wheelCut = environment.captureSnapshot("c40-greatsword-wheelcut"); break;
      }
    }
    let returning = null; let caught = null;
    if (wheelCut) {
      command({ type: "weapon", intent: "recall", phase: "pressed" });
      environment.advanceApplicationFrame(1 / 120);
      returning = environment.captureSnapshot("c40-greatsword-returning");
      for (let frame = 0; frame < 480; frame += 1) {
        environment.advanceApplicationFrame(1 / 120);
        if (environment.observe().blade.state === "held") {
          while (environment.observe().tick < 180) environment.advanceApplicationFrame(1 / 120);
          caught = environment.captureSnapshot("c40-greatsword-postcatch"); break;
        }
      }
    }
    if (caught) for (let frame = 0; frame < 12; frame += 1) environment.advanceApplicationFrame(1 / 120);
    const eventProjection = environment.engineEventProjection(); environment.terminate();
    return { launched, preThrow, wheelCut, returning, caught, eventProjection };
  }, resolved);
  assert.equal(result.launched.ok, true, JSON.stringify(result.launched));
  assert.ok(result.wheelCut, "Greatsword never reached the live Wheel Cut impact state");
  assert.equal(result.wheelCut.state["tear.blade.v1"].weaponId, "greatsword");
  assert.equal(result.wheelCut.state["tear.blade.v1"].state, "embedded");
  assert.notEqual(result.wheelCut.state["tear.blade.v1"].angle, result.preThrow.state["tear.blade.v1"].angle, "Wheel Cut must rotate its center-pivoted body during flight");
  assert.ok(result.returning, "Greatsword recall did not produce a return route");
  assert.equal(result.returning.state["tear.blade.v1"].state, "returning");
  assert.ok(result.caught, "Greatsword never returned to held");
  assert.equal(result.caught.state["tear.blade.v1"].state, "held");
  const nativeTypes = result.eventProjection.map((event) => event.type);
  assert.ok(nativeTypes.includes("blade.thrown") && nativeTypes.includes("blade.caught"), "generic native transport facts must reach the shared event port");
  await page.waitForFunction(() => window.__TEAR_GHOST_V3__.manifest() !== null || window.__TEAR_GHOST_V3__.failure() !== null, undefined, { timeout: 20_000 });
  assert.equal(await page.evaluate(() => window.__TEAR_GHOST_V3__.failure()), null);
  const manifest = await page.evaluate(() => window.__TEAR_GHOST_V3__.manifest());
  const capsule = await page.evaluate((id) => window.__TEAR_GHOST_V3__.read(id), manifest.id);
  assert.equal(manifest.status, "complete"); assert.equal(manifest.recordingProfile, "forensic-qa");
  assert.equal((await page.evaluate((id) => window.__TEAR_GHOST_V3__.verify(id), manifest.id)).status, "verified");
  const commands = capsule.tracks.commands.map((entry) => entry.value.command);
  assert.ok(commands.some((value) => value.type === "aim") && commands.some((value) => value.type === "weapon" && value.intent === "throw") && commands.some((value) => value.type === "weapon" && value.intent === "recall"));
  const causalTypes = capsule.tracks.events.map((entry) => entry.value.type);
  assert.ok(causalTypes.includes("blade.thrown") && causalTypes.includes("blade.caught"), "sealed V3 capsule must retain generic native transport facts");
  for (const [label, snapshot] of [["prethrow", result.preThrow], ["Wheel Cut", result.wheelCut], ["postcatch", result.caught]]) {
    const receipt = capsule.tracks.results.find((entry) => entry.tick === snapshot.tick && entry.value.kind === "authoritative-hash");
    assert.ok(receipt, `${label} must retain an authoritative hash receipt`);
    const seeks = await page.evaluate(async ({ id, tick }) => Promise.all([window.__TEAR_GHOST_V3__.seek(id, tick), window.__TEAR_GHOST_V3__.seek(id, tick), window.__TEAR_GHOST_V3__.seek(id, tick)]), { id: manifest.id, tick: snapshot.tick });
    assert.ok(seeks.every((seek) => seek?.tick === snapshot.tick && seek.usedSnapshotId), `${label} seeks must reopen fresh production worlds`);
    assert.equal(new Set(seeks.map((seek) => seek.semanticHash)).size, 1, `${label} seeks diverged semantically`);
    assert.equal(seeks[0].semanticHash, receipt.value.stateHash, `${label} seek did not reproduce recorded hash`);
  }
  console.log("C40 Greatsword Wheel Cut -> return -> catch V3 capture and fresh production seeks passed");
});
