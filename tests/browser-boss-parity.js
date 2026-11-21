const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");
const canonicalScenarios = require("../src/tearbench/canonical-scenarios.json");
const { STATE_WAIT_MS, waitForPointerLock } = require("./browser-waits");

const BOSS_PROGRESS_TIMEOUT_MS = STATE_WAIT_MS;
/** `--captured-pointer` (nightly) also requires the browser to grant real pointer lock. */
const REQUIRE_POINTER_LOCK = process.argv.includes("--captured-pointer");

const BOSSES = canonicalScenarios
  .filter((entry) => entry.subject.kind === "boss" && !entry.tags?.includes("unpublished-preview"))
  .map((entry) => entry.subject.id);

function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

async function startReadyBoss(page, bossId) {
  await page.evaluate((id) => window.__PANTHEON_TEST.startBoss(id, "normal"), bossId);
  const stage = await page.evaluate((id) => window.__PANTHEON_TEST.bossStage(id), bossId);
  assert.equal(stage.currentId, stage.authoredId, `${bossId} must load its authored source-owned stage`);
  assert.equal(stage.currentIndex, stage.authoredIndex, `${bossId} must load its authored source-owned biome index`);
  await page.waitForFunction(
    (id) => window.TEAR_WEAPON_DEBUG?.().enemies.some((enemy) => enemy.bossId === id),
    bossId,
    { timeout: STATE_WAIT_MS },
  );
  await page.waitForFunction(
    (id) => {
      const boss = window.TEAR_WEAPON_DEBUG?.().enemies.find((enemy) => enemy.bossId === id);
      return boss?.spawnT <= 0 && boss?.introT === 0;
    },
    bossId,
    { timeout: STATE_WAIT_MS },
  );
}

async function bossSnapshot(page, bossId) {
  return page.evaluate((id) => window.TEAR_WEAPON_DEBUG().enemies.find((enemy) => enemy.bossId === id), bossId);
}

async function moveCapturedPointer(page, from, to) {
  await page.evaluate(
    ({ previous, next }) => {
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
    },
    { previous: from, next: to },
  );
}

function bossProgressSummary(boss) {
  if (!boss) return null;
  return {
    aliveT: boss.aliveT,
    atk: boss.atk,
    introT: boss.introT,
    mode: boss.mode,
    phase: boss.phase,
    spawnT: boss.spawnT,
    x: boss.x,
    y: boss.y,
  };
}

async function waitForBossSimulationAdvance(
  page,
  bossId,
  initialAliveT,
  minimumAdvance,
  timeout = BOSS_PROGRESS_TIMEOUT_MS,
) {
  // Fixed-step catch-up is deliberately capped, so a busy CI renderer may drop
  // wall time instead of converting a long frame into an unbounded tick burst.
  // Observe the authored simulation clock directly while retaining a hard
  // browser timeout and the caller's exact postcondition assertion.
  try {
    await page.waitForFunction(
      ({ id, threshold }) => {
        const boss = window.TEAR_WEAPON_DEBUG?.().enemies.find((enemy) => enemy.bossId === id);
        return boss?.aliveT > threshold;
      },
      { id: bossId, threshold: initialAliveT + minimumAdvance },
      { timeout },
    );
  } catch (error) {
    const current = bossProgressSummary(await bossSnapshot(page, bossId));
    throw new Error(
      `${bossId} simulation did not advance within ${String(timeout)}ms; ` +
        `initialAliveT=${String(initialAliveT)} current=${JSON.stringify(current)}`,
      { cause: error },
    );
  }
  return bossSnapshot(page, bossId);
}

async function waitForBossCombatProgress(page, bossId, initial, minimumAdvance, timeout = BOSS_PROGRESS_TIMEOUT_MS) {
  try {
    await page.waitForFunction(
      ({ id, threshold, origin }) => {
        const boss = window.TEAR_WEAPON_DEBUG?.().enemies.find((enemy) => enemy.bossId === id);
        return boss?.aliveT > threshold && Math.hypot(boss.x - origin.x, boss.y - origin.y) > 1;
      },
      {
        id: bossId,
        threshold: initial.aliveT + minimumAdvance,
        origin: { x: initial.x, y: initial.y },
      },
      { timeout },
    );
  } catch (error) {
    const current = bossProgressSummary(await bossSnapshot(page, bossId));
    throw new Error(
      `${bossId} combat did not progress within ${String(timeout)}ms; ` +
        `initial=${JSON.stringify(bossProgressSummary(initial))} current=${JSON.stringify(current)}`,
      { cause: error },
    );
  }
  return bossSnapshot(page, bossId);
}

