const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");

function scenario(id, seed) {
  return {
    format: "tear-contract", kind: "scenario", schemaVersion: 1,
    id, version: 1, description: "C27 Ghost V3 browser corrupt-recording quarantine proof",
    stateClass: "recorded-canonical", executionClass: "engineering", seed,
    start: { mode: "endless", difficulty: "normal", weapon: "sword" }, maxTicks: 360,
    assertions: ["runtime.finite-state"], tags: ["c27", "ghost", "recovery", "quarantine"],
  };
}

async function vaultValue(page, store, key) {
  return page.evaluate(async ({ store: storeName, key: recordKey }) => new Promise((resolve, reject) => {
    const open = window.indexedDB.open("tear-ghost-v3");
    open.onerror = () => reject(open.error ?? new Error("IndexedDB open failed"));
    open.onsuccess = () => {
      const database = open.result;
      const transaction = database.transaction(storeName, "readonly");
      const request = transaction.objectStore(storeName).get(recordKey);
      request.onerror = () => { database.close(); reject(request.error ?? new Error("IndexedDB read failed")); };
      request.onsuccess = () => { database.close(); resolve(request.result); };
    };
  }), { store: store, key });
}

async function waitForVaultTerminalRecovery(page, capsuleId) {
  await page.waitForFunction(async (id) => {
    const read = (storeName, recordKey) => new Promise((resolve, reject) => {
      const open = window.indexedDB.open("tear-ghost-v3");
      open.onerror = () => reject(open.error ?? new Error("IndexedDB open failed"));
      open.onsuccess = () => {
        const database = open.result;
        const transaction = database.transaction(storeName, "readonly");
        const request = transaction.objectStore(storeName).get(recordKey);
        request.onerror = () => { database.close(); reject(request.error ?? new Error("IndexedDB read failed")); };
        request.onsuccess = () => { database.close(); resolve(request.result); };
      };
    });
    const manifests = await window.__TEAR_GHOST_V3__.manifests();
    const [quarantine, journal] = await Promise.all([
      read("quarantine", `recovery:${id}`),
      read("journals", id),
    ]);
    return manifests.some((manifest) => manifest.id === id && manifest.status === "quarantined")
      && manifests.some((manifest) => manifest.id !== id && manifest.status === "complete")
      && typeof quarantine === "string"
      && journal === undefined;
  }, capsuleId, { timeout: 20000 });
}

async function corruptVaultChunk(page, chunkId) {
  return page.evaluate(async (key) => new Promise((resolve, reject) => {
    const open = window.indexedDB.open("tear-ghost-v3");
    open.onerror = () => reject(open.error ?? new Error("IndexedDB open failed"));
    open.onsuccess = () => {
      const database = open.result;
      const transaction = database.transaction("chunks", "readwrite");
      const store = transaction.objectStore("chunks");
      const read = store.get(key);
      read.onerror = () => transaction.abort();
      read.onsuccess = () => {
        if (typeof read.result !== "string") { transaction.abort(); return; }
        store.put(`corrupt:${read.result}`, key);
      };
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error("IndexedDB corruption write failed")); };
      transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error("IndexedDB corruption write aborted")); };
    };
  }), chunkId);
}

withJourney({ name: "C27 Ghost V3 browser corrupt recovery", port: 8159 }, async ({ page }) => {
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__ && window.__TEAR_GHOST_V3__, undefined, { timeout: 15000 });
  // The application boot run may still be sealing while this journey starts.
  // Establish its durable identity first so the interrupted-recording proof
  // below can only select the scenario run that this test creates.
  const priorIds = await page.evaluate(async () => (await window.__TEAR_GHOST_V3__.manifests())
    .map((manifest) => manifest.id));
  await page.evaluate((next) => {
    const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    environment.reset(next);
    // A written chunk is required, but stepping farther lets the unprotected
    // live run reach a terminal state before its interrupted journal is
    // selected. Keep this deliberately below that lifecycle boundary.
    for (let tick = 1; tick <= 120; tick += 1) environment.step([]);
    // Keep the just-written capsule deliberately interrupted.  The browser's
    // normal frame loop is already disabled by reset(), but a paused live run
    // also prevents a late simulation frame from finishing the recording
    // between the chunk check and the intentional corruption below.
    environment.pause();
  }, scenario("c27-corrupt-interrupted", "c27-corrupt-interrupted-seed"));
  await page.waitForFunction(async (knownIds) => (await window.__TEAR_GHOST_V3__.manifests())
    .some((manifest) => !knownIds.includes(manifest.id)
      && manifest.status === "recording" && manifest.chunks.length > 0), priorIds, { timeout: 20000 });
  // Return a plain evidence record from the page. This preserves the exact
  // manifest fields needed by the corruption operation across the Playwright
  // boundary and avoids relying on a browser object-handle representation.
  const candidates = await page.evaluate(async (knownIds) => (await window.__TEAR_GHOST_V3__.manifests())
    .filter((manifest) => !knownIds.includes(manifest.id)
      && manifest.status === "recording" && manifest.chunks.length > 0)
    .map((manifest) => ({ id: manifest.id, chunks: manifest.chunks.map((chunk) => ({ id: chunk.id })) })), priorIds);
  assert.ok(candidates.length > 0, "recording manifest disappeared before corruption could begin");
  const [interrupted] = candidates;
  assert.equal(typeof interrupted?.id, "string");
  assert.equal(typeof interrupted?.chunks[0]?.id, "string");

  await corruptVaultChunk(page, interrupted.chunks[0].id);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__ && window.__TEAR_GHOST_V3__, undefined, { timeout: 15000 });
  // Bind the fresh page's audio context before its next live runtime advances.
  await page.mouse.click(10, 10);

  await page.evaluate((next) => {
    const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    environment.reset(next);
    for (let tick = 1; tick <= 240; tick += 1) environment.step([]);
    environment.terminate();
  }, scenario("c27-corrupt-recovery-trigger", "c27-corrupt-recovery-trigger-seed"));
  // Recovery durably changes three stores in sequence. Observe the terminal
  // audit state rather than racing the manifest write that occurs first.
  await waitForVaultTerminalRecovery(page, interrupted.id);

  const quarantineKey = `recovery:${interrupted.id}`;
  const recoveryEntry = await vaultValue(page, "quarantine", quarantineKey);
  assert.equal(typeof recoveryEntry, "string", "corrupt recovery did not retain an auditable quarantine entry");
  const recovery = JSON.parse(recoveryEntry);
  assert.equal(recovery.capsuleId, interrupted.id);
  assert.match(recovery.reason, /checksum|decode/i, "quarantine reason did not explain the corrupt evidence");
  assert.equal(await vaultValue(page, "journals", interrupted.id), undefined,
    "quarantined journal remained live and could be recovered repeatedly");

  const firstRecoveryEntry = recoveryEntry;
  await page.evaluate((next) => {
    const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    environment.reset(next);
    for (let tick = 1; tick <= 120; tick += 1) environment.step([]);
    environment.terminate();
  }, scenario("c27-corrupt-recovery-follow-up", "c27-corrupt-recovery-follow-up-seed"));
  await page.waitForFunction(async (id) => (await window.__TEAR_GHOST_V3__.manifests())
    .filter((manifest) => manifest.id !== id && manifest.status === "complete").length >= 2,
  interrupted.id, { timeout: 20000 });
  assert.equal(await vaultValue(page, "quarantine", quarantineKey), firstRecoveryEntry,
    "later healthy recordings mutated the immutable corruption audit entry");
  assert.equal(await vaultValue(page, "journals", interrupted.id), undefined,
    "later healthy recordings revived the quarantined journal");
});
