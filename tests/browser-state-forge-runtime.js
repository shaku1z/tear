const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { withJourney } = require("./browser-journey-harness");

const scenario = {
  format: "tear-contract",
  kind: "scenario",
  schemaVersion: 1,
  id: "c23.state-forge.live-restore",
  version: 1,
  description: "C23 live capture, clean reconstruction, and 600-tick continuation",
  stateClass: "recorded-canonical",
  executionClass: "engineering",
  seed: "c23-state-forge",
  start: { mode: "endless", difficulty: "hard", weapon: "hammer" },
  maxTicks: 700,
  assertions: ["runtime.finite-state", "entity.unique-id", "entity.valid-owner"],
  tags: ["c23", "state-forge", "live-restore"],
};

withJourney({ name: "C23 live State Forge", port: 8143 }, async ({ page }) => {
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__, undefined, { timeout: 15_000 });
  await page.waitForFunction(() => window.__PANTHEON_TEST, undefined, { timeout: 15_000 });
  await page.evaluate(() => window.__PANTHEON_TEST.startMode("campaign"));
  await page.waitForFunction(() => {
    const state = window.__PANTHEON_TEST.state();
    return state.active === true && state.cinema === "chapter-0" && state.cinemaElapsed > 0.05;
  }, undefined, { timeout: 15_000 });
  const activeCinemaResult = await page.evaluate(() => {
    const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    const source = environment.captureSnapshot("c27a-active-cinema-source");
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => {
      const prior = environment.captureSnapshot("c27a-active-cinema-prior");
      const inactiveHostile = structuredClone(prior);
      inactiveHostile.state["tear.cinematic.v1"] = {
        format: "tear.cinematic-director", schemaVersion: 1, active: false,
        scriptId: null, scriptRevision: null, beatId: null, beatIndex: -1,
        elapsedSeconds: 0, revealElapsedSeconds: 0, fullyVisibleElapsedSeconds: 0,
        totalElapsedSeconds: 0, fullyVisible: true, skipping: false, finished: false,
      };
      inactiveHostile.state["tear.world.v1"].runtime.chapterBinding = null;
      inactiveHostile.state["tear.ui.v1"].screen = "invalid-state-forge-screen";
      const inactiveFailure = environment.restoreSnapshot(inactiveHostile);
      const afterInactiveFailure = environment.captureSnapshot("c27a-active-after-inactive-rollback");
      const hostile = structuredClone(source);
      hostile.state["tear.ui.v1"].screen = "invalid-state-forge-screen";
      const failure = environment.restoreSnapshot(hostile);
      const afterFailure = environment.captureSnapshot("c27a-active-cinema-after-rollback");
      const success = environment.restoreSnapshot(source);
      const afterSuccess = environment.captureSnapshot("c27a-active-cinema-after-restore");
      window.__PANTHEON_TEST.startMode("campaign");
      const newSession = environment.captureSnapshot("c27a-new-campaign-session");
      const crossSessionRestore = environment.restoreSnapshot(source);
      const afterCrossSessionRestore = environment.captureSnapshot("c27a-after-cross-session-reconstruction");
      window.__PANTHEON_TEST.advance();
      const afterCrossSessionAdvance = environment.captureSnapshot("c27a-after-cross-session-advance");
      const malformedBinding = structuredClone(source);
      malformedBinding.state["tear.world.v1"].runtime.chapterBinding.page = 9999;
      const malformedBindingFailure = environment.restoreSnapshot(malformedBinding);
      const afterMalformedBindingFailure = environment.captureSnapshot("c27a-after-malformed-binding-rejection");
      const malformedTransient = structuredClone(source);
      malformedTransient.state["tear.world.v1"].runtime.hitStop = "not-a-number";
      const malformedTransientFailure = environment.restoreSnapshot(malformedTransient);
      const afterMalformedTransientFailure = environment.captureSnapshot("c27a-after-malformed-transient-rejection");
      resolve({
        source: source.state["tear.cinematic.v1"],
        prior: prior.state["tear.cinematic.v1"],
        inactiveFailure,
        afterInactiveFailure: afterInactiveFailure.state["tear.cinematic.v1"],
        failure,
        afterFailure: afterFailure.state["tear.cinematic.v1"],
        success,
        afterSuccess: afterSuccess.state["tear.cinematic.v1"],
        newSession: newSession.state["tear.cinematic.v1"],
        sourceRuntime: source.state["tear.world.v1"].runtime,
        newSessionRuntime: newSession.state["tear.world.v1"].runtime,
        crossSessionRestore,
        afterCrossSessionRestore: afterCrossSessionRestore.state,
        afterCrossSessionAdvance: afterCrossSessionAdvance.state,
        malformedBindingFailure,
        afterMalformedBindingFailure: afterMalformedBindingFailure.state,
        malformedTransientFailure,
        afterMalformedTransientFailure: afterMalformedTransientFailure.state,
      });
    })));
  });
  assert.equal(activeCinemaResult.source.active, true);
  assert.equal(activeCinemaResult.source.scriptId, "chapter-0");
  assert.ok(activeCinemaResult.source.elapsedSeconds > 0);
  assert.notDeepEqual(activeCinemaResult.prior, activeCinemaResult.source,
    "the campaign timeline must advance between source and prior captures");
  assert.deepEqual(activeCinemaResult.inactiveFailure, {
    ok: false, phase: "commit", issues: activeCinemaResult.inactiveFailure.issues, rolledBack: true,
  });
  assert.deepEqual(activeCinemaResult.afterInactiveFailure, activeCinemaResult.prior,
    "an active prior must survive rollback from an inactive cinematic candidate");
  assert.deepEqual(activeCinemaResult.failure, {
    ok: false, phase: "commit", issues: activeCinemaResult.failure.issues, rolledBack: true,
  });
  assert.deepEqual(activeCinemaResult.afterFailure, activeCinemaResult.prior,
    "a later commit failure must restore the exact prior cinematic position");
  assert.equal(activeCinemaResult.success.ok, true, JSON.stringify(activeCinemaResult.success));
  assert.deepEqual(activeCinemaResult.afterSuccess, activeCinemaResult.source,
    "a valid restore must recover the exact active cinematic position");
  assert.notEqual(activeCinemaResult.sourceRuntime.lifecycle.sessionId,
    activeCinemaResult.newSessionRuntime.lifecycle.sessionId,
    "a fresh campaign must have a different lifecycle identity");
  assert.equal(activeCinemaResult.crossSessionRestore.ok, true,
    JSON.stringify(activeCinemaResult.crossSessionRestore));
  assert.deepEqual(activeCinemaResult.afterCrossSessionRestore["tear.cinematic.v1"], activeCinemaResult.source,
    "a portable chapter binding must reconstruct the exact cinematic in a fresh run session");
  assert.deepEqual(activeCinemaResult.afterCrossSessionRestore["tear.world.v1"].runtime.chapterBinding,
    activeCinemaResult.sourceRuntime.chapterBinding,
    "cross-session restoration must retain the data-only chapter binding");
  assert.notEqual(activeCinemaResult.afterCrossSessionAdvance["tear.cinematic.v1"].beatId,
    activeCinemaResult.afterCrossSessionRestore["tear.cinematic.v1"].beatId,
    "the reconstructed binding must continue into the next real chapter beat");
  assert.deepEqual(activeCinemaResult.afterCrossSessionAdvance["tear.world.v1"].runtime.chapterBinding,
    { ...activeCinemaResult.sourceRuntime.chapterBinding, flowState: "LORE_READ", page: 0 },
    "advancing a reconstructed chapter must update its portable flow pointer");
  assert.deepEqual(activeCinemaResult.malformedBindingFailure, {
    ok: false, phase: "validate", issues: activeCinemaResult.malformedBindingFailure.issues, rolledBack: false,
  });
  assert.deepEqual(activeCinemaResult.afterMalformedBindingFailure,
    activeCinemaResult.afterCrossSessionAdvance,
    "a malformed chapter binding must fail before mutating the reconstructed world");
  assert.deepEqual(activeCinemaResult.malformedTransientFailure, {
    ok: false, phase: "validate", issues: activeCinemaResult.malformedTransientFailure.issues, rolledBack: false,
  });
  assert.deepEqual(activeCinemaResult.afterMalformedTransientFailure,
    activeCinemaResult.afterCrossSessionAdvance,
    "non-finite transient runtime data must fail before mutating the reconstructed world");

  const sourceResult = await page.evaluate((scenarioValue) => {
    const source = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    source.reset(scenarioValue);
    for (let tick = 1; tick <= 30; tick += 1) source.step();
    const snapshot = source.captureSnapshot("c23-live-frame-30");
    const actions = Array.from({ length: 600 }, (_, index) => {
      const tick = 31 + index;
      if (index % 120 === 0) {
        return [{
          kind: "command",
          id: 1 + index / 120,
          tick,
          command: { type: "move", x: index % 240 === 0 ? 1000 : -1000, y: 0 },
        }];
      }
      return [];
    });
    const sourceHashes = [];
    const sourceTrace = [];
    for (const tickActions of actions) {
      try {
        source.step(tickActions);
      } catch (error) {
        throw new Error(`source tick=${String(source.observe().tick)} actionTick=${String(tickActions[0]?.tick)}: ${String(error)}`);
      }
      sourceHashes.push(source.stateHash());
      sourceTrace.push({ observation: source.observe(), rng: source.rng() });
    }
    return { snapshot, actions, sourceHashes, sourceTrace, frozenSnapshot: Object.isFrozen(snapshot) };
  }, scenario);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__, undefined, { timeout: 15_000 });
  await page.waitForFunction(() => window.__TEAR_DIAGNOSTICS__?.snapshot().frame.samples > 0, undefined, { timeout: 15_000 });
  await page.mouse.click(10, 10);
  const result = await page.evaluate(({ scenarioValue, source }) => {
    const restored = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    restored.reset(scenarioValue);
    const restoreResult = restored.restoreSnapshot(source.snapshot);
    const restoredHashes = [];
    let firstMismatch = null;
    for (const tickActions of source.actions) {
      try {
        restored.step(tickActions);
      } catch (error) {
        throw new Error(`restored tick=${String(restored.observe().tick)} actionTick=${String(tickActions[0]?.tick)} restore=${JSON.stringify(restoreResult)}: ${String(error)}`);
      }
      restoredHashes.push(restored.stateHash());
      const index = restoredHashes.length - 1;
      if (firstMismatch === null && restoredHashes[index] !== source.sourceHashes[index]) {
        firstMismatch = {
          index,
          source: source.sourceTrace[index],
          restored: {
            observation: restored.observe(),
            rng: restored.rng(),
          },
        };
      }
    }

    const beforeFailedRestore = restored.stateHash();
    const hostile = structuredClone(source.snapshot);
    hostile.state["tear.player.v1"].maxHp = -1;
    const failedRestore = restored.restoreSnapshot(hostile);
    const afterFailedRestore = restored.stateHash();
    const beforeCommitFailure = restored.captureSnapshot("before-mid-commit-failure").hashes.exact;
    const commitHostile = structuredClone(source.snapshot);
    commitHostile.state["tear.ui.v1"].screen = "invalid-state-forge-screen";
    const commitFailure = restored.restoreSnapshot(commitHostile);
    const afterCommitFailure = restored.captureSnapshot("after-mid-commit-failure").hashes.exact;
    return {
      restoreResult,
      failedRestore,
      commitFailure,
      sourceHashes: source.sourceHashes,
      restoredHashes,
      beforeFailedRestore,
      afterFailedRestore,
      beforeCommitFailure,
      afterCommitFailure,
      finalObservation: restored.observe(),
      firstMismatch,
    };
  }, { scenarioValue: scenario, source: sourceResult });

  assert.equal(result.restoreResult.ok, true, JSON.stringify(result.restoreResult));
  const mismatch = result.restoredHashes.findIndex((hash, index) => hash !== result.sourceHashes[index]);
  assert.equal(mismatch, -1,
    `restored live runtime diverged at continuation tick ${String(mismatch + 1)}: `
    + `${String(result.restoredHashes[mismatch])} != ${String(result.sourceHashes[mismatch])} `
    + `${JSON.stringify(result.firstMismatch)}`);
  assert.equal(result.finalObservation.tick, 630);
  assert.equal(result.finalObservation.run.weapon, "hammer");
  assert.equal(result.finalObservation.run.difficulty, "hard");
  assert.equal(result.failedRestore.ok, false);
  assert.equal(result.beforeFailedRestore, result.afterFailedRestore,
    "a failed restoration must not partially mutate the active live world");
  assert.deepEqual(result.commitFailure, {
    ok: false,
    phase: "commit",
    issues: result.commitFailure.issues,
    rolledBack: true,
  });
  assert.equal(result.beforeCommitFailure, result.afterCommitFailure,
    "a mid-commit failure must reconstruct and restore the prior live world");
  assert.equal(sourceResult.frozenSnapshot, true);
  assert.deepEqual(sourceResult.snapshot.state["tear.cinematic.v1"], {
    format: "tear.cinematic-director",
    schemaVersion: 1,
    active: false,
    scriptId: null,
    scriptRevision: null,
    beatId: null,
    beatIndex: -1,
    elapsedSeconds: 0,
    revealElapsedSeconds: 0,
    fullyVisibleElapsedSeconds: 0,
    totalElapsedSeconds: 0,
    fullyVisible: true,
    skipping: false,
    finished: false,
  }, "State Forge must carry a versioned cinematic director position");
  assert.deepEqual(Object.keys(sourceResult.snapshot.codecs).sort(), [
    "tear.blade.v1", "tear.boss.v1", "tear.cinematic.v1", "tear.configuration.v1", "tear.enemy.v1",
    "tear.hazard.v1", "tear.platform.v1", "tear.player.v1", "tear.projectile.v1",
    "tear.reward.v1", "tear.rng.v1", "tear.run.v1", "tear.ui.v1", "tear.world.v1",
  ]);
  const artifactDirectory = path.resolve(__dirname, "..", "artifacts", "tearbench", "c23");
  fs.mkdirSync(artifactDirectory, { recursive: true });
  fs.writeFileSync(path.join(artifactDirectory, "live-restore-600.json"), JSON.stringify({
    scenario: scenario.id,
    sourceSnapshotHash: sourceResult.snapshot.hashes.exact,
    restoreResult: result.restoreResult,
    continuationTicks: result.restoredHashes.length,
    finalHash: result.restoredHashes.at(-1),
    finalObservation: result.finalObservation,
    failedRestore: result.failedRestore,
    midCommitFailure: result.commitFailure,
    failedRestoreWasAtomic: result.beforeFailedRestore === result.afterFailedRestore,
    midCommitRollbackWasAtomic: result.beforeCommitFailure === result.afterCommitFailure,
    cleanDocumentReload: true,
  }, null, 2));
  fs.writeFileSync(path.join(artifactDirectory, "failed-restore-rollback.json"), JSON.stringify({
    scenario: scenario.id,
    validationFailure: result.failedRestore,
    midCommitFailure: result.commitFailure,
    validationFailureWasAtomic: result.beforeFailedRestore === result.afterFailedRestore,
    midCommitRollbackWasAtomic: result.beforeCommitFailure === result.afterCommitFailure,
    restoredWorldHash: result.afterCommitFailure,
  }, null, 2));
  await page.screenshot({ path: path.join(artifactDirectory, "live-restore-600.png") });
  console.log("C23 live State Forge 600-tick restore passed");
});
