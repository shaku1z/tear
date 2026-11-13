const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { withJourney, waitForBrowserValue } = require("./browser-journey-harness");

// Produced by the focused native observation unit case using actual source
// training/evaluation owners. This is engineering synthetic data, not learned
// quality or participant evidence. Never hand-author an active pointer here.
const fixturePath = process.env.TEAR_C37_NATIVE_FIXTURE;
assert.ok(fixturePath && path.isAbsolute(fixturePath), "Set TEAR_C37_NATIVE_FIXTURE to the generated native awaiting-promotion fixture.");
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
assert.equal(fixture.format, "tear-c37-native-promotion-fixture");
assert.equal(fixture.classification, "engineering-synthetic-source-control");
assert.ok(fixture.stores && fixture.scheduleHash);
const evidence = process.env.TEAR_C37_ARTIFACT_DIR;
if (evidence) { assert.ok(path.isAbsolute(evidence)); fs.mkdirSync(evidence, { recursive: true }); }
const save = (name, value) => { if (evidence) fs.writeFileSync(path.join(evidence, name + ".json"), JSON.stringify(value, null, 2), { flag: "wx" }); };
async function settle(page) { await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function installText(page) {
  await page.addInitScript(() => {
    window.__C37_TEXT__ = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function c37Text(value, x, y, ...rest) {
      window.__C37_TEXT__.push({ text: String(value), x, y, at: performance.now() });
      if (window.__C37_TEXT__.length > 600) window.__C37_TEXT__.splice(0, 300);
      return original.call(this, value, x, y, ...rest);
    };
  });
}
async function clickText(page, label) {
  try {
    await page.waitForFunction((text) => window.__C37_TEXT__?.some((entry) => entry.text === text && performance.now() - entry.at < 250), label);
  } catch (error) {
    const context = await page.evaluate(() => ({ labelState: window.__PANTHEON_TEST?.state(), text: window.__C37_TEXT__ }));
    console.error(`Missing Run Monitor control ${label}: ${JSON.stringify(context)}`);
    if (evidence) await page.screenshot({ path: path.join(evidence, "missing-control.png") });
    throw error;
  }
  const position = await page.evaluate((text) => window.__C37_TEXT__.filter((entry) => entry.text === text).at(-1), label);
  await page.mouse.click(position.x, position.y - 4); await settle(page);
}
async function readAnalysis(page) {
  return page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("tear-ghost-v3", 2); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try { return await new Promise((resolve, reject) => {
      const tx = database.transaction(["analysis", "indexes"], "readonly"), result = {};
      for (const name of ["analysis", "indexes"]) {
        const store = tx.objectStore(name), keys = store.getAllKeys(), values = store.getAll();
        keys.onsuccess = () => { result[name + "Keys"] = keys.result; }; values.onsuccess = () => { result[name + "Values"] = values.result; };
      }
      tx.oncomplete = () => resolve(Object.fromEntries(["analysis", "indexes"].map((name) => [name, result[name + "Keys"].map((key, index) => [key, result[name + "Values"][index]])])));
      tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    }); } finally { database.close(); }
  });
}
const value = (snapshot, key) => snapshot.analysis.find(([id]) => id === key)?.[1];
const monitorRows = (snapshot) => snapshot.analysis.filter(([key]) => key.startsWith("foundry-job-v3-post-promotion-monitor:v1:"));

