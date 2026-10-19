/* eslint-disable @typescript-eslint/no-require-imports -- direct Node browser evidence consumer. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { withJourney } = require("./browser-journey-harness");

// This consumer is deliberately separate from unit fixtures. Every producer and
// consumer below owns a fresh browser process; only the normal download survives.
const requestedDirectory = process.env.TEAR_C39_ARTIFACT_DIR;
if (!requestedDirectory || !path.isAbsolute(requestedDirectory)) throw new Error("Set an absolute unique empty TEAR_C39_ARTIFACT_DIR outside the repository.");
const directory = path.resolve(requestedDirectory), repository = path.resolve(__dirname, "..");
const relative = path.relative(repository, directory);
if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) throw new Error("C39 evidence must be outside the source/build tree.");
if (fs.existsSync(directory) && fs.readdirSync(directory).length !== 0) throw new Error("Refusing nonempty C39 evidence destination; preserve prior evidence.");
fs.mkdirSync(directory, { recursive: true });
const archivePath = path.join(directory, "normal-download.tearghost.json");
const report = { format: "tear-c39-normal-file-browser-evidence", schemaVersion: 1, classification: "Local normal-file evidence; no remote redundancy, historical-runtime or device-quota claim", startedAt: new Date().toISOString(), phases: [], status: "running" };
const save = (name, value) => fs.writeFileSync(path.join(directory, name + ".json"), JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
let downloaded, binding, producerBuild;

async function settle(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function installObservation(page) {
  await page.addInitScript(() => {
    window.__C39_FILE_TEXT__ = { status: null, recent: [] };
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function c39FileText(value, ...args) {
      const text = String(value), observation = window.__C39_FILE_TEXT__;
      if (/^(IDLE|UNAVAILABLE|PICKING|VALIDATING|READY|RESTORING|RESELECT-REQUIRED|COMPLETE|CANCELLED|FAILED|DOWNLOAD-REQUESTED) \/ /u.test(text)) observation.status = text;
      observation.recent.push(text); if (observation.recent.length > 160) observation.recent.shift();
      return original.call(this, value, ...args);
    };
  });
}
async function stores(page) {
  return page.evaluate(async () => {
    if (!(await indexedDB.databases()).some((entry) => entry.name === "tear-ghost-v3")) return { absent: true, stores: {} };
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("tear-ghost-v3");
      request.onupgradeneeded = () => { request.transaction.abort(); reject(new Error("Refusing to create a database while observing evidence")); };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      const names = Array.from(database.objectStoreNames).sort();
      const result = await new Promise((resolve, reject) => {
        const tx = database.transaction(names, "readonly"), rows = {};
        for (const name of names) {
          const store = tx.objectStore(name), keys = store.getAllKeys(), values = store.getAll();
          values.onsuccess = () => { rows[name] = values.result; };
          keys.onsuccess = () => { rows[name + ":keys"] = keys.result; };
        }
        tx.oncomplete = () => resolve(Object.fromEntries(names.map((name) => [name, rows[name + ":keys"].map((key, index) => [key, rows[name][index]])])));
        tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      });
      return { absent: false, stores: result };
    } finally { database.close(); }
  });
}
const jobs = (snapshot) => (snapshot.stores.analysis || []).filter(([key]) => key.startsWith("ghost-cold-restore:job:v1:")).map(([, raw]) => JSON.parse(raw));
const value = (snapshot, store, key) => (snapshot.stores[store] || []).find(([id]) => id === key)?.[1];
async function observe(name, page, buildInfo) {
  const observation = { buildInfo, ui: await page.evaluate(() => ({ text: window.__C39_FILE_TEXT__, state: window.__PANTHEON_TEST?.state(), recorderFailure: window.__TEAR_GHOST_V3__?.failure() })), vault: await stores(page) };
  save(name, observation); return observation;
}
async function waitStatus(page, expected) {
  await page.waitForFunction((status) => window.__C39_FILE_TEXT__?.status?.startsWith(status + " / "), expected, { timeout: 30000 });
}
async function openVault(journey) {
  await journey.clickAndWait(260, 266, "profile");
  await journey.page.mouse.click(875, 271); await settle(journey.page);
  await journey.page.waitForFunction(() => window.__C39_FILE_TEXT__?.status !== null, undefined, { timeout: 15000 });
}
async function chooseFile(page, file, reselect = false) {
  const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 10000 }), page.mouse.click(reselect ? 522 : 330, 330)]);
  await chooser.setFiles(file); await settle(page);
}
async function assertCustody(name, page, buildInfo) {
  const observation = await observe(name, page, buildInfo), snapshot = observation.vault;
  const manifest = JSON.parse(value(snapshot, "manifests", binding.capsuleId) || "null");
  assert.deepEqual(manifest, downloaded.manifest, "restore changed the original manifest");
  for (const entry of downloaded.manifest.chunks) assert.equal(value(snapshot, "chunks", entry.id), downloaded.chunks[entry.id], "restore changed an original encoded chunk");
  return observation;
}
async function phase(id, run) {
  console.log("C39 phase " + id);
  await withJourney({ name: "C39 normal capsule files " + id, port: 8181, deferBoot: true, query: { "ghost-v3-profile": "forensic-qa" } }, async (journey) => {
    await installObservation(journey.page); await journey.boot();
    try {
      if (producerBuild) assert.deepEqual(journey.buildInfo, producerBuild, "consumer source/build differs from producer");
      await run(journey);
      const evidence = await observe(id + "-terminal", journey.page, journey.buildInfo);
      report.phases.push({ id, status: "passed", vaultSha256: sha256(JSON.stringify(evidence.vault)) });
    } catch (error) {
      let diagnostic;
      try { diagnostic = await observe(id + "-failure", journey.page, journey.buildInfo); }
      catch (observationError) { save(id + "-observation-error", { message: observationError.message }); }
      await journey.page.screenshot({ path: path.join(directory, id + "-failure.png") }).catch(() => undefined);
      report.phases.push({ id, status: "failed", error: error.message, pageErrors: journey.errors, observed: diagnostic !== undefined });
      throw error;
    }
  }); // withJourney closes this entire producer/consumer browser before returning.
}

async function main() {
  save("execution-start", { classification: report.classification, scriptSha256: sha256(fs.readFileSync(__filename)), requestedPort: process.env.TEAR_JOURNEY_PORT || "8181" });
  await phase("A-producer", async (journey) => {
    const { page, boot, waitScreen, clickAndWait, buildInfo } = journey; producerBuild = buildInfo;
    await openVault(journey); const empty = await observe("A-empty-vault", page, buildInfo);
    await page.screenshot({ path: path.join(directory, "A-empty-vault.png") });
    assert.equal((empty.vault.stores.manifests || []).length, 0); assert.match(empty.ui.text.recent.join("\n"), /SELECT ARCHIVE/u);
    await page.mouse.click(800, 850); await waitScreen("menu"); await clickAndWait(260, 360, "setup");
    await page.mouse.click(430, 255); await page.waitForFunction(() => window.__PANTHEON_TEST.state().setup.mode === "endless");
    await page.mouse.click(820, 435); await page.waitForFunction(() => window.__PANTHEON_TEST.state().setup.difficulty === "onehit");
    await page.mouse.click(1180, 376); await page.waitForFunction(() => window.__PANTHEON_TEST.state().setup.weapon === "chainblade");
    save("A-settings", { buildInfo, actualSetup: await page.evaluate(() => window.__PANTHEON_TEST.state().setup), profile: "forensic-qa", lifecycle: "ordinary physical input, natural defeat; deadline failure is not completion" });
    await page.keyboard.down("d"); await page.mouse.click(800, 758); await waitScreen("playing");
    await page.keyboard.up("d"); await page.keyboard.press("Space"); await page.keyboard.down("d"); await page.keyboard.press("Shift");
    await page.waitForTimeout(220); await page.keyboard.up("d");
    // No terminate, forced outcome, semantic stepping, actor patch, or timer-to-success fallback.
    await page.waitForFunction(() => window.__PANTHEON_TEST.state().game === "gameover", undefined, { timeout: 90000 });
    await page.waitForFunction(() => window.__TEAR_GHOST_V3__.manifest()?.status === "complete" || window.__TEAR_GHOST_V3__.failure() !== null, undefined, { timeout: 20000 });
    const natural = await observe("A-natural-closed", page, buildInfo), manifest = await page.evaluate(() => window.__TEAR_GHOST_V3__.manifest());
    save("A-natural-manifest", manifest); assert.equal(natural.ui.recorderFailure, null); assert.equal(manifest.status, "complete");
    await boot(); await openVault(journey); await settle(page);
    await observe("A-populated-before-download", page, buildInfo); await page.screenshot({ path: path.join(directory, "A-populated-before-download.png") });
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), page.mouse.click(1026, 518)]);
    await download.saveAs(archivePath); // Preserve the real normal-player download before parsing/assertions.
    const hash = createHash("sha256"); let byteLength = 0;
    for await (const bytes of fs.createReadStream(archivePath)) { byteLength += bytes.length; hash.update(bytes); }
    const fileSha256 = hash.digest("hex"); save("A-download-file", { path: archivePath, byteLength, sha256: fileSha256, suggestedFilename: download.suggestedFilename(), failure: await download.failure(), buildInfo });
    assert.ok(byteLength > 0 && byteLength <= 64 * 1024 * 1024, "normal download is outside its declared bound");
    downloaded = JSON.parse(fs.readFileSync(archivePath, "utf8"));
    binding = { sha256: fileSha256, byteLength, capsuleId: downloaded.manifest.id, rootIntegrity: downloaded.manifest.rootIntegrity };
    save("A-portable-binding", { ...binding, schemaVersion: downloaded.manifest.schemaVersion, fidelity: downloaded.manifest.fidelity, source: downloaded.manifest.provenance, chunkCount: downloaded.manifest.chunks.length });
    assert.deepEqual(downloaded.manifest, manifest); assert.ok(manifest.chunks.length > 0);
    for (const chunk of manifest.chunks) assert.equal(typeof downloaded.chunks[chunk.id], "string");
    await waitStatus(page, "DOWNLOAD-REQUESTED"); await assertCustody("A-download-custody", page, buildInfo);
  });
  await phase("B-fresh-restore", async (journey) => {
    const { page, boot, buildInfo } = journey; await openVault(journey); const initial = await observe("B-empty", page, buildInfo);
    assert.equal((initial.vault.stores.manifests || []).length, 0);
    await chooseFile(page, archivePath); await waitStatus(page, "READY"); const preview = await observe("B-preview", page, buildInfo);
    await page.screenshot({ path: path.join(directory, "B-ready-preview.png") });
    assert.equal((preview.vault.stores.manifests || []).length, 0); assert.equal(jobs(preview.vault)[0].binding.sha256, binding.sha256);
    await page.mouse.click(714, 330); await waitStatus(page, "COMPLETE"); await observe("B-complete-before-assertions", page, buildInfo);
    await page.screenshot({ path: path.join(directory, "B-complete-restored.png") }); await assertCustody("B-restored", page, buildInfo);
    await boot(); await openVault(journey); await waitStatus(page, "RESELECT-REQUIRED"); const historical = await observe("B-historical-complete", page, buildInfo);
    assert.equal(jobs(historical.vault)[0].state, "complete");
    await chooseFile(page, archivePath, true); await waitStatus(page, "READY"); await page.mouse.click(714, 330); await waitStatus(page, "COMPLETE");
    const resolved = await assertCustody("B-complete-resolved", page, buildInfo); assert.deepEqual(resolved.vault, historical.vault, "complete validation rewrote custody or metadata");
    const before = resolved.vault; await boot(); await openVault(journey); await waitStatus(page, "RESELECT-REQUIRED");
    const observed = await observe("B-readonly-catalog-after-reload", page, buildInfo); assert.deepEqual(observed.vault, before, "initial file catalog caused a maintenance or custody write");
    const reader = await page.evaluate((id) => window.__TEAR_GHOST_V3__.read(id), binding.capsuleId);
    const admission = await page.evaluate((id) => window.__TEAR_GHOST_V3__.admission(id), binding.capsuleId);
    save("B-reader-admission", { manifest: reader?.manifest, maxTick: reader?.maxTick, admission });
    assert.deepEqual(reader.manifest, downloaded.manifest); // Admission remains an honest separate result.
  });
  await phase("C-pending-resume", async (journey) => {
    const { page, boot, buildInfo } = journey; await openVault(journey); await chooseFile(page, archivePath); await waitStatus(page, "READY");
    const ready = await observe("C-pending-ready", page, buildInfo), job = jobs(ready.vault)[0]; assert.equal(job.state, "ready");
    await boot(); await openVault(journey); await waitStatus(page, "RESELECT-REQUIRED"); const reloaded = await observe("C-pending-reloaded", page, buildInfo);
    assert.equal((reloaded.vault.stores.manifests || []).length, 0); assert.deepEqual(jobs(reloaded.vault)[0], job);
    await chooseFile(page, archivePath, true); await waitStatus(page, "READY"); const reselected = await observe("C-pending-reselected", page, buildInfo);
    assert.deepEqual(jobs(reselected.vault)[0], job); assert.equal((reselected.vault.stores.manifests || []).length, 0);
    await page.mouse.click(714, 330); await waitStatus(page, "COMPLETE"); await assertCustody("C-resumed", page, buildInfo);
  });
  await phase("D-ready-cancel", async (journey) => {
    const { page, boot, buildInfo } = journey; await openVault(journey); await chooseFile(page, archivePath); await waitStatus(page, "READY");
    const ready = await observe("D-ready", page, buildInfo), job = jobs(ready.vault)[0];
    await page.mouse.click(891, 330); await waitStatus(page, "CANCELLED"); const cancelled = await observe("D-cancelled", page, buildInfo), result = jobs(cancelled.vault)[0];
    assert.equal(result.id, job.id); assert.equal(result.revision, job.revision + 1); assert.equal(result.state, "cancelled");
    assert.equal((cancelled.vault.stores.manifests || []).length, 0); assert.equal((cancelled.vault.stores.chunks || []).length, 0);
    assert.equal((cancelled.vault.stores.analysis || []).some(([key]) => key.startsWith("ghost-cold-restore:result:")), false);
    await boot(); await openVault(journey); await settle(page); const after = await observe("D-cancelled-reload", page, buildInfo);
    assert.deepEqual(after.vault, cancelled.vault, "reload revived a cancelled intent");
  });
  const corrupt = JSON.parse(fs.readFileSync(archivePath, "utf8")), first = corrupt.manifest.chunks[0].id;
  corrupt.chunks[first] = (corrupt.chunks[first][0] === "A" ? "B" : "A") + corrupt.chunks[first].slice(1);
  const corruptPath = path.join(directory, "corrupt-derivative.tearghost.json"); fs.writeFileSync(corruptPath, JSON.stringify(corrupt), { flag: "wx" });
  await phase("E-corrupt-refusal", async (journey) => {
    const { page, buildInfo } = journey; await openVault(journey); const before = await observe("E-before", page, buildInfo);
    await chooseFile(page, corruptPath); await waitStatus(page, "FAILED"); const after = await observe("E-refused", page, buildInfo);
    assert.deepEqual(after.vault, before.vault, "corrupt selection caused durable writes");
    assert.equal(sha256(fs.readFileSync(archivePath)), binding.sha256, "original download changed");
  });
  report.status = "passed"; report.binding = binding; report.buildInfo = producerBuild;
}
main().catch((error) => { report.status = "failed"; report.error = { message: error.message, stack: error.stack }; process.exitCode = 1; })
  .finally(() => { report.finishedAt = new Date().toISOString(); save("summary", report); console.log(JSON.stringify({ status: report.status, directory, phases: report.phases.map(({ id, status }) => ({ id, status })) })); });
