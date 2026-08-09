const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");

const resolved = Object.freeze({
  document: Object.freeze({
    format: "tearsdl", schemaVersion: 1, id: "c40.chainblade-bind-yank-catch-seek",
    stateClass: "reconstructed-reachable", seed: "c40-chainblade-bind-yank",
    start: Object.freeze({ mode: "endless", difficulty: "normal", weapon: "chainblade" }),
    state: Object.freeze({ player: Object.freeze({ x: 500, y: 620, vx: 0, vy: 0 }),
      enemyComposition: Object.freeze([Object.freeze({ kind: "charger", count: 1 })]) }),
    constraints: Object.freeze({ legalProgression: true }), tags: Object.freeze(["c40", "chainblade", "bind", "yank", "catch", "seek"]), maxTicks: 720,
  }),
  scenario: Object.freeze({
    format: "tear-contract", kind: "scenario", schemaVersion: 1, id: "c40.chainblade-bind-yank-catch-seek", version: 1,
    description: "Chainblade Bind to Yank to catch Ghost V3 seek proof", stateClass: "reconstructed-reachable", executionClass: "engineering",
    seed: "c40-chainblade-bind-yank", start: Object.freeze({ mode: "endless", difficulty: "normal", weapon: "chainblade", wave: 1 }),
    maxTicks: 720, assertions: Object.freeze(["runtime.finite-state", "player.valid-health", "runtime.no-softlock"]), tags: Object.freeze(["c40", "chainblade", "bind", "yank", "catch", "seek"]),
  }),
  structural: Object.freeze({ valid: true, issues: Object.freeze([]) }),
  reachability: Object.freeze({ reachable: true, reasons: Object.freeze([]) }),
  plausibility: Object.freeze({ plausible: true, provisional: false, reasons: Object.freeze([]) }),
  resolvedHash: "c40-chainblade-bind-yank",
});

