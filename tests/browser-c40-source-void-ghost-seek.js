const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");

const resolved = Object.freeze({
  document: Object.freeze({
    format: "tearsdl", schemaVersion: 1, id: "c40.source-void-ghost-seek",
    stateClass: "reconstructed-reachable", seed: "c40-source-void-ghost-seek",
    start: Object.freeze({ mode: "bossonly", difficulty: "normal", weapon: "sword", boss: "source" }),
    state: Object.freeze({ boss: Object.freeze({ hp: 4100 }) }),
    constraints: Object.freeze({ legalProgression: true }), tags: Object.freeze(["c40", "source", "void", "ghost", "seek"]), maxTicks: 720,
  }),
  scenario: Object.freeze({
    format: "tear-contract", kind: "scenario", schemaVersion: 1, id: "c40.source-void-ghost-seek", version: 1,
    description: "Source collapse-to-void Ghost V3 seek proof", stateClass: "reconstructed-reachable", executionClass: "engineering",
    seed: "c40-source-void-ghost-seek", start: Object.freeze({ mode: "bossonly", difficulty: "normal", weapon: "sword", wave: 1, boss: "source" }),
    maxTicks: 720, assertions: Object.freeze(["runtime.finite-state", "boss.valid-phase"]), tags: Object.freeze(["c40", "source", "void", "ghost", "seek"]),
  }),
  structural: Object.freeze({ valid: true, issues: Object.freeze([]) }),
  reachability: Object.freeze({ reachable: true, reasons: Object.freeze([]) }),
  plausibility: Object.freeze({ plausible: true, provisional: false, reasons: Object.freeze([]) }),
  resolvedHash: "c40-source-void-ghost-seek",
});

withJourney({ name: "C40 Source void Ghost seek", port: 8292, query: { "ghost-v3-profile": "forensic-qa" } }, async ({ page }) => {
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__ && window.__TEAR_GHOST_V3__, undefined, { timeout: 15_000 });
  const capture = await page.evaluate((scenario) => {
    const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    const launched = environment.forgeResolvedScenario(scenario);
    if (!launched.ok) return { launched };
    for (let index = 0; index < 120; index += 1) {
      environment.advanceApplicationFrame(1 / 60);
      const boss = environment.captureSnapshot(`c40-source-seek-intro-${String(index)}`).state["tear.boss.v1"].find((entry) => entry.factoryId === "source");
      if (boss?.mode === "collapse") break;
    }
    const collapse = environment.captureSnapshot("c40-source-seek-collapse");
    const advances = [];
    for (let index = 0; index < 6; index += 1) {
      advances.push(environment.advanceStateForgeCinematicBeat());
      environment.advanceApplicationFrame(1 / 60);
    }
    for (let index = 0; index < 210; index += 1) {
      if (index === 20) {
        const tick = environment.captureSnapshot("c40-source-seek-action-origin").tick + 1;
        environment.step([{ kind: "command", tick, id: 1, command: { type: "move", x: 1000, y: 0 } }]);
      }
      else environment.advanceApplicationFrame(1 / 60);
    }
    const voidSnapshot = environment.captureSnapshot("c40-source-seek-void");
    const events = environment.engineEventProjection();
    environment.terminate();
    return { launched, collapse, advances, voidSnapshot, events };
  }, resolved);
  assert.equal(capture.launched.ok, true, JSON.stringify(capture.launched));
  assert.ok(capture.advances.every((entry) => entry.advanced));
  const collapseBoss = capture.collapse.state["tear.boss.v1"].find((entry) => entry.factoryId === "source");
  const voidBoss = capture.voidSnapshot.state["tear.boss.v1"].find((entry) => entry.factoryId === "source");
  assert.equal(collapseBoss.mode, "collapse");
  assert.equal(voidBoss.mode, "void");
  assert.ok(capture.voidSnapshot.state["tear.platform.v1"].some((entry) => entry.void === true));
  await page.waitForFunction(() => window.__TEAR_GHOST_V3__.manifest() !== null || window.__TEAR_GHOST_V3__.failure() !== null, undefined, { timeout: 20_000 });
  assert.equal(await page.evaluate(() => window.__TEAR_GHOST_V3__.failure()), null);
  const manifest = await page.evaluate(() => window.__TEAR_GHOST_V3__.manifest());
  const capsule = await page.evaluate((id) => window.__TEAR_GHOST_V3__.read(id), manifest.id);
  assert.equal(manifest.status, "complete");
  assert.equal(manifest.recordingProfile, "forensic-qa", "evidence must use the explicit test-build forensic cadence");
  const keyframeTicks = capsule.tracks.keyframes.map((entry) => entry.tick);
  assert.deepEqual(keyframeTicks.slice(0, 5), [0, 60, 120, 180, 240], "recorder must retain genuine post-handoff canonical keyframes");
  const commandTicks = capsule.tracks.commands.map((entry) => entry.tick);
  assert.ok(commandTicks.some((tick) => tick > 60), "a real semantic input after void arrival must be retained in the V3 action track");
  const causal = capsule.tracks.events.filter((entry) => entry.value?.type === "enemy.spawned");
  assert.ok(causal.some((entry) => entry.tick > 0), "native causal combat events must be retained beside the canonical keyframes");
  const verification = await page.evaluate((id) => window.__TEAR_GHOST_V3__.verify(id), manifest.id);
  assert.equal(verification.status, "verified", JSON.stringify(verification));
  const targetTick = 120;
  const seeks = await page.evaluate(async ({ id, tick }) => Promise.all([
    window.__TEAR_GHOST_V3__.seek(id, tick), window.__TEAR_GHOST_V3__.seek(id, tick), window.__TEAR_GHOST_V3__.seek(id, tick),
  ]), { id: manifest.id, tick: targetTick });
  assert.ok(seeks.every((result) => result?.tick === targetTick && result.usedSnapshotId), "each seek must reopen a fresh keyed production world");
  assert.equal(new Set(seeks.map((result) => result.semanticHash)).size, 1, "fresh post-handoff seeks diverged semantically");
  const receipt = capsule.tracks.results.find((entry) => entry.tick === targetTick && entry.value?.kind === "authoritative-hash");
  assert.equal(seeks[0].semanticHash, receipt.value.stateHash, "production seek did not reproduce the recorded authoritative hash");
  console.log("C40 Source collapse-to-void Ghost V3 capture and fresh production seek passed");
});
