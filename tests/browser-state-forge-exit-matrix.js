const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { withJourney } = require("./browser-journey-harness");

const bosses = ["warden", "colossus", "aldric", "echo", "source"];
const phases = [1, 2, 3];
const boundaries = [
  ["hit-threshold", [-1, 0, 1]],
  ["perfect-parry", [-1, 0, 1]],
  ["deflect", [-1, 0, 1]],
  ["slam", [-1, 0, 1]],
  ["power-slam", [-1, 0, 1]],
  ["launch", [-1, 0, 1]],
  ["recall-distance", [-1, 0, 1]],
  ["overlap", [-1, 0, 1]],
  ["boss-hp", [1, 0, -1]],
  ["cooldown", [1, 0, -1]],
  ["iframe", [1, 0, -1]],
  ["shield", [1, 0, -1]],
  ["style", [-1, 0, 1]],
];

withJourney({ name: "C23 State Forge exit matrix", port: 8144 }, async ({ page }) => {
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__, undefined, { timeout: 15_000 });
  const result = await page.evaluate(({ bossIds, phaseIds, boundaryIds }) => {
    const factory = window.__TEAR_RUNTIME_ENVIRONMENT__;
    const boot = (id, start) => {
      const runtime = factory.create("A");
      runtime.reset({
        format: "tear-contract", kind: "scenario", schemaVersion: 1,
        id, version: 1, description: `C23 clean runtime launch ${id}`,
        stateClass: "recorded-canonical", executionClass: "engineering",
        seed: id, start, maxTicks: 2_000,
        assertions: ["runtime.finite-state"],
        tags: ["c23", "state-forge", "clean-launch"],
      });
      return runtime;
    };
    const seekBoss = (runtime) => {
      for (let tick = 0; tick < 1_500 && runtime.observe().diagnostics?.boss === undefined; tick += 1) {
        runtime.step();
      }
      if (runtime.observe().diagnostics?.boss === undefined) throw new Error("boss did not enter the clean runtime");
    };
    const seekEnemy = (runtime) => {
      for (let tick = 0; tick < 600 && runtime.observe().entities.length === 0; tick += 1) runtime.step();
      if (runtime.observe().entities.length === 0) throw new Error("enemy did not enter the clean runtime");
    };

    const wave = boot("hard-endless-wave-99-hammer", {
      mode: "endless", difficulty: "hard", weapon: "hammer",
    });
    const waveRestore = wave.forgeWave99Hammer();
    const waveObservation = wave.observe();
    const waveSnapshot = wave.captureSnapshot("wave99-visible-proof", "reconstructed-reachable");
    const waveWorld = waveSnapshot.state["tear.world.v1"];
    const waveRun = waveSnapshot.state["tear.run.v1"];
    const waveScreenshot = wave.screenshot();

    const bossResults = [];
    for (const boss of bossIds) {
      for (const phase of phaseIds) {
        const id = `boss-${boss}-phase-${String(phase)}`;
        const runtime = boot(id, {
          mode: "bossonly", difficulty: "hard", weapon: "hammer", boss,
        });
        seekBoss(runtime);
        const restore = runtime.forgeExitLaunch({
          id, kind: "boss-phase", boss, phase,
          attack: "opening-commit", attackFrame: 0,
        });
        const observation = runtime.observe();
        bossResults.push({
          id, restore, boss: observation.diagnostics?.boss,
          screenshot: runtime.screenshot().slice(0, 32),
          metrics: runtime.metrics(),
        });
      }
    }

    const boundaryResults = [];
    for (const [boundary, ticks] of boundaryIds) {
      for (const [index, position] of ["before", "at", "after"].entries()) {
        const id = `${boundary}-${position}`;
        const requiresBoss = boundary === "boss-hp";
        const runtime = boot(id, requiresBoss
          ? { mode: "bossonly", difficulty: "hard", weapon: "hammer", boss: "warden" }
          : { mode: "endless", difficulty: "hard", weapon: "hammer" });
        if (requiresBoss) seekBoss(runtime);
        if (boundary === "overlap") seekEnemy(runtime);
        const restore = runtime.forgeExitLaunch({
          id, kind: "one-frame-boundary", boundary, position, ticks: ticks[index],
        });
        boundaryResults.push({
          id, restore, tick: runtime.observe().tick,
          screenshot: runtime.screenshot().slice(0, 32),
          metrics: runtime.metrics(),
        });
      }
    }
    return {
      wave: {
        restore: waveRestore, observation: waveObservation, snapshot: waveSnapshot,
        evidence: waveRun?.stateForgeEvidence, ghost: waveWorld?.ghost,
        screenshot: waveScreenshot, metrics: wave.metrics(),
      },
      bossResults,
      boundaryResults,
    };
  }, { bossIds: bosses, phaseIds: phases, boundaryIds: boundaries });

  assert.equal(result.wave.restore.ok, true, JSON.stringify(result.wave.restore));
  assert.equal(result.wave.observation.run.wave, 99);
  assert.equal(result.wave.observation.run.weapon, "hammer");
  assert.equal(result.wave.observation.run.difficulty, "hard");
  for (const field of ["earnedPickCount", "selectedPickCount", "mutationCount", "rewardCount"]) {
    assert.equal(result.wave.evidence[field], 99);
  }
  assert.equal(result.wave.evidence.legal, true);
  assert.equal(result.wave.evidence.liveReplay.appliedMutationCount, 99);
  assert.equal(result.wave.evidence.liveReplay.earnedPickCount, 99);
  assert.equal(result.wave.evidence.ledger.events.filter((event) =>
    event.type === "configuration.mutated").length, 99);
  assert.equal(result.wave.snapshot.id, "wave99-visible-proof");
  assert.ok(Object.hasOwn(result.wave.ghost, "recording"), "live snapshot must include Ghost runtime state");
  assert.match(result.wave.screenshot, /^data:image\/png;base64,/u);
  assert.ok(result.wave.metrics.screenshots >= 1);

  assert.equal(result.bossResults.length, 15);
  for (const launched of result.bossResults) {
    assert.equal(launched.restore.ok, true, `${launched.id}: ${JSON.stringify(launched.restore)}`);
    assert.equal(launched.boss.id, launched.id.split("-")[1]);
    assert.equal(launched.boss.phase, launched.id.at(-1));
    assert.match(launched.screenshot, /^data:image\/png;base64,/u);
    assert.equal(launched.metrics.resets, 1, `${launched.id} did not use a clean runtime`);
  }

  assert.equal(result.boundaryResults.length, 39);
  for (const launched of result.boundaryResults) {
    assert.equal(launched.restore.ok, true, `${launched.id}: ${JSON.stringify(launched.restore)}`);
    assert.match(launched.screenshot, /^data:image\/png;base64,/u);
    assert.equal(launched.metrics.resets, 1, `${launched.id} did not use a clean runtime`);
  }
  const artifactDirectory = path.resolve(__dirname, "..", "artifacts", "tearbench", "checkpoints", "core", "C23", "state-forge");
  fs.mkdirSync(artifactDirectory, { recursive: true });
  const wavePng = result.wave.screenshot.replace(/^data:image\/png;base64,/u, "");
  fs.writeFileSync(path.join(artifactDirectory, "wave99-hard-endless-hammer.png"), Buffer.from(wavePng, "base64"));
  fs.writeFileSync(path.join(artifactDirectory, "wave99-hard-endless-hammer.json"), JSON.stringify({
    observation: result.wave.observation,
    evidence: result.wave.evidence,
    snapshot: result.wave.snapshot,
    ghost: result.wave.ghost,
    metrics: result.wave.metrics,
  }, null, 2));
  fs.writeFileSync(path.join(artifactDirectory, "boss-phase-matrix.json"),
    JSON.stringify(result.bossResults.map(({ screenshot, ...entry }) => entry), null, 2));
  fs.writeFileSync(path.join(artifactDirectory, "one-frame-boundary-matrix.json"),
    JSON.stringify(result.boundaryResults.map(({ screenshot, ...entry }) => entry), null, 2));
  console.log("C23 wave-99, 15 boss-phase, and 39 one-frame clean-runtime launches passed");
});
