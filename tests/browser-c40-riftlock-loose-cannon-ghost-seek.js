/* eslint-disable @typescript-eslint/no-require-imports -- browser proof is executed directly by Node. */
const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");

// State Forge supplies only a legal normal Riftlock/charger encounter. The
// captured target and Backblast recall are exercised through semantic input.
const resolved = Object.freeze({
  document: Object.freeze({
    format: "tearsdl", schemaVersion: 1, id: "c40.riftlock-loose-cannon-catch-seek",
    stateClass: "reconstructed-reachable", seed: "c40-riftlock-loose-cannon",
    start: Object.freeze({ mode: "endless", difficulty: "normal", weapon: "riftlock" }),
    state: Object.freeze({ player: Object.freeze({ x: 500, y: 620, vx: 0, vy: 0 }),
      enemyComposition: Object.freeze([Object.freeze({ kind: "charger", count: 1, x: 400, y: 620 })]) }),
    constraints: Object.freeze({ legalProgression: true }), tags: Object.freeze(["c40", "riftlock", "capture", "backblast", "catch", "seek"]), maxTicks: 720,
  }),
  scenario: Object.freeze({
    format: "tear-contract", kind: "scenario", schemaVersion: 1, id: "c40.riftlock-loose-cannon-catch-seek", version: 1,
    description: "Riftlock Loose Cannon capture to Backblast catch Ghost V3 seek proof", stateClass: "reconstructed-reachable", executionClass: "engineering",
    seed: "c40-riftlock-loose-cannon", start: Object.freeze({ mode: "endless", difficulty: "normal", weapon: "riftlock", wave: 1 }),
    maxTicks: 720, assertions: Object.freeze(["runtime.finite-state", "player.valid-health", "runtime.no-softlock"]), tags: Object.freeze(["c40", "riftlock", "capture", "backblast", "catch", "seek"]),
  }),
  structural: Object.freeze({ valid: true, issues: Object.freeze([]) }), reachability: Object.freeze({ reachable: true, reasons: Object.freeze([]) }),
  plausibility: Object.freeze({ plausible: true, provisional: false, reasons: Object.freeze([]) }), resolvedHash: "c40-riftlock-loose-cannon",
});

withJourney({ name: "C40 Riftlock Loose Cannon Ghost seek", port: 8307, query: { "ghost-v3-profile": "forensic-qa" } }, async ({ page }) => {
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__ && window.__TEAR_GHOST_V3__, undefined, { timeout: 15_000 });
  const result = await page.evaluate((scenario) => {
    const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    const launched = environment.forgeResolvedScenario(scenario);
    if (!launched.ok) return { launched };
    let id = 1;
    const command = (value) => environment.step([{ kind: "command", tick: environment.observe().tick + 1, id: id++, command: value }]);
    const preThrow = environment.captureSnapshot("c40-riftlock-prethrow");
    while (environment.observe().tick < 56) environment.advanceApplicationFrame(1 / 120);
    command({ type: "aim", turn: 500000, magnitude: 1000 });
    command({ type: "weapon", intent: "throw", phase: "pressed" });
    let captured = null;
    for (let frame = 0; frame < 360; frame += 1) {
      environment.advanceApplicationFrame(1 / 120);
      if (environment.observe().blade.state === "captured") {
        while (environment.observe().tick < 120) environment.advanceApplicationFrame(1 / 120);
        captured = environment.captureSnapshot("c40-riftlock-captured"); break;
      }
    }
    let backblast = null; let caught = null;
    if (captured) {
      command({ type: "weapon", intent: "recall", phase: "pressed" });
      environment.advanceApplicationFrame(1 / 120);
      backblast = environment.captureSnapshot("c40-riftlock-backblast");
      for (let frame = 0; frame < 480; frame += 1) {
        environment.advanceApplicationFrame(1 / 120);
        if (environment.observe().blade.state === "held") {
          while (environment.observe().tick < 180) environment.advanceApplicationFrame(1 / 120);
          caught = environment.captureSnapshot("c40-riftlock-postcatch"); break;
        }
      }
    }
    if (caught) for (let frame = 0; frame < 12; frame += 1) environment.advanceApplicationFrame(1 / 120);
    const eventProjection = environment.engineEventProjection(); environment.terminate();
    return { launched, preThrow, captured, backblast, caught, eventProjection };
  }, resolved);
  assert.equal(result.launched.ok, true, JSON.stringify(result.launched));
  assert.ok(result.captured, "Riftlock never captured a live target");
  const captureLog = result.captured.state["tear.run.v1"].weaponLog.find((entry) => entry.mechanic === "capture");
  assert.ok(captureLog, "Loose Cannon capture must be retained in the native weapon log");
  assert.ok(result.backblast, "Riftlock recall did not produce a Backblast route");
  assert.equal(result.backblast.state["tear.blade.v1"].state, "returning");
  assert.ok(result.caught, "Riftlock never returned to held");
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
  for (const [label, snapshot] of [["prethrow", result.preThrow], ["Capture", result.captured], ["postcatch", result.caught]]) {
    const receipt = capsule.tracks.results.find((entry) => entry.tick === snapshot.tick && entry.value.kind === "authoritative-hash");
    assert.ok(receipt, `${label} must retain an authoritative hash receipt`);
    const seeks = await page.evaluate(async ({ id, tick }) => Promise.all([window.__TEAR_GHOST_V3__.seek(id, tick), window.__TEAR_GHOST_V3__.seek(id, tick), window.__TEAR_GHOST_V3__.seek(id, tick)]), { id: manifest.id, tick: snapshot.tick });
    assert.ok(seeks.every((seek) => seek?.tick === snapshot.tick && seek.usedSnapshotId), `${label} seeks must reopen fresh production worlds`);
    assert.equal(new Set(seeks.map((seek) => seek.semanticHash)).size, 1, `${label} seeks diverged semantically`);
    assert.equal(seeks[0].semanticHash, receipt.value.stateHash, `${label} seek did not reproduce recorded hash`);
  }
  console.log("C40 Riftlock Loose Cannon -> Backblast -> catch V3 capture and fresh production seeks passed");
});
