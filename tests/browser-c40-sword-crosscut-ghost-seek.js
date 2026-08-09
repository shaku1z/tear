/* eslint-disable @typescript-eslint/no-require-imports -- browser proof is executed directly by Node. */
const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");

// State Forge supplies only one legal normal Sword/charger encounter. The
// outgoing Seam, retraced Crosscut, and catch are all live weapon semantics.
const resolved = Object.freeze({
  document: Object.freeze({
    format: "tearsdl", schemaVersion: 1, id: "c40.sword-seam-crosscut-catch-seek",
    stateClass: "reconstructed-reachable", seed: "c40-sword-seam-crosscut",
    start: Object.freeze({ mode: "endless", difficulty: "normal", weapon: "sword" }),
    state: Object.freeze({ player: Object.freeze({ x: 500, y: 620, vx: 0, vy: 0 }),
      enemyComposition: Object.freeze([Object.freeze({ kind: "charger", count: 1, x: 400, y: 620 })]) }),
    constraints: Object.freeze({ legalProgression: true }), tags: Object.freeze(["c40", "sword", "seam", "crosscut", "catch", "seek"]), maxTicks: 720,
  }),
  scenario: Object.freeze({
    format: "tear-contract", kind: "scenario", schemaVersion: 1, id: "c40.sword-seam-crosscut-catch-seek", version: 1,
    description: "Sword outgoing Seam to retraced Crosscut to catch Ghost V3 seek proof", stateClass: "reconstructed-reachable", executionClass: "engineering",
    seed: "c40-sword-seam-crosscut", start: Object.freeze({ mode: "endless", difficulty: "normal", weapon: "sword", wave: 1 }),
    maxTicks: 720, assertions: Object.freeze(["runtime.finite-state", "player.valid-health", "runtime.no-softlock"]), tags: Object.freeze(["c40", "sword", "seam", "crosscut", "catch", "seek"]),
  }),
  structural: Object.freeze({ valid: true, issues: Object.freeze([]) }), reachability: Object.freeze({ reachable: true, reasons: Object.freeze([]) }),
  plausibility: Object.freeze({ plausible: true, provisional: false, reasons: Object.freeze([]) }), resolvedHash: "c40-sword-seam-crosscut",
});

withJourney({ name: "C40 Sword Seam Crosscut Ghost seek", port: 8308, query: { "ghost-v3-profile": "forensic-qa" } }, async ({ page }) => {
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__ && window.__TEAR_GHOST_V3__, undefined, { timeout: 15_000 });
  const result = await page.evaluate((scenario) => {
    const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    const launched = environment.forgeResolvedScenario(scenario);
    if (!launched.ok) return { launched };
    let id = 1;
    const command = (value) => environment.step([{ kind: "command", tick: environment.observe().tick + 1, id: id++, command: value }]);
    // Inspect sparse Class-A snapshots while waiting for the live collision;
    // checkpoint receipts themselves are retained only at the four proof steps.
    const enemy = () => environment.captureSnapshot("c40-sword-probe").state["tear.enemy.v1"][0];
    const preThrow = environment.captureSnapshot("c40-sword-prethrow");
    // Let the real tether settle, then schedule the ordinary throw so its live
    // outgoing Seam lands on the V3 60-tick receipt boundary.
    while (environment.observe().tick < 56) environment.advanceApplicationFrame(1 / 120);
    command({ type: "aim", turn: 500000, magnitude: 1000 });
    command({ type: "weapon", intent: "throw", phase: "pressed" });
    let seamed = null; let missing = null;
    for (let frame = 0; frame < 360; frame += 1) {
      environment.advanceApplicationFrame(1 / 120);
      if (frame % 1 === 0) {
        const currentEnemy = enemy();
        if (!currentEnemy) { missing = environment.captureSnapshot("c40-sword-missing"); break; }
        if (currentEnemy.seamT > 0) { seamed = environment.captureSnapshot("c40-sword-seamed"); break; }
      }
    }
    if (!seamed) { const eventProjection = environment.engineEventProjection(); environment.terminate(); return { launched, preThrow, seamed, missing, eventProjection }; }
    command({ type: "weapon", intent: "recall", phase: "pressed" });
    let crosscut = null;
    for (let frame = 0; frame < 360; frame += 1) {
      environment.advanceApplicationFrame(1 / 120);
      const probe = environment.captureSnapshot("c40-sword-crosscut-probe");
      const log = probe.state["tear.run.v1"].weaponLog;
      if (log.some((entry) => entry.mechanic === "crosscut")) {
        while (environment.observe().tick < 120) environment.advanceApplicationFrame(1 / 120);
        crosscut = environment.captureSnapshot("c40-sword-crosscut"); break;
      }
    }
    let caught = null;
    for (let frame = 0; frame < 360; frame += 1) {
      environment.advanceApplicationFrame(1 / 120);
      if (environment.observe().blade.state === "held") { while (environment.observe().tick < 180) environment.advanceApplicationFrame(1 / 120); caught = environment.captureSnapshot("c40-sword-postcatch"); break; }
    }
    const eventProjection = environment.engineEventProjection(); environment.terminate();
    return { launched, preThrow, seamed, crosscut, caught, eventProjection };
  }, resolved);
  assert.equal(result.launched.ok, true, JSON.stringify(result.launched));
  assert.ok(result.seamed, `Sword never applied a live outgoing Seam: ${JSON.stringify(result)}`);
  assert.ok(result.crosscut, `Sword recall never consumed the live Seam as Crosscut: ${JSON.stringify(result)}`);
  assert.ok(result.caught, `Sword never returned to held: ${JSON.stringify(result)}`);
  const seamedEnemy = result.seamed.state["tear.enemy.v1"][0];
  assert.ok(seamedEnemy.seamT > 0, "outgoing Sword hit must retain a native Seam timer");
  const crosscutLog = result.crosscut.state["tear.run.v1"].weaponLog.find((entry) => entry.mechanic === "crosscut");
  assert.ok(crosscutLog && crosscutLog.secondary === true, "retraced return must produce the native Crosscut mechanic");
  assert.equal(result.crosscut.state["tear.enemy.v1"].some((entry) => entry.seamT > 0), false,
    "Crosscut must consume the Seam; the low-HP charger may be defeated by that real return hit");
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
  for (const [label, snapshot] of [["prethrow", result.preThrow], ["seamed", result.seamed], ["crosscut", result.crosscut], ["postcatch", result.caught]]) {
    const receipt = capsule.tracks.results.find((entry) => entry.tick === snapshot.tick && entry.value.kind === "authoritative-hash");
    assert.ok(receipt, `${label} must retain an authoritative hash receipt (snapshot tick ${String(snapshot.tick)}; retained ${capsule.tracks.results.map((entry) => entry.tick).join(",")})`);
    const seeks = await page.evaluate(async ({ id, tick }) => Promise.all([window.__TEAR_GHOST_V3__.seek(id, tick), window.__TEAR_GHOST_V3__.seek(id, tick), window.__TEAR_GHOST_V3__.seek(id, tick)]), { id: manifest.id, tick: snapshot.tick });
    assert.ok(seeks.every((seek) => seek?.tick === snapshot.tick && seek.usedSnapshotId), `${label} seeks must reopen fresh production worlds`);
    assert.equal(new Set(seeks.map((seek) => seek.semanticHash)).size, 1, `${label} seeks diverged semantically`);
    assert.equal(seeks[0].semanticHash, receipt.value.stateHash, `${label} seek did not reproduce recorded hash`);
  }
  console.log("C40 Sword Seam -> retraced Crosscut -> catch V3 capture and fresh production seeks passed");
});
