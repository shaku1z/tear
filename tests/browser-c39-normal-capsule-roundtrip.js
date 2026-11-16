const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { withJourney } = require("./browser-journey-harness");
const { SLOW_STATE_WAIT_MS, STATE_WAIT_MS, holdFor } = require("./browser-waits");

// This consumer is deliberately separate from unit fixtures. Every producer and
// consumer below owns a fresh browser process; only the normal download survives.
const requestedDirectory = process.env.TEAR_C39_ARTIFACT_DIR;
if (!requestedDirectory || !path.isAbsolute(requestedDirectory))
  throw new Error("Set an absolute unique empty TEAR_C39_ARTIFACT_DIR outside the repository.");
const directory = path.resolve(requestedDirectory),
  repository = path.resolve(__dirname, "..");
const relative = path.relative(repository, directory);
if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)))
  throw new Error("C39 evidence must be outside the source/build tree.");
if (fs.existsSync(directory) && fs.readdirSync(directory).length !== 0)
  throw new Error("Refusing nonempty C39 evidence destination; preserve prior evidence.");
fs.mkdirSync(directory, { recursive: true });
const archivePath = path.join(directory, "normal-download.tearghost.json");
const report = {
  format: "tear-c39-normal-file-browser-evidence",
  schemaVersion: 1,
  classification: "Local normal-file evidence; no remote redundancy, historical-runtime or device-quota claim",
  startedAt: new Date().toISOString(),
  phases: [],
  status: "running",
};
const save = (name, value) =>
  fs.writeFileSync(path.join(directory, name + ".json"), JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
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
      const text = String(value),
        observation = window.__C39_FILE_TEXT__;
      if (text.startsWith("FINALE CONTINUATION   ·")) {
        observation.replay = null;
        observation.frame = null;
        observation.stateHash = null;
        observation.expectStateHash = false;
        observation.paused = null;
      }
      const frame = /^FRAME ([0-9]+)$/u.exec(text);
      if (frame) observation.frame = Number(frame[1]);
      const position = /^([0-9.]+)s · TICK ([0-9]+) \/ ([0-9.]+)s$/u.exec(text);
      if (position)
        observation.replay = {
          elapsed: Number(position[1]),
          tick: Number(position[2]),
          duration: Number(position[3]),
          frame: observation.frame,
        };
      if (text === "▶") observation.paused = true;
      if (text === "❚❚") observation.paused = false;
      if (observation.expectStateHash) {
        observation.stateHash = text;
        observation.expectStateHash = false;
      }
      if (text === "CONTINUATION STATE") observation.expectStateHash = true;
      // The Vault draws one sentence per file status; map it back to the status name.
      const status = [
        ["UNAVAILABLE", "Importing replay files isn't available in this browser."],
        ["PICKING", "Choosing a file…"],
        ["VALIDATING", "Checking the file…"],
        ["READY", "Ready to restore."],
        ["RESTORING", "Restoring…"],
        ["RESELECT-REQUIRED", "Choose the file again to continue."],
        ["COMPLETE", "Restored to this device."],
        ["CANCELLED", "Import cancelled."],
        ["FAILED", "That file couldn't be restored."],
        ["DOWNLOAD-REQUESTED", "Download started."],
      ].find(([, sentence]) => text.startsWith(sentence));
      if (status) observation.status = status[0];
      if (text === "IMPORT A REPLAY FILE") observation.vaultOpen = true;
      if (text === "VAULT") observation.vaultTab = { x: args[0], y: args[1] };
      observation.recent.push(text);
      if (observation.recent.length > 160) observation.recent.shift();
      return original.call(this, value, ...args);
    };
  });
}
async function stores(page) {
  return page.evaluate(async () => {
    if (!(await indexedDB.databases()).some((entry) => entry.name === "tear-ghost-v3"))
      return { absent: true, stores: {} };
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("tear-ghost-v3");
      request.onupgradeneeded = () => {
        request.transaction.abort();
        reject(new Error("Refusing to create a database while observing evidence"));
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const names = Array.from(database.objectStoreNames).sort();
      const result = await new Promise((resolve, reject) => {
        const tx = database.transaction(names, "readonly"),
          rows = {};
        for (const name of names) {
          const store = tx.objectStore(name),
            keys = store.getAllKeys(),
            values = store.getAll();
          values.onsuccess = () => {
            rows[name] = values.result;
          };
          keys.onsuccess = () => {
            rows[name + ":keys"] = keys.result;
          };
        }
        tx.oncomplete = () =>
          resolve(
            Object.fromEntries(
              names.map((name) => [name, rows[name + ":keys"].map((key, index) => [key, rows[name][index]])]),
            ),
          );
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      return { absent: false, stores: result };
    } finally {
      database.close();
    }
  });
}
const jobs = (snapshot) =>
  (snapshot.stores.analysis || [])
    .filter(([key]) => key.startsWith("ghost-cold-restore:job:v1:"))
    .map(([, raw]) => JSON.parse(raw));
const value = (snapshot, store, key) => (snapshot.stores[store] || []).find(([id]) => id === key)?.[1];
async function observe(name, page, buildInfo) {
  const observation = {
    buildInfo,
    ui: await page.evaluate(() => ({
      text: window.__C39_FILE_TEXT__,
      state: window.__PANTHEON_TEST?.state(),
      recorderFailure: window.__TEAR_GHOST_V3__?.failure(),
    })),
    vault: await stores(page),
  };
  save(name, observation);
  return observation;
}
async function waitStatus(page, expected) {
  await page.waitForFunction((status) => window.__C39_FILE_TEXT__?.status === status, expected, {
    timeout: STATE_WAIT_MS,
  });
}
async function openVault(journey) {
  await journey.clickAndWait(260, 266, "profile");
  await journey.page.waitForFunction(() => window.__C39_FILE_TEXT__?.vaultTab, undefined, { timeout: STATE_WAIT_MS });
  const vaultTab = await journey.page.evaluate(() => window.__C39_FILE_TEXT__.vaultTab);
  await journey.page.mouse.click(vaultTab.x, vaultTab.y); // The drawn VAULT tab label.
  await settle(journey.page);
  await journey.page.waitForFunction(() => window.__C39_FILE_TEXT__?.vaultOpen, undefined, {
    timeout: STATE_WAIT_MS,
  });
}
async function chooseFile(page, file, reselect = false) {
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser", { timeout: STATE_WAIT_MS }),
    page.mouse.click(reselect ? 522 : 330, 330),
  ]);
  await chooser.setFiles(file);
  await settle(page);
}
async function assertCustody(name, page, buildInfo) {
  const observation = await observe(name, page, buildInfo),
    snapshot = observation.vault;
  const manifest = JSON.parse(value(snapshot, "manifests", binding.capsuleId) || "null");
  assert.deepEqual(manifest, downloaded.manifest, "restore changed the original manifest");
  for (const entry of downloaded.manifest.chunks)
    assert.equal(
      value(snapshot, "chunks", entry.id),
      downloaded.chunks[entry.id],
      "restore changed an original encoded chunk",
    );
  return observation;
}
async function phase(id, run) {
  console.log("C39 phase " + id);
  await withJourney(
    {
      name: "C39 normal capsule files " + id,
      port: 8181,
      deferBoot: true,
      query: { "ghost-v3-profile": "forensic-qa" },
    },
    async (journey) => {
      await installObservation(journey.page);
      await journey.boot();
      try {
        if (producerBuild)
          assert.deepEqual(journey.buildInfo, producerBuild, "consumer source/build differs from producer");
        await run(journey);
        const evidence = await observe(id + "-terminal", journey.page, journey.buildInfo);
        report.phases.push({ id, status: "passed", vaultSha256: sha256(JSON.stringify(evidence.vault)) });
      } catch (error) {
        let diagnostic;
        try {
          diagnostic = await observe(id + "-failure", journey.page, journey.buildInfo);
        } catch (observationError) {
          save(id + "-observation-error", { message: observationError.message });
        }
        await journey.page.screenshot({ path: path.join(directory, id + "-failure.png") }).catch(() => undefined);
        report.phases.push({
          id,
          status: "failed",
          error: error.message,
          pageErrors: journey.errors,
          observed: diagnostic !== undefined,
        });
        throw error;
      }
    },
  ); // withJourney closes this entire producer/consumer browser before returning.
}

