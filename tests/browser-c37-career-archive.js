const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { mkdir, readFile, writeFile } = require("node:fs/promises");
const { join } = require("node:path");
const { withJourney, waitForBrowserValue } = require("./browser-journey-harness");

withJourney({ name: "C37 Career Archive", port: 8155, deferBoot: true, ordinaryWatch: true }, async ({ page, boot, waitScreen, buildInfo, errors }) => {
  const directory = process.env.TEAR_CAREER_ARTIFACT_DIR;
  assert.ok(directory, "Set a unique external TEAR_CAREER_ARTIFACT_DIR");
  await mkdir(directory, { recursive: true });
  await page.addInitScript(() => {
    const positions = [], texts = [], original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (value, ...args) {
      const text = String(value);
      if (text === "CAREER ARCHIVE" || text === "PROFILE" && args[1] > 70 || args[1] < 80 && ["\u25c6 THEATER", "\u25b6 REPLAY"].includes(text)) positions.length = 0;
      positions.push({ text, x: args[0], y: args[1] }); texts.push(text);
      if (texts.length > 20000) texts.splice(0, 10000);
      if (positions.length > 20000) positions.splice(0, 10000);
      return original.call(this, value, ...args);
    };
    window.__CAREER_POSITIONS__ = positions; window.__CAREER_TEXTS__ = texts;
    window.__CAREER_VAULT__ = async () => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open("tear-ghost-v3");
        request.onupgradeneeded = () => { request.transaction.abort(); reject(new Error("Observations cannot create a vault")); };
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      try {
        return await new Promise((resolve, reject) => {
          const names = ["manifests", "chunks", "indexes", "analysis", "settings"], tx = database.transaction(names, "readonly"), values = {}, keys = {};
          for (const name of names) { const store = tx.objectStore(name), k = store.getAllKeys(), v = store.getAll(); k.onsuccess = () => { keys[name] = k.result; }; v.onsuccess = () => { values[name] = v.result; }; }
          tx.oncomplete = () => resolve(Object.fromEntries(names.map((name) => [name, keys[name].map((key, index) => [key, values[name][index]])])));
          tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
        });
      } finally { database.close(); }
    };
  });
  const query = { bossdebug: "1", watchagent: "1" }, evidence = { buildInfo, engineeringOverlayHidden: true, phases: [], sources: [] };
  const settle = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const labels = () => page.evaluate(() => window.__CAREER_POSITIONS__.map((entry) => entry.text));
  const vault = () => page.evaluate(() => window.__CAREER_VAULT__());
  const hash = (value) => createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
  const saved = () => page.evaluate(() => Object.fromEntries(["tear_meta", "tear_profile", "tear_profile_v2"].map((key) => [key, localStorage.getItem(key)])));
  const payload = (value) => { const envelope = JSON.parse(value.tear_profile_v2); if (envelope) { delete envelope.revision; delete envelope.updatedAtMs; } return { ...value, tear_profile_v2: envelope }; };
  const click = async (label) => {
    await page.waitForFunction((text) => window.__CAREER_POSITIONS__.some((entry) => entry.text === text), label, { timeout: 10000 });
    const point = await page.evaluate((text) => window.__CAREER_POSITIONS__.findLast((entry) => entry.text === text), label);
    await page.mouse.click(point.x, point.y); await settle();
  };
  const ordinaryBoot = async () => { await boot(query); await page.waitForFunction(() => window.__TEAR_GHOST_V3__); await page.addStyleTag({ content: "#tear-watch-agent { visibility:hidden!important; }" }); };
  const openCareer = async () => { await page.mouse.click(260, 266); await waitScreen("profile"); await click("CAREER"); await page.waitForFunction(() => window.__CAREER_POSITIONS__.some((entry) => entry.text.startsWith("Page "))); };
  const backToResults = async () => { if ((await labels()).includes("BACK TO RESULTS")) await click("BACK TO RESULTS"); };
  const search = async (id, filters = {}) => {
    await backToResults(); await click("SEARCH / FILTERS");
    const dialog = page.getByRole("dialog"); await dialog.waitFor({ state: "visible" });
    assert.equal(await dialog.locator("input").count(), 19, "Search must expose text plus all eighteen filters");
    for (const input of await dialog.locator("input").all()) await input.fill("");
    await dialog.locator('[name="search"]').fill(id);
    for (const [key, value] of Object.entries(filters)) await dialog.locator(`[name="${key}"]`).fill(value);
    await dialog.getByRole("button", { name: "APPLY", exact: true }).click(); await settle();
  };
  const select = async (id) => {
    await search(id);
    await page.waitForFunction(() => window.__CAREER_POSITIONS__.some((entry) => entry.text.startsWith("1 matches /")));
    const point = await page.evaluate(() => window.__CAREER_POSITIONS__.find((entry) => entry.y >= 132 && entry.y < 170 && entry.text.includes(" · ")));
    assert.ok(point, "Exact source must have a selectable row"); await page.mouse.click(point.x, point.y); await settle();
    assert.ok((await labels()).includes("BACK TO RESULTS"));
  };
  const indexed = async (id) => waitForBrowserValue(page, async (sourceId) => {
    const snapshot = await window.__CAREER_VAULT__();
    const entry = snapshot.indexes.filter(([key]) => key.startsWith("career:v1:")).map(([, raw]) => JSON.parse(raw)).find((entry) => entry.id === sourceId && entry.enriched);
    return entry || null;
  }, id, { timeout: 30000 });
  const assertSourceBytes = (snapshot, original) => {
    assert.equal(snapshot.manifests.find(([key]) => key === original.id)?.[1], original.manifest);
    for (const [key, raw] of original.chunks) assert.equal(snapshot.chunks.find(([id]) => id === key)?.[1], raw, `Changed original chunk ${key}`);
  };
  try {
    await ordinaryBoot();
    // One genuine natural defeat produces the existing visual-only Ghost2 owner.
    await page.mouse.click(260, 360); await waitScreen("setup");
    await page.mouse.click(430, 255); await page.waitForFunction(() => window.__PANTHEON_TEST.state().setup.mode === "endless");
    await page.mouse.click(820, 435); await page.waitForFunction(() => window.__PANTHEON_TEST.state().setup.difficulty === "onehit");
    assert.equal(await page.evaluate(() => window.__PANTHEON_TEST.state().setup.weapon), "sword");
    await page.mouse.click(800, 758); await waitScreen("playing");
    await page.waitForFunction(() => window.__PANTHEON_TEST.state().game === "gameover", undefined, { timeout: 90000 });
    evidence.natural = { fixture: "ordinary setup input and real application frames; natural one-hit defeat, no forced outcome", state: await page.evaluate(() => window.__PANTHEON_TEST.state()) };
    await page.waitForFunction(() => window.__TEAR_GHOST_V3__.manifest()?.status === "complete" || window.__TEAR_GHOST_V3__.failure(), undefined, { timeout: 20000 });
    assert.equal(await page.evaluate(() => window.__TEAR_GHOST_V3__.failure()), null);
    const natural = await page.evaluate(() => window.__TEAR_GHOST_V3__.manifest()); evidence.sources.push(natural.id);
    for (let index = 0; index < 5; index++) {
      await page.evaluate((number) => {
        const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A"), ticks = number === 4 ? 300 : 120;
        environment.reset({ format: "tear-contract", kind: "scenario", schemaVersion: 1, id: `c37-career-${number}`, version: 1, description: "Native retained history fixture",
          stateClass: "recorded-canonical", executionClass: "engineering", seed: `career-source-${number}`, start: { mode: "endless", difficulty: "normal", weapon: "sword" }, maxTicks: ticks, assertions: ["runtime.finite-state"], tags: ["c37", "career"] });
        for (let tick = 1; tick <= ticks; tick++) environment.step(tick === 140 ? [{ kind: "command", tick, id: 1, command: { type: "weapon", intent: "throw", phase: "pressed" } }]
          : tick === 150 ? [{ kind: "command", tick, id: 2, command: { type: "weapon", intent: "recall", phase: "pressed" } }] : []);
        environment.terminate();
      }, index);
      await page.waitForFunction((prior) => window.__TEAR_GHOST_V3__.manifest()?.status === "complete" && window.__TEAR_GHOST_V3__.manifest().id !== prior || window.__TEAR_GHOST_V3__.failure(), evidence.sources.at(-1), { timeout: 20000 });
      assert.equal(await page.evaluate(() => window.__TEAR_GHOST_V3__.failure()), null);
      evidence.sources.push(await page.evaluate(() => window.__TEAR_GHOST_V3__.manifest().id));
    }
    const sourceId = evidence.sources.at(-1), heldId = evidence.sources[1], deletedId = evidence.sources[2];
    const initial = await vault(), originals = evidence.sources.map((id) => { const manifest = initial.manifests.find(([key]) => key === id)?.[1]; assert.ok(manifest); const ids = new Set(JSON.parse(manifest).chunks.map((chunk) => chunk.id)); return { id, manifest, chunks: initial.chunks.filter(([key]) => ids.has(key)) }; });
    const legacy = await page.evaluate(() => { const entries = JSON.parse(localStorage.getItem("tear_vault_index") || "[]"); return entries.map((entry) => ({ ...entry, raw: localStorage.getItem(`tear_vault_${entry.id}`) })); });
    assert.ok(legacy.length > 0 && legacy[0].raw, "Natural outcome must retain an actual legacy recording"); evidence.legacy = legacy.map(({ raw, ...entry }) => ({ ...entry, sha256: hash(raw) }));
    const source = await page.evaluate((id) => window.__TEAR_GHOST_V3__.read(id), sourceId);
    evidence.native = source.tracks.results.filter((entry) => entry.value?.format === "tearghost-career-witness" || entry.value?.kind === "run-dna-metrics-v1");
    assert.ok(evidence.native.some((entry) => entry.value.kind === "coverage")); assert.ok(evidence.native.some((entry) => entry.value.kind === "terminal"));
    await ordinaryBoot(); const progressBefore = await saved(); evidence.progressBefore = progressBefore;
    await openCareer(); const facts = await indexed(sourceId); evidence.facts = facts;
    assert.equal(facts.verified, "receipts"); assert.equal(facts.resumed, false); assert.ok(facts.abilities.includes("throw")); assert.ok(facts.abilities.includes("catch")); assert.deepEqual(facts.categories, ["unupgraded"]); assert.deepEqual(facts.bosses, []);
    await page.waitForFunction(() => window.__CAREER_POSITIONS__.some((entry) => entry.text.startsWith("Page 1 / 3")));
    evidence.pages = [];
    for (let number = 1; number <= 3; number++) { evidence.pages.push(await labels()); if (number < 3) { await click("NEXT"); await page.waitForFunction((n) => window.__CAREER_POSITIONS__.some((entry) => entry.text.startsWith(`Page ${n} / 3`)), number + 1); } }
    assert.ok(evidence.pages[0].some((text) => text.startsWith(`${evidence.sources.length + legacy.length} matches /`)));
    const views = ["ALL RUNS", "PERSONAL BESTS", "FIRST CLEARS", "BEST BY WEAPON", "BOSS CLEAR TIMES", "FAVORITE BUILDS", "BOSS NEAR MISSES", "STYLE MILESTONES", "LONGEST SURVIVAL", "RUN DNA HISTORY"];
    evidence.views = [];
    for (let i = 0; i < views.length; i++) { await click(views[i]); await page.waitForFunction((label) => window.__CAREER_POSITIONS__.some((entry) => entry.text === label), views[(i + 1) % views.length]); evidence.views.push(await labels()); }
    for (const id of [...evidence.sources, ...legacy.map((entry) => entry.id)]) { await search(id); assert.ok((await labels()).some((text) => text.startsWith("1 matches /")), `Retained source missing from whole history: ${id}`); }
    await search(sourceId, { mode: facts.mode, difficulty: facts.difficulty, weapon: facts.weapon, result: facts.result, archetype: "unupgraded", ability: "throw", wave: `${facts.wave}..${facts.wave}`, damage: `${facts.damage}..${facts.damage}`, verified: "receipts", actor: facts.actor, shared: "unknown", resumed: "false", version: facts.gameVersion, date: `${facts.date.slice(0, 10)}..${facts.date.slice(0, 10)}` });
    assert.ok((await labels()).some((text) => text.startsWith("1 matches /"))); evidence.phases.push("whole retained history, three pages and combined native filters");
    await select(sourceId); assert.ok((await labels()).some((text) => text.startsWith("Accepted uses:") && text.includes("throw") && text.includes("catch")));
    await click("TAGS"); await page.getByRole("dialog").locator('[name="tags"]').fill("career-browser, return-catch"); await page.getByRole("dialog").getByRole("button", { name: "APPLY", exact: true }).click();
    await page.waitForFunction(() => window.__CAREER_POSITIONS__.some((entry) => entry.text.startsWith("Tags: career-browser, return-catch")));
    await click("PIN"); await page.waitForFunction(() => window.__CAREER_POSITIONS__.some((entry) => entry.text === "UNPIN"));
    await page.screenshot({ path: join(directory, "desktop-detail.png") });
    await page.setViewportSize({ width: 800, height: 450 }); await settle(); await page.screenshot({ path: join(directory, "compact-detail.png") }); await page.setViewportSize({ width: 1600, height: 900 }); await settle();
    assert.deepEqual(await saved(), progressBefore);
    await ordinaryBoot(); assert.deepEqual(payload(await saved()), payload(progressBefore)); await openCareer(); await indexed(sourceId); await select(sourceId);
    assert.ok((await labels()).includes("UNPIN")); assert.ok((await labels()).some((text) => text.startsWith("Tags: career-browser, return-catch")));
    const afterReload = await saved();
    await click("THEATER"); await waitScreen("replay"); await click("RUN DNA"); await page.waitForFunction(() => window.__CAREER_POSITIONS__.some((entry) => entry.text === "RUN DNA · RECORDED METRICS"));
    await page.keyboard.press("Escape"); await waitScreen("profile"); assert.ok((await labels()).includes("BACK TO RESULTS"));
    await backToResults(); await click("SEARCH / FILTERS"); assert.equal(await page.getByRole("dialog").locator('[name="search"]').inputValue(), sourceId); await page.getByRole("dialog").getByRole("button", { name: "CANCEL", exact: true }).click();
    await select(legacy[0].id); assert.ok((await labels()).some((text) => text.startsWith("OLDER RECORDING (WATCH ONLY)"))); await click("COACH"); assert.equal(await page.evaluate(() => window.__PANTHEON_TEST.state().game), "profile");
    assert.ok((await labels()).some((text) => text.startsWith("OLDER RECORDING (WATCH ONLY)"))); await click("THEATER"); await waitScreen("replay"); await page.keyboard.press("Escape"); await waitScreen("profile");
    assert.equal(await page.evaluate((id) => localStorage.getItem(`tear_vault_${id}`), legacy[0].id), legacy[0].raw);
    evidence.phases.push("tags and pin survive reload; canonical Theater and visual-only legacy playback return to Career");
    // Real independent protection fixture; no forged gameplay/verification/sharing facts.
    await page.evaluate(async (id) => {
      const database = await new Promise((resolve, reject) => { const r = indexedDB.open("tear-ghost-v3"); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      try { await new Promise((resolve, reject) => { const tx = database.transaction(["manifests", "analysis"], "readwrite"), request = tx.objectStore("manifests").get(id); request.onsuccess = () => { const manifest = JSON.parse(request.result), key = `ghost-capsule-protection:v1:${id}`, old = tx.objectStore("analysis").get(key); old.onsuccess = () => { const hold = old.result ? JSON.parse(old.result) : { format: "ghost-capsule-protection", schemaVersion: 1, capsuleId: id, rootIntegrity: manifest.rootIntegrity, owners: [] }; hold.owners = [...new Set([...hold.owners, "career-browser-external-hold"])]; tx.objectStore("analysis").put(JSON.stringify(hold), key); }; }; tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); }); } finally { database.close(); }
    }, heldId);
    await select(heldId); await click("DELETE LOCAL"); await click("DELETE LOCAL");
    await page.waitForFunction(() => window.__CAREER_POSITIONS__.some((entry) => /protected|hold/iu.test(entry.text) && !entry.text.startsWith("Delete local")));
    assertSourceBytes(await vault(), originals.find((entry) => entry.id === heldId)); evidence.protectedRefusal = await labels();
    await select(deletedId); await click("DELETE LOCAL"); await click("DELETE LOCAL");
    await waitForBrowserValue(page, async (id) => !(await window.__CAREER_VAULT__()).manifests.some(([key]) => key === id), deletedId);
    await page.waitForFunction(() => !window.__CAREER_POSITIONS__.some((entry) => entry.text === "BACK TO RESULTS") && window.__CAREER_POSITIONS__.some((entry) => entry.text.startsWith("Page ")));
    await select(sourceId);
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), click("DOWNLOAD")]); const archivePath = join(directory, "career-export.tearghost.json"); await download.saveAs(archivePath);
    const archiveBytes = await readFile(archivePath), archive = JSON.parse(archiveBytes); assert.deepEqual(archive.manifest, source.manifest); evidence.archive = { path: archivePath, bytes: archiveBytes.length, sha256: hash(archiveBytes) };
    await click("DELETE LOCAL"); await click("DELETE LOCAL"); await waitForBrowserValue(page, async (id) => !(await window.__CAREER_VAULT__()).manifests.some(([key]) => key === id), sourceId);
    await click("‹  BACK"); await click("VAULT");
    const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 10000 }), click("IMPORT A REPLAY FILE")]); await chooser.setFiles(archivePath);
    await page.waitForFunction(() => window.__CAREER_POSITIONS__.some((entry) => entry.text.startsWith("READY / ")), undefined, { timeout: 20000 }); await click("RESTORE");
    await page.waitForFunction(() => window.__CAREER_POSITIONS__.some((entry) => entry.text.startsWith("COMPLETE / ")), undefined, { timeout: 30000 });
    await click("CAREER"); await indexed(sourceId);
    await waitForBrowserValue(page, async (id) => (await window.__CAREER_VAULT__()).settings.some(([key, raw]) => key.startsWith(`career-notes:career:v1:${encodeURIComponent(id)}:`) && JSON.parse(raw).retention === "imported"), sourceId);
    await select(sourceId); assert.ok((await labels()).some((text) => text.includes("retention imported"))); await page.screenshot({ path: join(directory, "imported-reopened.png") });
    const final = await vault(); for (const original of originals.filter((entry) => entry.id !== deletedId)) assertSourceBytes(final, original);
    assert.deepEqual(await saved(), afterReload); assert.equal(await page.evaluate((id) => localStorage.getItem(`tear_vault_${id}`), legacy[0].id), legacy[0].raw);
    evidence.phases.push("foreign protection refuses deletion; explicit local deletion; real download and import preserve exact source/chunk bytes");
    evidence.finalIndexes = final.indexes.filter(([key]) => key.startsWith("career:v1:")).map(([key, raw]) => ({ key, entry: JSON.parse(raw) }));
    evidence.sourceBindings = originals.map(({ id, manifest, chunks }) => ({ id, manifestSha256: hash(manifest), chunks: chunks.map(([key, raw]) => ({ id: key, sha256: hash(raw) })) }));
    if (process.env.TEAR_C37_CHASE === "1") {
      // Existing generated sources are engineering recordings, not human skill evidence.
      let chaseSourceId = sourceId;
      if (process.env.TEAR_C37_CHASE_ARCHIVE) {
        const referenceArchive = JSON.parse(await readFile(process.env.TEAR_C37_CHASE_ARCHIVE, "utf8"));
        chaseSourceId = referenceArchive.manifest.id;
        await click("‹  BACK"); await click("VAULT");
        const [referenceChooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 10000 }), click("IMPORT A REPLAY FILE")]);
        await referenceChooser.setFiles(process.env.TEAR_C37_CHASE_ARCHIVE);
        await page.waitForFunction(() => window.__CAREER_POSITIONS__.some((entry) => entry.text.startsWith("READY / ")), undefined, { timeout: 20000 }); await click("RESTORE");
        await page.waitForFunction(() => window.__CAREER_POSITIONS__.some((entry) => entry.text.startsWith("COMPLETE / ")), undefined, { timeout: 30000 });
        await click("CAREER"); await indexed(chaseSourceId);
      }
      const chaseSource = await page.evaluate((id) => window.__TEAR_GHOST_V3__.read(id), chaseSourceId);
      const waveClears = chaseSource.tracks.events.filter((entry) => entry.value?.source === "engine" && entry.value.type === "wave.cleared");
      assert.ok(waveClears.length > 0, "Chase acceptance requires a genuine compatible reference with an actual native wave clear; supply TEAR_C37_CHASE_ARCHIVE if the short Career fixture has none");
      await backToResults(); await click("ALL RUNS"); await select(chaseSourceId);
      assert.ok((await labels()).some((text) => text.includes("CHASE: independent seed")));
      const sourceBeforeChase = await vault();
      await click("CHASE BEST"); await waitScreen("playing"); await page.mouse.click(800, 450);
      await page.waitForFunction(() => window.__CAREER_TEXTS__.some((text) => text.startsWith("CHASE ") && text.includes("NONCOMPETITIVE")), undefined, { timeout: 30000 });
      await page.keyboard.down("d"); await page.waitForTimeout(250); await page.keyboard.up("d");
      evidence.chase = { declaredSource: chaseSource.manifest.provenance?.actor ?? "unknown attribution", nativeWaveClears: waveClears, live: await page.evaluate(() => window.__PANTHEON_TEST.state()) };
      await page.screenshot({ path: join(directory, "chase-live.png") });
      await page.keyboard.press("Escape"); await waitScreen("paused"); await click("HIDE GHOST"); await click("RESUME"); await waitScreen("playing");
      await page.waitForFunction(() => window.__CAREER_TEXTS__.some((text) => text.startsWith("CHASE ") && text.includes("HIDDEN")));
      await page.screenshot({ path: join(directory, "chase-hidden-splits.png") });
      await page.waitForFunction(() => window.__CAREER_POSITIONS__.some((entry) => entry.text.includes("projection unavailable")), undefined, { timeout: 10000 });
      evidence.chase.coverageRefusal = (await labels()).find((text) => text.includes("projection unavailable"));
      await page.keyboard.press("Escape"); await waitScreen("paused"); await click("SHOW GHOST"); await click("STOP CHASE"); await click("RESUME"); await waitScreen("playing");
      await page.waitForFunction(() => window.__CAREER_TEXTS__.some((text) => text.includes("Assisted / noncompetitive run")));
      await page.keyboard.press("Escape"); await waitScreen("paused"); await click("MAIN MENU"); await waitScreen("confirmquit"); await click("QUIT"); await waitScreen("menu");
      const assisted = await waitForBrowserValue(page, async () => {
        const v = await window.__CAREER_VAULT__();
        return v.manifests.map(([, raw]) => JSON.parse(raw)).find((m) => m.status === "complete" && m.provenance?.ghostAssistance?.format === "tear-ghost-chase") || null;
      }, undefined, { timeout: 30000 });
      assert.equal(assisted.provenance.ghostAssistance.sourceId, chaseSourceId); assert.equal(assisted.provenance.ghostAssistance.competitiveEligible, false);
      evidence.chase.assisted = assisted;
      const afterChase = await vault(); for (const original of originals.filter((entry) => entry.id !== deletedId)) assertSourceBytes(afterChase, original);
      assertSourceBytes(sourceBeforeChase, originals.find((entry) => entry.id === sourceId));
      await ordinaryBoot(); assert.ok((await vault()).manifests.some(([, raw]) => JSON.parse(raw).id === assisted.id && JSON.parse(raw).provenance.ghostAssistance.competitiveEligible === false));
      await writeFile(join(directory, "chase-evidence.json"), JSON.stringify(evidence.chase, null, 2));
    }
    evidence.pageErrors = errors; evidence.status = "passed";
  } catch (error) {
    evidence.status = "failed"; evidence.error = String(error); evidence.pageErrors = errors;
    evidence.state = await page.evaluate(() => window.__PANTHEON_TEST?.state()); evidence.labels = await labels(); evidence.recent = await page.evaluate(() => window.__CAREER_TEXTS__?.slice(-160));
    await page.screenshot({ path: join(directory, "failure.png") }); throw error;
  } finally { await writeFile(join(directory, "journey.json"), JSON.stringify(evidence, null, 2)); }
}).then(() => console.log("C37 normal Career Archive journey passed")).catch((error) => { console.error(error); process.exitCode = 1; });
