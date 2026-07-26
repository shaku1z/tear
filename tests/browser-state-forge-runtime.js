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
  assert.deepEqual(Object.keys(sourceResult.snapshot.codecs).sort(), [
    "tear.blade.v1", "tear.boss.v1", "tear.configuration.v1", "tear.enemy.v1",
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