async function forcePhase(page, bossId, fraction, cinematicId) {
  await page.evaluate((value) => window.__PANTHEON_TEST.setBossHealthFraction(value), fraction);
  await page.waitForFunction(
    (id) => window.__PANTHEON_TEST.state().active && window.__PANTHEON_TEST.state().cinema === id,
    cinematicId,
    { timeout: STATE_WAIT_MS },
  );
  const entered = await bossSnapshot(page, bossId);
  assert.equal(entered.cinematicPending, false, `${bossId} must consume its phase request when the scene begins`);
  await page.evaluate(() => {
    for (let index = 0; index < 12; index += 1) window.__PANTHEON_TEST.advance();
  });
  await page.waitForFunction(() => !window.__PANTHEON_TEST.state().active, undefined, {
    timeout: STATE_WAIT_MS,
  });
  const released = await bossSnapshot(page, bossId);
  assert.equal(released.cinematicT, 0, `${bossId} ritual presentation state must release`);
  return released;
}

// A boss whose phase changes in the fight: crossing the mark changes the phase with no scene, and the
// boss keeps fighting (plans/active/CINEMATICS_OVERHAUL.md).
async function crossPhaseInFight(page, bossId, fraction, phase) {
  await page.evaluate((value) => window.__PANTHEON_TEST.setBossHealthFraction(value), fraction);
  await page.waitForFunction(
    ({ id, expected }) => window.TEAR_WEAPON_DEBUG?.().enemies.find((enemy) => enemy.bossId === id)?.phase === expected,
    { id: bossId, expected: phase },
    { timeout: STATE_WAIT_MS },
  );
  const entered = await bossSnapshot(page, bossId);
  const cinema = await page.evaluate(() => window.__PANTHEON_TEST.state());
  assert.equal(cinema.active, false, `${bossId} phase ${String(phase)} must not start a scene`);
  assert.equal(entered.cinematicPending, false, `${bossId} phase ${String(phase)} must not request a scene`);
  return entered;
}

