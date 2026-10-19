/* eslint-disable @typescript-eslint/no-require-imports -- Browser journey scripts run directly under Node CommonJS. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { withJourney } = require("./browser-journey-harness");

const scenario = {
  format: "tear-contract",
  kind: "scenario",
  schemaVersion: 1,
  id: "tutorial.complete-with-player-actions",
  version: 1,
  description: "Complete every tutorial lesson through live, player-valid actions",
  stateClass: "recorded-canonical",
  executionClass: "engineering",
  seed: "tutorial-parity",
  start: { mode: "tutorial", difficulty: "normal", weapon: "sword" },
  // The prior course used 11,970 ticks. Two-wave transfer adds a 150-tick
  // breath plus real launch/follow-up/projectile actions, with finite retries.
  maxTicks: 16_000,
  assertions: ["runtime.finite-state", "player.finite-transform", "blade.finite-transform"],
  tags: ["tutorial", "parity", "full-journey"],
};

withJourney({ name: "tutorial full journey", port: 4187 }, async ({ page }) => {
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__ && window.__PANTHEON_TEST,
    undefined, { timeout: 15_000 });
  // Use the same async preflight as the real Play menu before taking exact-tick control.
  await page.evaluate(() => window.__PANTHEON_TEST.startMode("tutorial", "normal"));
  await page.waitForFunction(() => window.__PANTHEON_TEST.state().game === "playing"
    && window.__PANTHEON_TEST.tutorial().active, undefined, { timeout: 15_000 });
  const result = await page.evaluate(({ scenarioValue, captureContinuation }) => {
    const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    environment.reset(scenarioValue);
    window.__tutorialJourneyEnvironment = environment;
    let commandId = 0;
    const trace = [];
    const tutorial = () => window.__PANTHEON_TEST.tutorial();
    const command = (value) => ({
      kind: "command", tick: environment.observe().tick + 1, id: ++commandId, command: value,
    });
    let continuationTrace;
    let capturing = false;
    const step = (...values) => {
      const before = environment.observe().tick;
      const actions = values.map(command);
      const transition = environment.step(actions);
      if (capturing) {
        if (transition.observation.tick !== before + 1) throw new Error("Field Test trace requires one authoritative tick per step");
        continuationTrace.segments.push({ kind: "fixed", fromTick: before, toTick: transition.observation.tick, actions });
        continuationTrace.hashes.push({ tick: transition.observation.tick,
          canonical: transition.info.canonicalStateHash, state: environment.canonicalState() });
        if (tutorial().lessonIndex === 13) {
          continuationTrace.engineEventProjection.events = environment.engineEventProjection()
            .filter((event) => event.tick > continuationTrace.origin.tick)
            .map((event, sequence) => ({ ...event, sequence }));
          capturing = false;
        }
      }
      return transition;
    };
    const idle = (ticks) => {
      for (let index = 0; index < ticks; index += 1) step();
    };
    const record = (label) => {
      const observation = environment.observe();
      const snapshot = tutorial();
      trace.push({
        label, tick: observation.tick, lessonIndex: snapshot.lessonIndex, lesson: snapshot.lesson, description: snapshot.description,
        arena: snapshot.arena, fieldEncounter: environment.canonicalState().tutorial?.fieldEncounter,
        counters: snapshot.counters, player: observation.player, blade: observation.blade,
        entities: observation.entities,
      });
    };
    const waitForLessonToAdvance = (lessonIndex, limit = 360) => {
      for (let index = 0; index < limit && tutorial().lessonIndex === lessonIndex; index += 1) step();
      record(`after-${lessonIndex}`);
      if (tutorial().lessonIndex <= lessonIndex) {
        throw new Error(`Tutorial lesson ${lessonIndex} did not advance: ${JSON.stringify({ tutorial: tutorial(), observation: environment.observe() })}`);
      }
      return true;
    };
    const liveDummy = () => environment.observe().entities.find((entity) => entity.kind === "charger");
    const approachDummy = (distance = 70, limit = 360) => {
      for (let index = 0; index < limit; index += 1) {
        const dummy = liveDummy(), player = environment.observe().player;
        if (!dummy) { step(); continue; }
        const dx = dummy.x - player.x;
        if (Math.abs(dx) <= distance) { step({ type: "move", x: 0, y: 0 }); idle(24); return true; }
        step({ type: "move", x: dx > 0 ? 350 : -350, y: 0 });
      }
      step({ type: "move", x: 0, y: 0 });
      return false;
    };
    const swing = (fromTurn, toTurn, settle = 7, recover = 18) => {
      step({ type: "aim", turn: fromTurn, magnitude: 1000 });
      idle(settle);
      step({ type: "aim", turn: toTurn, magnitude: 1000 });
      idle(recover);
    };
    const swingThroughDummy = (arc = 90000, recover = 16) => {
      const dummy = liveDummy(), blade = environment.observe().blade;
      if (!dummy) { idle(recover); return; }
      const angle = Math.atan2(dummy.y - blade.handY, dummy.x - blade.handX);
      const center = Math.round((((angle / (Math.PI * 2)) % 1) + 1) % 1 * 1_000_000) % 1_000_000;
      const before = (center - arc + 1_000_000) % 1_000_000;
      const after = (center + arc) % 1_000_000;
      swing(before, after, 4, recover);
    };
    const risingAimAtDummy = () => {
      const dummy = liveDummy(), observation = environment.observe();
      if (!dummy) return null;
      // Aim is player-relative. The observed blade "hand" point is the moving
      // blade body, so it must not reverse the target side as the spring lags.
      const dx = dummy.x - observation.player.x, dy = dummy.y - observation.player.y;
      const side = Math.sign(dx) || Math.sign(dummy.x - observation.blade.handX) || 1;
      const center = Math.round(((((Math.atan2(dy, dx) / (Math.PI * 2)) % 1) + 1) % 1) * 1_000_000) % 1_000_000;
      const arc = 200000;
      return { from: (center + side * arc + 1_000_000) % 1_000_000,
        to: (center - side * arc + 1_000_000) % 1_000_000 };
    };
    const prepareRisingAim = (settle) => {
      const aim = risingAimAtDummy();
      if (!aim) return null;
      step({ type: "aim", turn: aim.from, magnitude: 1000 }); idle(settle);
      // A lowering contact can spend the dummy's hit cooldown. Let that
      // player action settle before asking the next contact to be a launch.
      for (let tick = 0; tick < 120; tick += 1) {
        const enemy = window.__PANTHEON_TEST.state().enemyTrace.find((entry) => entry.kind === "charger");
        if (environment.observe().blade.tipSpeed < 200 && (!enemy || enemy.hitCooldown <= 0)) break;
        step();
      }
      return aim;
    };
    const risingCutThroughDummy = (settle, recover) => {
      const aim = prepareRisingAim(settle);
      if (!aim) { idle(recover); return; }
      step({ type: "aim", turn: aim.to, magnitude: 1000 }); idle(recover);
    };
    const jump = () => {
      step({ type: "jump", phase: "pressed" });
      step({ type: "jump", phase: "released" });
    };
    const waitGrounded = (limit = 300) => {
      for (let index = 0; index < limit && !environment.observe().player.grounded; index += 1) step();
      return environment.observe().player.grounded;
    };
    const coach = () => environment.observe().entities.find((entity) => entity.kind === "charger");
    const moveTowardCoach = (distance = 190) => {
      const enemy = coach(), player = environment.observe().player;
      if (!enemy) { step(); return; }
      const dx = enemy.x - player.x;
      step({ type: "move", x: Math.abs(dx) <= distance ? 0 : (dx > 0 ? 1000 : -1000), y: 0 });
    };
    const evadeLiveCharge = (enemy) => {
      const player = environment.observe().player;
      const away = player.x < enemy.x ? -1000 : 1000;
      step({ type: "dash", x: away, y: 0 });
      idle(4);
    };
    const returnVisibleShot = () => {
      const shot = window.__PANTHEON_TEST.state().projectileTrace.find((projectile) => !projectile.deflected);
      const blade = environment.observe().blade;
      if (!shot || Math.hypot(shot.x - blade.handX, shot.y - blade.handY) > 210) return false;
      const angle = Math.atan2(shot.y - blade.handY, shot.x - blade.handX);
      const center = Math.round(((((angle / (Math.PI * 2)) % 1) + 1) % 1) * 1_000_000) % 1_000_000;
      step({ type: "aim", turn: (center - 120000 + 1_000_000) % 1_000_000, magnitude: 1000 });
      idle(2);
      step({ type: "aim", turn: (center + 120000) % 1_000_000, magnitude: 1000 });
      idle(4);
      return true;
    };

    record("start");

    for (let pass = 0; pass < 10 && tutorial().lessonIndex === 0; pass += 1) {
      step({ type: "move", x: -1000, y: 0 }); idle(80);
      step({ type: "move", x: 1000, y: 0 }); idle(80);
      if ((tutorial().counters.moveL ?? 0) >= 60 && (tutorial().counters.moveR ?? 0) >= 60) break;
    }
    step({ type: "move", x: 0, y: 0 });
    waitForLessonToAdvance(0);

    for (let count = 0; count < 3 && tutorial().lessonIndex === 1; count += 1) {
      waitGrounded(); jump(); idle(144);
    }
    waitForLessonToAdvance(1);

    for (let count = 0; count < 3 && tutorial().lessonIndex === 2; count += 1) {
      step({ type: "dash", x: count === 0 ? 1000 : -1000, y: 0 }); idle(110);
    }
    waitForLessonToAdvance(2);

    idle(4); approachDummy();
    for (let attempt = 0; attempt < 30 && tutorial().lessonIndex === 3; attempt += 1) {
      swing(attempt % 2 === 0 ? 500000 : 0, attempt % 2 === 0 ? 0 : 500000);
      approachDummy(70, 90);
    }
    waitForLessonToAdvance(3);

    approachDummy(70);
    for (let attempt = 0; attempt < 50 && tutorial().lessonIndex === 4; attempt += 1) {
      risingCutThroughDummy(10, 24);
      approachDummy(70, 120);
    }
    waitForLessonToAdvance(4);

    approachDummy(70);
    for (let attempt = 0; attempt < 30 && tutorial().lessonIndex === 5; attempt += 1) {
      risingCutThroughDummy(8, 12);
      swingThroughDummy(110000, 10);
      swingThroughDummy(110000, 18);
      approachDummy(70, 120);
    }
    waitForLessonToAdvance(5);

    for (let attempt = 0; attempt < 30 && tutorial().lessonIndex === 6; attempt += 1) {
      step({ type: "aim", turn: 500000, magnitude: 1000 }); idle(8);
      approachDummy(70); waitGrounded(); jump(); idle(4);
      step({ type: "dash", x: 0, y: -1000 }); idle(8);
      const target = liveDummy(), player = environment.observe().player;
      if (target) {
        const turn = Math.round(((((Math.atan2(target.y - player.y, target.x - player.x) / (Math.PI * 2)) % 1) + 1) % 1) * 1_000_000) % 1_000_000;
        step({ type: "aim", turn, magnitude: 1000 });
      }
      idle(65);
    }
    waitForLessonToAdvance(6);

    for (let attempt = 0; attempt < 30 && tutorial().lessonIndex === 7; attempt += 1) {
      step({ type: "aim", turn: 625000, magnitude: 1000 }); idle(8);
      approachDummy(70); waitGrounded();
      jump(); idle(40);
      const target = liveDummy();
      const horizontal = target && target.x < environment.observe().player.x ? -800 : 800;
      const player = environment.observe().player;
      const strikeTurn = target
        ? Math.round(((((Math.atan2(target.y - player.y, target.x - player.x) / (Math.PI * 2)) % 1) + 1) % 1) * 1_000_000) % 1_000_000
        : 250000;
      step({ type: "dash", x: horizontal, y: 600 }, { type: "aim", turn: strikeTurn, magnitude: 1000 });
      idle(70);
    }
    waitForLessonToAdvance(7);

    for (let attempt = 0; attempt < 30 && tutorial().lessonIndex === 8; attempt += 1) {
      // An updraft is not merely an upward cut: the player must still be in
      // the strong rising window when the blade crosses the target.
      approachDummy(70); waitGrounded();
      const aim = prepareRisingAim(8);
      if (!aim) { step(); continue; }
      jump(); idle(2);
      step({ type: "aim", turn: aim.to, magnitude: 1000 });
      idle(75);
    }
    waitForLessonToAdvance(8);

    for (let attempt = 0; attempt < 30 && tutorial().lessonIndex === 9; attempt += 1) {
      approachDummy(80);
      const dummy = liveDummy(), blade = environment.observe().blade;
      const turn = dummy
        ? Math.round(((((Math.atan2(dummy.y - blade.handY, dummy.x - blade.handX) / (Math.PI * 2)) % 1) + 1) % 1) * 1_000_000) % 1_000_000
        : 0;
      step({ type: "aim", turn, magnitude: 1000 }); idle(8);
      step({ type: "weapon", intent: "throw", phase: "pressed" });
      step({ type: "weapon", intent: "throw", phase: "released" });
      for (let tick = 0; tick < 360
        && !["embedded", "held"].includes(environment.observe().blade.state); tick += 1) step();
      for (let tick = 0; tick < 360 && environment.observe().blade.state !== "held"; tick += 1) {
        const observation = environment.observe();
        const dx = observation.blade.handX - observation.player.x;
        if (Math.abs(dx) <= 280) break;
        step({ type: "move", x: dx > 0 ? 350 : -350, y: 0 });
      }
      step({ type: "move", x: 0, y: 0 });
      if (environment.observe().blade.state !== "held") {
        step({ type: "weapon", intent: "recall", phase: "pressed" });
        step({ type: "weapon", intent: "recall", phase: "released" });
      }
      for (let tick = 0; tick < 360 && environment.observe().blade.state !== "held"; tick += 1) step();
      if ((tutorial().counters.throwHit ?? 0) > 0 && (tutorial().counters.recall ?? 0) > 0) {
        for (let tick = 0; tick < 360 && tutorial().lessonIndex === 9; tick += 1) step();
      }
    }
    waitForLessonToAdvance(9);

    for (let tick = 0; tick < 3_600 && tutorial().lessonIndex === 10; tick += 1) {
      if (!returnVisibleShot()) step();
    }
    waitForLessonToAdvance(10, 720);
    for (let tick = 0; tick < 4_800 && tutorial().lessonIndex === 11; tick += 1) {
      const counters = tutorial().counters, enemy = coach();
      if (!enemy) { step(); continue; }
      if ((counters.evade ?? 0) === 0 && enemy.state === "commit") evadeLiveCharge(enemy);
      else if ((counters.evade ?? 0) > 0 && (counters.punish ?? 0) === 0 && enemy.state === "recover") swingThroughDummy(120000, 8);
      else moveTowardCoach();
    }
    waitForLessonToAdvance(11, 720);
    if (!/STEP 1: WATCH THE CHARGER/u.test(tutorial().description)) {
      throw new Error("Field Test must state its first action instead of hiding a compound objective");
    }
    if (captureContinuation) {
      const origin = environment.captureSnapshot("tutorial-field-test-origin", "recorded-canonical");
      continuationTrace = { scenario: scenarioValue, origin, originInput: environment.canonicalState().input,
        schedule: {}, hashes: [], segments: [], engineEventProjection: {
          format: "tear-semantic-engine-events", schemaVersion: 1,
          boundary: { kind: "post-origin-snapshot", originTick: origin.tick }, events: [],
        } };
      capturing = true;
    }
    let sawFieldBreath = false, sawFieldMixed = false;
    for (let tick = 0; tick < 8_400 && tutorial().lessonIndex === 12; tick += 1) {
      const encounter = environment.canonicalState().tutorial?.fieldEncounter;
      if (encounter === "breath") {
        if (!sawFieldBreath) {
          record("field-inter-wave"); sawFieldBreath = true;
          if (environment.observe().entities.length !== 0 || window.__PANTHEON_TEST.state().projectileTrace.length !== 0) {
            throw new Error("Field Test inter-wave breath must clear the completed encounter");
          }
        }
        step(); continue;
      }
      if (encounter === "mixed") {
        if (!sawFieldMixed) {
          record("field-mixed"); sawFieldMixed = true;
          const n = tutorial().counters;
          if ((n.launch ?? 0) !== 0 || (n.airHit ?? 0) !== 0 || (n.parry ?? 0) !== 0 || (n.deflect ?? 0) !== 0) {
            throw new Error("Mixed transfer must start without earlier encounter credit");
          }
          step();
          const kinds = environment.observe().entities.map((enemy) => enemy.kind);
          if (!kinds.includes("charger") || !kinds.includes("ranged")) throw new Error("Mixed transfer must install real target and ranged actors");
        }
        const counters = tutorial().counters;
        if ((counters.deflect ?? 0) + (counters.parry ?? 0) === 0 && returnVisibleShot()) continue;
        if ((counters.launch ?? 0) === 0 || (counters.airHit ?? 0) === 0) {
          approachDummy(70, 120);
          risingCutThroughDummy(8, 12);
          swingThroughDummy(110000, 10);
          swingThroughDummy(110000, 18);
        } else step();
        continue;
      }
      const counters = tutorial().counters, enemy = coach();
      if ((counters.evade ?? 0) === 0) {
        if (enemy?.state === "commit") evadeLiveCharge(enemy); else moveTowardCoach();
      } else if ((counters.punish ?? 0) === 0) {
        if (enemy?.state === "recover") swingThroughDummy(120000, 8); else moveTowardCoach();
      } else step();
    }
    if (!sawFieldBreath || !sawFieldMixed) throw new Error("Field Test must teach both waves with a visible inter-wave breath");
    waitForLessonToAdvance(12, 720);
    const reachedReady = tutorial().lessonIndex === 13;
    for (let tick = 0; tick < 240 && tutorial().active; tick += 1) step();
    record("terminal");
    return {
      reachedReady,
      active: tutorial().active,
      screen: window.__PANTHEON_TEST.state().game,
      mode: window.__PANTHEON_TEST.state().mode,
      metrics: environment.metrics(),
      trace,
      ...(continuationTrace === undefined ? {} : { continuationTrace }),
    };
  }, { scenarioValue: scenario, captureContinuation: Boolean(process.env.TEAR_TUTORIAL_CONTINUATION_TRACE) });

  const last = result.trace.at(-1);
  assert.equal(result.reachedReady, true, `tutorial did not reach READY: ${JSON.stringify(last)}`);
  if (process.env.TEAR_TUTORIAL_CONTINUATION_TRACE) {
    assert.ok(result.continuationTrace?.hashes.length > 0, "Field Test continuation trace must include actual authoritative ticks");
    const target = path.resolve(process.env.TEAR_TUTORIAL_CONTINUATION_TRACE);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(result.continuationTrace, null, 2)}\n`);
  }
  assert.equal(result.active, false, `tutorial remained active: ${JSON.stringify(last)}`);
  assert.equal(result.mode, "playground", `tutorial did not hand off to practice: ${JSON.stringify(last)}`);
  assert.equal(result.screen, "paused", `completion did not open its technique summary: ${JSON.stringify(last)}`);
  assert.ok(result.metrics.acceptedActions > 0, "journey must use player-valid actions");
  assert.ok(result.metrics.fixedTicks <= scenario.maxTicks, "tutorial journey must remain within its declared tick limit");
  const launchEntry = result.trace.find((entry) => entry.label === "after-3");
  const powerSlamEntry = result.trace.find((entry) => entry.label === "after-6");
  assert.equal(launchEntry?.lesson, "LAUNCH", "journey must reach the launch lesson");
  assert.equal(launchEntry?.counters?.launch ?? 0, 0, "launch must not inherit an earlier upward cut");
  assert.equal(powerSlamEntry?.lesson, "POWER SLAM", "journey must reach the power-slam lesson");
  assert.equal(powerSlamEntry?.counters?.superslam ?? 0, 0, "power slam must not inherit the slam lesson");
  assert.deepEqual([...new Set(result.trace.map((entry) => entry.arena))], [
    "runway", "vertical-gate", "dash-lane", "blade-range", "launch-bay", "air-chain", "drop-well",
    "dive-channel", "liftwell", "throw-lane", "counterline", "read-line", "field-floor", "ready-room",
  ], "every tutorial block must install its own arena");
  // Select the actual rendered completed LAUNCH control in this same course.
  // Class A stopped the browser loop; advance its application frame to consume
  // the physical click through the normal UI owner.
  await page.mouse.click(830, 328);
  await page.evaluate(() => window.__tutorialJourneyEnvironment.advanceApplicationFrame(1 / 120));
  await page.waitForFunction(() => window.__PANTHEON_TEST.state().mode === "tutorial"
    && window.__PANTHEON_TEST.tutorial().active && window.__PANTHEON_TEST.tutorial().lessonIndex === 4);
  const practice = await page.evaluate(() => window.__PANTHEON_TEST.tutorial());
  assert.equal(practice.arena, "launch-bay", "completed LAUNCH selection must install its own arena after the new-run boundary");
  assert.deepEqual(await page.evaluate(() => window.__tutorialJourneyEnvironment.observe().navigation.surfaces.map((surface) => surface.id).sort()), ["tutorial:launch-bay:0", "tutorial:launch-bay:floor"], "selected lesson must own the physical collision surfaces");
  assert.equal(practice.session.phase, "lesson-practice");
  assert.equal(practice.session.courseCompleted, true, "practice must retain the course completion guard");
  await page.evaluate(() => { delete window.__tutorialJourneyEnvironment; });
  console.log(`Tutorial journey passed in ${result.metrics.fixedTicks} fixed ticks`);
});
