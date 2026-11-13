const assert = require("node:assert/strict");
const { withJourney, waitForBrowserValue } = require("./browser-journey-harness");

withJourney({ name: "C28 Ghost Vault player library", port: 8162 }, async ({ page, boot, waitScreen }) => {
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__ && window.__TEAR_GHOST_V3__, undefined, { timeout: 15000 });
  await page.evaluate(() => {
    const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    environment.reset({
      format: "tear-contract", kind: "scenario", schemaVersion: 1,
      id: "c28-vault-library", version: 1, description: "C28 player-facing Vault proof",
      stateClass: "recorded-canonical", executionClass: "engineering", seed: "c28-vault-seed",
      start: { mode: "endless", difficulty: "normal", weapon: "sword" }, maxTicks: 30,
      assertions: ["runtime.finite-state"], tags: ["c28", "ghost", "vault"],
    });
    environment.step([{ kind: "command", tick: 1, id: 1, command: { type: "move", x: 1000, y: 0 } }]);
    environment.terminate();
  });
  await page.waitForFunction(() => window.__TEAR_GHOST_V3__.manifest() !== null, undefined, { timeout: 20000 });
  const manifest = await page.evaluate(() => window.__TEAR_GHOST_V3__.manifest());
  assert.equal(manifest.status, "complete");
  await page.evaluate(({ id, corruptChunkId }) => new Promise((resolve, reject) => {
    const open = window.indexedDB.open("tear-ghost-v3");
    open.onerror = () => reject(open.error ?? new Error("IndexedDB open failed"));
    open.onsuccess = () => {
      const database = open.result;
      const transaction = database.transaction(["indexes", "chunks"], "readwrite");
      transaction.objectStore("indexes").delete(`manifest:${id}`);
      transaction.objectStore("chunks").put("corrupted-by-c28-doctor", corruptChunkId);
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error("IndexedDB index removal failed")); };
    };
  }), { id: manifest.id, corruptChunkId: manifest.chunks[0].id });

  await boot();
  const recoveryRequests = [];
  const recoveryPattern = "**/v1/capsules**", blockRecovery = (route) => route.abort("blockedbyclient");
  await page.route(recoveryPattern, blockRecovery);
  const observeRecovery = (request) => { if (new URL(request.url()).pathname.startsWith("/v1/capsules")) recoveryRequests.push(request.url()); };
  page.on("request", observeRecovery);
  const vaultRecords = () => page.evaluate(async () => {
    if (!(await indexedDB.databases()).some((entry) => entry.name === "tear-ghost-v3")) return [];
    const database = await new Promise((resolve, reject) => { const request = indexedDB.open("tear-ghost-v3"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try {
      return await Promise.all([...database.objectStoreNames].sort().map((name) => new Promise((resolve, reject) => {
        const transaction = database.transaction(name, "readonly"), store = transaction.objectStore(name), keys = store.getAllKeys(), values = store.getAll();
        transaction.oncomplete = () => resolve([name, keys.result.map((key, index) => [key, values.result[index]])]); transaction.onerror = () => reject(transaction.error);
      })));
    } finally { database.close(); }
  });
  const beforeOwnerNavigation = await vaultRecords();
  await page.evaluate(() => {
    const texts = [], positions = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function captureVaultText(text, ...rest) {
      texts.push(String(text));
      positions.push({ text: String(text), x: rest[0], y: rest[1] });
      return original.call(this, text, ...rest);
    };
    window.__TEAR_C28_VAULT_TEXT__ = texts;
    window.__TEAR_C28_VAULT_TEXT_POSITIONS__ = positions;
  });
  await page.mouse.click(260, 266); // PROFILE, through the normal player menu route
  await waitScreen("profile");
  await page.mouse.click(875, 271); // VAULT, the third of four profile tabs
  await page.waitForFunction(() => window.__TEAR_C28_VAULT_TEXT__?.includes("Ghost V3 - COACHING"), undefined, { timeout: 10000 });
  await page.waitForTimeout(250);
  await page.waitForFunction(() => window.__TEAR_C28_VAULT_TEXT__?.includes("MY ACCOUNT'S REPLAYS"), undefined, { timeout: 10000 });
  await page.mouse.click(1210, 90); // Disabled for the actual anonymous/unconfigured normal profile.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.deepEqual(recoveryRequests, [], "normal anonymous Vault navigation/click must not request cloud recovery");
  assert.deepEqual(await vaultRecords(), beforeOwnerNavigation, "opening/refreshing Vault must not mutate retained data");
  page.off("request", observeRecovery);
  await page.unroute(recoveryPattern, blockRecovery);
  if (process.env.TEAR_OWNER_RECOVERY_SCREENSHOT) {
    assert.ok(require("node:path").isAbsolute(process.env.TEAR_OWNER_RECOVERY_SCREENSHOT), "owner recovery screenshot must use an absolute path");
    await page.screenshot({ path: process.env.TEAR_OWNER_RECOVERY_SCREENSHOT });
  }
  await page.evaluate(() => { window.__TEAR_C28_VAULT_TEXT__.length = 0; });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const renderedVaultText = await page.evaluate(() => window.__TEAR_C28_VAULT_TEXT__ ?? []);
  assert.ok(renderedVaultText.some((text) => text.includes("NEEDS REPAIR")), `Vault did not render the Doctor health state: ${renderedVaultText.slice(-80).join(" | ")}`);
  assert.ok(!renderedVaultText.includes("Opening your saved replays…"), "ready nonempty Vault retained its loading message");
  assert.ok(renderedVaultText.includes("REPAIR"), `Vault did not render the repair control: ${renderedVaultText.slice(-80).join(" | ")}`);
  assert.equal(await page.evaluate(() => window.__PANTHEON_TEST.state().game), "profile");
  const repairPosition = await page.evaluate(() => window.__TEAR_C28_VAULT_TEXT_POSITIONS__.findLast((entry) => entry.text === "REPAIR"));
  assert.ok(repairPosition && Number.isFinite(repairPosition.x) && Number.isFinite(repairPosition.y), "REPAIR must have an actual rendered position");
  await page.mouse.click(repairPosition.x, repairPosition.y); // Actual rendered normal control, including the archive header offset.
  const persistedManifests = await waitForBrowserValue(page, () => new Promise((resolve, reject) => {
    const open = window.indexedDB.open("tear-ghost-v3");
    open.onerror = () => reject(open.error ?? new Error("IndexedDB open failed"));
    open.onsuccess = () => {
      const database = open.result;
      const transaction = database.transaction("manifests", "readonly");
      const records = transaction.objectStore("manifests").getAll();
      transaction.oncomplete = () => {
        database.close(); const manifests = records.result.map((entry) => JSON.parse(entry));
        resolve(manifests.some((item) => item.status === "repaired") ? manifests : undefined);
      };
      transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error("IndexedDB manifest read failed")); };
    };
  }));
  const repaired = persistedManifests.find((item) => item.lineage?.parentId === manifest.id && item.status === "repaired");
  await page.waitForFunction(() => window.__TEAR_C28_VAULT_TEXT__?.some((text) => text.includes("GRAVEYARD")), undefined, { timeout: 10000 });
  const repairTexts = await page.evaluate(() => window.__TEAR_C28_VAULT_TEXT__?.slice(-120) ?? []);
  assert.ok(repaired, `player repair did not create a durable child capsule: ${JSON.stringify({ persistedManifests, repairTexts })}`);
  assert.ok(persistedManifests.some((item) => item.id === manifest.id), "player repair removed the original capsule");
  const maintenance = await page.evaluate((id) => new Promise((resolve, reject) => {
    const open = window.indexedDB.open("tear-ghost-v3");
    open.onerror = () => reject(open.error ?? new Error("IndexedDB open failed"));
    open.onsuccess = () => {
      const database = open.result;
      const transaction = database.transaction(["indexes", "analysis", "libraries"], "readonly");
      const index = transaction.objectStore("indexes").get(`manifest:${id}`);
      const report = transaction.objectStore("analysis").get("vault-maintenance:v1");
      const graveyard = transaction.objectStore("libraries").get(`entry:graveyard:graveyard:${id}`);
      transaction.oncomplete = () => { database.close(); resolve({ index: index.result, report: report.result, graveyard: graveyard.result }); };
      transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error("IndexedDB maintenance read failed")); };
    };
  }), manifest.id);
  assert.equal(typeof maintenance.index, "string", "explicit selected repair did not restore its source index");
  const previousReport = beforeOwnerNavigation.find(([store]) => store === "analysis")?.[1].find(([key]) => key === "vault-maintenance:v1")?.[1];
  assert.equal(maintenance.report, previousReport, "selected repair must not run global maintenance or rewrite its report");
  assert.deepEqual(JSON.parse(maintenance.index), { status: manifest.status, createdAt: manifest.createdAt, chunks: manifest.chunks.length });
  const graveyard = JSON.parse(maintenance.graveyard).entry;
  assert.equal(graveyard.library, "graveyard");
  assert.equal(graveyard.ghostId, manifest.id);
  assert.equal(graveyard.rootHash, manifest.rootIntegrity);
  assert.equal(graveyard.provenance.corruptChunks, "1");
  const repairEvidence = await page.evaluate(({ sourceId, childId, chunkId }) => new Promise((resolve, reject) => {
    const open = window.indexedDB.open("tear-ghost-v3");
    open.onerror = () => reject(open.error ?? new Error("IndexedDB open failed"));
    open.onsuccess = () => {
      const database = open.result;
      const transaction = database.transaction(["chunks", "lineage", "manifests", "quarantine"], "readonly");
      const sourceChunk = transaction.objectStore("chunks").get(chunkId);
      const source = transaction.objectStore("manifests").get(sourceId);
      const child = transaction.objectStore("manifests").get(childId);
      const lineage = transaction.objectStore("lineage").get(`repair:${childId}`);
      const quarantine = transaction.objectStore("quarantine").get(`repair:${childId}:${chunkId}`);
      transaction.oncomplete = () => { database.close(); resolve({ source: source.result, sourceChunk: sourceChunk.result, child: child.result, lineage: lineage.result, quarantine: quarantine.result }); };
      transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error("IndexedDB repair read failed")); };
    };
  }), { sourceId: manifest.id, childId: repaired.id, chunkId: manifest.chunks[0].id });
  assert.equal(repairEvidence.source, beforeOwnerNavigation.find(([store]) => store === "manifests")?.[1].find(([key]) => key === manifest.id)?.[1], "repair changed original manifest bytes");
  assert.equal(repairEvidence.sourceChunk, "corrupted-by-c28-doctor", "repair changed the original source bytes");
  assert.equal(JSON.parse(repairEvidence.child).lineage.parentId, manifest.id);
  assert.equal(JSON.parse(repairEvidence.lineage).childId, repaired.id);
  assert.equal(JSON.parse(repairEvidence.quarantine).parentId, manifest.id);
  assert.ok(repairEvidence.quarantine.includes("corrupted-by-c28-doctor"), "quarantine must preserve the original damaged bytes");
}).then(() => console.log("browser Ghost Vault player library passed"))
  .catch((error) => { console.error(error); process.exit(1); });
