/* eslint-disable @typescript-eslint/no-require-imports -- direct Node browser evidence script. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { withJourney, waitForBrowserValue } = require("./browser-journey-harness");

const scenario = Object.freeze({
  format: "tear-contract", kind: "scenario", schemaVersion: 1, version: 1,
  id: "c27a.campaign-source-victory", description: "Real campaign finale from a certified surgical Source origin",
  stateClass: "recorded-canonical", executionClass: "engineering", seed: "c27a-campaign-victory",
  start: { mode: "campaign", difficulty: "normal", weapon: "sword" }, maxTicks: 8_000,
  assertions: ["runtime.finite-state", "player.finite-transform", "blade.finite-transform"],
  tags: ["c27a", "campaign", "source", "finale", "state-forge"],
});

const companionMode = process.env.TEAR_R07_FINALE_COMPANION === "1";
withJourney({ name: "C27A campaign victory", port: 8168 }, async ({ page, boot, waitScreen }) => {
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__, undefined, { timeout: 15_000 });
  await page.mouse.click(10, 10);
  await page.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__.audio.snapshot().state === "running",
    undefined, { timeout: 20_000 });
  let evidence = await page.evaluate(async ({ scenarioValue, companionMode: companion }) => {
    const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    environment.reset(scenarioValue);
    const checkRecording = (boundary) => {
      if (!companion) return;
      const inspector = window.__TEAR_GHOST_V3__, failure = inspector.failure();
      if (failure !== null) {
        const manifest = inspector.manifest();
        throw new Error(`finale prefix recording failed: ${JSON.stringify({ boundary, tick: environment.observe().tick,
          failure, active: inspector.active(), manifest: manifest === null ? null : { id: manifest.id, status: manifest.status, chunks: manifest.chunks.length } })}`);
      }
    };
    checkRecording("reset");
    const started = environment.forgeCampaignFinalWave();
    if (!started.ok) throw new Error(`campaign frontier restore failed in ${started.phase}`);

    const snapshot = (id, stateClass = "recorded-canonical") =>
      environment.captureSnapshot(id, stateClass);
    const runState = (value) => value.state["tear.run.v1"];
    const bossState = (value) => value.state["tear.boss.v1"];
    const worldState = (value) => value.state["tear.world.v1"];
    const uiState = (value) => value.state["tear.ui.v1"];
    const cinemaState = (value) => value.state["tear.cinematic.v1"];
    const trace = [];
    let sourceSpawn = null;

    for (let index = 0; index < 1_200; index += 1) {
      if (companion) await new Promise((resolve) => requestAnimationFrame(resolve));
      const before = environment.observe();
      if (before.entities.some((actor) => actor.kind === "source")) {
        sourceSpawn = snapshot("campaign-source-production-spawn");
        break;
      }
      const transition = environment.step([]);
      trace.push({ kind: "fixed", tick: transition.observation.tick, hash: transition.info.canonicalStateHash });
    }
    if (sourceSpawn === null) throw new Error("production wave 60 did not spawn Source");
    checkRecording("Source spawn");

    // Boss introductions are advanced by the real application frame prelude,
    // not by exact fixed ticks. Wait until the production actor reaches its
    // normal combat-ready state before creating the surgical child.
    for (let frame = 0; frame < 600; frame += 1) {
      const boss = bossState(snapshot(`campaign-source-intro-${String(frame)}`))[0];
      if (typeof boss?.introT === "number" && boss.introT <= 0) break;
      const advanced = environment.advanceApplicationFrame(1 / 60);
      trace.push({ kind: "application", frame, ...advanced });
      // Class-A frames are synchronous. Return to the browser after each intro
      // frame so worker/IndexedDB writes settle as they do during normal RAF.
      if (companion) await new Promise((resolve) => requestAnimationFrame(resolve));
      checkRecording(`Source introduction frame ${String(frame)}`);
    }
    const combatReady = snapshot("campaign-source-combat-ready", "reconstructed-reachable");
    checkRecording("Source combat ready");
    const readyBosses = bossState(combatReady);
    if (!Array.isArray(readyBosses) || readyBosses.length !== 1 || readyBosses[0]?.introT > 0) {
      throw new Error("Source did not leave its production introduction");
    }
    const forged = environment.forgeExitLaunch({
      id: "campaign-source-one-hp", kind: "boss-finisher", boss: "source", remainingHp: 1,
    });
    if (!forged.ok) throw new Error(`Source finisher restore failed in ${forged.phase}: ${JSON.stringify(forged.issues)}`);
    const surgical = snapshot("campaign-source-one-hp", "surgical-valid");

    let commandId = 0;
    const command = (tick, value) => ({ kind: "command", tick, id: ++commandId, command: value });
    let defeated = false;
    let preFinaleHeldActions = [];
    for (let index = 0; index < 3_600 && !defeated; index += 1) {
      if (companion) await new Promise((resolve) => requestAnimationFrame(resolve));
      const observation = environment.observe();
      const source = observation.entities.find((actor) => actor.kind === "source");
      if (source === undefined) { defeated = true; break; }
      const dx = source.x - observation.player.x, dy = source.y - observation.player.y;
      const distance = Math.hypot(dx, dy), toward = dx >= 0 ? 1_000 : -1_000;
      const sweep = ((index % 24) / 23 - 0.5) * 1.8;
      const angle = Math.atan2(source.y - observation.blade.handY,
        source.x - observation.blade.handX) + sweep;
      const turn = ((Math.floor(angle / (Math.PI * 2) * 1_000_000) % 1_000_000) + 1_000_000) % 1_000_000;
      const nextTick = observation.tick + 1;
      const actions = [
        command(nextTick, { type: "aim", turn, magnitude: 1_000 }),
        command(nextTick, { type: "move", x: distance > 135 ? toward : -toward, y: 0 }),
        command(nextTick, { type: "weapon", intent: "primary", phase: "pressed" }),
      ];
      if (observation.player.grounded && (dy < -60 || distance < 230)) {
        actions.push(command(nextTick, { type: "jump", phase: "pressed" }));
      }
      if (observation.player.dashCharges > 0 && distance > 430) {
        actions.push(command(nextTick, { type: "dash", x: toward, y: 0 }));
      }
      preFinaleHeldActions = actions.map((entry) => entry.command);
      const transition = environment.step(actions);
      trace.push({ kind: "combat", tick: transition.observation.tick, hash: transition.info.canonicalStateHash });
      // Source owns authored phase cinematics and a timed kneel before TRUE
      // FORM. Exact ticks alone intentionally do not advance those directors,
      // so run the real application frame path between semantic combat ticks.
      const phaseFrame = environment.advanceApplicationFrame(1 / 60, { skipCinematic: true });
      trace.push({ kind: "combat-application", ...phaseFrame });
      defeated = environment.engineEventProjection().some((event) => event.type === "enemy.defeated");
    }
    if (!defeated) {
      const failed = snapshot("campaign-source-combat-failed");
      throw new Error(`semantic combat did not defeat the surgical Source: ${JSON.stringify({
        observation: environment.observe(), player: failed.state["tear.player.v1"],
        blade: failed.state["tear.blade.v1"], boss: failed.state["tear.boss.v1"],
        events: environment.engineEventProjection().slice(-10),
      })}`);
    }
    const preFinale = snapshot("campaign-source-post-defeat", "recorded-canonical");
    checkRecording("Source defeat");

    // Death animation/removal and wave clearing remain fixed-step production
    // work. The authored finale itself advances through application frames.
    for (let index = 0; index < 1_200 && environment.observe().availableActions.includes("move"); index += 1) {
      if (companion) await new Promise((resolve) => requestAnimationFrame(resolve));
      const transition = environment.step([]);
      trace.push({ kind: "death-and-clear", tick: transition.observation.tick, hash: transition.info.canonicalStateHash });
      const state = snapshot(`campaign-source-clear-${String(index)}`);
      if (worldState(state).runtime?.lifecycle?.phase === "finale") break;
    }
    const finaleStart = snapshot("campaign-source-finale-start", "recorded-canonical");
    checkRecording("finale launch");
    if (worldState(finaleStart).runtime?.lifecycle?.phase !== "finale") {
      throw new Error("production wave clear did not begin the Adventure finale");
    }

    if (companion) {
      window.__R07_FINALE_ENVIRONMENT__ = environment;
      return { started, sourceSpawn, combatReady, surgical, preFinale, preFinaleHeldActions, finaleStart, trace };
    }
    for (let frame = 0; frame < 900 && uiState(snapshot(`campaign-finale-${String(frame)}`)).screen !== "win"; frame += 1) {
      const advanced = environment.advanceApplicationFrame(1 / 60, { skipCinematic: frame === 0 });
      trace.push({ kind: "finale", frame, ...advanced });
    }
    const terminal = snapshot("campaign-source-victory", "recorded-canonical");
    return {
      started, sourceSpawn, combatReady, surgical, preFinale, preFinaleHeldActions, finaleStart, terminal, trace,
      events: environment.engineEventProjection(), observation: environment.observe(),
      finaleIntents: environment.finaleIntentProjection(),
      finaleOutward: environment.finaleOutwardProjection(),
      finaleAudio: environment.audioDispatchProjection(),
      // The receipt journal is intentionally data-only. It captures only the
      // synchronous adapter decisions accepted by this live run, so a
      // detached reconstruction can inject those decisions without claiming
      // that a profile, cloud push, or device side effect completed.
      outcomeChronology: environment.outcomeChronologyProjection(),
      terminalRun: runState(terminal), terminalWorld: worldState(terminal),
      terminalUi: uiState(terminal), terminalCinema: cinemaState(terminal),
    };
  }, { scenarioValue: scenario, companionMode });

  if (companionMode) {
    // Constructed final-wave origin and existing surgical Source defeat above are
    // engineering evidence, never a naturally completed sixty-wave Campaign.
    // From the committed finale launch onward use real host confirm samples,
    // with no skip/finish/landing/HP injection or later state restoration.
    await page.keyboard.up("Enter");
    for (let frame = 0; frame < 900; frame++) {
      if (frame === 60) await page.keyboard.down("Enter");
      const terminal = await page.evaluate(async () => {
        const environment = window.__R07_FINALE_ENVIRONMENT__;
        environment.advanceApplicationFrame(1 / 60);
        await new Promise((resolve) => requestAnimationFrame(resolve));
        return environment.captureSnapshot("r07-finale-frame", "recorded-canonical").state["tear.ui.v1"].screen === "win";
      });
      if (terminal) break;
    }
    await page.keyboard.up("Enter");
    evidence = { ...evidence, ...await page.evaluate(() => {
      const environment = window.__R07_FINALE_ENVIRONMENT__, terminal = environment.captureSnapshot("r07-final-win", "recorded-canonical");
      return { terminal, events: environment.engineEventProjection(), terminalRun: terminal.state["tear.run.v1"],
        terminalWorld: terminal.state["tear.world.v1"], terminalUi: terminal.state["tear.ui.v1"], terminalCinema: terminal.state["tear.cinematic.v1"] };
    }) };
    assert.equal(evidence.terminalUi.screen, "win", "actual confirmation/assist, gravity and landing must reach final presentation");
    const artifactDir = process.env.TEAR_R07_FINALE_ARTIFACT_DIR || path.join("artifacts", "tearbench", "c27a", "finale-companion");
    fs.mkdirSync(artifactDir, { recursive: true });
    fs.writeFileSync(path.join(artifactDir, "terminal-evidence.json"), JSON.stringify(evidence, null, 2), { flag: "wx" });
    const completed = await waitForBrowserValue(page, async () => {
      const failure = window.__TEAR_GHOST_V3__.failure();
      if (failure !== null) throw new Error(`finale recording failed: ${JSON.stringify(failure)}`);
      const manifests = await window.__TEAR_GHOST_V3__.manifests();
      return manifests.find((manifest) => manifest.status === "complete" && manifest.provenance?.finaleCompanion)?.id;
    }).catch(async (error) => {
      const status = await page.evaluate(async () => ({ active: window.__TEAR_GHOST_V3__.active(),
        failure: window.__TEAR_GHOST_V3__.failure(), manifests: await window.__TEAR_GHOST_V3__.manifests() }));
      fs.writeFileSync(path.join(artifactDir, "recording-failure.json"), JSON.stringify({ error: String(error), ...status }, null, 2), { flag: "wx" });
      throw error;
    });
    const child = await page.evaluate((id) => window.__TEAR_GHOST_V3__.read(id), completed);
    const parentId = child.manifest.provenance.finaleCompanion.parentId;
    const parent = await page.evaluate((id) => window.__TEAR_GHOST_V3__.read(id), parentId);
    fs.writeFileSync(path.join(artifactDir, "source-pair.json"), JSON.stringify({ classification: "constructed-final-wave-surgical-source", parent, child, evidence }, null, 2));
    // Preserve original encoded Vault strings as evidence; this is not a new
    // paired portable archive format or a synthesized custody source.
    const encodedPair = await page.evaluate((ids) => new Promise((resolve, reject) => {
      const request = indexedDB.open("tear-ghost-v3"); request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction(["manifests", "chunks"], "readonly"), pair = {};
        for (const id of ids) {
          const m = tx.objectStore("manifests").get(id);
          m.onsuccess = () => {
            const text = m.result; if (typeof text !== "string") { tx.abort(); return; }
            const manifest = JSON.parse(text), chunks = {}; pair[id] = { manifestText: text, chunks };
            for (const entry of manifest.chunks) {
              const c = tx.objectStore("chunks").get(entry.id); c.onsuccess = () => { if (typeof c.result !== "string") { tx.abort(); return; } chunks[entry.id] = c.result; };
            }
          };
        }
        tx.oncomplete = () => { db.close(); resolve(pair); }; tx.onabort = () => { db.close(); reject(tx.error || new Error("source pair read failed")); };
      };
    }), [parentId, completed]);
    fs.writeFileSync(path.join(artifactDir, "encoded-source-pair.json"), JSON.stringify(encodedPair, null, 2));
    const verified = await page.evaluate((id) => window.__TEAR_GHOST_V3__.verify(id), completed);
    fs.writeFileSync(path.join(artifactDir, "verification.json"), JSON.stringify(verified, null, 2));
    assert.equal(verified.status, "verified", JSON.stringify(verified));
    const profile = await page.evaluate(() => ({ meta: localStorage.getItem("tear_meta"), profile: localStorage.getItem("tear_profile_v2") }));
    await boot();
    await page.evaluate(() => {
      const positions = []; window.__R07_FINALE_POSITIONS__ = positions;
      const original = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function captureFinaleText(text, x, y, ...rest) {
        if (["PROFILE", "▶ REPLAY"].includes(String(text)) && y < 80) positions.length = 0;
        positions.push({ text: String(text), x, y }); return original.call(this, text, x, y, ...rest);
      };
    });
    const clickText = async (label, index = 0) => {
      await page.waitForFunction((text) => window.__R07_FINALE_POSITIONS__?.some((point) => point.text === text), label);
      const point = await page.evaluate(({ label: text, index: at }) => window.__R07_FINALE_POSITIONS__.filter((p) => p.text === text)[at], { label, index });
      assert.ok(point, `missing rendered ${label}`); await page.mouse.click(point.x, point.y);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    };
    await page.mouse.click(260, 266); await waitScreen("profile");
    await page.mouse.click(875, 271);
    await page.waitForFunction(() => window.__R07_FINALE_POSITIONS__.some((p) => p.text === "◆ THEATER"));
    // Newest complete capsule is the companion; its row goes through the normal
    // library action and exact-parent lease, never a debug state/restore hook.
    await clickText("◆ THEATER"); await waitScreen("replay");
    await page.waitForFunction(() => window.__R07_FINALE_POSITIONS__.some((p) => p.text.startsWith("FINALE CONTINUATION   ·")));
    await page.screenshot({ path: path.join(artifactDir, "theater-origin.png") });
    await clickText("▶");
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(artifactDir, "theater-playing.png") });
    // Actual transport seeks by fraction using the rendered progress track.
    await page.mouse.click(1280, 810);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: path.join(artifactDir, "theater-restoration.png") });
    await clickText("BACK TO SCORED RUN");
    await page.waitForFunction(() => window.__R07_FINALE_POSITIONS__.some((p) => p.text === "FINALE CONTINUATION")
      || window.__R07_FINALE_POSITIONS__.some((p) => p.text === "The Ghost source is not verified for Theater.")
      || window.__R07_FINALE_POSITIONS__.some((p) => p.text === "◆ THEATER" && p.y < 80));
    // The surgical prefix may be refused by the ordinary scored verifier. It
    // must report that truthfully rather than promote the constructed origin.
    const after = await page.evaluate(() => ({ meta: localStorage.getItem("tear_meta"), profile: localStorage.getItem("tear_profile_v2") }));
    assert.deepEqual(after, profile, "detached continuation must not repeat scored/profile effects");
    assert.deepEqual(await page.evaluate((id) => window.__TEAR_GHOST_V3__.read(id), completed), child);
    assert.deepEqual(await page.evaluate((id) => window.__TEAR_GHOST_V3__.read(id), parentId), parent);
    fs.writeFileSync(path.join(artifactDir, "reopen.json"), JSON.stringify({ completed, parentId, profile, after, positions: await page.evaluate(() => window.__R07_FINALE_POSITIONS__) }, null, 2));
    console.log(`R07 finale companion: ${completed} bound to ${parentId}; constructed final-wave proof only`);
    return;
  }

  assert.equal(evidence.sourceSpawn.state["tear.run.v1"].wave, 60);
  assert.equal(evidence.sourceSpawn.state["tear.run.v1"].stage, 5);
  assert.equal(evidence.surgical.stateClass, "surgical-valid");
  assert.equal(evidence.surgical.state["tear.boss.v1"][0].hp, 1);
  assert.equal(evidence.surgical.state["tear.boss.v1"][0].hpDisplay, 1);
  assert.equal(evidence.terminalUi.screen, "win");
  assert.equal(evidence.terminalWorld.runtime.lifecycle.phase, "terminated");
  assert.equal(evidence.terminalWorld.runtime.lifecycle.outcome, "victory");
  assert.equal(evidence.terminalCinema.active, false);
  assert.ok(evidence.terminalRun.finalBossDeath, "Source kill must retain its production death witness");
  assert.equal(evidence.finaleIntents.length, 7);
  assert.deepEqual(evidence.finaleIntents.map((batch) => batch.map((intent) => intent.type)), [
    ["begin-finale-lifecycle", "clear-combat", "freeze-void", "world-zoom", "final-blade"],
    ["sound"], ["ring", "burst", "flash", "shake", "sound", "vibrate"],
    ["ring", "burst", "flash", "shake", "sound", "vibrate"],
    ["ring", "burst", "flash", "shake", "sound", "vibrate"],
    ["restore-stage-zero", "freeze-void", "world-zoom", "set-player-restoration", "sound"],
    ["final-blade", "win-run"],
  ]);
  assert.deepEqual(evidence.finaleOutward.map((call) => call.type), [
    "world-zoom", "sound",
    "ring", "burst", "flash", "shake", "sound", "vibrate",
    "ring", "burst", "flash", "shake", "sound", "vibrate",
    "ring", "burst", "flash", "shake", "sound", "vibrate",
    "world-zoom", "sound",
  ]);
  const feelCalls = evidence.finaleOutward.filter((call) =>
    call.type === "world-zoom" || call.type === "flash" || call.type === "shake");
  assert.deepEqual(feelCalls.map((call) => ({ type: call.type, receipt: call.receipt })), [
    { type: "world-zoom", receipt: { requested: 0.84, immediate: true,
      before: { current: 0.8100000020438322, target: 1 }, after: { current: 0.84, target: 0.84 } } },
    { type: "flash", receipt: { requested: 0.135, before: 0, after: 0.135, aggregation: "maximum" } },
    { type: "shake", receipt: { requested: 5, before: 16.125, after: 16.125, aggregation: "maximum" } },
    { type: "flash", receipt: { requested: 0.17, before: 0.135, after: 0.17, aggregation: "maximum" } },
    { type: "shake", receipt: { requested: 7, before: 16.125, after: 16.125, aggregation: "maximum" } },
    { type: "flash", receipt: { requested: 0.20500000000000002, before: 0.17,
      after: 0.20500000000000002, aggregation: "maximum" } },
    { type: "shake", receipt: { requested: 9, before: 16.125, after: 16.125, aggregation: "maximum" } },
    { type: "world-zoom", receipt: { requested: 1, immediate: true,
      before: { current: 0.84, target: 0.84 }, after: { current: 1, target: 1 } } },
  ]);
  assert.equal(evidence.finaleAudio.length, 24);
  assert.ok(evidence.finaleAudio.every((receipt, index) => receipt.phase === (index % 2 === 0 ? "executing" : "completed")));
  assert.ok(evidence.finaleAudio.every((receipt, index) => index % 2 === 0
    || receipt.requestId === evidence.finaleAudio[index - 1].requestId));
  const completedAudio = evidence.finaleAudio.filter((receipt) => receipt.phase === "completed");
  assert.equal(completedAudio.length, 12);
  assert.deepEqual(completedAudio.filter((receipt) => receipt.result.kind === "cue")
    .map((receipt) => receipt.request.operation),
  ["final-silence", "final-cut", "final-cut", "final-cut", "final-restore"]);
  const cueAudio = completedAudio.filter((entry) => entry.result.kind === "cue");
  for (const receipt of cueAudio) {
    assert.equal(receipt.result.kind, "cue");
    assert.equal(receipt.result.route, "environment");
    assert.equal(receipt.result.context, "running");
    assert.ok(receipt.result.attempted > 0);
    assert.ok(receipt.result.scheduling === "scheduled-to-audio-graph"
      || receipt.result.scheduling === "voice-cap-rejected");
    if (receipt.result.scheduling === "scheduled-to-audio-graph") assert.ok(receipt.result.accepted > 0);
    else assert.equal(receipt.result.accepted, 0);
  }
  assert.deepEqual(cueAudio.map((receipt) => ({
    operation: receipt.request.operation, scheduling: receipt.result.scheduling,
    attempted: receipt.result.attempted, accepted: receipt.result.accepted,
  })), [
    { operation: "final-silence", scheduling: "voice-cap-rejected", attempted: 1, accepted: 0 },
    { operation: "final-cut", scheduling: "voice-cap-rejected", attempted: 3, accepted: 0 },
    { operation: "final-cut", scheduling: "voice-cap-rejected", attempted: 3, accepted: 0 },
    { operation: "final-cut", scheduling: "voice-cap-rejected", attempted: 3, accepted: 0 },
    { operation: "final-restore", scheduling: "voice-cap-rejected", attempted: 4, accepted: 0 },
  ]);
  const mixAudio = completedAudio.filter((receipt) => receipt.result.kind === "mix");
  assert.deepEqual(mixAudio.map((receipt) => ({
    operation: receipt.request.operation, context: receipt.result.context,
    scheduling: receipt.result.scheduling, before: receipt.result.logicalBefore,
    after: receipt.result.logicalAfter, duration: receipt.result.normalizedDuration,
  })), [
    { operation: "music-duck", context: "running", scheduling: "logical-target-only", before: 0.45, after: 1, duration: 0.25 },
    { operation: "music-duck", context: "running", scheduling: "logical-target-only", before: 1, after: 0.45, duration: 0.18 },
    { operation: "void-mix", context: "running", scheduling: "logical-target-only", before: 0, after: 0, duration: 0.05 },
    { operation: "void-mix", context: "running", scheduling: "logical-target-only", before: 0, after: 1, duration: 0.45 },
    { operation: "void-mix", context: "running", scheduling: "logical-target-only", before: 1, after: 0.72, duration: 0.55 },
    { operation: "void-mix", context: "running", scheduling: "logical-target-only", before: 0.72, after: 0, duration: 0.9 },
    { operation: "music-duck", context: "running", scheduling: "logical-target-only", before: 0.45, after: 1, duration: 0.75 },
  ]);

  const particleCalls = evidence.finaleOutward.filter((call) => call.type === "ring" || call.type === "burst");
  assert.equal(particleCalls.length, 6);
  assert.deepEqual(particleCalls.map((call) => call.receipt), [
    { accepted: true, requested: 1, emitted: 1, rejected: { culled: 0, budget: 0 }, listDelta: 1 },
    { accepted: true, requested: 14, emitted: 14, rejected: { culled: 0, budget: 0 }, listDelta: 14 },
    { accepted: true, requested: 1, emitted: 1, rejected: { culled: 0, budget: 0 }, listDelta: 1 },
    { accepted: true, requested: 14, emitted: 14, rejected: { culled: 0, budget: 0 }, listDelta: 14 },
    { accepted: true, requested: 1, emitted: 1, rejected: { culled: 0, budget: 0 }, listDelta: 1 },
    { accepted: true, requested: 14, emitted: 14, rejected: { culled: 0, budget: 0 }, listDelta: 14 },
  ]);
  const outcomeEffects = evidence.outcomeChronology.map((entry) => entry.effect.type);
  assert.ok(outcomeEffects.includes("outcome.prepared-stored")
    || outcomeEffects.includes("outcome.prepared-cache-hit"));
  assert.ok(outcomeEffects.includes("outcome.presentation-dispatched"));
  assert.deepEqual(evidence.outcomeChronology.map((entry) => entry.sequence),
    evidence.outcomeChronology.map((_, index) => index));
  assert.ok(evidence.events.some((event) => event.type === "enemy.spawned" && event.payload.bossId === "source"));
  assert.ok(evidence.events.some((event) => event.type === "enemy.defeated"));
  assert.ok(evidence.events.some((event) => event.type === "wave.cleared" && event.payload.wave === 60));
  assert.ok(evidence.events.some((event) => event.type === "run.completed"));

  const target = path.join("artifacts", "tearbench", "c27a", "campaign-source-victory.json");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify({ scenario, ...evidence, capturedAt: new Date().toISOString() }, null, 2)}\n`);
  console.log(`C27A campaign victory: ${String(evidence.trace.length)} transitions -> ${target}`);
});
