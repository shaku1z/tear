const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");

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
  await page.evaluate((id) => new Promise((resolve, reject) => {
    const open = window.indexedDB.open("tear-ghost-v3");
    open.onerror = () => reject(open.error ?? new Error("IndexedDB open failed"));
    open.onsuccess = () => {
      const database = open.result;
      const transaction = database.transaction("indexes", "readwrite");
      transaction.objectStore("indexes").delete(`manifest:${id}`);
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error("IndexedDB index removal failed")); };
    };
  }), manifest.id);

  await boot();
  await page.evaluate(() => {
    const texts = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function captureVaultText(text, ...rest) {
      texts.push(String(text));
      return original.call(this, text, ...rest);
    };
    window.__TEAR_C28_VAULT_TEXT__ = texts;
  });
  await page.mouse.click(260, 266); // PROFILE, through the normal player menu route
  await waitScreen("profile");
  await page.mouse.click(875, 271); // VAULT, the third of four profile tabs
  await page.waitForFunction(() => window.__TEAR_C28_VAULT_TEXT__?.includes("Ghost V3 - COACHING"), undefined, { timeout: 10000 });
  assert.equal(await page.evaluate(() => window.__PANTHEON_TEST.state().game), "profile");
  assert.deepEqual(await page.evaluate(() => window.__TEAR_GHOST_V3__.manifests().then((items) => items.map((item) => item.id))), [manifest.id]);
  const maintenance = await page.evaluate((id) => new Promise((resolve, reject) => {
    const open = window.indexedDB.open("tear-ghost-v3");
    open.onerror = () => reject(open.error ?? new Error("IndexedDB open failed"));
    open.onsuccess = () => {
      const database = open.result;
      const transaction = database.transaction(["indexes", "analysis"], "readonly");
      const index = transaction.objectStore("indexes").get(`manifest:${id}`);
      const report = transaction.objectStore("analysis").get("vault-maintenance:v1");
      transaction.oncomplete = () => { database.close(); resolve({ index: index.result, report: report.result }); };
      transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error("IndexedDB maintenance read failed")); };
    };
  }), manifest.id);
  assert.equal(typeof maintenance.index, "string", "opening the player Vault did not rebuild its missing index");
  const report = JSON.parse(maintenance.report);
  assert.equal(report.maximumBytes, 256 * 1024 * 1024);
  assert.ok(report.integrity.some((entry) => entry.id === manifest.id && entry.healthy === true));
}).then(() => console.log("browser Ghost Vault player library passed"))
  .catch((error) => { console.error(error); process.exit(1); });
