/* eslint-disable @typescript-eslint/no-require-imports -- direct Node browser evidence script. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { withJourney } = require("./browser-journey-harness");

// The live half of the C27A parity comparison. It captures, from the real
// application, the three things a detached world needs to be checked against:
// the State Forge origin snapshot, the sealed action schedule, and the
// authoritative per-tick state hashes. It is not itself a parity claim.
function scenarioFor(overrides) {
  return {
    format: "tear-contract",
    kind: "scenario",
    schemaVersion: 1,
    version: 1,
    description: "C27A live authoritative trace for detached-world comparison",
    stateClass: "recorded-canonical",
    executionClass: "engineering",
    maxTicks: 180,
    assertions: ["runtime.finite-state", "player.finite-transform", "blade.finite-transform"],
    tags: ["c27a", "parity", "live-runtime"],
    ...overrides,
  };
}

// One scenario proves the pipe works; a matrix is what makes the shared-core
// claim more than anecdotal. Modes, difficulties, weapons, and run length all
// change which production code the tick executes.
const scenarios = [
  scenarioFor({
    id: "c27a.live-parity-trace",
    seed: "c27a-parity-seed",
    start: { mode: "endless", difficulty: "normal", weapon: "sword" },
  }),
  scenarioFor({
    id: "c27a.live-parity-trace.hard-hammer",
    seed: "c27a-parity-hard",
    start: { mode: "endless", difficulty: "hard", weapon: "hammer" },
  }),
  scenarioFor({
    id: "c27a.live-parity-trace.playground",
    seed: "c27a-parity-playground",
    start: { mode: "playground", difficulty: "normal", weapon: "sword" },
  }),
  scenarioFor({
    id: "c27a.live-parity-trace.boss-warden",
    seed: "c27a-parity-boss",
    // A boss run exercises boss steps, arena platforms, and boss feedback that
    // an ordinary opening wave never reaches.
    start: { mode: "bossonly", difficulty: "normal", weapon: "sword", boss: "warden" },
    maxTicks: 300,
  }),
  // The remaining roster. Each boss brings its own steps, arena, and
  // cinematic hooks, so one boss is not evidence for the others.
  ...["colossus", "aldric", "echo", "source"].map((boss) => scenarioFor({
    id: `c27a.live-parity-trace.boss-${boss}`,
    seed: `c27a-parity-boss-${boss}`,
    start: { mode: "bossonly", difficulty: "normal", weapon: "sword", boss },
    maxTicks: 300,
  })),
  // Campaign and gauntlet drive different wave planners, stage selection, and
  // progression paths than endless does.
  scenarioFor({
    id: "c27a.live-parity-trace.campaign",
    seed: "c27a-parity-campaign",
    start: { mode: "campaign", difficulty: "normal", weapon: "sword" },
    maxTicks: 300,
  }),
  scenarioFor({
    id: "c27a.live-parity-trace.gauntlet",
    seed: "c27a-parity-gauntlet",
    start: { mode: "gauntlet", difficulty: "normal", weapon: "greatsword" },
    maxTicks: 300,
  }),
  scenarioFor({
    id: "c27a.live-parity-trace.terminal",
    seed: "c27a-parity-terminal",
    // An idle player on hard eventually dies. A terminal run exercises death
    // resolution, revives, and the run ending, which no surviving run reaches.
    start: { mode: "endless", difficulty: "hard", weapon: "sword" },
    maxTicks: 3600,
    idle: true,
  }),
  scenarioFor({
    id: "c27a.live-parity-trace.long",
    seed: "c27a-parity-long",
    start: { mode: "endless", difficulty: "normal", weapon: "sword" },
    maxTicks: 600,
  }),
  scenarioFor({
    id: "c27a.live-parity-trace.natural-wave",
    seed: "audit-wave-natural",
    start: { mode: "endless", difficulty: "easy", weapon: "sword" },
    maxTicks: 1800,
    adaptiveNaturalWave: true,
  }),
];

// Preserve the full matrix by default while permitting one bounded local
// source-owned mechanic capture without invoking endurance scenarios.
const SHORT_SCENARIO_ID = "c27a.live-parity-trace";
const MAX_FOCUSED_TICKS = 180;
const MIN_FOCUSED_TICKS = 40;

function scenariosForExecution() {
  const requestedId = process.env.TEAR_C27A_SCENARIO_ID;
  const requestedMaxTicks = process.env.TEAR_C27A_MAX_TICKS;
  if (requestedId === undefined && requestedMaxTicks === undefined) return scenarios;
  if (requestedId !== SHORT_SCENARIO_ID) {
    throw new Error(`focused C27A capture requires TEAR_C27A_SCENARIO_ID=${SHORT_SCENARIO_ID}`);
  }
  if (requestedMaxTicks === undefined || !/^\d+$/u.test(requestedMaxTicks)) {
    throw new Error("focused C27A capture requires a numeric TEAR_C27A_MAX_TICKS");
  }
  const maxTicks = Number(requestedMaxTicks);
  if (!Number.isSafeInteger(maxTicks) || maxTicks < MIN_FOCUSED_TICKS || maxTicks > MAX_FOCUSED_TICKS) {
    throw new Error(`TEAR_C27A_MAX_TICKS must be an integer from ${String(MIN_FOCUSED_TICKS)} to ${String(MAX_FOCUSED_TICKS)}`);
  }
  const selected = scenarios.find((scenario) => scenario.id === SHORT_SCENARIO_ID);
  if (selected === undefined) throw new Error(`missing source-owned C27A scenario ${SHORT_SCENARIO_ID}`);
  return [{ ...selected, maxTicks }];
}

function action(tick, id, command) {
  return { kind: "command", tick, id, command };
}

function actionsAt(tick) {
  if (tick === 2) return [action(tick, 1, { type: "aim", turn: 0, magnitude: 1000 })];
  if (tick === 4) return [action(tick, 2, { type: "move", x: 1000, y: 0 })];
  if (tick === 12) return [action(tick, 3, { type: "weapon", intent: "primary", phase: "pressed" })];
  if (tick === 40) return [action(tick, 4, { type: "weapon", intent: "primary", phase: "released" })];
  if (tick === 55) return [action(tick, 5, { type: "jump", phase: "pressed" })];
  if (tick === 56) return [action(tick, 6, { type: "jump", phase: "released" })];
  if (tick === 80) return [action(tick, 7, { type: "dash", x: 1000, y: 0 })];
  if (tick === 150) return [action(tick, 8, { type: "move", x: 0, y: 0 })];
  return [];
}

const ARTIFACT_DIR = path.join("artifacts", "tearbench", "c27a");

function artifactPath(scenario) {
  return path.join(ARTIFACT_DIR, `${scenario.id}.json`);
}

withJourney({ name: "C27A live parity trace", port: 8167 }, async ({ page }) => {
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__, undefined, { timeout: 15000 });
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const written = [];

  for (const scenario of scenariosForExecution()) {
    const schedule = Object.fromEntries(Array.from({ length: scenario.maxTicks }, (_, index) => {
      const tick = index + 1;
      return [tick, scenario.idle === true ? [] : actionsAt(tick)];
    }));

    const captured = await page.evaluate(({ scenarioValue, scheduledActions }) => {
      const wrap = (observation, commands, nextId) => commands.map((command) => ({
        kind: "command", tick: observation.tick + 1, id: nextId(), command,
      }));
      const naturalWaveActions = (observation, nextId) => {
        if (observation.availableActions.includes("draft-choice")) {
          const choiceId = observation.diagnostics?.ui?.focusableIds?.[0];
          if (typeof choiceId !== "string") throw new Error("natural wave draft has no offered choice");
          return wrap(observation, [{ type: "draft-choice", choiceId }], nextId);
        }
        const actors = observation.entities.filter((entity) => entity.kind !== "projectile");
        if (actors.length === 0) return wrap(observation, [{ type: "move", x: 0, y: 0 }], nextId);
        const player = observation.player;
        actors.sort((left, right) => {
          const ld = Math.hypot(left.x - player.x, left.y - player.y);
          const rd = Math.hypot(right.x - player.x, right.y - player.y);
          return ld - rd || left.id.localeCompare(right.id);
        });
        const target = actors[0];
        const dx = target.x - player.x, dy = target.y - player.y, distance = Math.hypot(dx, dy);
        const toward = dx > 0 ? 1000 : -1000;
        const moveX = distance < 100 ? -toward : distance > 145 ? toward
          : (Math.floor(observation.tick / 150) % 2 === 0 ? 1000 : -1000);
        const phase = observation.tick % 20;
        const sweep = phase < 12 ? -1.05 + 2.1 * (phase / 11) : 0;
        const angle = Math.atan2(target.y - observation.blade.handY,
          target.x - observation.blade.handX) + sweep;
        const scale = 1_000_000;
        const turn = ((Math.floor(angle / (Math.PI * 2) * scale) % scale) + scale) % scale;
        const commands = [
          { type: "move", x: moveX, y: dy > 100 && player.grounded ? 1000 : 0 },
          { type: "aim", turn, magnitude: 1000 },
          { type: "weapon", intent: "primary", phase: "pressed" },
        ];
        if (player.grounded && (target.y < player.y - 70 || distance < 240)) {
          commands.push({ type: "jump", phase: "pressed" });
        }
        if (player.dashCharges > 0 && (distance < 100 || distance > 560)) {
          commands.push({ type: "dash", x: toward, y: 0 });
        }
        return wrap(observation, commands, nextId);
      };
      const routeProjection = (environment) => {
        const observation = environment.observe();
        const state = environment.captureSnapshot(`route-${String(observation.tick)}`, "recorded-canonical").state;
        const run = state["tear.run.v1"] ?? {};
        const world = state["tear.world.v1"] ?? {};
        const reward = state["tear.reward.v1"] ?? {};
        const ui = state["tear.ui.v1"] ?? {};
        return {
          tick: observation.tick, screen: ui.screen, wave: observation.run.wave,
          lifecycle: world.runtime?.lifecycle,
          reward: reward.selection === null ? null : {
            phase: reward.selection?.phase,
            choiceIds: reward.selection?.choices?.map((choice) => choice.id) ?? [],
            reserveChoiceIds: reward.selection?.reserveChoices?.map((choice) => choice.id) ?? [],
          },
          focusableIds: observation.diagnostics?.ui?.focusableIds ?? [],
          owned: run.mods?.owned ?? {},
        };
      };
      const trace = (label, replaySegments) => {
        const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
        environment.reset(scenarioValue);
        // The origin snapshot is taken before the first stepped tick so a
        // detached world can start from exactly this state.
        const origin = environment.captureSnapshot(`${label}-origin`, "recorded-canonical");
        const hashes = [];
        const events = [];
        const checkpoints = [];
        const segments = [];
        const routeBoundaries = [];
        let terminated = false;
        let commandId = 0, cursor = 0;
        const nextId = () => ++commandId;
        while (hashes.length < scenarioValue.maxTicks && !terminated) {
          if (replaySegments !== null && cursor >= replaySegments.length) break;
          const before = environment.observe();
          const actions = replaySegments !== null ? replaySegments[cursor].actions
            : scenarioValue.adaptiveNaturalWave === true
              ? naturalWaveActions(before, nextId)
              : scheduledActions[before.tick + 1] ?? [];
          const beforeRoute = before.availableActions.includes("draft-choice")
            ? routeProjection(environment) : null;
          const transition = environment.step(actions);
          terminated = transition.terminated === true;
          const routed = transition.observation.tick === before.tick;
          const segment = routed
            ? { kind: "route", atTick: before.tick, actions }
            : { kind: "fixed", fromTick: before.tick, toTick: transition.observation.tick, actions };
          if (scenarioValue.adaptiveNaturalWave === true) segments.push(segment);
          if (routed) {
            routeBoundaries.push({ before: beforeRoute, after: routeProjection(environment) });
            cursor += 1;
            continue;
          }
          const tick = transition.observation.tick;
          // A few full State Forge checkpoints make a hash mismatch diagnosable:
          // they say WHICH field diverged, not merely that something did.
          if (tick <= 3 || tick === 30 || tick === scenarioValue.maxTicks || terminated) {
            checkpoints.push({
              tick,
              canonical: environment.canonicalState(),
              state: environment.captureSnapshot(`${label}-tick-${String(tick)}`, "recorded-canonical").state,
            });
          }
          hashes.push({
            tick: transition.observation.tick,
            canonical: transition.info.canonicalStateHash,
            observed: transition.info.stateHash,
            // The canonical state is what the authoritative step hashed. Keeping
            // it per tick turns "the hashes differ" into "this field differs".
            state: environment.canonicalState(),
          });
          for (const event of transition.events) events.push({ tick: event.tick, type: event.type });
          cursor += 1;
          if (scenarioValue.adaptiveNaturalWave === true && replaySegments === null) {
            const native = environment.engineEventProjection();
            const waveStart = native.find((event) => event.type === "wave.started" && event.payload.wave === 2);
            const postStartSpawn = waveStart && native.find((event) => event.type === "enemy.spawned"
              && event.tick > waveStart.tick);
            const observation = environment.observe();
            if (waveStart && postStartSpawn && observation.run.wave === 2 && observation.entities.length > 0
              && observation.availableActions.includes("move")) break;
          }
        }
        const finalTick = environment.observe().tick;
        if (checkpoints.at(-1)?.tick !== finalTick) checkpoints.push({
          tick: finalTick, canonical: environment.canonicalState(),
          state: environment.captureSnapshot(`${label}-tick-${String(finalTick)}`, "recorded-canonical").state,
        });
        const engineEvents = environment.engineEventProjection();
        return {
          origin, hashes, events, engineEvents, checkpoints, terminated, segments, routeBoundaries,
          rng: environment.rng(),
          finalObservation: environment.observe(),
        };
      };
      const first = trace("first", null);
      const second = trace("second", scenarioValue.adaptiveNaturalWave === true ? first.segments : null);
      return { first, second };
    }, { scenarioValue: scenario, scheduledActions: schedule });

    const first = captured.first;
    const second = captured.second;
    const where = `${scenario.id} (${scenario.start.mode}/${scenario.start.difficulty}/${scenario.start.weapon})`;

    assert.ok(first.hashes.length > 0 && first.hashes.length <= scenario.maxTicks,
      `${where}: the live trace must cover the ticks it executed`);
    if (scenario.idle === true) {
      assert.ok(first.terminated, `${where}: a terminal scenario must actually end the run`);
    } else if (scenario.adaptiveNaturalWave !== true) {
      assert.equal(first.hashes.length, scenario.maxTicks, `${where}: a surviving run must cover every scheduled tick`);
    } else {
      assert.ok(first.hashes.length < scenario.maxTicks, `${where}: natural wave proof must reach its stop condition`);
      assert.equal(first.routeBoundaries.length, 1, `${where}: natural wave proof must route exactly one draft`);
      assert.equal(first.routeBoundaries[0].before.tick, first.routeBoundaries[0].after.tick,
        `${where}: draft routing must not advance the fixed scheduler`);
      assert.equal(first.routeBoundaries[0].before.screen, "draft");
      assert.equal(first.routeBoundaries[0].after.screen, "playing");
      assert.equal(first.routeBoundaries[0].after.wave, 2);
      assert.ok(first.routeBoundaries[0].before.focusableIds.includes(
        first.segments.find((segment) => segment.kind === "route").actions[0].command.choiceId));
      const defeated = first.engineEvents.filter((event) => event.type === "enemy.defeated");
      const cleared = first.engineEvents.find((event) => event.type === "wave.cleared"
        && event.payload.wave === 1);
      assert.equal(defeated.length, 3,
        `${where}: natural wave must publish one native defeat for each production enemy`);
      assert.ok(cleared && defeated.every((event) => event.tick < cleared.tick),
        `${where}: all native defeats must precede the wave-clear fact`);
    }
    assert.equal(second.hashes.length, first.hashes.length, `${where}: both live runs must end on the same tick`);
    assert.ok(first.hashes.every((entry) => typeof entry.canonical === "string" && entry.canonical.length > 0),
      `${where}: every live tick must publish an authoritative state hash`);
    assert.ok(new Set(first.hashes.map((entry) => entry.canonical)).size > 1,
      `${where}: a live trace whose hash never changes would not be exercising the world`);
    assert.deepEqual(first.hashes.map((entry) => entry.tick),
      Array.from({ length: first.hashes.length }, (_, index) => index + 1),
      `${where}: live ticks must advance one at a time from 1`);

    // Same seed, same actions, same application: the live side must be
    // deterministic before any detached comparison is meaningful.
    assert.deepEqual(second.hashes, first.hashes, `${where}: two live runs must produce one hash sequence`);
    assert.deepEqual(second.events, first.events, `${where}: two live runs must emit one event sequence`);
    assert.deepEqual(second.engineEvents, first.engineEvents,
      `${where}: two live runs must emit one native gameplay-event sequence`);
    assert.deepEqual(second.routeBoundaries, first.routeBoundaries,
      `${where}: two live runs must emit one route-boundary state sequence`);
    assert.deepEqual(first.engineEvents.map((event) => event.sequence),
      first.engineEvents.map((_, index) => index),
      `${where}: native gameplay events must use one contiguous local order`);
    assert.ok(first.engineEvents.every((event, index) => index === 0 ||
      event.tick >= first.engineEvents[index - 1].tick),
    `${where}: native gameplay event ticks must not go backwards`);
    assert.ok(first.checkpoints.length >= 3, `${where}: the live trace must carry diagnostic state checkpoints`);
    assert.deepEqual(second.rng, first.rng, `${where}: two live runs must end on one RNG state`);
    assert.ok(first.origin && typeof first.origin === "object", `${where}: the live trace must carry an origin snapshot`);

    const target = artifactPath(scenario);
    fs.writeFileSync(target, `${JSON.stringify({
      scenario, schedule, ...(scenario.adaptiveNaturalWave === true ? { segments: first.segments,
        routeBoundaries: first.routeBoundaries } : {}),
      origin: first.origin, hashes: first.hashes, events: first.events,
      engineEventProjection: {
        format: "tear-semantic-engine-events", schemaVersion: 1,
        boundary: { kind: "post-origin-snapshot", originTick: first.origin.tick },
        events: first.engineEvents.filter((event) => event.tick > first.origin.tick)
          .map((event, sequence) => ({ ...event, sequence })),
      },
      terminated: first.terminated,
      checkpoints: first.checkpoints,
      rng: first.rng, capturedAt: new Date().toISOString(),
    }, null, 2)}
`);
    written.push({ id: scenario.id, ticks: first.hashes.length, terminated: first.terminated,
      file: path.basename(target) });
    console.log(`  ${where}: ${String(first.hashes.length)} ticks${first.terminated ? " (run ended)" : ""}`);
  }

  fs.writeFileSync(path.join(ARTIFACT_DIR, "live-parity-index.json"),
    `${JSON.stringify({ traces: written, capturedAt: new Date().toISOString() }, null, 2)}
`);
  console.log(`C27A live parity traces captured: ${String(written.length)} scenarios -> ${ARTIFACT_DIR}`);
});
