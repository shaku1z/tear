const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { withJourney } = require("./browser-journey-harness");
const openingJourney = process.env.TEAR_C29_OPENING_JOURNEY === "1";
if (openingJourney && !process.env.TEAR_OPENING_ARTIFACT_DIR) throw new Error("opening journey requires a unique TEAR_OPENING_ARTIFACT_DIR evidence destination");
if (openingJourney && fs.existsSync(process.env.TEAR_OPENING_ARTIFACT_DIR) && fs.readdirSync(process.env.TEAR_OPENING_ARTIFACT_DIR).length > 0) throw new Error("opening evidence destination must be empty; preserve prior evidence");
const diagnosticDirectory = process.env.TEAR_C29_DIAGNOSTIC_DIR ? path.resolve(process.env.TEAR_C29_DIAGNOSTIC_DIR) : undefined;
if (diagnosticDirectory && fs.existsSync(diagnosticDirectory) && fs.readdirSync(diagnosticDirectory).length > 0) throw new Error("C29 diagnostic destination must be empty; preserve prior evidence");
function writeDiagnostic(name, value) {
  if (diagnosticDirectory === undefined) return;
  fs.mkdirSync(diagnosticDirectory, { recursive: true });
  fs.writeFileSync(path.join(diagnosticDirectory, `${name}.json`), JSON.stringify(value, null, 2), { flag: "wx" });
}

