const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");

const LEGACY_V1_STORES = Object.freeze([
  "manifests", "chunks", "assets", "indexes", "uploadJobs", "analysis", "lineage", "settings", "journals", "quarantine",
]);
const DATABASE_NAME = "tear-ghost-v3";
const SENTINEL_KEY = "c28:legacy-version-sentinel";
const SENTINEL_VALUE = JSON.stringify(Object.freeze({ createdBy: "c28 browser migration fixture", schema: 1 }));

function createLegacyVault(page) {
  return page.evaluate(({ databaseName, stores, key, value }) => new Promise((resolve, reject) => {
    const deleted = window.indexedDB.deleteDatabase(databaseName);
    deleted.onblocked = () => reject(new Error("legacy Vault database deletion was blocked"));
    deleted.onerror = () => reject(deleted.error ?? new Error("legacy Vault database deletion failed"));
    deleted.onsuccess = () => {
      const open = window.indexedDB.open(databaseName, 1);
      open.onerror = () => reject(open.error ?? new Error("legacy Vault database creation failed"));
      open.onupgradeneeded = () => {
        for (const store of stores) open.result.createObjectStore(store);
        open.transaction.objectStore("settings").put(value, key);
      };
      open.onsuccess = () => { open.result.close(); resolve(); };
    };
  }), { databaseName: DATABASE_NAME, stores: LEGACY_V1_STORES, key: SENTINEL_KEY, value: SENTINEL_VALUE });
}

function inspectMigratedVault(page) {
  return page.evaluate(({ databaseName, key }) => new Promise((resolve, reject) => {
    const open = window.indexedDB.open(databaseName);
    open.onerror = () => reject(open.error ?? new Error("migrated Vault database open failed"));
    open.onsuccess = () => {
      const database = open.result;
      const transaction = database.transaction("settings", "readonly");
      const sentinel = transaction.objectStore("settings").get(key);
      transaction.oncomplete = () => {
        const result = Object.freeze({ version: database.version, stores: [...database.objectStoreNames], sentinel: sentinel.result });
        database.close();
        resolve(result);
      };
      transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error("migrated Vault sentinel read failed")); };
    };
  }), { databaseName: DATABASE_NAME, key: SENTINEL_KEY });
}

async function recordThroughTheRunningApp(page) {
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__ && window.__TEAR_GHOST_V3__, undefined, { timeout: 15000 });
  await page.evaluate(() => {
    const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    environment.reset({
      format: "tear-contract", kind: "scenario", schemaVersion: 1,
      id: "c28-vault-schema-migration", version: 1, description: "C28 legacy Vault migration proof",
      stateClass: "recorded-canonical", executionClass: "engineering", seed: "c28-vault-migration-seed",
      start: { mode: "endless", difficulty: "normal", weapon: "sword" }, maxTicks: 30,
      assertions: ["runtime.finite-state"], tags: ["c28", "ghost", "vault", "migration"],
    });
    environment.step([{ kind: "command", tick: 1, id: 1, command: { type: "move", x: 1000, y: 0 } }]);
    environment.terminate();
  });
  await page.waitForFunction(() => window.__TEAR_GHOST_V3__.manifest() !== null, undefined, { timeout: 20000 });
}

withJourney({ name: "C28 Ghost Vault schema migration", port: 8163, deferBoot: true }, async ({ page, baseUrl, boot }) => {
  // A same-origin blank 404 document lets the fixture create version 1 before
  // the production app opens its Vault database. It does not load app code.
  await page.goto(`${baseUrl}/__tear_browser_blank_fixture__.html`, { waitUntil: "domcontentloaded" });
  await createLegacyVault(page);

  await boot();
  await recordThroughTheRunningApp(page);
  const migrated = await inspectMigratedVault(page);
  assert.equal(migrated.version, 2, "the running app did not upgrade the legacy Vault schema");
  assert.ok(migrated.stores.includes("libraries"), "the version-2 knowledge-library store was not created");
  assert.equal(migrated.sentinel, SENTINEL_VALUE, "schema migration lost a legacy stored record");

  await boot();
  const afterRestart = await inspectMigratedVault(page);
  assert.equal(afterRestart.version, 2, "Vault schema changed after browser restart");
  assert.equal(afterRestart.sentinel, SENTINEL_VALUE, "migrated legacy record did not survive browser restart");
}).then(() => console.log("browser Ghost Vault schema migration passed"))
  .catch((error) => { console.error(error); process.exit(1); });
