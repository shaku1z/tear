const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");

withJourney({ name: "C27 Ghost V3 live capture", port: 8155 }, async ({ page, boot, waitScreen }) => {
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__ && window.__TEAR_GHOST_V3__, undefined, { timeout: 15000 });
  await page.evaluate(() => {
    const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    environment.reset({
      format: "tear-contract", kind: "scenario", schemaVersion: 1,
      id: "c27-live-capture", version: 1, description: "C27 V3 live recorder proof",
      stateClass: "recorded-canonical", executionClass: "engineering", seed: "c27-capsule-seed",
      start: { mode: "endless", difficulty: "normal", weapon: "sword" }, maxTicks: 240,
      assertions: ["runtime.finite-state"], tags: ["c27", "ghost", "capsule"],
    });
    for (let tick = 1; tick <= 240; tick += 1) {
      environment.step(tick === 1 ? [{ kind: "command", tick, id: 1, command: { type: "move", x: 1000, y: 0 } }]
        : tick === 25 ? [{ kind: "command", tick, id: 2, command: { type: "dash", x: 1000, y: 0 } }] : []);
    }
    environment.pause();
    environment.resume();
    environment.pause();
    environment.resume();
    environment.terminate();
  });
  await page.waitForFunction(() => window.__TEAR_GHOST_V3__.manifest() !== null
    || window.__TEAR_GHOST_V3__.failure() !== null, undefined, { timeout: 20000 });
  assert.equal(await page.evaluate(() => window.__TEAR_GHOST_V3__.failure()), null);
  const manifest = await page.evaluate(() => window.__TEAR_GHOST_V3__.manifest());
  const persisted = await page.evaluate(() => window.__TEAR_GHOST_V3__.manifests());
  assert.equal(manifest.status, "complete");
  assert.equal(manifest.recordingProfile, "coaching");
  assert.equal(typeof manifest.provenance.runId, "string");
  assert.equal(typeof manifest.provenance.seed, "string");
  assert.ok(persisted.some((candidate) => candidate.id === manifest.id && candidate.status === "complete"));
  const capsule = await page.evaluate((id) => window.__TEAR_GHOST_V3__.read(id), manifest.id);
  assert.equal(capsule.tracks.events.length > 0, true);
  const eventTypes = capsule.tracks.events.map((entry) => entry.value?.type);
  assert.ok(eventTypes.includes("run.started"), "live capsule omitted its authoritative start boundary");
  assert.ok(eventTypes.includes("run.paused"), "live pause did not enter the V3 causal track");
  assert.ok(eventTypes.includes("run.resumed"), "live resume did not enter the V3 causal track");
  assert.ok(eventTypes.includes("run.abandoned"), "lifecycle termination did not enter the V3 capsule before shutdown");
  assert.equal(capsule.tracks.results.length > 0, true);
  assert.ok(manifest.chunks.some((chunk) => chunk.kind === "events"));
  assert.ok(manifest.chunks.some((chunk) => chunk.kind === "results"));
  const receipts = capsule.tracks.results.filter((entry) => entry.value?.kind === "authoritative-hash");
  assert.deepEqual(receipts.map((entry) => entry.tick), [0, 120, 240]);
  assert.ok(receipts.every((entry) => entry.value?.tick === entry.tick
    && typeof entry.value?.stateHash === "string" && /^[a-f0-9]{16}$/iu.test(entry.value.stateHash)
    && entry.value.input?.tick === entry.tick && typeof entry.value.input?.primaryHeld === "boolean"));
  const verification = await page.evaluate((id) => window.__TEAR_GHOST_V3__.verify(id), manifest.id);
  assert.equal(verification.status, "verified");
  assert.deepEqual(verification.comparisons.map((entry) => [entry.tick, entry.equal]), [[0, true], [120, true], [240, true]]);
  const sourceBeforePractice = JSON.stringify(capsule);
  const practice = await page.evaluate((id) => window.__TEAR_GHOST_V3__.practice(id, 120, "exact-practice"), manifest.id);
  assert.equal(practice.id, `${manifest.id}:practice:120:exact-practice`);
  assert.equal(practice.sourceGhostId, manifest.id);
  assert.equal(practice.forkTick, 120);
  assert.equal(practice.mode, "exact-practice");
  assert.equal(practice.snapshot.tick, 120);
  assert.equal(practice.inputLatchPolicy, "release-all");
  assert.equal(practice.rankedEligible, false);
  assert.equal(practice.leaderboardEligible, false);
  assert.deepEqual(practice.lineage, { relation: "forked-at", parentId: manifest.id,
    parentRootHash: practice.sourceRootHash, forkTick: 120 });
  const sourceAfterPractice = JSON.stringify(await page.evaluate((id) => window.__TEAR_GHOST_V3__.read(id), manifest.id));
  assert.equal(sourceAfterPractice, sourceBeforePractice, "practice fork mutated durable source custody");
  assert.equal(await page.evaluate(() => window.__TEAR_GHOST_V3__.failure()), null);
  await page.evaluate(() => {
    const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("B");
    environment.reset({
      format: "tear-contract", kind: "scenario", schemaVersion: 1,
      id: "c29-live-comparison", version: 1, description: "C29 V3 comparison proof",
      stateClass: "recorded-canonical", executionClass: "engineering", seed: "c29-comparison-seed",
      start: { mode: "endless", difficulty: "normal", weapon: "sword" }, maxTicks: 240,
      assertions: ["runtime.finite-state"], tags: ["c29", "ghost", "comparison"],
    });
    for (let tick = 1; tick <= 240; tick += 1) {
      environment.step(tick === 1 ? [{ kind: "command", tick, id: 1, command: { type: "move", x: -1000, y: 0 } }]
        : tick === 25 ? [{ kind: "command", tick, id: 2, command: { type: "dash", x: -1000, y: 0 } }] : []);
    }
    environment.pause();
    environment.resume();
    environment.pause();
    environment.resume();
    environment.terminate();
  });
  await page.waitForFunction((sourceId) => window.__TEAR_GHOST_V3__.manifest()?.id !== sourceId
    || window.__TEAR_GHOST_V3__.failure() !== null, manifest.id, { timeout: 20000 });
  const comparisonManifest = await page.evaluate(() => window.__TEAR_GHOST_V3__.manifest());
  assert.notEqual(comparisonManifest.id, manifest.id, "comparison needs a second durable source capsule");
  assert.equal(comparisonManifest.status, "complete");
  for (let sourceNumber = 3; sourceNumber <= 9; sourceNumber += 1) {
    const previousId = await page.evaluate(() => window.__TEAR_GHOST_V3__.manifest()?.id ?? null);
    await page.evaluate((number) => {
      const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("B");
      environment.reset({
        format: "tear-contract", kind: "scenario", schemaVersion: 1,
        id: `c29-live-comparison-${String(number)}`, version: 1, description: "C29 V3 N-way comparison proof",
        stateClass: "recorded-canonical", executionClass: "engineering", seed: `c29-comparison-seed-${String(number)}`,
        start: { mode: "endless", difficulty: "normal", weapon: "sword" }, maxTicks: 240,
        assertions: ["runtime.finite-state"], tags: ["c29", "ghost", "comparison"],
      });
      for (let tick = 1; tick <= 240; tick += 1) {
        environment.step(tick === 1 ? [{ kind: "command", tick, id: 1, command: { type: "move", x: number % 2 === 0 ? 1000 : -1000, y: 0 } }]
          : tick === 25 ? [{ kind: "command", tick, id: 2, command: { type: "dash", x: number % 2 === 0 ? 1000 : -1000, y: 0 } }] : []);
      }
      environment.pause();
      environment.resume();
      environment.pause();
      environment.resume();
      environment.terminate();
    }, sourceNumber);
    await page.waitForFunction((sourceId) => window.__TEAR_GHOST_V3__.manifest()?.id !== sourceId
      || window.__TEAR_GHOST_V3__.failure() !== null, previousId, { timeout: 20000 });
    assert.equal(await page.evaluate(() => window.__TEAR_GHOST_V3__.failure()), null);
  }
  await boot();
  await page.waitForFunction(() => window.__TEAR_GHOST_V3__, undefined, { timeout: 15000 });
  const afterReload = await page.evaluate(() => window.__TEAR_GHOST_V3__.manifests());
  assert.ok(afterReload.some((candidate) => candidate.id === manifest.id && candidate.status === "complete"),
    "completed Ghost V3 capsule was not readable after a browser reload");
  assert.ok(afterReload.some((candidate) => candidate.id === comparisonManifest.id && candidate.status === "complete"),
    "second comparison capsule was not readable after a browser reload");
  const comparisonSources = afterReload.filter((candidate) => candidate.status === "complete");
  assert.ok(comparisonSources.length >= 9, "N-way comparison needs nine durable sources");
  const durableSourcesBeforeVisiblePractice = Object.fromEntries(await Promise.all(comparisonSources.map(async (candidate) => [candidate.id,
    JSON.stringify(await page.evaluate((id) => window.__TEAR_GHOST_V3__.read(id), candidate.id))])));
  const reloadedCapsule = await page.evaluate((id) => window.__TEAR_GHOST_V3__.read(id), manifest.id);
  assert.equal(reloadedCapsule.tracks.results.length > 0, true);
  await page.evaluate(() => {
    const texts = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function captureTheaterText(text, ...rest) {
      texts.push(String(text));
      return original.call(this, text, ...rest);
    };
    window.__TEAR_C29_THEATER_TEXT__ = texts;
  });
  await page.mouse.click(260, 266); // PROFILE through the ordinary menu action
  await waitScreen("profile");
  await page.mouse.click(875, 271); // VAULT tab
  await page.waitForFunction(() => window.__TEAR_C29_THEATER_TEXT__?.includes("Ghost V3 - COACHING"), undefined, { timeout: 10000 });
  for (const y of [362, 458, 554, 650, 746]) {
    await page.mouse.click(1149, y); // select five visible healthy capsules
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(120);
  await page.mouse.move(800, 600);
  await page.mouse.wheel(0, 480);
  await page.waitForTimeout(120);
  for (const y of [446, 542, 638, 734]) {
    await page.mouse.click(1149, y); // select the remaining four sources
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(120);
  await page.mouse.click(1280, 446); // the visible COMPARE 9 control
  await waitScreen("replay");
  await page.waitForFunction(() => window.__TEAR_C29_THEATER_TEXT__?.includes("SEMANTIC COMPARISON"), undefined, { timeout: 10000 });
  await page.mouse.click(428, 854); // next semantic event through the rendered replay transport
  await page.mouse.click(428, 854); // a second repeated semantic occurrence
  await page.waitForFunction(() => window.__TEAR_C29_THEATER_TEXT__?.includes("OCCURRENCE 2"), undefined, { timeout: 10000 });
  const comparisonTexts = await page.evaluate(() => window.__TEAR_C29_THEATER_TEXT__ ?? []);
  assert.ok(comparisonTexts.some((text) => text.includes("SEMANTIC COMPARISON")), "comparison panel did not render");
  assert.ok(comparisonTexts.filter((text) => text.includes("RUN ")).length >= 9, "comparison did not render all nine durable sources");
  await page.keyboard.press("Escape");
  await waitScreen("profile");
  await page.mouse.click(1023, 362); // The healthy capsule's semantic THEATER control
  await waitScreen("replay");
  const theaterTextCount = await page.evaluate(() => window.__TEAR_C29_THEATER_TEXT__?.length ?? 0);
  await page.waitForTimeout(250);
  await page.mouse.click(428, 854); // next verified checkpoint through the visible transport
  await page.waitForFunction((count) => window.__TEAR_C29_THEATER_TEXT__?.slice(count).includes("TICK 120"), theaterTextCount, { timeout: 10000 });
  const theaterTexts = await page.evaluate((count) => (window.__TEAR_C29_THEATER_TEXT__ ?? []).slice(count), theaterTextCount);
  assert.ok(theaterTexts.some((text) => text.includes("THEATER")), `Theater header did not render: ${theaterTexts.slice(-80).join(" | ")}`);
  assert.equal(await page.evaluate(() => window.__PANTHEON_TEST.state().game), "replay");
  await page.mouse.click(1020, 854); // rendered C37 RUN DNA control; it projects only declared capsule metrics
  await page.waitForFunction(() => window.__TEAR_C29_THEATER_TEXT__?.includes("RUN DNA · VERIFIED METRICS"), undefined, { timeout: 10000 });
  const dnaTexts = await page.evaluate(() => window.__TEAR_C29_THEATER_TEXT__ ?? []);
  assert.ok(dnaTexts.some((text) => String(text).includes("FORMULA run-dna-v1 · EVIDENCE verified capsule")),
    "Run DNA did not visibly identify its formula and verified capsule custody");
  assert.ok(dnaTexts.some((text) => String(text).includes("UNAVAILABLE · no declared run-dna-metrics-v1 result")),
    "Run DNA inferred metrics instead of exposing the actual capsule declaration gap");
  await page.mouse.click(892, 854); // rendered C37 COACH control; it has no implicit baseline
  await page.waitForFunction(() => window.__TEAR_C29_THEATER_TEXT__?.includes("COACH · SELECTED VERIFIED PAIR"), undefined, { timeout: 10000 });
  await page.waitForTimeout(180); // local Vault candidates arrive through the normal browser reader
  await page.mouse.click(250, 212); // explicitly select the first displayed distinct local baseline
  await page.waitForFunction(() => window.__TEAR_C29_THEATER_TEXT__?.some((text) => String(text).startsWith("TARGET ") && String(text).includes("BASELINE ")),
    undefined, { timeout: 10000 });
  const coachTexts = await page.evaluate(() => window.__TEAR_C29_THEATER_TEXT__ ?? []);
  assert.ok(coachTexts.some((text) => String(text).includes("COACH · SELECTED VERIFIED PAIR")), "Coach panel did not render through Theater");
  assert.ok(coachTexts.some((text) => String(text).startsWith("TARGET ") && String(text).includes("BASELINE ")),
    "Coach did not surface its selected source IDs");
  await page.mouse.click(734, 854); // visible PRACTICE launches the verified checkpoint child
  await waitScreen("playing");
  const launchedPractice = await page.evaluate(() => window.__TEAR_GHOST_V3__.activePractice());
  assert.ok(Object.hasOwn(durableSourcesBeforeVisiblePractice, launchedPractice.sourceGhostId));
  assert.equal(launchedPractice.id, `${launchedPractice.sourceGhostId}:practice:120:exact-practice`);
  assert.equal(typeof launchedPractice.sourceRootHash, "string");
  assert.equal(launchedPractice.forkTick, 120);
  assert.equal(launchedPractice.rankedEligible, false);
  assert.equal(launchedPractice.leaderboardEligible, false);
  assert.equal(launchedPractice.inputLatchPolicy, "release-all");
  const sourceAfterVisiblePractice = JSON.stringify(await page.evaluate((id) => window.__TEAR_GHOST_V3__.read(id), launchedPractice.sourceGhostId));
  assert.equal(sourceAfterVisiblePractice, durableSourcesBeforeVisiblePractice[launchedPractice.sourceGhostId], "visible practice launch mutated durable source custody");
  assert.equal(await page.evaluate(() => window.__TEAR_GHOST_V3__.failure()), null);
});