async function main() {
  save("execution-start", {
    classification: report.classification,
    scriptSha256: sha256(fs.readFileSync(__filename)),
    requestedPort: process.env.TEAR_JOURNEY_PORT || "8181",
  });
  await phase("A-producer", async (journey) => {
    const { page, boot, waitScreen, clickAndWait, buildInfo } = journey;
    producerBuild = buildInfo;
    await openVault(journey);
    const empty = await observe("A-empty-vault", page, buildInfo);
    await page.screenshot({ path: path.join(directory, "A-empty-vault.png") });
    assert.equal((empty.vault.stores.manifests || []).length, 0);
    assert.match(empty.ui.text.recent.join("\n"), /IMPORT A REPLAY FILE/u);
    await page.mouse.click(800, 850);
    await waitScreen("menu");
    await clickAndWait(260, 360, "setup");
    await page.mouse.click(430, 255);
    await page.waitForFunction(() => window.__PANTHEON_TEST.state().setup.mode === "endless");
    await page.mouse.click(820, 435);
    await page.waitForFunction(() => window.__PANTHEON_TEST.state().setup.difficulty === "onehit");
    await page.mouse.click(1180, 376);
    await page.waitForFunction(() => window.__PANTHEON_TEST.state().setup.weapon === "chainblade");
    save("A-settings", {
      buildInfo,
      actualSetup: await page.evaluate(() => window.__PANTHEON_TEST.state().setup),
      profile: "forensic-qa",
      lifecycle: "ordinary physical input, natural defeat; deadline failure is not completion",
    });
    await page.keyboard.down("d");
    await page.mouse.click(800, 758);
    await waitScreen("playing");
    await page.keyboard.up("d");
    await page.keyboard.press("Space");
    await page.keyboard.down("d");
    await page.keyboard.press("Shift");
    await page.waitForTimeout(holdFor(220));
    await page.keyboard.up("d");
    // No terminate, forced outcome, semantic stepping, actor patch, or timer-to-success fallback.
    await page.waitForFunction(() => window.__PANTHEON_TEST.state().game === "gameover", undefined, {
      timeout: SLOW_STATE_WAIT_MS,
    });
    await page.waitForFunction(
      () => window.__TEAR_GHOST_V3__.manifest()?.status === "complete" || window.__TEAR_GHOST_V3__.failure() !== null,
      undefined,
      { timeout: STATE_WAIT_MS },
    );
    const natural = await observe("A-natural-closed", page, buildInfo),
      manifest = await page.evaluate(() => window.__TEAR_GHOST_V3__.manifest());
    save("A-natural-manifest", manifest);
    assert.equal(natural.ui.recorderFailure, null);
    assert.equal(manifest.status, "complete");
    await boot();
    await openVault(journey);
    await settle(page);
    await page.waitForFunction(() => window.__C39_FILE_TEXT__?.recent?.includes("DOWNLOAD"), undefined, {
      timeout: STATE_WAIT_MS,
    });
    await observe("A-populated-before-download", page, buildInfo);
    await page.screenshot({ path: path.join(directory, "A-populated-before-download.png") });
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: STATE_WAIT_MS }),
      page.mouse.click(1026, 518),
    ]);
    await download.saveAs(archivePath); // Preserve the real normal-player download before parsing/assertions.
    const hash = createHash("sha256");
    let byteLength = 0;
    for await (const bytes of fs.createReadStream(archivePath)) {
      byteLength += bytes.length;
      hash.update(bytes);
    }
    const fileSha256 = hash.digest("hex");
    save("A-download-file", {
      path: archivePath,
      byteLength,
      sha256: fileSha256,
      suggestedFilename: download.suggestedFilename(),
      failure: await download.failure(),
      buildInfo,
    });
    assert.ok(byteLength > 0 && byteLength <= 64 * 1024 * 1024, "normal download is outside its declared bound");
    downloaded = JSON.parse(fs.readFileSync(archivePath, "utf8"));
    binding = {
      sha256: fileSha256,
      byteLength,
      capsuleId: downloaded.manifest.id,
      rootIntegrity: downloaded.manifest.rootIntegrity,
    };
    save("A-portable-binding", {
      ...binding,
      schemaVersion: downloaded.manifest.schemaVersion,
      fidelity: downloaded.manifest.fidelity,
      source: downloaded.manifest.provenance,
      chunkCount: downloaded.manifest.chunks.length,
    });
    assert.deepEqual(downloaded.manifest, manifest);
    assert.ok(manifest.chunks.length > 0);
    for (const chunk of manifest.chunks) assert.equal(typeof downloaded.chunks[chunk.id], "string");
    await waitStatus(page, "DOWNLOAD-REQUESTED");
    await assertCustody("A-download-custody", page, buildInfo);
  });
  await phase("B-fresh-restore", async (journey) => {
    const { page, boot, buildInfo } = journey;
    await openVault(journey);
    const initial = await observe("B-empty", page, buildInfo);
    assert.equal((initial.vault.stores.manifests || []).length, 0);
    await chooseFile(page, archivePath);
    await waitStatus(page, "READY");
    const preview = await observe("B-preview", page, buildInfo);
    await page.screenshot({ path: path.join(directory, "B-ready-preview.png") });
    assert.equal((preview.vault.stores.manifests || []).length, 0);
    assert.equal(jobs(preview.vault)[0].binding.sha256, binding.sha256);
    await page.mouse.click(714, 330);
    await waitStatus(page, "COMPLETE");
    await observe("B-complete-before-assertions", page, buildInfo);
    await page.screenshot({ path: path.join(directory, "B-complete-restored.png") });
    await assertCustody("B-restored", page, buildInfo);
    await boot();
    await openVault(journey);
    await waitStatus(page, "RESELECT-REQUIRED");
    const historical = await observe("B-historical-complete", page, buildInfo);
    assert.equal(jobs(historical.vault)[0].state, "complete");
    await chooseFile(page, archivePath, true);
    await waitStatus(page, "READY");
    await page.mouse.click(714, 330);
    await waitStatus(page, "COMPLETE");
    const resolved = await assertCustody("B-complete-resolved", page, buildInfo);
    assert.deepEqual(resolved.vault, historical.vault, "complete validation rewrote custody or metadata");
    const before = resolved.vault;
    await boot();
    await openVault(journey);
    await waitStatus(page, "RESELECT-REQUIRED");
    const observed = await observe("B-readonly-catalog-after-reload", page, buildInfo);
    assert.deepEqual(observed.vault, before, "initial file catalog caused a maintenance or custody write");
    const reader = await page.evaluate((id) => window.__TEAR_GHOST_V3__.read(id), binding.capsuleId);
    const admission = await page.evaluate((id) => window.__TEAR_GHOST_V3__.admission(id), binding.capsuleId);
    save("B-reader-admission", { manifest: reader?.manifest, maxTick: reader?.maxTick, admission });
    assert.deepEqual(reader.manifest, downloaded.manifest); // Admission remains an honest separate result.
  });
  await phase("C-pending-resume", async (journey) => {
    const { page, boot, buildInfo } = journey;
    await openVault(journey);
    await chooseFile(page, archivePath);
    await waitStatus(page, "READY");
    const ready = await observe("C-pending-ready", page, buildInfo),
      job = jobs(ready.vault)[0];
    assert.equal(job.state, "ready");
    await boot();
    await openVault(journey);
    await waitStatus(page, "RESELECT-REQUIRED");
    const reloaded = await observe("C-pending-reloaded", page, buildInfo);
    assert.equal((reloaded.vault.stores.manifests || []).length, 0);
    assert.deepEqual(jobs(reloaded.vault)[0], job);
    await chooseFile(page, archivePath, true);
    await waitStatus(page, "READY");
    const reselected = await observe("C-pending-reselected", page, buildInfo);
    assert.deepEqual(jobs(reselected.vault)[0], job);
    assert.equal((reselected.vault.stores.manifests || []).length, 0);
    await page.mouse.click(714, 330);
    await waitStatus(page, "COMPLETE");
    await assertCustody("C-resumed", page, buildInfo);
  });
  await phase("D-ready-cancel", async (journey) => {
    const { page, boot, buildInfo } = journey;
    await openVault(journey);
    await chooseFile(page, archivePath);
    await waitStatus(page, "READY");
    const ready = await observe("D-ready", page, buildInfo),
      job = jobs(ready.vault)[0];
    await page.mouse.click(891, 330);
    await waitStatus(page, "CANCELLED");
    const cancelled = await observe("D-cancelled", page, buildInfo),
      result = jobs(cancelled.vault)[0];
    assert.equal(result.id, job.id);
    assert.equal(result.revision, job.revision + 1);
    assert.equal(result.state, "cancelled");
    assert.equal((cancelled.vault.stores.manifests || []).length, 0);
    assert.equal((cancelled.vault.stores.chunks || []).length, 0);
    assert.equal(
      (cancelled.vault.stores.analysis || []).some(([key]) => key.startsWith("ghost-cold-restore:result:")),
      false,
    );
    await boot();
    await openVault(journey);
    await settle(page);
    const after = await observe("D-cancelled-reload", page, buildInfo);
    assert.deepEqual(after.vault, cancelled.vault, "reload revived a cancelled intent");
  });
  const corrupt = JSON.parse(fs.readFileSync(archivePath, "utf8")),
    first = corrupt.manifest.chunks[0].id;
  corrupt.chunks[first] = (corrupt.chunks[first][0] === "A" ? "B" : "A") + corrupt.chunks[first].slice(1);
  const corruptPath = path.join(directory, "corrupt-derivative.tearghost.json");
  fs.writeFileSync(corruptPath, JSON.stringify(corrupt), { flag: "wx" });
  await phase("E-corrupt-refusal", async (journey) => {
    const { page, buildInfo } = journey;
    await openVault(journey);
    const before = await observe("E-before", page, buildInfo);
    await chooseFile(page, corruptPath);
    await waitStatus(page, "FAILED");
    const after = await observe("E-refused", page, buildInfo);
    assert.deepEqual(after.vault, before.vault, "corrupt selection caused durable writes");
    assert.equal(sha256(fs.readFileSync(archivePath)), binding.sha256, "original download changed");
  });
  report.status = "passed";
  report.binding = binding;
  report.buildInfo = producerBuild;
}
// Optional source fixture route: the input is an existing portable pair, never a
// claim of a natural Campaign. Each phase still uses normal file UI in a fresh browser.
async function pairedMain(input) {
  if (!path.isAbsolute(input) || fs.statSync(input).size > 64 * 1024 * 1024)
    throw new Error("Linked pair input must be an explicit bounded absolute file");
  const original = fs.readFileSync(input),
    envelope = JSON.parse(original.toString("utf8"));
  assert.equal(envelope.format, "tearghost-linked-archive");
  assert.equal(envelope.version, 1);
  const members = [JSON.parse(envelope.parent), JSON.parse(envelope.companion)];
  report.classification =
    "Existing captured source pair through normal file UI; no natural full-Campaign or independent scored-prefix claim";
  const assertPair = async (name, journey) => {
    const observation = await observe(name, journey.page, journey.buildInfo);
    for (const member of members) {
      assert.deepEqual(JSON.parse(value(observation.vault, "manifests", member.manifest.id)), member.manifest);
      for (const [id, encoded] of Object.entries(member.chunks))
        assert.equal(value(observation.vault, "chunks", id), encoded);
    }
    return observation;
  };
  await phase("pair-A-normal-source-download", async (journey) => {
    const { page, buildInfo } = journey;
    producerBuild = buildInfo;
    await openVault(journey);
    await chooseFile(page, input);
    await waitStatus(page, "READY");
    assert.ok(await page.evaluate(() => window.__C39_FILE_TEXT__.recent.includes("RESTORE BOTH")));
    await page.mouse.click(714, 330);
    await waitStatus(page, "COMPLETE");
    await assertPair("pair-A-source-custody", journey);
    await page.waitForFunction(() => window.__C39_FILE_TEXT__.recent.includes("DOWNLOAD RUN + FINALE"));
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: STATE_WAIT_MS }),
      page.mouse.click(1094, 564),
    ]);
    await download.saveAs(archivePath);
    assert.equal(await download.failure(), null);
    downloaded = JSON.parse(fs.readFileSync(archivePath, "utf8"));
    assert.deepEqual(JSON.parse(downloaded.parent), members[0]);
    assert.deepEqual(JSON.parse(downloaded.companion), members[1]);
    save("pair-downloaded-file", {
      byteLength: fs.statSync(archivePath).size,
      sha256: sha256(fs.readFileSync(archivePath)),
      members: members.map((m) => ({ id: m.manifest.id, root: m.manifest.rootIntegrity })),
    });
    await page.screenshot({ path: path.join(directory, "pair-A-download.png") });
  });
  await phase("pair-B-fresh-normal-restore", async (journey) => {
    const { page } = journey;
    await openVault(journey);
    assert.equal(((await stores(page)).stores.manifests || []).length, 0);
    await chooseFile(page, archivePath);
    await waitStatus(page, "READY");
    const ready = await observe("pair-B-preview", page, journey.buildInfo);
    assert.equal((ready.vault.stores.manifests || []).length, 0);
    assert.equal(jobs(ready.vault)[0].schemaVersion, 2);
    assert.ok(ready.ui.text.recent.includes("RESTORE BOTH"));
    await page.screenshot({ path: path.join(directory, "pair-B-preview.png") });
    await page.mouse.click(714, 330);
    await waitStatus(page, "COMPLETE");
    const custodyBefore = await assertPair("pair-B-complete", journey);
    const profileBefore = await page.evaluate(() => ({
      meta: localStorage.getItem("tear_meta"),
      profile: localStorage.getItem("tear_profile_v2"),
    }));
    // Newer companion is first in the normal Vault catalog. The existing exact
    // parent permit and runtime restoration remain authoritative on open.
    // The durable restore completes before the asynchronous catalog refresh.
    await page.waitForFunction(() => window.__C39_FILE_TEXT__.recent.includes("◆ THEATER"), undefined, {
      timeout: STATE_WAIT_MS,
    });
    await settle(page);
    await page.mouse.click(1024, 494);
    await journey.waitScreen("replay");
    await page.waitForFunction(() => window.__C39_FILE_TEXT__.recent.includes("BACK TO SCORED RUN"));
    await page.screenshot({ path: path.join(directory, "pair-B-linked-theater.png") });
    const recorded = await page.evaluate((id) => window.__TEAR_GHOST_V3__.read(id), members[1].manifest.id);
    const frames = recorded.tracks.results
      .filter((entry) => entry.value?.format === "tearghost-finale-frame")
      .map((entry) => entry.value);
    const last = frames.at(-1);
    assert.ok(last?.completed, "portable companion lacks actual final-frame witness");
    const restoration = recorded.tracks.keyframes.find(
      (entry) =>
        entry.value.state["tear.run.v1"].stage === 0 &&
        entry.value.state["tear.world.v1"].runtime.finaleBinding?.state.restoring,
    );
    assert.ok(restoration, "source has no captured stage-zero restoration checkpoint");
    await page.waitForFunction(
      () => window.__C39_FILE_TEXT__.replay !== null && window.__C39_FILE_TEXT__.paused === true,
    );
    const start = await page.evaluate(() => window.__C39_FILE_TEXT__.replay);
    await page.keyboard.press("Space");
    await page.waitForFunction(
      (elapsed) => window.__C39_FILE_TEXT__.paused === false && window.__C39_FILE_TEXT__.replay?.elapsed > elapsed,
      start.elapsed,
    );
    await page.keyboard.press("Space");
    await settle(page);
    assert.equal(
      await page.evaluate(() => window.__C39_FILE_TEXT__.paused),
      true,
      "native Space must pause without activating another UI control",
    );
    await page.mouse.click(1280, 810); // 91% of the actual1600×900 SAFE timeline.
    await page.waitForFunction(() => {
      const p = window.__C39_FILE_TEXT__.replay;
      return p && p.elapsed / p.duration >= 0.9;
    });
    const sought = await page.evaluate(() => window.__C39_FILE_TEXT__.replay);
    assert.ok(sought.tick >= restoration.tick, "scrub did not reach the recorded restoration interval");
    assert.ok(
      frames.some((frame) => frame.cursor.ordinal === sought.frame && frame.tick === sought.tick),
      "rendered position lacks its original frame witness",
    );
    await page.screenshot({ path: path.join(directory, "pair-B-restoration-seek.png") });
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(
      ({ tick, ordinal }) =>
        window.__C39_FILE_TEXT__.replay?.tick === tick && window.__C39_FILE_TEXT__.replay?.frame === ordinal,
      { tick: last.tick, ordinal: last.cursor.ordinal },
    );
    await page.mouse.click(1225, 856); // Existing normal INFO button.
    await page.waitForFunction((hash) => window.__C39_FILE_TEXT__.stateHash === hash, last.stateHash);
    const ended = await page.evaluate(() => window.__C39_FILE_TEXT__);
    save("pair-B-actual-transport", {
      start,
      sought,
      ended,
      originalFinalFrame: last,
      restorationTick: restoration.tick,
    });
    await page.screenshot({ path: path.join(directory, "pair-B-final-frame.png") });
    const custodyAfter = await assertPair("pair-B-after-linked-theater", journey);
    assert.deepEqual(custodyAfter.vault, custodyBefore.vault, "playback/transport changed source bytes or metadata");
    assert.deepEqual(
      await page.evaluate(() => ({
        meta: localStorage.getItem("tear_meta"),
        profile: localStorage.getItem("tear_profile_v2"),
      })),
      profileBefore,
      "playback/transport changed progression",
    );
  });
  assert.deepEqual(fs.readFileSync(input), original);
  report.status = "passed";
  report.buildInfo = producerBuild;
}
const linkedInput = process.env.TEAR_C39_LINKED_PAIR_FILE;
(linkedInput ? pairedMain(path.resolve(linkedInput)) : main())
  .catch((error) => {
    report.status = "failed";
    report.error = { message: error.message, stack: error.stack };
    process.exitCode = 1;
  })
  .finally(() => {
    report.finishedAt = new Date().toISOString();
    save("summary", report);
    console.log(
      JSON.stringify({
        status: report.status,
        directory,
        phases: report.phases.map(({ id, status }) => ({ id, status })),
      }),
    );
  });