withJourney({ name: "C40 Chainblade Bind Yank Ghost seek", port: 8303, query: { "ghost-v3-profile": "forensic-qa" } }, async ({ page }) => {
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__ && window.__TEAR_GHOST_V3__, undefined, { timeout: 15_000 });
  const result = await page.evaluate((scenario) => {
    const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    const launched = environment.forgeResolvedScenario(scenario);
    if (!launched.ok) return { launched };
    let id = 1;
    const command = (command) => environment.step([{ kind: "command", tick: environment.observe().tick + 1, id: id++, command }]);
    const preThrow = environment.captureSnapshot("c40-chainblade-prethrow");
    command({ type: "aim", turn: 462000 });
    command({ type: "weapon", intent: "throw", phase: "pressed" });
    let latched = null;
    for (let tick = 0; tick < 180; tick += 1) {
      environment.advanceApplicationFrame(1 / 120);
      if (environment.observe().blade.state === "latched") {
        latched = environment.captureSnapshot("c40-chainblade-latched"); break;
      }
    }
    if (!latched) { environment.terminate(); return { launched, preThrow, latched, eventProjection: environment.engineEventProjection() }; }
    while (environment.observe().tick < 60) environment.advanceApplicationFrame(1 / 120);
    latched = environment.captureSnapshot("c40-chainblade-latched");
    while (environment.observe().tick < 119) environment.advanceApplicationFrame(1 / 120);
    command({ type: "weapon", intent: "recall", phase: "pressed" });
    const yanking = environment.captureSnapshot("c40-chainblade-yanking");
    let caught = null;
    for (let tick = 0; tick < 360; tick += 1) {
      environment.advanceApplicationFrame(1 / 120);
      const blade = environment.observe().blade;
      if (blade.state === "held") { caught = environment.captureSnapshot("c40-chainblade-catch-transition"); break; }
    }
    while (environment.observe().tick < 180) environment.advanceApplicationFrame(1 / 120);
    if (caught !== null) caught = environment.captureSnapshot("c40-chainblade-caught");
    const eventProjection = environment.engineEventProjection();
    environment.terminate();
    return { launched, preThrow, latched, yanking, caught, eventProjection };
  }, resolved);
  assert.equal(result.launched.ok, true, JSON.stringify(result.launched));
  assert.ok(result.latched, JSON.stringify(result));
  assert.ok(result.yanking, JSON.stringify(result));
  assert.ok(result.caught, JSON.stringify(result));
  const latchedBlade = result.latched.state["tear.blade.v1"];
  const latchedEnemy = result.latched.state["tear.enemy.v1"][0];
  const yankingBlade = result.yanking.state["tear.blade.v1"];
  const yankingEnemy = result.yanking.state["tear.enemy.v1"][0];
  assert.equal(latchedBlade.state, "latched");
  assert.equal(latchedBlade.anchorTarget.$ref, latchedEnemy.id, "Bind must retain its real target identity");
  assert.ok(latchedEnemy.boundT > 0, "Bind must apply the native bound timer");
  assert.equal(yankingBlade.state, "yanking");
  assert.ok(Math.abs(yankingEnemy.vx) > 0 || Math.abs(yankingEnemy.vy) > 0,
    "Yank must apply target pull velocity before its return catch");
  assert.equal(result.caught.state["tear.blade.v1"].state, "held");
  const nativeTypes = result.eventProjection.map((event) => event.type);
  assert.ok(nativeTypes.includes("blade.thrown"), "native generic throw launch must reach the shared event port");
  assert.ok(nativeTypes.includes("blade.caught"), "native generic catch must reach the shared event port");
  await page.waitForFunction(() => window.__TEAR_GHOST_V3__.manifest() !== null || window.__TEAR_GHOST_V3__.failure() !== null, undefined, { timeout: 20_000 });
  assert.equal(await page.evaluate(() => window.__TEAR_GHOST_V3__.failure()), null);
  const manifest = await page.evaluate(() => window.__TEAR_GHOST_V3__.manifest());
  const capsule = await page.evaluate((id) => window.__TEAR_GHOST_V3__.read(id), manifest.id);
  assert.equal(manifest.status, "complete");
  assert.equal(manifest.recordingProfile, "forensic-qa");
  assert.equal((await page.evaluate((id) => window.__TEAR_GHOST_V3__.verify(id), manifest.id)).status, "verified");
  const commandKinds = capsule.tracks.commands.map((entry) => entry.value.command);
  assert.ok(commandKinds.some((command) => command.type === "weapon" && command.intent === "throw"));
  assert.ok(commandKinds.some((command) => command.type === "weapon" && command.intent === "recall"));
  const causalTypes = capsule.tracks.events.map((entry) => entry.value.type);
  assert.ok(causalTypes.includes("blade.thrown") && causalTypes.includes("blade.caught"),
    "the sealed V3 capsule must retain the generic native transport facts");
  for (const [label, snapshot] of [["prethrow", result.preThrow], ["latched", result.latched], ["yanking", result.yanking], ["postcatch", result.caught]]) {
    const tick = snapshot.tick;
    const receipt = capsule.tracks.results.find((entry) => entry.tick === tick && entry.value.kind === "authoritative-hash");
    assert.ok(receipt, `${label} must retain an authoritative hash receipt`);
    const seeks = await page.evaluate(async ({ id, tick }) => Promise.all([
      window.__TEAR_GHOST_V3__.seek(id, tick), window.__TEAR_GHOST_V3__.seek(id, tick), window.__TEAR_GHOST_V3__.seek(id, tick),
    ]), { id: manifest.id, tick });
    assert.ok(seeks.every((seek) => seek?.tick === tick && seek.usedSnapshotId), `${label} seeks must reopen fresh production worlds`);
    assert.equal(new Set(seeks.map((seek) => seek.semanticHash)).size, 1, `${label} seeks diverged semantically`);
    assert.equal(seeks[0].semanticHash, receipt.value.stateHash, `${label} seek did not reproduce the recorded hash`);
  }
  console.log("C40 Chainblade Bind -> Yank -> catch V3 capture and fresh production seeks passed");
});
