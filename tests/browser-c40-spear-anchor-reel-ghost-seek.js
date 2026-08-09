/* eslint-disable @typescript-eslint/no-require-imports -- browser proof is executed directly by Node. */
const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");

// This is deliberately a Spear-specific forensic journey.  It drives the
// public semantic commands through State Forge; it never writes an anchor or
// reel state into the live world.
const resolved = Object.freeze({
  document: Object.freeze({
    format: "tearsdl", schemaVersion: 1, id: "c40.spear-anchor-reel-catch-seek",
    stateClass: "reconstructed-reachable", seed: "c40-spear-anchor-reel",
    start: Object.freeze({ mode: "endless", difficulty: "normal", weapon: "spear" }),
    state: Object.freeze({ player: Object.freeze({ x: 500, y: 620, vx: 0, vy: 0 }),
      enemyComposition: Object.freeze([Object.freeze({ kind: "charger", count: 1 })]) }),
    constraints: Object.freeze({ legalProgression: true }), tags: Object.freeze(["c40", "spear", "anchor", "reel", "catch", "seek"]), maxTicks: 720,
  }),
  scenario: Object.freeze({
    format: "tear-contract", kind: "scenario", schemaVersion: 1, id: "c40.spear-anchor-reel-catch-seek", version: 1,
    description: "Spear Anchor to Reel to catch Ghost V3 seek proof", stateClass: "reconstructed-reachable", executionClass: "engineering",
    seed: "c40-spear-anchor-reel", start: Object.freeze({ mode: "endless", difficulty: "normal", weapon: "spear", wave: 1 }),
    maxTicks: 720, assertions: Object.freeze(["runtime.finite-state", "player.valid-health", "runtime.no-softlock"]), tags: Object.freeze(["c40", "spear", "anchor", "reel", "catch", "seek"]),
  }),
  structural: Object.freeze({ valid: true, issues: Object.freeze([]) }), reachability: Object.freeze({ reachable: true, reasons: Object.freeze([]) }),
  plausibility: Object.freeze({ plausible: true, provisional: false, reasons: Object.freeze([]) }), resolvedHash: "c40-spear-anchor-reel",
});

