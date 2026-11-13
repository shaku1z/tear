// Live play and production replay must agree on Verdant: a Bloom Well / Rootbinder wave and each
// Rootbound phase are played live, recorded as a Ghost V3 capsule, and every authoritative hash
// receipt must reproduce when the capsule is replayed through the detached production world.
const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");

function resolved(id, start, state) {
  const document = { format: "tearsdl", schemaVersion: 1, id, stateClass: "surgical-valid", seed: id, start, state };
  return {
    document,
    scenario: {
      format: "tear-contract",
      kind: "scenario",
      schemaVersion: 1,
      id,
      version: 1,
      description: `Verdant live/replay parity: ${id}`,
      stateClass: "surgical-valid",
      executionClass: "engineering",
      seed: id,
      start: { wave: 1, ...start },
      maxTicks: 1200,
      assertions: ["runtime.finite-state", "player.valid-health", "runtime.no-softlock"],
      tags: ["verdant", "replay-parity"],
    },
    structural: { valid: true, issues: [] },
    reachability: { reachable: true, reasons: [] },
    plausibility: { plausible: true, provisional: false, reasons: [] },
    resolvedHash: id,
  };
}

const bossStart = { mode: "bossonly", difficulty: "normal", weapon: "sword", boss: "rootbound" };
const CASES = [
  resolved(
    "verdant-wave-wells-rootbinders",
    { mode: "campaign", difficulty: "normal", weapon: "sword", stage: "verdant-sanctum", wave: 31 },
    {
      enemyComposition: [
        { kind: "rootbinder", count: 2 },
        { kind: "charger", count: 3 },
      ],
    },
  ),
  resolved("rootbound-phase-1", bossStart, undefined),
  resolved("rootbound-phase-2", bossStart, { boss: { hp: 1375 } }),
  resolved("rootbound-phase-3", bossStart, { boss: { hp: 625 } }),
];

withJourney(
  { name: "Verdant live/replay parity", port: 8293, query: { "ghost-v3-profile": "forensic-qa" } },
  async ({ page }) => {
    await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__ && window.__TEAR_GHOST_V3__, undefined, {
      timeout: 15_000,
    });
    let previous = null;
    for (const entry of CASES) {
      const id = entry.document.id;
      const played = await page.evaluate((scenario) => {
        const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
        const launched = environment.forgeResolvedScenario(scenario);
        if (!launched.ok) return { launched };
        let command = 1;
        let last = environment.captureSnapshot(`${scenario.document.id}-start`);
        let ended = false;
        // Stop at the first natural end of the run (wave clear or defeat); the recording seals there.
        try {
          for (let frame = 0; frame < 900; frame += 1) {
            if (frame % 90 === 30) {
              last = environment.captureSnapshot(`${scenario.document.id}-${String(frame)}`);
              const x = frame % 180 === 30 ? 1000 : -1000;
              environment.step([
                { kind: "command", tick: last.tick + 1, id: command++, command: { type: "move", x, y: 0 } },
              ]);
            } else environment.advanceApplicationFrame(1 / 60);
          }
          last = environment.captureSnapshot(`${scenario.document.id}-end`);
        } catch (error) {
          if (!String(error).includes("requires a running Tear runtime")) throw error;
          ended = true;
        }
        if (!ended) environment.terminate();
        const bosses = last.state["tear.boss.v1"] ?? [];
        return { launched, ended, tick: last.tick, bossPhases: bosses.map((boss) => boss.phaseMarker) };
      }, entry);
      assert.equal(played.launched.ok, true, `${id}: ${JSON.stringify(played.launched)}`);
      await page.waitForFunction(
        (prior) => {
          const manifest = window.__TEAR_GHOST_V3__.manifest();
          return (manifest !== null && manifest.id !== prior) || window.__TEAR_GHOST_V3__.failure() !== null;
        },
        previous,
        { timeout: 30_000 },
      );
      assert.equal(await page.evaluate(() => window.__TEAR_GHOST_V3__.failure()), null, `${id}: recorder failed`);
      const manifest = await page.evaluate(() => window.__TEAR_GHOST_V3__.manifest());
      previous = manifest.id;
      const verification = await page.evaluate((ghostId) => window.__TEAR_GHOST_V3__.verify(ghostId), manifest.id);
      assert.ok(verification.comparisons.length > 0, `${id}: no authoritative receipts were checked`);
      const diverged = verification.comparisons.filter((comparison) => comparison.equal !== true);
      assert.deepEqual(diverged, [], `${id}: replay diverged from live play`);
      assert.equal(verification.status, "verified", `${id}: ${verification.status}`);
      console.log(
        `${id}: ${String(verification.comparisons.length)} receipts match (ended ${String(played.ended)} at tick ${String(played.tick)}, phases ${played.bossPhases.join(",") || "-"})`,
      );
    }
  },
);
