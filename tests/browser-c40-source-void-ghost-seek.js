const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");

const resolved = Object.freeze({
  document: Object.freeze({
    format: "tearsdl", schemaVersion: 1, id: "c40.source-void-low-hp-rescue-seek",
    stateClass: "reconstructed-reachable", seed: "c40-source-void-ghost-seek",
    start: Object.freeze({ mode: "bossonly", difficulty: "normal", weapon: "sword", boss: "source" }),
    // One HP proves the authored void-fall bite remains nonfatal even at the
    // lethal boundary.  The fall itself is still caused only by a semantic
    // movement command after the real collapse-to-void handoff.
    state: Object.freeze({ playerHp: 1, boss: Object.freeze({ hp: 4100 }) }),
    constraints: Object.freeze({ legalProgression: true }), tags: Object.freeze(["c40", "source", "void", "rescue", "ghost", "seek"]), maxTicks: 1200,
  }),
  scenario: Object.freeze({
    format: "tear-contract", kind: "scenario", schemaVersion: 1, id: "c40.source-void-low-hp-rescue-seek", version: 1,
    description: "Source one-HP void rescue Ghost V3 seek proof", stateClass: "reconstructed-reachable", executionClass: "engineering",
    seed: "c40-source-void-ghost-seek", start: Object.freeze({ mode: "bossonly", difficulty: "normal", weapon: "sword", wave: 1, boss: "source" }),
    maxTicks: 1200, assertions: Object.freeze(["runtime.finite-state", "player.valid-health", "boss.valid-phase", "runtime.no-softlock"]), tags: Object.freeze(["c40", "source", "void", "rescue", "ghost", "seek"]),
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
    let commandId = 1, rescueSnapshot = null;
    for (let index = 0; index < 510; index += 1) {
      if (index === 20) {
        const tick = environment.captureSnapshot("c40-source-seek-action-origin").tick + 1;
        environment.step([{ kind: "command", tick, id: commandId++, command: { type: "move", x: 1000, y: 0 } }]);
      }
      else environment.advanceApplicationFrame(1 / 60);
      if (environment.engineEventProjection().some((event) => event.type === "world.void-rescue")) {
        rescueSnapshot = environment.captureSnapshot("c40-source-void-rescue");
        break;
      }
    }
    for (let index = 0; index < 120; index += 1) environment.advanceApplicationFrame(1 / 60);
    const voidSnapshot = environment.captureSnapshot("c40-source-seek-post-rescue");
    const events = environment.engineEventProjection();
    environment.terminate();
    return { launched, collapse, advances, rescueSnapshot, voidSnapshot, events };
  }, resolved);
  assert.equal(capture.launched.ok, true, JSON.stringify(capture.launched));
  assert.ok(capture.advances.every((entry) => entry.advanced));
  const collapseBoss = capture.collapse.state["tear.boss.v1"].find((entry) => entry.factoryId === "source");
  const voidBoss = capture.voidSnapshot.state["tear.boss.v1"].find((entry) => entry.factoryId === "source");
  assert.equal(collapseBoss.mode, "collapse");
  assert.equal(voidBoss.mode, "void");
  assert.ok(capture.voidSnapshot.state["tear.platform.v1"].some((entry) => entry.void === true));
  const rescue = capture.events.find((event) => event.type === "world.void-rescue");
  assert.ok(rescue, "only the real void fall after semantic movement may publish the native rescue fact");
  assert.ok(capture.rescueSnapshot, "the native rescue must be observable in the live Source world");
  const rescuedPlayer = capture.rescueSnapshot.state["tear.player.v1"];
  assert.equal(rescuedPlayer.hp, 1, "the authored void bite must clamp the one-HP player rather than end the run");
  assert.ok(rescuedPlayer.voidTransferT > 0 && rescuedPlayer.voidSlowT > 0,
    "rescue must grant the authored transfer grace and movement penalty");
  assert.ok(["lower", "upper"].includes(rescue.payload.lane), "rescue must choose a valid generated lane");
  assert.ok(capture.rescueSnapshot.state["tear.platform.v1"].some((platform) => platform.void === true
    && platform.voidLane === rescue.payload.lane && rescuedPlayer.x >= platform.x && rescuedPlayer.x <= platform.x + platform.w),
  "rescue must relocate above a live platform in its reported lane");
  assert.ok(capture.voidSnapshot.tick > capture.rescueSnapshot.tick && capture.voidSnapshot.state["tear.player.v1"].hp === 1,
    "the rescued Source world must continue simulating without a soft-lock or delayed defeat");
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
  const rescueEvent = capsule.tracks.events.find((entry) => entry.value?.type === "world.void-rescue");
  assert.ok(rescueEvent, "the sealed V3 capsule must retain the native rescue event");
  const verification = await page.evaluate((id) => window.__TEAR_GHOST_V3__.verify(id), manifest.id);
  assert.equal(verification.status, "verified", JSON.stringify(verification));
  const postReceipt = [...capsule.tracks.results].find((entry) => entry.tick >= rescueEvent.tick && entry.value?.kind === "authoritative-hash");
  assert.ok(postReceipt, "a post-rescue authoritative hash receipt must be retained");
  for (const [label, targetTick] of [["pre-rescue", 120], ["post-rescue", postReceipt.tick]]) {
    const seeks = await page.evaluate(async ({ id, tick }) => Promise.all([
      window.__TEAR_GHOST_V3__.seek(id, tick), window.__TEAR_GHOST_V3__.seek(id, tick), window.__TEAR_GHOST_V3__.seek(id, tick),
    ]), { id: manifest.id, tick: targetTick });
    assert.ok(seeks.every((result) => result?.tick === targetTick && result.usedSnapshotId), `${label} seeks must reopen fresh keyed production worlds`);
    assert.equal(new Set(seeks.map((result) => result.semanticHash)).size, 1, `${label} seeks diverged semantically`);
    const receipt = capsule.tracks.results.find((entry) => entry.tick === targetTick && entry.value?.kind === "authoritative-hash");
    assert.equal(seeks[0].semanticHash, receipt.value.stateHash, `${label} seek did not reproduce the recorded authoritative hash`);
  }
  console.log("C40 Source one-HP void rescue Ghost V3 capture and fresh pre/post-rescue production seeks passed");
});
