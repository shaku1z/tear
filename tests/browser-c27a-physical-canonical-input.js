/* eslint-disable @typescript-eslint/no-require-imports -- direct Node browser evidence script. */
const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");

function physicalInput(page, input) {
  return page.evaluate((next) => {
    window.__TEAR_RUNTIME_ENVIRONMENT__.create("C").physicalInput(next);
  }, input);
}

function snapshotPlayer(entry) {
  const snapshot = entry.value;
  if (snapshot?.kind !== "snapshot" || snapshot.stateClass !== "recorded-canonical") return null;
  const player = snapshot.state?.["tear.player.v1"];
  const run = snapshot.state?.["tear.run.v1"];
  if (typeof player?.x !== "number" || typeof player?.y !== "number" || typeof run?.tick !== "number") return null;
  return Object.freeze({ tick: entry.tick, runTick: run.tick, x: player.x, y: player.y });
}

withJourney({ name: "C27A physical canonical input", port: 8162 }, async ({ page, waitScreen }) => {
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__ && window.__TEAR_GHOST_V3__, undefined, { timeout: 15000 });

  // Class C deliberately has no structured observation or semantic stepping
  // surface.  This establishes that the journey below cannot inject a
  // TearBench command while it drives the ordinary visible game.
  const classCSurface = await page.evaluate(() => {
    const physical = window.__TEAR_RUNTIME_ENVIRONMENT__.create("C");
    return {
      accessClass: physical.accessClass,
      hasStep: "step" in physical,
      hasRenderFrame: "renderFrame" in physical,
      hasActionBatch: "actionBatch" in physical,
      hasObservation: "observe" in physical,
    };
  });
  assert.deepEqual(classCSurface, {
    accessClass: "C", hasStep: false, hasRenderFrame: false, hasActionBatch: false, hasObservation: false,
  });

  // Enter setup and the real run by the same physical pointer bridge used by
  // the existing Class-C journey. No Class-A/semantic operation occurs here.
  await physicalInput(page, { type: "pointer", x: 260, y: 360, button: 0, phase: "pressed" });
  await physicalInput(page, { type: "pointer", x: 260, y: 360, button: 0, phase: "released" });
  await waitScreen("setup");
  await physicalInput(page, { type: "pointer", x: 800, y: 755, button: 0, phase: "pressed" });
  await physicalInput(page, { type: "pointer", x: 800, y: 755, button: 0, phase: "released" });
  await waitScreen("playing");

  // Keep a normal physical movement key held long enough to force several
  // 60-tick recorder snapshots. The live requestAnimationFrame loop, rather
  // than a TearBench advance/step call, owns all fixed simulation ticks.
  await physicalInput(page, { type: "key", code: "KeyD", phase: "pressed" });
  await page.waitForTimeout(2_100);
  await physicalInput(page, { type: "key", code: "KeyD", phase: "released" });

  // This is lifecycle cleanup only: it neither injects an action nor advances
  // a fixed tick. It completes the passive recorder so the capsule can be read.
  await page.evaluate(() => { window.__TEAR_RUNTIME_ENVIRONMENT__.create("A").terminate(); });
  await page.waitForFunction(() => window.__TEAR_GHOST_V3__.manifest() !== null
    || window.__TEAR_GHOST_V3__.failure() !== null, undefined, { timeout: 20000 });
  assert.equal(await page.evaluate(() => window.__TEAR_GHOST_V3__.failure()), null);

  const capsule = await page.evaluate(async () => {
    const manifest = await window.__TEAR_GHOST_V3__.manifest();
    return window.__TEAR_GHOST_V3__.read(manifest.id);
  });
  const commands = capsule.tracks.commands.map((entry) => entry.value);
  assert.ok(commands.length > 0, "physical movement did not produce any Ghost V3 command envelopes");
  assert.ok(commands.every((entry) => entry?.kind === "command"
    && Number.isSafeInteger(entry.tick) && entry.tick > 0
    && Number.isSafeInteger(entry.id) && entry.id > 0),
  "physical input produced a non-canonical Ghost V3 command entry");

  const rightwardMoves = commands.filter((entry) => entry.command?.type === "move" && entry.command.x > 0);
  assert.ok(rightwardMoves.length > 0,
    "the physical KeyD press was not sealed as a positive canonical move action");
  assert.ok(rightwardMoves.every((entry) => entry.command.x <= 1000 && entry.command.y >= -1000 && entry.command.y <= 1000),
    "sealed physical movement fell outside the canonical input axis range");

  const snapshots = capsule.tracks.keyframes.map(snapshotPlayer).filter(Boolean);
  assert.ok(snapshots.length >= 2,
    "physical live play did not retain enough authoritative keyframes to prove a state transition");
  assert.ok(snapshots.every((snapshot) => snapshot.tick === snapshot.runTick),
    "recorded physical snapshots disagreed with the authoritative simulation tick");
  assert.ok(snapshots.some((snapshot) => snapshot.tick > rightwardMoves[0].tick),
    "no authoritative snapshot followed the sealed physical movement command");

  const xValues = snapshots.map((snapshot) => snapshot.x);
  const displacement = Math.max(...xValues) - Math.min(...xValues);
  assert.ok(displacement > 1,
    `physical canonical movement left the authoritative player state idle: ${JSON.stringify(snapshots)}`);
  assert.ok(snapshots.every((snapshot) => Number.isFinite(snapshot.x) && Number.isFinite(snapshot.y)),
    "physical canonical movement produced a non-finite authoritative player state");

  assert.equal(await page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.input.snapshot().recording), false,
    "normal termination did not close the canonical device-input session");
  // Tutorial runs do not qualify for Ghost 2 achievement recording. Use the
  // real asynchronous training preflight, then prove that input is still
  // owned by the run boundary rather than V3/IndexedDB availability.
  await page.evaluate(() => window.__PANTHEON_TEST.startMode("tutorial", "normal"));
  await page.waitForFunction(() => window.__PANTHEON_TEST.state().game === "playing"
    && window.__PANTHEON_TEST.tutorial().active, undefined, { timeout: 15_000 });
  const tutorialLifecycle = await page.evaluate(() => {
    const active = window.__TEAR_CATALOG_DEBUG__.input.snapshot().recording;
    window.__TEAR_RUNTIME_ENVIRONMENT__.create("A").terminate();
    return { active, inactive: !window.__TEAR_CATALOG_DEBUG__.input.snapshot().recording };
  });
  assert.deepEqual(tutorialLifecycle, { active: true, inactive: true },
    "untracked tutorial input lifecycle depended on Ghost 2/V3 recording availability");
});
