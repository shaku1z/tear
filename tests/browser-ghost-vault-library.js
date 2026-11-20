const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");
const { STATE_WAIT_MS } = require("./browser-waits");

withJourney({ name: "C28 Ghost Vault player library" }, async ({ page, boot, waitScreen }) => {
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__ && window.__TEAR_GHOST_V3__, undefined, {
    timeout: STATE_WAIT_MS,
  });
  await page.evaluate(() => {
    const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    environment.reset({
      format: "tear-contract",
      kind: "scenario",
      schemaVersion: 1,
      id: "c28-vault-library",
      version: 1,
      description: "C28 player-facing Vault proof",
      stateClass: "recorded-canonical",
      executionClass: "engineering",
      seed: "c28-vault-seed",
      start: { mode: "endless", difficulty: "normal", weapon: "sword" },
      maxTicks: 30,
      assertions: ["runtime.finite-state"],
      tags: ["c28", "ghost", "vault"],
    });
    environment.step([{ kind: "command", tick: 1, id: 1, command: { type: "move", x: 1000, y: 0 } }]);
    environment.terminate();
  });
  await page.waitForFunction(() => window.__TEAR_GHOST_V3__.manifest() !== null, undefined, { timeout: STATE_WAIT_MS });
  const manifest = await page.evaluate(() => window.__TEAR_GHOST_V3__.manifest());
  assert.equal(manifest.status, "complete");
  await page.evaluate(
    ({ id, corruptChunkId }) =>
      new Promise((resolve, reject) => {
        const open = window.indexedDB.open("tear-ghost-v3");
        open.onerror = () => reject(open.error ?? new Error("IndexedDB open failed"));
        open.onsuccess = () => {
          const database = open.result;
          const transaction = database.transaction(["indexes", "chunks"], "readwrite");
          transaction.objectStore("indexes").delete(`manifest:${id}`);
          transaction.objectStore("chunks").put("corrupted-by-c28-doctor", corruptChunkId);
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => {
            database.close();
            reject(transaction.error ?? new Error("IndexedDB index removal failed"));
          };
        };
      }),
    { id: manifest.id, corruptChunkId: manifest.chunks[0].id },
  );

  await boot();
  const recoveryRequests = [];
  const recoveryPattern = "**/v1/capsules**",
    blockRecovery = (route) => route.abort("blockedbyclient");
  await page.route(recoveryPattern, blockRecovery);
  const observeRecovery = (request) => {
    if (new URL(request.url()).pathname.startsWith("/v1/capsules")) recoveryRequests.push(request.url());
  };
  page.on("request", observeRecovery);
  const vaultRecords = () =>
    page.evaluate(async () => {
      if (!(await indexedDB.databases()).some((entry) => entry.name === "tear-ghost-v3")) return [];
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open("tear-ghost-v3");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        return await Promise.all(
          [...database.objectStoreNames].sort().map(
            (name) =>
              new Promise((resolve, reject) => {
                const transaction = database.transaction(name, "readonly"),
                  store = transaction.objectStore(name),
                  keys = store.getAllKeys(),
                  values = store.getAll();
                transaction.oncomplete = () =>
                  resolve([name, keys.result.map((key, index) => [key, values.result[index]])]);
                transaction.onerror = () => reject(transaction.error);
              }),
          ),
        );
      } finally {
        database.close();
      }
    });
  const beforeOwnerNavigation = await vaultRecords();
  await page.evaluate(() => {
    const texts = [],
      positions = [];
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
  await page.waitForFunction(() => window.__TEAR_C28_VAULT_TEXT_POSITIONS__?.some((entry) => entry.text === "VAULT"));
  const vaultTab = await page.evaluate(() =>
    window.__TEAR_C28_VAULT_TEXT_POSITIONS__.findLast((entry) => entry.text === "VAULT"),
  );
  await page.mouse.click(vaultTab.x, vaultTab.y); // The drawn VAULT tab label, wherever the tab row puts it.
  // The toolbar is drawn while the Vault is still reading its records, so it does not mean the list
  // is ready. The seeded capsule's row does: it is drawn only once the read has finished.
  await page.waitForFunction(
    () => window.__TEAR_C28_VAULT_TEXT__?.some((text) => text.includes("damaged, can't play")),
    undefined,
    { timeout: STATE_WAIT_MS },
  );
  assert.ok(
    !(await page.evaluate(() => window.__TEAR_C28_VAULT_TEXT__.includes("MY ACCOUNT'S REPLAYS"))),
    "the removed account-recovery control must not be drawn",
  );
  assert.deepEqual(recoveryRequests, [], "normal Vault navigation must not request any cloud capsule");
  assert.deepEqual(
    await vaultRecords(),
    beforeOwnerNavigation,
    "opening/refreshing Vault must not mutate retained data",
  );
  page.off("request", observeRecovery);
  await page.unroute(recoveryPattern, blockRecovery);
  await page.evaluate(() => {
    window.__TEAR_C28_VAULT_TEXT__.length = 0;
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const renderedVaultText = await page.evaluate(() => window.__TEAR_C28_VAULT_TEXT__ ?? []);
  assert.ok(
    renderedVaultText.some((text) => text.includes("damaged, can't play")),
    `Vault did not render the damaged health state: ${renderedVaultText.slice(-80).join(" | ")}`,
  );
  assert.ok(
    !renderedVaultText.includes("Opening your saved replays…"),
    "ready nonempty Vault retained its loading message",
  );
  assert.ok(
    renderedVaultText.includes("CAN'T PLAY"),
    `Vault did not mark the damaged capsule unplayable: ${renderedVaultText.slice(-80).join(" | ")}`,
  );
  assert.ok(!renderedVaultText.includes("REPAIR"), "the removed REPAIR control must not be drawn");
  assert.equal(await page.evaluate(() => window.__PANTHEON_TEST.state().game), "profile");
  assert.deepEqual(
    await vaultRecords(),
    beforeOwnerNavigation,
    "showing a damaged capsule must not rewrite, repair or quarantine it",
  );
})
  .then(() => console.log("browser Ghost Vault player library passed"))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
