const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");

const QUOTA_BUCKET = "tear-c28-physical-quota";
const QUOTA_BYTES = 256 * 1024;

function scenario(id, seed, maxTicks) {
  return {
    format: "tear-contract", kind: "scenario", schemaVersion: 1,
    id, version: 1, description: "C28 physical IndexedDB quota evidence",
    stateClass: "recorded-canonical", executionClass: "engineering", seed,
    start: { mode: "endless", difficulty: "normal", weapon: "sword" }, maxTicks,
    assertions: ["runtime.finite-state"], tags: ["c28", "ghost", "vault", "physical-quota"],
  };
}

withJourney({
  name: "C28 Ghost Vault physical browser quota",
  port: 8170,
  query: { "ghost-vault-storage": "physical-quota" },
}, async ({ page }) => {
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__ && window.__TEAR_GHOST_V3__, undefined, { timeout: 15_000 });
  const source = await page.evaluate(async (next) => {
    const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    environment.reset(next);
    environment.step([]);
    environment.terminate();
    await new Promise((resolve, reject) => {
      const deadline = performance.now() + 20_000;
      const poll = async () => {
        const manifest = await window.__TEAR_GHOST_V3__.manifest();
        const failure = window.__TEAR_GHOST_V3__.failure();
        if (manifest !== null) { resolve(manifest); return; }
        if (failure !== null) { reject(new Error(failure)); return; }
        if (performance.now() >= deadline) { reject(new Error("source capsule did not complete")); return; }
        setTimeout(poll, 20);
      };
      void poll();
    });
    return window.__TEAR_GHOST_V3__.manifest();
  }, scenario("c28-physical-quota-source", "c28-physical-quota-source-seed", 1));
  assert.equal(source.status, "complete", "the retained source capsule did not complete before storage pressure");

  const sourceBucket = await page.evaluate(async () => {
    const bucket = await navigator.storageBuckets.open("tear-c28-physical-quota", { quota: 256 * 1024, durability: "strict" });
    return bucket.estimate();
  });
  assert.equal(sourceBucket.quota, QUOTA_BYTES, "the journey did not receive the configured physical storage bucket");
  assert.ok(sourceBucket.usage > 0, "the retained source capsule did not occupy browser bucket storage");

  await page.evaluate((next) => {
    const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    environment.reset(next);
    for (let tick = 1; tick <= 1_200; tick += 1) environment.step([]);
    window.__C28_PHYSICAL_QUOTA_ENVIRONMENT__ = environment;
  }, scenario("c28-physical-quota-pressure", "c28-physical-quota-pressure-seed", 1_200));
  await page.waitForFunction(() => window.__TEAR_GHOST_V3__.failure() !== null, undefined, { timeout: 20_000 });
  const failure = await page.evaluate(() => window.__TEAR_GHOST_V3__.failure());
  assert.match(failure, /QuotaExceededError|quota/i, "the normal recorder did not surface a browser quota rejection");

  const outcome = await page.evaluate(async (sourceId) => ({
    ticks: window.__C28_PHYSICAL_QUOTA_ENVIRONMENT__.observe().run.elapsedTicks,
    manifests: await window.__TEAR_GHOST_V3__.manifests(),
    bucket: await (await navigator.storageBuckets.open("tear-c28-physical-quota", { quota: 256 * 1024, durability: "strict" })).estimate(),
    sourceId,
  }), source.id);
  assert.equal(outcome.ticks, 1_200, "physical Ghost Vault pressure halted the live simulation");
  assert.ok(outcome.manifests.some((entry) => entry.id === outcome.sourceId && entry.status === "complete"),
    "physical storage pressure mutated the retained source capsule");
  assert.equal(outcome.bucket.quota, QUOTA_BYTES);
  assert.ok(outcome.bucket.usage > sourceBucket.usage, "the pressure run did not write into the physical browser bucket");
}).then(() => console.log("browser Ghost Vault physical quota passed"))
  .catch((error) => { console.error(error); process.exit(1); });
