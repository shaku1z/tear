const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");

function scenario(id, seed) {
  return {
    format: "tear-contract", kind: "scenario", schemaVersion: 1,
    id, version: 1, description: "C27 Ghost V3 browser storage-fault containment proof",
    stateClass: "recorded-canonical", executionClass: "engineering", seed,
    start: { mode: "endless", difficulty: "normal", weapon: "sword" }, maxTicks: 120,
    assertions: ["runtime.finite-state"], tags: ["c27", "ghost", "storage", "recovery"],
  };
}

withJourney({
  name: "C27 Ghost V3 browser storage-fault containment",
  port: 8158,
  query: { "ghost-v3-storage-fault": "quota-on-first-chunk" },
}, async ({ page, boot }) => {
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__ && window.__TEAR_GHOST_V3__, undefined, { timeout: 15000 });
  const beforeFailure = await page.evaluate((next) => {
    const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    environment.reset(next);
    for (let tick = 1; tick <= 12; tick += 1) environment.step([]);
    window.__C27_GHOST_STORAGE_ENVIRONMENT__ = environment;
    return { tick: environment.observe().run.elapsedTicks, metrics: environment.metrics() };
  }, scenario("c27-browser-quota", "c27-browser-quota-seed"));
  assert.equal(beforeFailure.tick, 12);
  assert.equal(beforeFailure.metrics.fixedTicks, 12);

  await page.waitForFunction(() => window.__TEAR_GHOST_V3__.failure() !== null, undefined, { timeout: 20000 });
  const failure = await page.evaluate(() => window.__TEAR_GHOST_V3__.failure());
  assert.match(failure, /quota/i, "the test-only browser quota fault was not surfaced by the V3 sidecar");
  const stranded = await page.evaluate(async () => (await window.__TEAR_GHOST_V3__.manifests())
    .find((entry) => entry.status === "recording"));
  assert.ok(stranded, "quota containment did not leave a durable incomplete V3 journal");

  const afterFailure = await page.evaluate(() => {
    const environment = window.__C27_GHOST_STORAGE_ENVIRONMENT__;
    environment.step([]);
    return { tick: environment.observe().run.elapsedTicks, metrics: environment.metrics() };
  });
  assert.equal(afterFailure.tick, 13, "Ghost storage failure halted the live simulation");
  assert.equal(afterFailure.metrics.fixedTicks, 13, "Ghost storage failure stopped fixed-tick progression");

  // Navigate without the injected fault. The next sidecar must recover the
  // stranded actual IndexedDB journal before it begins its own recording.
  await boot({ test: "1", bossdebug: "1" });
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__ && window.__TEAR_GHOST_V3__, undefined, { timeout: 15000 });
  assert.equal(await page.evaluate(() => window.__TEAR_GHOST_V3__.failure()), null);
  await page.evaluate((next) => {
    const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    environment.reset(next);
    environment.step([]);
    environment.terminate();
  }, scenario("c27-browser-quota-recovery", "c27-browser-quota-recovery-seed"));
  await page.waitForFunction(async (id) => (await window.__TEAR_GHOST_V3__.manifests())
    .some((entry) => entry.id === id && entry.status === "recovered"), stranded.id, { timeout: 20000 });
  const recovered = await page.evaluate(async (id) => (await window.__TEAR_GHOST_V3__.manifests())
    .find((entry) => entry.id === id), stranded.id);
  assert.equal(recovered.status, "recovered");
});
