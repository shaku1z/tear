const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");

function scenario(id, seed) {
  return {
    format: "tear-contract", kind: "scenario", schemaVersion: 1,
    id, version: 1, description: "C27 interrupted Ghost V3 browser recovery proof",
    stateClass: "recorded-canonical", executionClass: "engineering", seed,
    start: { mode: "endless", difficulty: "normal", weapon: "sword" }, maxTicks: 120,
    assertions: ["runtime.finite-state"], tags: ["c27", "ghost", "recovery"],
  };
}

withJourney({ name: "C27 Ghost V3 interrupted browser recovery", port: 8157 }, async ({ page }) => {
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__ && window.__TEAR_GHOST_V3__, undefined, { timeout: 15000 });
  await page.evaluate((next) => {
    const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    environment.reset(next);
    for (let tick = 1; tick <= 24; tick += 1) environment.step([]);
  }, scenario("c27-interrupted-before-refresh", "c27-interrupted-before-refresh-seed"));
  await page.waitForFunction(async () => (await window.__TEAR_GHOST_V3__.manifests())
    .some((manifest) => manifest.status === "recording"), undefined, { timeout: 20000 });
  const interruptedId = await page.evaluate(async () => {
    const manifest = (await window.__TEAR_GHOST_V3__.manifests()).find((entry) => entry.status === "recording");
    return manifest?.id ?? null;
  });
  assert.equal(typeof interruptedId, "string");

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__ && window.__TEAR_GHOST_V3__, undefined, { timeout: 15000 });
  // A reload creates a fresh legacy audio context.  Mirror the journey harness
  // boot gesture before advancing the live runtime so wave SFX have a bound
  // context just as they do in an actual browser session.
  await page.mouse.click(10, 10);
  assert.equal(await page.evaluate(async (id) => (await window.__TEAR_GHOST_V3__.manifests())
    .find((entry) => entry.id === id)?.status, interruptedId), "recording");

  await page.evaluate((next) => {
    const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    environment.reset(next);
    environment.step([]);
    environment.terminate();
  }, scenario("c27-recovery-trigger", "c27-recovery-trigger-seed"));
  await page.waitForFunction(async (id) => (await window.__TEAR_GHOST_V3__.manifests())
    .some((entry) => entry.id === id && entry.status === "recovered"), interruptedId, { timeout: 20000 });
  const recovered = await page.evaluate(async (id) => (await window.__TEAR_GHOST_V3__.manifests())
    .find((entry) => entry.id === id), interruptedId);
  assert.equal(recovered.status, "recovered");
});
