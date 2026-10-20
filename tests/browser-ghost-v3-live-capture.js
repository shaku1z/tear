const { mkdir, writeFile, readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { createHash } = require("node:crypto");
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
        : tick === 25 ? [{ kind: "command", tick, id: 2, command: { type: "dash", x: 1000, y: 0 } }] : tick === 140 ? [{ kind: "command", tick, id: 3, command: { type: "weapon", intent: "throw", phase: "pressed" } }]
        : tick === 180 ? [{ kind: "command", tick, id: 4, command: { type: "weapon", intent: "recall", phase: "pressed" } }] : []);
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
        : tick === 25 ? [{ kind: "command", tick, id: 2, command: { type: "dash", x: -1000, y: 0 } }] : tick === 140 ? [{ kind: "command", tick, id: 3, command: { type: "weapon", intent: "throw", phase: "pressed" } }]
        : tick === 180 ? [{ kind: "command", tick, id: 4, command: { type: "weapon", intent: "recall", phase: "pressed" } }] : []);
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
          : tick === 25 ? [{ kind: "command", tick, id: 2, command: { type: "dash", x: number % 2 === 0 ? 1000 : -1000, y: 0 } }] : tick === 140 ? [{ kind: "command", tick, id: 3, command: { type: "weapon", intent: "throw", phase: "pressed" } }]
        : tick === 180 ? [{ kind: "command", tick, id: 4, command: { type: "weapon", intent: "recall", phase: "pressed" } }] : []);
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
    const texts = [], positions = [];
    const imageDraw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function captureStudioThumbnail(image, ...rest) {
      if (image instanceof HTMLImageElement && image.src.startsWith("data:image/png")) window.__TEAR_C37_THUMBNAIL__ = image.src;
      return imageDraw.call(this, image, ...rest);
    };
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function captureTheaterText(text, ...rest) {
      const label = String(text);
      texts.push(label);
      if (label === "PROFILE" || rest[1] < 80 && ["\u25c6 THEATER", "\u25b6 REPLAY", "COMPARE"].includes(label)) positions.length = 0;
      positions.push({ text: label, x: rest[0], y: rest[1] });
      return original.call(this, text, ...rest);
    };
    window.__TEAR_C29_THEATER_TEXT__ = texts; window.__TEAR_C29_POSITIONS__ = positions;
  });
  await page.mouse.click(260, 266); // PROFILE through the ordinary menu action
  await waitScreen("profile");
  await page.mouse.click(875, 271); // VAULT tab
  await page.waitForFunction(() => window.__TEAR_C29_THEATER_TEXT__?.includes("Ghost V3 - COACHING"), undefined, { timeout: 10000 });
  const clickText = async (text) => {
    const point = await page.evaluate((label) => window.__TEAR_C29_POSITIONS__?.findLast((entry) => entry.text === label), text);
    assert.ok(point && Number.isFinite(point.x) && Number.isFinite(point.y), `Missing rendered ${text}`);
    await page.mouse.click(point.x, point.y);
    // Normal canvas actions are consumed on an application frame, then repainted.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  let selectedCount = 0;
  for (let attempt = 0; attempt < 32 && selectedCount < 9; attempt++) {
    await page.waitForTimeout(100);
    const point = await page.evaluate(() => window.__TEAR_C29_POSITIONS__?.find((entry) => entry.text === "SELECT" && entry.y > 310 && entry.y < 810));
    if (!point) {
      await page.mouse.move(800, 650); await page.mouse.wheel(0, 96);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      continue;
    }
    await page.mouse.click(point.x, point.y);
    const expectedCount = selectedCount + 1;
    await page.waitForFunction((count) => window.__TEAR_C29_POSITIONS__?.some((entry) => entry.text === (count === 1
      ? "Comparison source selected. Choose at least one more healthy Ghost capsule."
      : `${String(count)} comparison sources selected. Press COMPARE to open them.`)), expectedCount, { timeout: 5000 });
    selectedCount = expectedCount;
  }
  if (selectedCount !== 9 && process.env.TEAR_STUDIO_ARTIFACT_DIR) {
    await mkdir(process.env.TEAR_STUDIO_ARTIFACT_DIR, { recursive: true });
    await page.screenshot({ path: join(process.env.TEAR_STUDIO_ARTIFACT_DIR, "vault-navigation-failure.png") });
    await writeFile(join(process.env.TEAR_STUDIO_ARTIFACT_DIR, "vault-navigation-failure.json"), JSON.stringify(await page.evaluate(() => ({ positions: window.__TEAR_C29_POSITIONS__, screen: window.__PANTHEON_TEST.state() })), null, 2));
  }
  assert.equal(selectedCount, 9, "all nine rendered source selections must be reached within bounded scrolling");
  await page.waitForTimeout(140); await clickText("COMPARE 9");
  await waitScreen("replay");
  await page.waitForFunction(() => window.__TEAR_C29_THEATER_TEXT__?.includes("SEMANTIC COMPARISON"), undefined, { timeout: 10000 });
  await page.mouse.click(428, 854); // next semantic event through the rendered replay transport
  await page.waitForFunction(() => window.__TEAR_C29_THEATER_TEXT__?.some((text) => String(text).startsWith("EVENT 2 / EVENT ")), undefined, { timeout: 10000 });
  await page.mouse.click(428, 854); // a second repeated semantic occurrence
  await page.waitForFunction(() => window.__TEAR_C29_THEATER_TEXT__?.includes("OCCURRENCE 2"), undefined, { timeout: 10000 });
  const comparisonTexts = await page.evaluate(() => window.__TEAR_C29_THEATER_TEXT__ ?? []);
  assert.ok(comparisonTexts.some((text) => text.includes("SEMANTIC COMPARISON")), "comparison panel did not render");
  assert.ok(comparisonTexts.filter((text) => text.includes("RUN ")).length >= 9, "comparison did not render all nine durable sources");
  await page.keyboard.press("Escape");
  await waitScreen("profile");
  await page.waitForTimeout(180); await clickText("\u25c6 THEATER"); // actual rendered healthy source control
  await waitScreen("replay");
  const theaterTextCount = await page.evaluate(() => window.__TEAR_C29_THEATER_TEXT__?.length ?? 0);
  await page.waitForTimeout(250);
  await page.mouse.click(428, 854); // next verified checkpoint through the visible transport
  await page.waitForFunction((count) => window.__TEAR_C29_THEATER_TEXT__?.slice(count).includes("TICK 120"), theaterTextCount, { timeout: 10000 });
  const theaterTexts = await page.evaluate((count) => (window.__TEAR_C29_THEATER_TEXT__ ?? []).slice(count), theaterTextCount);
  assert.ok(theaterTexts.some((text) => text.includes("THEATER")), `Theater header did not render: ${theaterTexts.slice(-80).join(" | ")}`);
  assert.equal(await page.evaluate(() => window.__PANTHEON_TEST.state().game), "replay");
  const studioSourceBefore = JSON.stringify(await page.evaluate((id) => window.__TEAR_GHOST_V3__.read(id), manifest.id));
  const outputDirectory = process.env.TEAR_STUDIO_ARTIFACT_DIR ?? join(tmpdir(), `tear-studio-${String(Date.now())}`);
  await mkdir(outputDirectory, { recursive: true });
  const sceneRegion = { x: 40, y: 146, width: 1520, height: 638 };
  const firstScene = await page.screenshot({ path: join(outputDirectory, "theater-tick120.png"), clip: sceneRegion });
  await clickText("REPLAY EDITOR"); await page.waitForTimeout(120); await clickText("MARK IN");
  await page.mouse.click(428, 854); // next actual verified checkpoint240
  await page.waitForTimeout(180); await clickText("APPEND RANGE");
  await clickText("CLOSE EDITOR"); await page.waitForTimeout(120);
  const secondScene = await page.screenshot({ path: join(outputDirectory, "theater-tick240.png"), clip: sceneRegion });
  assert.notEqual(createHash("sha256").update(firstScene).digest("hex"), createHash("sha256").update(secondScene).digest("hex"), "world-only scene must change independently of tick labels");
  await clickText("REPLAY EDITOR"); await page.waitForTimeout(120); await clickText("ENCODE WEBM");
  await page.waitForFunction(() => window.__TEAR_C29_THEATER_TEXT__?.some((text) => String(text).startsWith("WebM decoded locally.") || String(text).startsWith("Studio export refused:")), undefined, { timeout: 90000 });
  assert.ok(await page.evaluate(() => window.__TEAR_C29_THEATER_TEXT__?.includes("WebM decoded locally. Click DOWNLOAD WEBM to request a browser save.")),
    `Studio did not produce media: ${await page.evaluate(() => (window.__TEAR_C29_THEATER_TEXT__ ?? []).slice(-60).join(" | "))}`);
  await page.waitForFunction(() => window.__TEAR_C37_THUMBNAIL__?.startsWith("data:image/png"), undefined, { timeout: 5000 });
  const downloadPending = page.waitForEvent("download"); await clickText("DOWNLOAD WEBM"); const download = await downloadPending;
  assert.ok(download.suggestedFilename().endsWith(".webm")); const downloadPath = join(outputDirectory, download.suggestedFilename()); await download.saveAs(downloadPath);
  const mediaBytes = await readFile(downloadPath); assert.ok(mediaBytes.length > 100); assert.equal(mediaBytes.subarray(0, 4).toString("hex"), "1a45dfa3", "actual WebM EBML signature");
  const decoded = await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (value) => value.charCodeAt(0)), url = URL.createObjectURL(new Blob([bytes], { type: "video/webm" }));
    const video = document.createElement("video"); video.muted = true; video.preload = "auto";
    const event = (name) => new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error(`decode ${name} timeout`)), 10000); video.addEventListener(name, () => { clearTimeout(timer); resolve(); }, { once: true }); });
    try { const ready = event("loadedmetadata"); video.src = url; await ready; if (!Number.isFinite(video.duration)) { const sought = event("seeked"); video.currentTime = 100000; await sought; }
      const canvas = document.createElement("canvas"); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      const context = canvas.getContext("2d"); if (!context) throw new Error("native decoded video canvas unavailable");
      const frames = [];
      for (const time of [.1, .8]) {
        const sought = event("seeked"); video.currentTime = time; await sought;
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) throw new Error("native video did not decode a current frame");
        context.drawImage(video, 0, 0); frames.push({ time, png: canvas.toDataURL("image/png") });
      }
      return { width: video.videoWidth, height: video.videoHeight, duration: Number.isFinite(video.duration) ? video.duration : video.currentTime, thumbnail: window.__TEAR_C37_THUMBNAIL__, frames };
    } finally { video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url); }
  }, mediaBytes.toString("base64"));
  assert.equal(decoded.width, 640); assert.equal(decoded.height, 360); assert.ok(Math.abs(decoded.duration - 1) < .35, `decoded duration ${String(decoded.duration)}`);
  const frameHashes = [];
  for (const frame of decoded.frames) {
    const bytes = Buffer.from(frame.png.split(",")[1], "base64"); frameHashes.push(createHash("sha256").update(bytes).digest("hex"));
    await writeFile(join(outputDirectory, `decoded-${String(frame.time)}s.png`), bytes);
  }
  assert.equal(frameHashes.length, 2); assert.notEqual(frameHashes[0], frameHashes[1], "actual decoded moving video frames must differ");
  assert.ok(decoded.thumbnail.startsWith("data:image/png;base64,")); await writeFile(join(outputDirectory, "studio-thumbnail.png"), Buffer.from(decoded.thumbnail.split(",")[1], "base64"));
  const studioSourceAfter = JSON.stringify(await page.evaluate((id) => window.__TEAR_GHOST_V3__.read(id), manifest.id));
  assert.equal(studioSourceAfter, studioSourceBefore, "actual local WebM export changed durable source custody");
  console.log(JSON.stringify({ studio: { directory: outputDirectory, bytes: mediaBytes.length, width: decoded.width, height: decoded.height, duration: decoded.duration, decodedFrameHashes: frameHashes, clock: "simulation-time-120hz", camera: "reconstructed-player-follow", fixture: "engineered canonical240tick source" } }));
  await page.mouse.click(1020, 854); // rendered C37 RUN DNA control; it projects only declared capsule metrics
  await page.waitForFunction(() => window.__TEAR_C29_THEATER_TEXT__?.includes("RUN DNA \u00b7 RECORDED METRICS"), undefined, { timeout: 10000 });
  const dnaTexts = await page.evaluate(() => window.__TEAR_C29_THEATER_TEXT__ ?? []);
  assert.ok(dnaTexts.includes("FORMULA run-dna-v1 \u00b7 native-combat-episodes-v1"));
  const dnaCustody = dnaTexts.findLast((text) => String(text).startsWith("verified capsule "));
  assert.ok(dnaCustody, "Run DNA must identify its actual source custody");
  const dnaCapsule = await page.evaluate((id) => window.__TEAR_GHOST_V3__.read(id), dnaCustody.slice("verified capsule ".length));
  const dnaDeclarations = dnaCapsule.tracks.results.filter((entry) => entry.value?.kind === "run-dna-metrics-v1");
  assert.equal(dnaDeclarations.length, 1, "Fresh native capture must declare its own metric basis");
  const nativeDna = dnaDeclarations[0].value;
  for (const [name, value] of Object.entries(nativeDna.metrics)) assert.ok(dnaTexts.includes(`${name.toUpperCase()} \u00b7 ${String(value)}`));
  if (nativeDna.capture.censored > 0 || nativeDna.metrics.attacks === 0) assert.ok(dnaTexts.some((text) => String(text).startsWith("UNAVAILABLE \u00b7 precision:")));
  await page.mouse.click(892, 854); // rendered C37 COACH control; it has no implicit baseline
  await page.waitForFunction(() => window.__TEAR_C29_THEATER_TEXT__?.includes("COACH \u00b7 YOUR SELECTED RUNS"), undefined, { timeout: 10000 });
  await page.waitForTimeout(180);
  await page.mouse.click(750, 189); // explicit first compatible local recording, no peer auto-selection
  await page.waitForFunction(() => window.__TEAR_C29_THEATER_TEXT__?.some((text) => String(text).includes("/2 usable recordings")), undefined, { timeout: 30000 });
  await clickText("RUNS");
  await page.waitForFunction(() => window.__TEAR_C29_POSITIONS__?.some((entry) => entry.text.startsWith("+ ") && entry.y > 170 && entry.y < 370), undefined, { timeout: 5000 });
  const nextCandidate = await page.evaluate(() => window.__TEAR_C29_POSITIONS__?.find((entry) => entry.text.startsWith("+ ") && entry.y > 170 && entry.y < 370));
  assert.ok(nextCandidate, "Coach must render a distinct unselected recording");
  await clickText(nextCandidate.text);
  await page.waitForFunction(() => window.__TEAR_C29_THEATER_TEXT__?.some((text) => String(text).includes("/3 usable recordings")), undefined, { timeout: 30000 });
  const coachTexts = await page.evaluate(() => window.__TEAR_C29_THEATER_TEXT__ ?? []);
  assert.ok(coachTexts.some((text) => String(text).includes("CHRONOLOGICAL HISTORY")), "Coach did not render per-measure run history");
  assert.ok(coachTexts.some((text) => String(text).includes("Count distribution:")), "Coach did not disclose count distribution");
  assert.ok(coachTexts.some((text) => String(text).includes("OPEN RUN MOMENT") && String(text).includes("TICK 140")), "Coach omitted the actual identified native throw");
  await page.screenshot({ path: join(outputDirectory, "coach-history.png") });
  await clickText("VIEW MOMENT"); // normal source-owned seek
  await page.waitForFunction(() => window.__TEAR_C29_THEATER_TEXT__?.some((text) => String(text).includes("Reconstructed source scene \u00b7 TICK 140")), undefined, { timeout: 10000 });
  await page.screenshot({ path: join(outputDirectory, "coach-moment.png") });
  await clickText("RETURN TO COACH");
  await clickText("PRACTICE BEFORE"); // strictly preceding checkpoint120
  await waitScreen("playing");
  const launchedPractice = await page.evaluate(() => window.__TEAR_GHOST_V3__.activePractice());
  assert.ok(Object.hasOwn(durableSourcesBeforeVisiblePractice, launchedPractice.sourceGhostId));
  assert.equal(launchedPractice.id, `${launchedPractice.sourceGhostId}:practice:120:coach-assisted`);
  assert.equal(launchedPractice.mode, "coach-assisted");
  assert.equal(typeof launchedPractice.sourceRootHash, "string");
  assert.equal(launchedPractice.forkTick, 120);
  assert.equal(launchedPractice.rankedEligible, false);
  assert.equal(launchedPractice.leaderboardEligible, false);
  assert.equal(launchedPractice.inputLatchPolicy, "release-all");
  const sourceAfterVisiblePractice = JSON.stringify(await page.evaluate((id) => window.__TEAR_GHOST_V3__.read(id), launchedPractice.sourceGhostId));
  assert.equal(sourceAfterVisiblePractice, durableSourcesBeforeVisiblePractice[launchedPractice.sourceGhostId], "visible practice launch mutated durable source custody");
  assert.equal(await page.evaluate(() => window.__TEAR_GHOST_V3__.failure()), null);
  await writeFile(join(outputDirectory, "coach-history.json"), JSON.stringify({ sourceCount: 3, nativeMoment: 140,
    practice: launchedPractice, sourceUnchanged: true, renderedTexts: coachTexts.slice(-180) }, null, 2));
});