withJourney({ name: "boss oracle parity", recordFrames: true }, async ({ page, waitArmed, clickLabel }) => {
  if (!REQUIRE_POINTER_LOCK) {
    // Decline pointer lock for the whole run, in this page and after any reload. Dropping a lock
    // the game already holds would pause it (a lost capture pauses play), so it is never granted.
    const declinePointerLock = () => {
      Element.prototype.requestPointerLock = () => Promise.resolve();
    };
    await page.addInitScript(declinePointerLock);
    await page.evaluate(declinePointerLock);
  }
  for (const bossId of BOSSES) {
    await startReadyBoss(page, bossId);
    const before = await bossSnapshot(page, bossId);
    const after =
      bossId === "rootbound" || bossId === "white-hart"
        ? await waitForBossSimulationAdvance(page, bossId, before.aliveT, 0.8)
        : await waitForBossCombatProgress(
            page,
            bossId,
            before,
            0.8,
            bossId === "echo" ? 12_000 : BOSS_PROGRESS_TIMEOUT_MS,
          );
    assert.ok(after.aliveT > before.aliveT + 0.8, `${bossId} AI must keep receiving fixed ticks after its intro`);
    if (bossId === "rootbound") {
      await page.waitForFunction(
        () =>
          window
            .TEAR_WEAPON_DEBUG?.()
            .enemies.find((enemy) => enemy.bossId === "rootbound")
            ?.atk?.endsWith(":tell"),
        undefined,
        { timeout: STATE_WAIT_MS },
      );
      const attacking = await bossSnapshot(page, bossId);
      assert.equal(attacking.phase, 1, "Rootbound must begin in its authored first phase");
      assert.match(
        attacking.atk,
        /^(?:vine-lash|root-glide|canopy-vault|thorn-burst|root-wave):/u,
        "Rootbound must start a move from its Phase I table",
      );
    } else if (bossId === "white-hart") {
      assert.equal(after.phase, 1, "White Hart must begin in phase one");
      assert.ok(
        ["antler-run", "snowbound-leap", "aurora-volley", "backtrail-kick", "idle"].includes(after.atk),
        "White Hart must remain inside its authored Phase I attack set",
      );
    } else assert.ok(distance(before, after) > 1, `${bossId} must leave its arrival pose after its intro`);
    if (bossId === "echo") assert.equal(after.live, true, "the Echo mirror brain must be live");
  }

  // Rootbound enters and retries through the same production Boss Test result
  // route as the rest of the roster; only the test hook supplies terminal HP.
  await startReadyBoss(page, "rootbound");
  await page.evaluate(() => window.__PANTHEON_TEST.defeatPlayer());
  await waitArmed("gameover");
  await clickLabel("RETRY", "playing");
  await page.waitForFunction(
    () => window.TEAR_WEAPON_DEBUG?.().enemies.some((enemy) => enemy.bossId === "rootbound"),
    undefined,
    { timeout: STATE_WAIT_MS },
  );
  const retriedStage = await page.evaluate(() => window.__PANTHEON_TEST.bossStage("rootbound"));
  assert.equal(retriedStage.currentId, retriedStage.authoredId, "Rootbound retry must return to Verdant Sanctum");

  // The Warden and the Colossus change phase in the fight: no scene starts, and the boss's AI keeps
  // running through both phase changes.
  for (const bossId of ["warden", "colossus"]) {
    await startReadyBoss(page, bossId);
    const phaseTwo = await crossPhaseInFight(page, bossId, 0.5, 2);
    const phaseTwoMoving = await waitForBossSimulationAdvance(page, bossId, phaseTwo.aliveT, 0.6);
    assert.ok(phaseTwoMoving.aliveT > phaseTwo.aliveT + 0.6, `${bossId} phase-two AI must keep running`);

    const phaseThree = await crossPhaseInFight(page, bossId, 0.2, 3);
    const phaseThreeMoving = await waitForBossSimulationAdvance(page, bossId, phaseThree.aliveT, 0.6);
    assert.ok(phaseThreeMoving.aliveT > phaseThree.aliveT + 0.6, `${bossId} final-phase AI must keep running`);
    assert.equal(
      (await page.evaluate(() => window.__PANTHEON_TEST.state())).active,
      false,
      `${bossId} must never start a scene`,
    );
  }

  // Aldric's fire turn, crownfall and revive all happen in the fight: the kneel starts on the
  // phase tick, and he rises into frenzy when it ends, with no scene at either change.
  await startReadyBoss(page, "aldric");
  const aldric = await crossPhaseInFight(page, "aldric", 0.19, 3);
  assert.equal(aldric.mode, "downed", "Aldric must enter the kneel on the crownfall tick");
  await page.waitForFunction(
    () => window.TEAR_WEAPON_DEBUG?.().enemies.find((enemy) => enemy.bossId === "aldric")?.mode === "frenzy",
    undefined,
    { timeout: STATE_WAIT_MS },
  );
  assert.equal(
    (await page.evaluate(() => window.__PANTHEON_TEST.state())).active,
    false,
    "Aldric's revive must never start a scene",
  );

  // Echo has no dialogue channel in the source-of-truth fight: phase two splits
  // the reflection and phase three dissolves it while the mirror brain stays live.
  await startReadyBoss(page, "echo");
  await page.evaluate(() => window.__PANTHEON_TEST.setBossHealthFraction(0.5));
  await page.waitForFunction(() => window.TEAR_WEAPON_DEBUG().enemies.length > 1, undefined, {
    timeout: STATE_WAIT_MS,
  });
  let echo = await bossSnapshot(page, "echo");
  assert.equal(echo.phase, 2, "Echo must split at phase two");
  await page.evaluate(() => window.__PANTHEON_TEST.setBossHealthFraction(0.2));
  await page.waitForFunction(
    () => {
      const debug = window.TEAR_WEAPON_DEBUG();
      return debug.enemies.find((enemy) => enemy.bossId === "echo")?.phase === 3 && debug.enemies.length === 1;
    },
    undefined,
    { timeout: STATE_WAIT_MS },
  );
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
  assert.ok(
    sourceMoving.aliveT > sourceVoid.aliveT + 0.8,
    "Source AI must resume after its authored void-arrival grace",
  );

  // Prove damage through the real held-blade path. This is deliberately not a debug hit
  // shortcut: it exercises the same collision gate that made every boss appear invulnerable
  // when introT was stranded above zero. A scripted click is not always granted pointer lock
  // on the hosted Linux runner, so the required run declines the lock and the game aims by
  // pointer position from the same moves (each carries both position and movement). The
  // nightly run passes --captured-pointer to require the real lock as well.
  await startReadyBoss(page, "warden");
  const fullHealth = (await bossSnapshot(page, "warden")).hp;
  await page.mouse.click(800, 450);
  if (REQUIRE_POINTER_LOCK) await waitForPointerLock(page);
  let damaged = await bossSnapshot(page, "warden");
  let pointer = { x: 800, y: 450 };
  for (let index = 0; index < 240 && damaged.hp >= fullHealth; index += 1) {
    const simulationTick = await page.evaluate(() => window.__TEAR_DIAGNOSTICS__.snapshot().gauges.simulationTick || 0);
    const angle = index * 0.48,
      radius = index % 2 === 0 ? 70 : 240;
    const nextPointer = { x: 800 + Math.cos(angle) * radius, y: 650 + Math.sin(angle) * radius };
    await moveCapturedPointer(page, pointer, nextPointer);
    pointer = nextPointer;
    await page.waitForFunction(
      (tick) => (window.__TEAR_DIAGNOSTICS__.snapshot().gauges.simulationTick || 0) > tick,
      simulationTick,
      { timeout: STATE_WAIT_MS },
    );
    if (index % 12 === 11) damaged = await bossSnapshot(page, "warden");
  }
  damaged = await bossSnapshot(page, "warden");
  assert.ok(
    damaged.hp < fullHealth,
    `held blade must damage the live boss (${String(damaged.hp)} < ${String(fullHealth)})`,
  );

  // Observe an actual live boss clone through the normal Class-A session and
  // its independent native projection, not merely through visible enemy count.
  for (const bossId of ["aldric", "echo"]) {
    const bossEntry = canonicalScenarios.find((entry) => entry.subject.kind === "boss" && entry.subject.id === bossId);
    assert.ok(bossEntry, `the canonical production catalog must own the ${bossId} encounter`);
    const support = await page.evaluate((entry) => {
      const scenario = {
        format: "tear-contract",
        kind: "scenario",
        schemaVersion: 1,
        id: entry.id,
        version: 1,
        description: entry.description,
        stateClass: "recorded-canonical",
        executionClass: "engineering",
        subject: entry.subject,
        backends: entry.backends,
        seed: `current-${entry.subject.id}-live-support`,
        start: entry.start,
        maxTicks: 720,
        assertions: ["runtime.finite-state"],
        tags: entry.tags,
      };
      const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
      const opening = environment.reset(scenario);
      for (
        let tick = 0;
        tick < 120 && !window.TEAR_WEAPON_DEBUG().enemies.some((enemy) => enemy.bossId === entry.subject.id);
        tick += 1
      ) {
        environment.step([]);
      }
      window.__PANTHEON_TEST.prepareBossSupportScenario(entry.subject.id);
      const expectedKind = entry.subject.id === "echo" ? "reflection" : "charger";
      for (let tick = 0; tick < 30; tick += 1) {
        const transition = environment.step([]);
        const delivered = transition.events.filter(
          (event) =>
            event.type === "enemy.spawned" &&
            event.payload.bossId === entry.subject.id &&
            event.payload.actorKind === expectedKind,
        );
        if (delivered.length > 0) {
          const projected = environment
            .engineEventProjection()
            .filter(
              (event) =>
                event.type === "enemy.spawned" &&
                event.payload.bossId === entry.subject.id &&
                event.payload.actorKind === expectedKind,
            );
          return {
            stage: opening.run.stage,
            authoredStage: window.__PANTHEON_TEST.bossStage(entry.subject.id).authoredId,
            delivered,
            projected,
          };
        }
      }
      throw new Error(`bounded live ${entry.subject.id} encounter did not publish its source-owned support spawn`);
    }, bossEntry);
    assert.equal(support.stage, support.authoredStage);
    const expectedCount = bossId === "echo" ? 1 : 2;
    assert.equal(support.delivered.length, expectedCount, `${bossId} must deliver each actual boss support actor once`);
    assert.equal(support.projected.length, expectedCount, `${bossId} must project each actual boss support actor once`);
    assert.equal(new Set(support.delivered.map((event) => event.actorId)).size, expectedCount);
    for (let index = 0; index < expectedCount; index += 1) {
      assert.equal(support.delivered[index].source, "engine");
      assert.equal(support.projected[index].actorId, support.delivered[index].actorId);
      assert.deepEqual(support.projected[index].payload, support.delivered[index].payload);
    }
  }
});
