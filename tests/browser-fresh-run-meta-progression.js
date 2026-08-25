const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");

withJourney({ name: "fresh-run meta progression", port: 8162, deferBoot: true }, async ({ page, boot }) => {
  await page.addInitScript(() => {
    window.__TEAR_TEST_STORAGE__ = {
      tear_meta: JSON.stringify({
      lifetimeEarned: 10_000,
      lifetimeSpent: 0,
      buy: { headstart: 1 },
      }),
    };
  });
  await boot();
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__, undefined, { timeout: 15_000 });

  const result = await page.evaluate(() => {
    const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    environment.reset({
      format: "tear-contract",
      kind: "scenario",
      schemaVersion: 1,
      id: "fresh-run-head-start",
      version: 1,
      description: "Fresh persisted Head Start applies a config-dependent upgrade",
      stateClass: "recorded-canonical",
      executionClass: "engineering",
      seed: "headstart-44",
      start: { mode: "endless", difficulty: "normal", weapon: "sword" },
      maxTicks: 2,
      assertions: ["runtime.finite-state"],
      tags: ["progression", "startup", "headstart"],
    });
    const current = environment.observe();
    const snapshot = environment.captureSnapshot("fresh-run-head-start-result");
    const run = snapshot.state["tear.run.v1"];
    const configuration = snapshot.state["tear.configuration.v1"];
    environment.terminate();
    return {
      mode: current.run.mode,
      bladeState: current.blade.state,
      keenEdgeStacks: run.mods.owned.keen_edge ?? 0,
      bladeDamageScale: configuration.values.blade.damageScale,
    };
  });

  assert.equal(result.mode, "endless");
  assert.equal(result.bladeState, "held");
  assert.equal(result.keenEdgeStacks, 1, "the fixed seed must exercise the config-dependent Keen Edge upgrade");
  assert.equal(result.bladeDamageScale, 0.0092 * 1.12, "Head Start must apply Keen Edge to the live world config");
}).then(() => console.log("fresh-run persisted Head Start passed"))
  .catch((error) => { console.error(error); process.exit(1); });
