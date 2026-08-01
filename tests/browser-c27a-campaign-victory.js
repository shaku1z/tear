/* eslint-disable @typescript-eslint/no-require-imports -- direct Node browser evidence script. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { withJourney } = require("./browser-journey-harness");

const scenario = Object.freeze({
  format: "tear-contract", kind: "scenario", schemaVersion: 1, version: 1,
  id: "c27a.campaign-source-victory", description: "Real campaign finale from a certified surgical Source origin",
  stateClass: "recorded-canonical", executionClass: "engineering", seed: "c27a-campaign-victory",
  start: { mode: "campaign", difficulty: "normal", weapon: "sword" }, maxTicks: 8_000,
  assertions: ["runtime.finite-state", "player.finite-transform", "blade.finite-transform"],
  tags: ["c27a", "campaign", "source", "finale", "state-forge"],
});

withJourney({ name: "C27A campaign victory", port: 8168 }, async ({ page }) => {
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__, undefined, { timeout: 15_000 });
  const evidence = await page.evaluate((scenarioValue) => {
    const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    environment.reset(scenarioValue);
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
      const before = environment.observe();
      if (before.entities.some((actor) => actor.kind === "source")) {
        sourceSpawn = snapshot("campaign-source-production-spawn");
        break;
      }
      const transition = environment.step([]);
      trace.push({ kind: "fixed", tick: transition.observation.tick, hash: transition.info.canonicalStateHash });
    }
    if (sourceSpawn === null) throw new Error("production wave 50 did not spawn Source");

    // Boss introductions are advanced by the real application frame prelude,
    // not by exact fixed ticks. Wait until the production actor reaches its
    // normal combat-ready state before creating the surgical child.
    for (let frame = 0; frame < 600; frame += 1) {
      const boss = bossState(snapshot(`campaign-source-intro-${String(frame)}`))[0];
      if (typeof boss?.introT === "number" && boss.introT <= 0) break;
      const advanced = environment.advanceApplicationFrame(1 / 60);
      trace.push({ kind: "application", frame, ...advanced });
    }
    const combatReady = snapshot("campaign-source-combat-ready", "reconstructed-reachable");
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

    // Death animation/removal and wave clearing remain fixed-step production
    // work. The authored finale itself advances through application frames.
    for (let index = 0; index < 1_200 && environment.observe().availableActions.includes("move"); index += 1) {
      const transition = environment.step([]);
      trace.push({ kind: "death-and-clear", tick: transition.observation.tick, hash: transition.info.canonicalStateHash });
      const state = snapshot(`campaign-source-clear-${String(index)}`);
      if (worldState(state).runtime?.lifecycle?.phase === "finale") break;
    }
    const finaleStart = snapshot("campaign-source-finale-start", "recorded-canonical");
    if (worldState(finaleStart).runtime?.lifecycle?.phase !== "finale") {
      throw new Error("production wave clear did not begin the Adventure finale");
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
      terminalRun: runState(terminal), terminalWorld: worldState(terminal),
      terminalUi: uiState(terminal), terminalCinema: cinemaState(terminal),
    };
  }, scenario);

  assert.equal(evidence.sourceSpawn.state["tear.run.v1"].wave, 50);
  assert.equal(evidence.sourceSpawn.state["tear.run.v1"].stage, 4);
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
      before: { current: 0.8000000001419295, target: 1 }, after: { current: 0.84, target: 0.84 } } },
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
  assert.ok(evidence.events.some((event) => event.type === "enemy.spawned" && event.payload.bossId === "source"));
  assert.ok(evidence.events.some((event) => event.type === "enemy.defeated"));
  assert.ok(evidence.events.some((event) => event.type === "wave.cleared" && event.payload.wave === 50));
  assert.ok(evidence.events.some((event) => event.type === "run.completed"));

  const target = path.join("artifacts", "tearbench", "c27a", "campaign-source-victory.json");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify({ scenario, ...evidence, capturedAt: new Date().toISOString() }, null, 2)}\n`);
  console.log(`C27A campaign victory: ${String(evidence.trace.length)} transitions -> ${target}`);
});
