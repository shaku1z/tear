const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");
const { STATE_WAIT_MS, holdFor, waitForSetup } = require("./browser-waits");
const { rulesetVersion: PUBLISHED_RULESET_VERSION } = require("../config/campaign-publication-boundary.json");

function scenario() {
  return {
    format: "tear-contract",
    kind: "scenario",
    schemaVersion: 1,
    id: "c27-physical-live-capture",
    version: 1,
    description: "C27 physical V3 capture proof",
    stateClass: "recorded-canonical",
    executionClass: "engineering",
    seed: "c27-physical-capsule-seed",
    start: { mode: "endless", difficulty: "normal", weapon: "sword" },
    maxTicks: 240,
    assertions: ["runtime.finite-state"],
    tags: ["c27", "ghost", "capsule", "physical-input"],
  };
}

withJourney({ name: "C27 Ghost V3 physical live capture", tutorialSkipped: true }, async ({ page, waitScreen }) => {
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__ && window.__TEAR_GHOST_V3__, undefined, {
    timeout: STATE_WAIT_MS,
  });
  // Only the physical Class-C adapter operates the visible menu and gameplay.
  // The final Class-A call is lifecycle cleanup for this test build; it does not
  // supply commands or advance simulation ticks.
  await page.evaluate(() => {
    const physical = window.__TEAR_RUNTIME_ENVIRONMENT__.create("C");
    physical.physicalInput({ type: "pointer", x: 260, y: 360, button: 0, phase: "pressed" });
    physical.physicalInput({ type: "pointer", x: 260, y: 360, button: 0, phase: "released" });
  });
  await waitScreen("setup");
  // The setup preselects a mode from the profile; this capture records Endless, so it picks
  // ENDLESS itself, physically, rather than relying on the preselected mode.
  await page.evaluate(() => {
    const physical = window.__TEAR_RUNTIME_ENVIRONMENT__.create("C");
    physical.physicalInput({ type: "pointer", x: 430, y: 255, button: 0, phase: "pressed" });
    physical.physicalInput({ type: "pointer", x: 430, y: 255, button: 0, phase: "released" });
  });
  await waitForSetup(page, { mode: "endless" });
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
  await page.waitForTimeout(holdFor(1_500));
  await page.evaluate(() => {
    const physical = window.__TEAR_RUNTIME_ENVIRONMENT__.create("C");
    physical.physicalInput({ type: "key", code: "KeyD", phase: "released" });
    window.__TEAR_RUNTIME_ENVIRONMENT__.create("A").terminate();
  });
  await page.waitForFunction(
    () => window.__TEAR_GHOST_V3__.manifest() !== null || window.__TEAR_GHOST_V3__.failure() !== null,
    undefined,
    { timeout: STATE_WAIT_MS },
  );
  assert.equal(await page.evaluate(() => window.__TEAR_GHOST_V3__.failure()), null);
  const manifest = await page.evaluate(() => window.__TEAR_GHOST_V3__.manifest());
  const persisted = await page.evaluate(() => window.__TEAR_GHOST_V3__.manifests());
  assert.equal(manifest.status, "complete");
  assert.equal(manifest.recordingProfile, "coaching");
  assert.ok(persisted.some((candidate) => candidate.id === manifest.id && candidate.status === "complete"));
  const capsule = await page.evaluate((id) => window.__TEAR_GHOST_V3__.read(id), manifest.id);
  const replay = await page.evaluate((id) => window.__TEAR_GHOST_V3__.replay(id), manifest.id);
  const admission = await page.evaluate((id) => window.__TEAR_GHOST_V3__.admission(id), manifest.id);
  assert.ok(
    manifest.chunks.some((chunk) => chunk.kind === "commands"),
    "physical device input did not produce a sealed V3 command",
  );
  assert.ok(
    manifest.chunks.some((chunk) => chunk.kind === "keyframes"),
    "physical live loop did not produce a periodic V3 keyframe",
  );
  assert.ok(
    manifest.chunks.some((chunk) => chunk.kind === "rng"),
    "physical live loop did not capture named RNG state",
  );
  assert.ok(
    manifest.chunks.every((chunk) => chunk.encoding === "utf8-base64-v1" || chunk.encoding === "gzip-base64-v1"),
    "new browser chunks did not use the versioned codec registry",
  );
  assert.ok(
    manifest.chunks.some((chunk) => chunk.encoding === "gzip-base64-v1"),
    "compressible physical-run evidence did not use the worker gzip codec",
  );
  assert.ok(capsule.tracks.commands.length > 0);
  assert.ok(capsule.tracks.keyframes.length > 0);
  assert.ok(capsule.tracks.rng.length > 0);
  const eventTypes = capsule.tracks.events.map((entry) => entry.value?.type);
  assert.ok(eventTypes.includes("run.started"), "physical live run omitted its authoritative start boundary");
  assert.ok(eventTypes.includes("run.abandoned"), "physical termination did not enter the V3 capsule before shutdown");
  assert.ok(
    capsule.tracks.keyframes.some(
      (entry) =>
        entry.value?.kind === "snapshot" &&
        entry.value.tick === entry.tick &&
        entry.value.stateClass === "recorded-canonical",
    ),
    "physical live loop did not retain a restorable State Setup keyframe",
  );
  assert.ok(replay.accepted.commands > 0, "sealed device command did not map into V3 replay truth");
  assert.ok(
    replay.accepted.events > 0,
    `captured engine events did not map into V3 causal truth: ${JSON.stringify(replay.issues)}`,
  );
  assert.ok(replay.accepted.snapshots > 0, "State Setup keyframe did not map into V3 replay truth");
  assert.deepEqual(replay.ghost.trident.command, {
    kind: "command",
    status: "declared-unverified",
    available: true,
    resumable: false,
    seekable: false,
    reason: "canonical V3 commands require compatible-runtime replay verification",
  });
  assert.equal(replay.ghost.trident.state.available, true);
  assert.equal(replay.ghost.trident.state.seekable, true);
  assert.ok(manifest.chunks.some((chunk) => chunk.kind === "results"));
  // The bootstrap can locate a future detached world, but the closure-owned
  // live runtime is deliberately never registered as one. Metadata matching
  // is not replay execution or truth verification.
  assert.equal(admission.status, "unavailable", admission.reason);
  assert.equal(admission.context.format, "tear-ghost-replay-context");
  assert.equal(admission.context.schemaVersion, 1);
  assert.deepEqual(admission.context.run, {
    id: manifest.provenance.runId,
    seed: manifest.provenance.seed,
    mode: "endless",
    difficulty: "normal",
    weaponId: "sword",
  });
  assert.deepEqual(admission.context.simulation, {
    ticksPerSecond: 120,
    initialState: "opening-initialized",
    opening: {
      version: 1,
      phase: "opening-initialized-before-run-start",
      previousScreen: "setup",
      destination: "playing",
      runId: manifest.provenance.runId,
    },
  });
  const openingCompletion = capsule.tracks.events.filter(
    (entry) => entry.value?.payload?.boundary === "recorded-opening-playing-exposed",
  );
  assert.equal(openingCompletion.length, 1, "physical recorder must retain exactly one playing completion");
  assert.deepEqual(openingCompletion[0].value.payload, {
    boundary: "recorded-opening-playing-exposed",
    runId: manifest.provenance.runId,
    screen: "playing",
  });
  assert.equal(openingCompletion[0].value.type, "system.checkpoint");
  assert.equal(openingCompletion[0].tick, 0);
  assert.equal(openingCompletion[0].value.tick, 0);
  assert.equal(openingCompletion[0].value.phase, "pre-simulation");
  assert.equal(openingCompletion[0].value.source, "engine");
  assert.ok(
    openingCompletion[0].value.sequence >
      capsule.tracks.events.find((entry) => entry.value?.type === "run.started").value.sequence,
  );
  assert.equal(
    capsule.tracks.keyframes.find((entry) => entry.tick === 0)?.value?.state?.["tear.ui.v1"]?.screen,
    "setup",
  );
  // The published ruleset, which tests/unit/verdant-publication-boundary.test.ts holds equal to CURRENT_RULESET_VERSION.
  assert.equal(admission.context.build.rulesetVersion, PUBLISHED_RULESET_VERSION);
  assert.ok(admission.context.build.contentHash.length > 0);
  assert.ok(admission.context.build.configHash.length > 0);
  const stateKeyframes = capsule.tracks.keyframes.filter((entry) => entry.value?.kind === "snapshot");
  assert.ok(stateKeyframes.length > 0, "physical capsule did not retain a State Setup keyframe to attest");
  const bootstrap = capsule.tracks.events.find(
    (entry) =>
      entry.value?.id?.startsWith("ghost-live-bootstrap-") && entry.value?.payload?.boundary === "v3-sidecar-opened",
  );
  assert.ok(bootstrap, "physical capsule lacks the integrity-protected V3 bootstrap event");
  const staticBuild = ({ configHash: _configHash, ...build }) => {
    void _configHash;
    return build;
  };
  for (const keyframe of stateKeyframes) {
    assert.deepEqual(
      staticBuild(keyframe.value.provenance?.build),
      staticBuild(admission.context.build),
      "a State Setup keyframe diverged from the capsule's immutable replay build identity",
    );
    assert.equal(
      keyframe.value.provenance?.sourceId,
      bootstrap.value.id,
      "a State Setup keyframe did not cite the integrity-protected V3 bootstrap event",
    );
  }
  assert.ok(Object.keys(admission.context.rng).length > 0);
  assert.equal(admission.context.rng.combat.algorithm, "mulberry32");
  assert.equal(await page.evaluate(() => window.__TEAR_GHOST_V3__.failure()), null);
  // Keep the scenario defined in this file as a concise evidence descriptor.
  assert.equal(scenario().executionClass, "engineering");
});