withJourney({ name: "C29 durable active campaign cinematic", port: 8164 }, async ({ page, boot, waitScreen, clickAndWait, buildInfo }) => {
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__ && window.__TEAR_GHOST_V3__, undefined,
    { timeout: 15000 });
  await page.evaluate(() => {
    const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    environment.reset({
      format: "tear-contract", kind: "scenario", schemaVersion: 1,
      id: "c29-active-campaign-cinematic", version: 1,
      description: "C29 durable active campaign cinematic capture",
      stateClass: "recorded-canonical", executionClass: "engineering", seed: "c29-cinematic-seed",
      start: { mode: "campaign", difficulty: "normal", weapon: "sword" }, maxTicks: 1,
      assertions: ["runtime.finite-state"], tags: ["c29", "ghost", "campaign", "cinematic"],
    });
    environment.terminate();
  });
  await page.waitForFunction(() => window.__TEAR_GHOST_V3__.manifest() !== null
    || window.__TEAR_GHOST_V3__.failure() !== null, undefined, { timeout: 20000 });
  assert.equal(await page.evaluate(() => window.__TEAR_GHOST_V3__.failure()), null);
  const manifest = await page.evaluate(() => window.__TEAR_GHOST_V3__.manifest());
  assert.equal(manifest.provenance.replayContext.simulation.initialState, "opening-initialized");
  const capsule = await page.evaluate((id) => window.__TEAR_GHOST_V3__.read(id), manifest.id);
  writeDiagnostic("default-capture", { manifest, buildInfo, capsule });
  const anchor = capsule.tracks.keyframes.find((entry) => entry.tick === 0)?.value;
  assert.equal(anchor?.state?.["tear.cinematic.v1"]?.active, true,
    "the durable opening anchor must contain the active campaign director");
  assert.equal(manifest.provenance.replayContext.simulation.opening?.phase, "opening-initialized-before-run-start");
  assert.ok(capsule.tracks.events.some((entry) => entry.value.payload?.boundary === "recorded-opening-playing-exposed"), "real Campaign opening must seal playing exposure after native start");
  const verification = await page.evaluate((id) => window.__TEAR_GHOST_V3__.verify(id), manifest.id);
  writeDiagnostic("default-verification", { manifest, buildInfo, verification });
  assert.equal(verification.status, "verified", JSON.stringify(verification));
  assert.deepEqual(verification.comparisons.map((entry) => [entry.tick, entry.equal]), [[0, true]]);
  if (!openingJourney) return;

  // This optional post-review consumer uses ordinary rendered controls and browser
  // keyboard/pointer input. It never patches actors, fabricates outcomes or changes chunks.
  await boot({ test: "1", bossdebug: "1", "ghost-v3-profile": "forensic-qa" });
  await clickAndWait(260, 360, "setup");
  // Canvas clicks are consumed on UI frames; observe each selection before the next click.
  await page.mouse.click(430, 255); // Endless
  await page.waitForFunction(() => window.__PANTHEON_TEST.state().setup.mode === "endless");
  await page.mouse.click(820, 435); // One-Hit: natural defeat remains an actual combat outcome.
  await page.waitForFunction(() => window.__PANTHEON_TEST.state().setup.difficulty === "onehit");
  await page.mouse.click(1180, 376); // Chainblade
  await page.waitForFunction(() => window.__PANTHEON_TEST.state().setup.weapon === "chainblade");
  assert.deepEqual(await page.evaluate(() => window.__PANTHEON_TEST.state().setup), { mode: "endless", difficulty: "onehit", weapon: "chainblade", boss: "shuffle" });
  const archive = async (id) => page.evaluate(async (sourceId) => {
    const database = await new Promise((resolve, reject) => { const request = indexedDB.open("tear-ghost-v3"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try {
      const get = (store, key) => new Promise((resolve, reject) => { const request = database.transaction(store, "readonly").objectStore(store).get(key); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      const encodedManifest = await get("manifests", sourceId), manifest = JSON.parse(encodedManifest);
      const chunks = Object.fromEntries(await Promise.all(manifest.chunks.map(async (chunk) => [chunk.id, await get("chunks", chunk.id)])));
      return JSON.stringify({ manifest, chunks });
    } finally { database.close(); }
  }, id);
  const captureNatural = async (predecessor, firstId) => {
    await page.keyboard.down("d");
    await page.mouse.click(predecessor === "setup" ? 800 : 220, predecessor === "setup" ? 758 : 347);
    await waitScreen("playing");
    await page.keyboard.up("d"); await page.keyboard.press("Space");
    await page.keyboard.down("d"); await page.keyboard.press("Shift");
    await page.waitForTimeout(220); await page.keyboard.up("d");
    await page.waitForFunction(() => window.__PANTHEON_TEST.state().game === "gameover", undefined, { timeout: 90000 });
    await page.waitForFunction((oldId) => { const manifest = window.__TEAR_GHOST_V3__.manifest(); return manifest !== null && manifest.id !== oldId; }, firstId ?? null, { timeout: 20000 });
    const current = await page.evaluate(() => window.__TEAR_GHOST_V3__.manifest());
    const source = await page.evaluate((id) => window.__TEAR_GHOST_V3__.read(id), current.id);
    writeDiagnostic(`${predecessor}-capture`, { manifest: current, buildInfo, capsule: source });
    const encoded = await archive(current.id);
    writeDiagnostic(`${predecessor}-encoded-archive`, { buildInfo, sourceId: current.id, rootIntegrity: current.rootIntegrity, encoded });
    const initial = source.tracks.keyframes.find((entry) => entry.tick === 0).value;
    assert.equal(initial.state["tear.ui.v1"].screen, predecessor);
    assert.equal(current.provenance.replayContext.simulation.opening.previousScreen, predecessor);
    const input0 = source.tracks.results.find((entry) => entry.tick === 0).value.input;
    assert.equal(input0.moveX, 0, "normal runtime tick0 is neutral; held movement is queued for tick1");
    assert.ok(source.tracks.commands.some((entry) => entry.tick === 1 && entry.value.command.type === "move" && entry.value.command.x !== 0));
    for (const kind of ["move", "jump", "dash"]) assert.ok(source.tracks.commands.some((entry) => entry.tick <= 180 && entry.value.command.type === kind), `nonvacuous opening requires ${kind}`);
    const movements = source.tracks.commands.filter((entry) => entry.tick <= 180 && entry.value.command.type === "move").map((entry) => entry.value.command.x);
    assert.ok(movements.includes(0) && movements.filter((value) => value !== 0).length >= 2, "held movement must release and repress");
    const continued = await page.evaluate((id) => window.__TEAR_GHOST_V3__.verify(id, "opening-continuation"), current.id);
    writeDiagnostic(`${predecessor}-verification`, { manifest: current, buildInfo, verification: continued });
    assert.equal(continued.status, "verified", JSON.stringify(continued));
    assert.equal(continued.continuation.steps, 180); assert.equal(continued.continuation.laterKeyframesUsed, false);
    assert.deepEqual(continued.comparisons.map((entry) => [entry.tick, entry.equal, entry.inputEqual]), [[60, true, true], [120, true, true], [180, true, true]]);
    assert.equal(await archive(current.id), encoded, "continuation must leave manifest and encoded chunks unchanged");
    const modeRefused = await page.evaluate(async (id) => { try { await window.__TEAR_GHOST_V3__.verify(id, "unsupported"); return false; } catch { return true; } }, current.id);
    assert.equal(modeRefused, true);
    const directory = path.resolve(process.env.TEAR_OPENING_ARTIFACT_DIR); fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, `${predecessor}-capsule.json`), encoded);
    fs.writeFileSync(path.join(directory, `${predecessor}-continuation.json`), JSON.stringify({ buildInfo, current, initialInput: input0, sourceRootIntegrity: current.rootIntegrity, continued }, null, 2));
    return current;
  };
  const first = await captureNatural("setup");
  const retry = await captureNatural("gameover", first.id);
  assert.notEqual(retry.provenance.replayContext.run.id, first.provenance.replayContext.run.id, "natural results retry must own a new run identity");
});
