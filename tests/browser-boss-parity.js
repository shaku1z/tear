const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");

const BOSSES = ["warden", "colossus", "aldric", "echo", "source"];

function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

async function startReadyBoss(page, bossId) {
  await page.evaluate((id) => window.__PANTHEON_TEST.startBoss(id, "normal"), bossId);
  await page.waitForFunction((id) => window.TEAR_WEAPON_DEBUG?.().enemies.some((enemy) => enemy.bossId === id),
    bossId, { timeout: 10000 });
  await page.waitForFunction((id) => {
    const boss = window.TEAR_WEAPON_DEBUG?.().enemies.find((enemy) => enemy.bossId === id);
    return boss?.spawnT <= 0 && boss?.introT === 0;
  }, bossId, { timeout: 10000 });
}

async function bossSnapshot(page, bossId) {
  return page.evaluate((id) => window.TEAR_WEAPON_DEBUG().enemies.find((enemy) => enemy.bossId === id), bossId);
}

async function moveCapturedPointer(page, from, to) {
  await page.evaluate(({ previous, next }) => {
    const canvas = document.querySelector("canvas");
    const event = new MouseEvent("mousemove", {
      bubbles: true,
      cancelable: true,
      clientX: next.x,
      clientY: next.y,
    });
    Object.defineProperties(event, {
      movementX: { value: next.x - previous.x },
      movementY: { value: next.y - previous.y },
    });
    canvas.dispatchEvent(event);
  }, { previous: from, next: to });
}

async function waitForBossSimulationAdvance(page, bossId, initialAliveT, minimumAdvance, timeout = 5000) {
  // Fixed-step catch-up is deliberately capped, so a busy CI renderer may drop
  // wall time instead of converting a long frame into an unbounded tick burst.
  // Observe the authored simulation clock directly while retaining a hard
  // browser timeout and the caller's exact postcondition assertion.
  await page.waitForFunction(({ id, threshold }) => {
    const boss = window.TEAR_WEAPON_DEBUG?.().enemies.find((enemy) => enemy.bossId === id);
    return boss?.aliveT > threshold;
  }, { id: bossId, threshold: initialAliveT + minimumAdvance }, { timeout });
  return bossSnapshot(page, bossId);
}

async function waitForBossCombatProgress(page, bossId, initial, minimumAdvance, timeout = 5000) {
  await page.waitForFunction(({ id, threshold, origin }) => {
    const boss = window.TEAR_WEAPON_DEBUG?.().enemies.find((enemy) => enemy.bossId === id);
    return boss?.aliveT > threshold && Math.hypot(boss.x - origin.x, boss.y - origin.y) > 1;
  }, {
    id: bossId,
    threshold: initial.aliveT + minimumAdvance,
    origin: { x: initial.x, y: initial.y },
  }, { timeout });
  return bossSnapshot(page, bossId);
}

async function forcePhase(page, bossId, fraction, cinematicId) {
  await page.evaluate((value) => window.__PANTHEON_TEST.setBossHealthFraction(value), fraction);
  await page.waitForFunction((id) => window.__PANTHEON_TEST.state().active
    && window.__PANTHEON_TEST.state().cinema === id, cinematicId, { timeout: 10000 });
  const entered = await bossSnapshot(page, bossId);
  assert.equal(entered.cinematicPending, false, `${bossId} must consume its phase request when the scene begins`);
  await page.evaluate(() => {
    for (let index = 0; index < 12; index += 1) window.__PANTHEON_TEST.advance();
  });
  await page.waitForFunction(() => !window.__PANTHEON_TEST.state().active, undefined, { timeout: 5000 });
  const released = await bossSnapshot(page, bossId);
  assert.equal(released.cinematicT, 0, `${bossId} ritual presentation state must release`);
  return released;
}

