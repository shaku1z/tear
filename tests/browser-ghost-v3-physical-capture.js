/* eslint-disable @typescript-eslint/no-require-imports -- direct Node browser evidence script. */
const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");

function scenario() {
  return {
    format: "tear-contract", kind: "scenario", schemaVersion: 1,
    id: "c27-physical-live-capture", version: 1, description: "C27 physical V3 capture proof",
    stateClass: "recorded-canonical", executionClass: "engineering", seed: "c27-physical-capsule-seed",
    start: { mode: "endless", difficulty: "normal", weapon: "sword" }, maxTicks: 240,
    assertions: ["runtime.finite-state"], tags: ["c27", "ghost", "capsule", "physical-input"],
  };
}

withJourney({ name: "C27 Ghost V3 physical live capture", port: 8156 }, async ({ page, waitScreen }) => {
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__ && window.__TEAR_GHOST_V3__, undefined, { timeout: 15000 });
  // Only the physical Class-C adapter operates the visible menu and gameplay.
  // The final Class-A call is lifecycle cleanup for this test build; it does not
  // supply commands or advance simulation ticks.
  await page.evaluate(() => {
    const physical = window.__TEAR_RUNTIME_ENVIRONMENT__.create("C");
    physical.physicalInput({ type: "pointer", x: 260, y: 360, button: 0, phase: "pressed" });
    physical.physicalInput({ type: "pointer", x: 260, y: 360, button: 0, phase: "released" });
  });
  await waitScreen("setup");
  await page.evaluate(() => {
    const physical = window.__TEAR_RUNTIME_ENVIRONMENT__.create("C");
    physical.physicalInput({ type: "pointer", x: 800, y: 755, button: 0, phase: "pressed" });
    physical.physicalInput({ type: "pointer", x: 800, y: 755, button: 0, phase: "released" });
  });
  await waitScreen("playing");
  await page.evaluate(() => {
    window.__TEAR_RUNTIME_ENVIRONMENT__.create("C").physicalInput({ type: "key", code: "KeyD", phase: "pressed" });
  });
  // The live requestAnimationFrame loop owns the fixed steps.  This exceeds a
  // keyframe interval at 120 Hz without using renderFrame or semantic stepping.
  await page.waitForTimeout(1_500);
  await page.evaluate(() => {
    const physical = window.__TEAR_RUNTIME_ENVIRONMENT__.create("C");
    physical.physicalInput({ type: "key", code: "KeyD", phase: "released" });
    window.__TEAR_RUNTIME_ENVIRONMENT__.create("A").terminate();
  });
  await page.waitForFunction(() => window.__TEAR_GHOST_V3__.manifest() !== null, undefined, { timeout: 20000 });
  const manifest = await page.evaluate(() => window.__TEAR_GHOST_V3__.manifest());
  const persisted = await page.evaluate(() => window.__TEAR_GHOST_V3__.manifests());
  assert.equal(manifest.status, "complete");
  assert.equal(manifest.recordingProfile, "coaching");
  assert.ok(persisted.some((candidate) => candidate.id === manifest.id && candidate.status === "complete"));
  const capsule = await page.evaluate((id) => window.__TEAR_GHOST_V3__.read(id), manifest.id);
  const replay = await page.evaluate((id) => window.__TEAR_GHOST_V3__.replay(id), manifest.id);
  assert.ok(manifest.chunks.some((chunk) => chunk.kind === "commands"), "physical device input did not produce a sealed V3 command");
  assert.ok(manifest.chunks.some((chunk) => chunk.kind === "keyframes"), "physical live loop did not produce a periodic V3 keyframe");
  assert.ok(manifest.chunks.some((chunk) => chunk.kind === "rng"), "physical live loop did not capture named RNG state");
  assert.ok(capsule.tracks.commands.length > 0);
  assert.ok(capsule.tracks.keyframes.length > 0);
  assert.ok(capsule.tracks.rng.length > 0);
  assert.ok(capsule.tracks.keyframes.some((entry) => entry.value?.kind === "snapshot"
    && entry.value.tick === entry.tick && entry.value.stateClass === "recorded-canonical"),
  "physical live loop did not retain a restorable State Forge keyframe");
  assert.ok(replay.accepted.commands > 0, "sealed device command did not map into V3 replay truth");
  assert.ok(replay.accepted.events > 0, "captured engine events did not map into V3 causal truth");
  assert.ok(replay.accepted.snapshots > 0, "State Forge keyframe did not map into V3 replay truth");
  assert.deepEqual(replay.ghost.trident.command, {
    kind: "command", status: "declared-unverified", available: true, resumable: false, seekable: false,
    reason: "canonical V3 commands require compatible-runtime replay verification",
  });
  assert.equal(replay.ghost.trident.state.available, true);
  assert.equal(replay.ghost.trident.state.seekable, true);
  assert.ok(manifest.chunks.some((chunk) => chunk.kind === "results"));
  assert.equal(await page.evaluate(() => window.__TEAR_GHOST_V3__.failure()), null);
  // Keep the scenario defined in this file as a concise evidence descriptor.
  assert.equal(scenario().executionClass, "engineering");
});