withJourney({ name: "C40 Spear Anchor Reel Ghost seek", port: 8303, query: { "ghost-v3-profile": "forensic-qa" } }, async ({ page }) => {
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__ && window.__TEAR_GHOST_V3__, undefined, { timeout: 15_000 });
  const result = await page.evaluate((scenario) => {
    const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    const launched = environment.forgeResolvedScenario(scenario);
    if (!launched.ok) return { launched };
    let id = 1;
    const command = (command) => environment.step([{ kind: "command", tick: environment.observe().tick + 1, id: id++, command }]);
    const preThrow = environment.captureSnapshot("c40-spear-prethrow");
    command({ type: "aim", turn: 462000 });
    command({ type: "weapon", intent: "throw", phase: "pressed" });
    let anchored = null;
    let reeling = null;
    const bladeStates = [];
    for (let frame = 0; frame < 360; frame += 1) {
      environment.advanceApplicationFrame(1 / 120);
      const blade = environment.observe().blade;
      if (bladeStates.at(-1) !== blade.state) bladeStates.push(blade.state);
      if (blade.state === "embedded" && !anchored) {
        while (environment.observe().tick < 60) environment.advanceApplicationFrame(1 / 120);
        anchored = environment.captureSnapshot("c40-spear-anchored");
        while (environment.observe().tick < 119) environment.advanceApplicationFrame(1 / 120);
        command({ type: "weapon", intent: "recall", phase: "pressed" });
        reeling = environment.captureSnapshot("c40-spear-reeling");
        break;
      }
    }
    let caught = null;
    for (let frame = 0; frame < 720; frame += 1) {
      environment.advanceApplicationFrame(1 / 120);
      if (environment.observe().blade.state === "held") {
        while (environment.observe().tick < 180) environment.advanceApplicationFrame(1 / 120);
        caught = environment.captureSnapshot("c40-spear-caught"); break;
      }
    }
    // Let the shared recorder consume the native catch edge before sealing.
    if (caught) for (let frame = 0; frame < 12; frame += 1) environment.advanceApplicationFrame(1 / 120);
    const eventProjection = environment.engineEventProjection();
    environment.terminate();
    return { launched, bladeStates, preThrow, anchored, reeling, caught, eventProjection };
  }, resolved);
  assert.equal(result.launched.ok, true, JSON.stringify(result.launched));
  assert.ok(result.anchored, `no Anchor state: ${JSON.stringify(result.bladeStates)}`); assert.ok(result.reeling, `no Reel state: ${JSON.stringify(result.bladeStates)}`); assert.ok(result.caught, `no catch state: ${JSON.stringify(result.bladeStates)}`);
  const anchoredBlade = result.anchored.state["tear.blade.v1"];
  const anchoredEnemy = result.anchored.state["tear.enemy.v1"][0];
  assert.equal(anchoredBlade.state, "embedded");
  assert.equal(anchoredBlade.anchorTarget.$ref, anchoredEnemy.id, "Anchor must retain its real target identity");
  const reelingBlade = result.reeling.state["tear.blade.v1"];
  const reelingEnemy = result.reeling.state["tear.enemy.v1"][0];
  assert.equal(reelingBlade.state, "reeling");
  assert.ok(Math.abs(reelingEnemy.vx) > 0 || Math.abs(reelingEnemy.vy) > 0, "Reel must apply native target pull velocity before catch");
  assert.equal(result.caught.state["tear.blade.v1"].state, "held");
  const nativeTypes = result.eventProjection.map((event) => event.type);
  assert.ok(nativeTypes.includes("blade.thrown") && nativeTypes.includes("blade.caught"), "generic native transport facts must reach the shared event port");
  await page.waitForFunction(() => window.__TEAR_GHOST_V3__.manifest() !== null || window.__TEAR_GHOST_V3__.failure() !== null, undefined, { timeout: 20_000 });
  assert.equal(await page.evaluate(() => window.__TEAR_GHOST_V3__.failure()), null);
  const manifest = await page.evaluate(() => window.__TEAR_GHOST_V3__.manifest());
  const capsule = await page.evaluate((capsuleId) => window.__TEAR_GHOST_V3__.read(capsuleId), manifest.id);
  assert.equal(manifest.status, "complete"); assert.equal(manifest.recordingProfile, "forensic-qa");
  assert.equal((await page.evaluate((capsuleId) => window.__TEAR_GHOST_V3__.verify(capsuleId), manifest.id)).status, "verified");
  const commandKinds = capsule.tracks.commands.map((entry) => entry.value.command);
  assert.ok(commandKinds.some((command) => command.type === "weapon" && command.intent === "throw"));
  assert.ok(commandKinds.some((command) => command.type === "weapon" && command.intent === "recall"));
  const causalTypes = capsule.tracks.events.map((entry) => entry.value.type);
  assert.ok(causalTypes.includes("blade.thrown") && causalTypes.includes("blade.caught"), `sealed V3 capsule must retain generic native transport facts: ${JSON.stringify(causalTypes)}`);
  for (const [label, snapshot] of [["prethrow", result.preThrow], ["anchored", result.anchored], ["reeling", result.reeling], ["postcatch", result.caught]]) {
    const receipt = capsule.tracks.results.find((entry) => entry.tick === snapshot.tick && entry.value.kind === "authoritative-hash");
    assert.ok(receipt, `${label} must retain an authoritative hash receipt`);
    const seeks = await page.evaluate(async ({ capsuleId, tick }) => Promise.all([window.__TEAR_GHOST_V3__.seek(capsuleId, tick), window.__TEAR_GHOST_V3__.seek(capsuleId, tick), window.__TEAR_GHOST_V3__.seek(capsuleId, tick)]), { capsuleId: manifest.id, tick: snapshot.tick });
    assert.ok(seeks.every((seek) => seek?.tick === snapshot.tick && seek.usedSnapshotId), `${label} seeks must reopen fresh production worlds`);
    assert.equal(new Set(seeks.map((seek) => seek.semanticHash)).size, 1, `${label} seeks diverged semantically`);
    assert.equal(seeks[0].semanticHash, receipt.value.stateHash, `${label} seek did not reproduce recorded hash`);
  }
  // This is a separate live mechanic probe after the V3 capsule is sealed:
  // a queued recall would otherwise skip the one-tick embedded receipt above.
  const queued = await page.evaluate((scenario) => {
    const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    const launched = environment.forgeResolvedScenario(scenario);
    let id = 10_000;
    const command = (command) => environment.step([{ kind: "command", tick: environment.observe().tick + 1, id: id++, command }]);
    if (launched.ok) { command({ type: "aim", turn: 462000 }); command({ type: "weapon", intent: "throw", phase: "pressed" }); command({ type: "weapon", intent: "recall", phase: "pressed" }); }
    const blade = environment.captureSnapshot("c40-spear-queued-recall").state["tear.blade.v1"];
    environment.terminate();
    return { launched, blade };
  }, resolved);
  assert.equal(queued.launched.ok, true);
  assert.equal(queued.blade.state, "flying"); assert.equal(queued.blade.secondaryQueued, true, "Spear recall must queue while flying");
  console.log("C40 Spear Anchor -> Reel -> catch V3 capture and fresh production seeks passed");
});