withJourney({ name: "boss oracle parity", port: 8237 }, async ({ page }) => {
  for (const bossId of BOSSES) {
    await startReadyBoss(page, bossId);
    const before = await bossSnapshot(page, bossId);
    const after = await waitForBossCombatProgress(page, bossId, before, 0.8,
      bossId === "echo" ? 7000 : 5000);
    assert.ok(after.aliveT > before.aliveT + 0.8, `${bossId} AI must keep receiving fixed ticks after its intro`);
    assert.ok(distance(before, after) > 1, `${bossId} must leave its arrival pose after its intro`);
    if (bossId === "echo") assert.equal(after.live, true, "the Echo mirror brain must be live");
  }

  // Warden and Colossus both have two serialized transformation gates. Crossing
  // either gate used to strand cinematicRequest and freeze the boss forever.
  for (const [bossId, firstScene, finalScene] of [
    ["warden", "warden-unchained", "warden-nothing-left"],
    ["colossus", "colossus-breach", "colossus-meltdown"],
  ]) {
    await startReadyBoss(page, bossId);
    const phaseTwo = await forcePhase(page, bossId, 0.5, firstScene);
    assert.equal(phaseTwo.phase, 2, `${bossId} must enter phase two`);
    const phaseTwoMoving = await waitForBossSimulationAdvance(page, bossId, phaseTwo.aliveT, 0.6);
    assert.ok(phaseTwoMoving.aliveT > phaseTwo.aliveT + 0.6, `${bossId} phase-two AI must resume after ritual`);

    const phaseThree = await forcePhase(page, bossId, 0.2, finalScene);
    assert.equal(phaseThree.phase, 3, `${bossId} must enter phase three`);
    const phaseThreeMoving = await waitForBossSimulationAdvance(page, bossId, phaseThree.aliveT, 0.6);
    assert.ok(phaseThreeMoving.aliveT > phaseThree.aliveT + 0.6, `${bossId} final-phase AI must resume after ritual`);
  }

  // Aldric's fire turn is immediate, then the crownfall and resurrection are
  // serialized rituals around an intentionally still kneel.
  await startReadyBoss(page, "aldric");
  await page.evaluate(() => window.__PANTHEON_TEST.setBossHealthFraction(0.19));
  await page.waitForFunction(() => window.__PANTHEON_TEST.state().cinema === "aldric-crownfall",
    undefined, { timeout: 10000 });
  await forcePhase(page, "aldric", 0.19, "aldric-crownfall");
  let aldric = await bossSnapshot(page, "aldric");
  assert.equal(aldric.mode, "downed", "Aldric must enter the authored kneel after crownfall");
  await page.waitForFunction(() => ["aldric-witnessed", "aldric-angered"].includes(window.__PANTHEON_TEST.state().cinema),
    undefined, { timeout: 10000 });
  await page.evaluate(() => {
    for (let index = 0; index < 12; index += 1) window.__PANTHEON_TEST.advance();
  });
  await page.waitForFunction(() => !window.__PANTHEON_TEST.state().active, undefined, { timeout: 5000 });
  aldric = await waitForBossSimulationAdvance(page, "aldric", aldric.aliveT, 0.6);
  assert.equal(aldric.mode, "frenzy", "Aldric must rise into frenzy after the kneel");

  // Echo has no dialogue channel in the source-of-truth fight: phase two splits
  // the reflection and phase three dissolves it while the mirror brain stays live.
  await startReadyBoss(page, "echo");
  await page.evaluate(() => window.__PANTHEON_TEST.setBossHealthFraction(0.5));
  await page.waitForFunction(() => window.TEAR_WEAPON_DEBUG().enemies.length > 1, undefined, { timeout: 5000 });
  let echo = await bossSnapshot(page, "echo");
  assert.equal(echo.phase, 2, "Echo must split at phase two");
  await page.evaluate(() => window.__PANTHEON_TEST.setBossHealthFraction(0.2));
  await page.waitForFunction(() => {
    const debug = window.TEAR_WEAPON_DEBUG();
    return debug.enemies.find((enemy) => enemy.bossId === "echo")?.phase === 3 && debug.enemies.length === 1;
  }, undefined, { timeout: 5000 });
  const echoFinalStart = await bossSnapshot(page, "echo");
  echo = await waitForBossSimulationAdvance(page, "echo", echoFinalStart.aliveT, 1.2, 7000);
  assert.ok(echo.aliveT > echoFinalStart.aliveT + 1.2, "Echo's final reflection brain must keep simulating");

  // Source's phase-two request crosses a typed adapter into the void-descent
  // director. The request must launch, construct the moving stream, and release
  // Source from `collapse` into live void combat.
  await startReadyBoss(page, "source");
  const sourceVoid = await forcePhase(page, "source", 0.5, "voidDescent");
  assert.equal(sourceVoid.phase, 2, "Source must enter phase two");
  assert.equal(sourceVoid.mode, "void", "Source descent must hand off into void combat");
  assert.equal(sourceVoid.voidPending, false, "Source descent request must be consumed exactly once");
  const sourceMoving = await waitForBossSimulationAdvance(page, "source", sourceVoid.aliveT, 0.8, 7000);
  assert.ok(sourceMoving.aliveT > sourceVoid.aliveT + 0.8, "Source AI must resume after its authored void-arrival grace");

  // Prove damage through the actual captured-pointer + held-blade path. This is
  // deliberately not a debug hit shortcut: it exercises the same collision gate
  // that made every boss appear invulnerable when introT was stranded above zero.
  await startReadyBoss(page, "warden");
  const fullHealth = (await bossSnapshot(page, "warden")).hp;
  await page.mouse.click(800, 450);
  await page.waitForFunction(() => document.pointerLockElement !== null, undefined, { timeout: 5000 });
  let damaged = await bossSnapshot(page, "warden");
  let pointer = { x: 800, y: 450 };
  for (let index = 0; index < 240 && damaged.hp >= fullHealth; index += 1) {
    const simulationTick = await page.evaluate(
      () => window.__TEAR_DIAGNOSTICS__.snapshot().gauges.simulationTick || 0,
    );
    const angle = index * 0.48, radius = index % 2 === 0 ? 70 : 240;
    const nextPointer = { x: 800 + Math.cos(angle) * radius, y: 650 + Math.sin(angle) * radius };
    await moveCapturedPointer(page, pointer, nextPointer);
    pointer = nextPointer;
    await page.waitForFunction((tick) =>
      (window.__TEAR_DIAGNOSTICS__.snapshot().gauges.simulationTick || 0) > tick,
    simulationTick, { timeout: 5000 });
    if (index % 12 === 11) damaged = await bossSnapshot(page, "warden");
  }
  damaged = await bossSnapshot(page, "warden");
  assert.ok(damaged.hp < fullHealth, `captured-pointer held blade must damage the live boss (${String(damaged.hp)} < ${String(fullHealth)})`);
});
