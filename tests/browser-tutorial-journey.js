/* eslint-disable @typescript-eslint/no-require-imports -- Browser journey scripts run directly under Node CommonJS. */
const assert = require("node:assert/strict");
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
  maxTicks: 12_000,
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
  const result = await page.evaluate((scenarioValue) => {
    const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    environment.reset(scenarioValue);
    let commandId = 0;
    const trace = [];
    const tutorial = () => window.__PANTHEON_TEST.tutorial();
    const command = (value) => ({
      kind: "command", tick: environment.observe().tick + 1, id: ++commandId, command: value,
    });
    const step = (...values) => environment.step(values.map(command));
    const idle = (ticks) => {
      for (let index = 0; index < ticks; index += 1) step();
    };
    const record = (label) => {
      const observation = environment.observe();
      const snapshot = tutorial();
      trace.push({
        label, tick: observation.tick, lessonIndex: snapshot.lessonIndex, lesson: snapshot.lesson,
        arena: snapshot.arena,
        counters: snapshot.counters, player: observation.player, blade: observation.blade,
        entities: observation.entities,
      });
    };
    const waitForLessonToAdvance = (lessonIndex, limit = 360) => {
      for (let index = 0; index < limit && tutorial().lessonIndex === lessonIndex; index += 1) step();
      record(`after-${lessonIndex}`);
      return tutorial().lessonIndex > lessonIndex;
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
      waitGrounded(); jump(); idle(150);
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
      swing(250000, 750000, 10, 24);
      approachDummy(70, 120);
    }
    waitForLessonToAdvance(4);

    approachDummy(70);
    for (let attempt = 0; attempt < 30 && tutorial().lessonIndex === 5; attempt += 1) {
      swing(250000, 750000, 8, 12);
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
      approachDummy(70); waitGrounded(); jump(); idle(5); swing(250000, 750000, 3, 75);
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
      step({ type: "weapon", intent: "throw", phase: "released" }); idle(30);
      step({ type: "weapon", intent: "recall", phase: "pressed" });
      step({ type: "weapon", intent: "recall", phase: "released" }); idle(120);
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
    for (let tick = 0; tick < 8_400 && tutorial().lessonIndex === 12; tick += 1) {
      const counters = tutorial().counters, enemy = coach();
      if ((counters.evade ?? 0) === 0) {
        if (enemy?.state === "commit") evadeLiveCharge(enemy); else moveTowardCoach();
      } else if ((counters.punish ?? 0) === 0) {
        if (enemy?.state === "recover") swingThroughDummy(120000, 8); else moveTowardCoach();
      } else if ((counters.launch ?? 0) === 0) {
        moveTowardCoach(100); swing(250000, 750000, 6, 18);
      } else if ((counters.deflect ?? 0) === 0) {
        if (!returnVisibleShot()) step();
      } else step();
    }
    waitForLessonToAdvance(12, 720);
    const reachedReady = tutorial().lessonIndex === 13;
    idle(240);
    record("terminal");
    return {
      reachedReady,
      active: tutorial().active,
      screen: window.__PANTHEON_TEST.state().game,
      mode: window.__PANTHEON_TEST.state().mode,
      metrics: environment.metrics(),
      trace,
    };
  }, scenario);

  const last = result.trace.at(-1);
  assert.equal(result.reachedReady, true, `tutorial did not reach READY: ${JSON.stringify(last)}`);
  assert.equal(result.active, false, `tutorial remained active: ${JSON.stringify(last)}`);
  assert.equal(result.mode, "playground", `tutorial did not hand off to practice: ${JSON.stringify(last)}`);
  assert.equal(result.screen, "playing", `practice did not enter a playable arena: ${JSON.stringify(last)}`);
  assert.ok(result.metrics.acceptedActions > 0, "journey must use player-valid actions");
  assert.deepEqual([...new Set(result.trace.map((entry) => entry.arena))], [
    "runway", "vertical-gate", "dash-lane", "blade-range", "launch-bay", "air-chain", "drop-well",
    "dive-channel", "liftwell", "throw-lane", "counterline", "read-line", "field-floor", "ready-room",
  ], "every tutorial block must install its own arena");
  console.log(`Tutorial journey passed in ${result.metrics.fixedTicks} fixed ticks`);
});