withJourney({ name: "normal native Run Monitor observation", port: 8180, deferBoot: true }, async ({ page, boot, waitScreen, buildInfo }) => {
  await installText(page); await boot();
  await page.evaluate(async (input) => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("tear-ghost-v3", 2); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try { await new Promise((resolve, reject) => {
      const names = Object.keys(input.stores), tx = database.transaction(names, "readwrite");
      for (const name of names) for (const [key, raw] of input.stores[name]) tx.objectStore(name).put(raw, key);
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    }); } finally { database.close(); }
  }, fixture);
  await boot();
  // The normal 220px menu button clips this long label through fitLine.
  // Click its authored logical center and require the actual screen transition.
  await page.mouse.click(548, 757); await waitScreen("foundry");
  await clickText(page, "PROMOTE");
  await waitForBrowserValue(page, async () => {
    const database = await new Promise((resolve) => { const request = indexedDB.open("tear-ghost-v3", 2); request.onsuccess = () => resolve(request.result); });
    try { return await new Promise((resolve) => { const tx = database.transaction("analysis", "readonly"), request = tx.objectStore("analysis").getAllKeys(); request.onsuccess = () => resolve(request.result.some((key) => key.startsWith("training-operations-v3-promotion-cycle:v1:"))); }); }
    finally { database.close(); }
  });
  const promoted = await readAnalysis(page); save("native-promoted", { buildInfo, stores: promoted });
  const activeRaw = value(promoted, "policy-active:v1"), active = JSON.parse(activeRaw);
  assert.ok(promoted.analysis.some(([key, raw]) => key.startsWith("foundry-job-v3-promotion-approval:") && JSON.parse(raw).format === "training-operations-v3-native-promotion-approval"));
  await clickText(page, "‹  BACK"); await waitScreen("menu");
  await clickText(page, "REPLAY HUB"); await waitScreen("ghostlab");
  await clickText(page, "START RUN MONITOR"); await waitScreen("playing");
  await page.waitForTimeout(250); await page.keyboard.press("p"); await waitScreen("paused");
  await clickText(page, "PAUSE RUN MONITOR"); await page.waitForTimeout(500);
  const paused = await readAnalysis(page); save("paused", paused);
  const beforePause = paused.analysis.filter(([key]) => key.startsWith("policy-decision-journal:v1:watch-policy:v1:normal:"));
  assert.equal(beforePause.length, 1);
  await page.waitForTimeout(200);
  assert.deepEqual((await readAnalysis(page)).analysis.filter(([key]) => key.startsWith("policy-decision-journal:v1:watch-policy:v1:normal:")), beforePause, "pause changed its observation journal");
  await clickText(page, "RESUME RUN MONITOR"); await waitScreen("playing");
  await page.waitForTimeout(200); await page.keyboard.press("p"); await waitScreen("paused");
  await clickText(page, "STOP RUN MONITOR");
  // Return through normal menu controls; the stopped controller now reports the durable result in Replay Hub.
  await clickText(page, "MAIN MENU"); await waitScreen("confirmquit");
  await clickText(page, "QUIT"); await waitScreen("menu");
  await clickText(page, "REPLAY HUB"); await waitScreen("ghostlab");
  await page.waitForFunction(() => window.__C37_TEXT__?.some((entry) => /^(Previous observation retained|Observation retained): stopped/u.test(entry.text)));
  const retained = await readAnalysis(page); save("retained", { buildInfo, stores: retained, text: await page.evaluate(() => window.__C37_TEXT__) });
  if (evidence) await page.screenshot({ path: path.join(evidence, "normal-observation-retained.png") });
  const rows = monitorRows(retained); assert.equal(rows.length, 1);
  const record = JSON.parse(rows[0][1]);
  assert.equal(record.evidence.terminalStatus, "stopped"); assert.equal(record.promotion.activationHash, active.activationHash);
  assert.equal(record.classification, "threshold-breach", "user stop was relabelled as passing health");
  const journals = retained.analysis.filter(([key]) => key.startsWith("policy-decision-journal:v1:watch-policy:v1:normal:"));
  assert.equal(journals.length, 1);
  const journal = JSON.parse(journals[0][1]);
  assert.equal(journal.droppedEntries, 0); assert.ok(journal.entries.length > 0 && journal.entries.length <= 256);
  assert.equal(record.evidence.journalHash, journal.journalHash);
  assert.ok(journal.entries.every((entry) => entry.receipt.source === "artifact" && entry.receipt.activationHash === active.activationHash && entry.receipt.artifactHash === active.artifactHash));
  assert.equal(value(retained, "policy-active:v1"), activeRaw, "observation changed the active pointer");
  await boot(); await clickText(page, "REPLAY HUB"); await waitScreen("ghostlab");
  await page.waitForFunction(() => window.__C37_TEXT__?.some((entry) => entry.text.startsWith("Previous observation retained: stopped")));
  const reload = await readAnalysis(page); save("reloaded", { buildInfo, stores: reload });
  assert.deepEqual(monitorRows(reload), rows); assert.equal(value(reload, "policy-active:v1"), activeRaw);
  await clickText(page, "‹  BACK"); await waitScreen("menu");
  await page.mouse.click(548, 757); await waitScreen("foundry");
  await clickText(page, "RESTORE BASELINE");
  await waitForBrowserValue(page, async () => {
    const database = await new Promise((resolve, reject) => { const request = indexedDB.open("tear-ghost-v3", 2); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { return await new Promise((resolve, reject) => { const tx = database.transaction("analysis", "readonly"), request = tx.objectStore("analysis").getAllKeys(); request.onsuccess = () => resolve(request.result.some((key) => key.startsWith("training-operations-v3-post-promotion-cycle:v1:"))); request.onerror = () => reject(request.error); }); }
    finally { database.close(); }
  });
  const restored = await readAnalysis(page); save("baseline-restored", { buildInfo, stores: restored, text: await page.evaluate(() => window.__C37_TEXT__) });
  if (evidence) await page.screenshot({ path: path.join(evidence, "baseline-restored.png") });
  const approval = JSON.parse(promoted.analysis.find(([key, raw]) => key.startsWith("foundry-job-v3-promotion-approval:") && JSON.parse(raw).format === "training-operations-v3-native-promotion-approval")[1]);
  const restoredActiveRaw = value(restored, "policy-active:v1"), restoredActive = JSON.parse(restoredActiveRaw);
  assert.equal(restoredActive.artifactId, approval.rollbackBaseline.artifactId);
  assert.equal(restoredActive.artifactHash, approval.rollbackBaseline.artifactHash);
  assert.equal(restoredActive.revision, active.revision + 1);
  assert.equal(restoredActive.previousArtifactId, active.artifactId);
  const terminals = restored.analysis.filter(([key]) => key.startsWith("training-operations-v3-post-promotion-cycle:v1:"));
  assert.equal(terminals.length, 1);
  const terminal = JSON.parse(terminals[0][1]);
  assert.equal(terminal.intent.baselineActivationHash, approval.rollbackBaseline.activationHash);
  assert.equal(terminal.intent.monitorHash, record.recordHash);
  assert.equal(terminal.receipt.rollback.activationHash, restoredActive.activationHash);
  assert.deepEqual(monitorRows(restored), rows, "explicit restoration relabelled its stopped observation");
  const allowance = restored.analysis.filter(([key]) => key.startsWith("training-operations-budget:v1:"));
  await boot(); await page.mouse.click(548, 757); await waitScreen("foundry");
  await page.waitForFunction(() => window.__C37_TEXT__?.some((entry) => entry.text === "BASELINE RESTORED / retained after reload"));
  const restoredReload = await readAnalysis(page); save("restored-reloaded", { buildInfo, stores: restoredReload });
  assert.equal(value(restoredReload, "policy-active:v1"), restoredActiveRaw);
  assert.deepEqual(restoredReload.analysis.filter(([key]) => key.startsWith("training-operations-v3-post-promotion-cycle:v1:")), terminals);
  assert.deepEqual(restoredReload.analysis.filter(([key]) => key.startsWith("training-operations-budget:v1:")), allowance, "reload recharged restoration");
}).then(() => { console.log("normal native Run Monitor observation and explicit baseline restoration passed (engineering synthetic source fixture)"); }).catch((error) => { console.error(error); process.exit(1); });
