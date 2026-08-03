const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");

function scenario(id, seed) {
  return {
    format: "tear-contract", kind: "scenario", schemaVersion: 1,
    id, version: 1, description: "C28 durable Vault interrupted-write recovery proof",
    stateClass: "recorded-canonical", executionClass: "engineering", seed,
    start: { mode: "endless", difficulty: "normal", weapon: "sword" }, maxTicks: 180,
    assertions: ["runtime.finite-state"], tags: ["c28", "ghost", "vault", "recovery"],
  };
}

function readRecoveryStores(page, capsuleId) {
  return page.evaluate((id) => new Promise((resolve, reject) => {
    const open = window.indexedDB.open("tear-ghost-v3");
    open.onerror = () => reject(open.error ?? new Error("IndexedDB open failed"));
    open.onsuccess = () => {
      const database = open.result;
      const transaction = database.transaction(["manifests", "journals", "indexes"], "readonly");
      const manifest = transaction.objectStore("manifests").get(id);
      const journal = transaction.objectStore("journals").get(id);
      const index = transaction.objectStore("indexes").get(`manifest:${id}`);
      transaction.oncomplete = () => {
        database.close();
        resolve(Object.freeze({ manifest: manifest.result, journal: journal.result, index: index.result }));
      };
      transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error("IndexedDB recovery read failed")); };
    };
  }), capsuleId);
}

withJourney({ name: "C28 Ghost Vault interrupted-write recovery", port: 8165 }, async ({ page, boot }) => {
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__ && window.__TEAR_GHOST_V3__, undefined, { timeout: 15000 });
  const knownIds = await page.evaluate(async () => (await window.__TEAR_GHOST_V3__.manifests()).map((manifest) => manifest.id));
  await page.evaluate((next) => {
    const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    environment.reset(next);
    for (let tick = 1; tick <= 120; tick += 1) environment.step([]);
    environment.pause();
  }, scenario("c28-vault-interrupted", "c28-vault-interrupted-seed"));
  await page.waitForFunction(async (ids) => (await window.__TEAR_GHOST_V3__.manifests())
    .some((manifest) => !ids.includes(manifest.id) && manifest.status === "recording" && manifest.chunks.length > 0), knownIds, { timeout: 20000 });
  const interruptedId = await page.evaluate(async (ids) => (await window.__TEAR_GHOST_V3__.manifests())
    .find((manifest) => !ids.includes(manifest.id) && manifest.status === "recording" && manifest.chunks.length > 0)?.id ?? null, knownIds);
  assert.equal(typeof interruptedId, "string", "interrupted run did not create a durable Vault journal");

  await boot();
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__ && window.__TEAR_GHOST_V3__, undefined, { timeout: 15000 });
  await page.evaluate((next) => {
    const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    environment.reset(next);
    environment.step([]);
    environment.terminate();
  }, scenario("c28-vault-recovery-trigger", "c28-vault-recovery-trigger-seed"));
  await page.waitForFunction(async (id) => (await window.__TEAR_GHOST_V3__.manifests())
    .some((manifest) => manifest.id === id && manifest.status === "recovered"), interruptedId, { timeout: 20000 });
  // The public Vault catalog has observed recovery, but the final assertion is
  // about raw durable stores. Wait for the IndexedDB transaction itself rather
  // than sampling it in the small visibility window between those observers.
  await page.waitForFunction((id) => new Promise((resolve, reject) => {
    const open = window.indexedDB.open("tear-ghost-v3");
    open.onerror = () => reject(open.error ?? new Error("IndexedDB open failed"));
    open.onsuccess = () => {
      const database = open.result;
      const transaction = database.transaction(["manifests", "journals", "indexes"], "readonly");
      const manifest = transaction.objectStore("manifests").get(id);
      const journal = transaction.objectStore("journals").get(id);
      const index = transaction.objectStore("indexes").get(`manifest:${id}`);
      transaction.oncomplete = () => {
        database.close();
        try {
          resolve(manifest.result !== undefined && JSON.parse(manifest.result).status === "recovered"
            && journal.result === undefined && typeof index.result === "string");
        } catch { resolve(false); }
      };
      transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error("IndexedDB recovery read failed")); };
    };
  }), interruptedId, { timeout: 20000 });

  const persisted = await readRecoveryStores(page, interruptedId);
  const manifest = JSON.parse(persisted.manifest);
  assert.equal(manifest.status, "recovered", "recovery did not durably mark the interrupted capsule terminal");
  assert.equal(persisted.journal, undefined, "recovered Vault journal remained live after browser restart");
  assert.equal(typeof persisted.index, "string", "recovered Vault capsule has no durable manifest index");
}).then(() => console.log("browser Ghost Vault interrupted-write recovery passed"))
  .catch((error) => { console.error(error); process.exit(1); });
