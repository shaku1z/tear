import assert from "node:assert/strict";
import test from "node:test";
import { compareParityTraces, TRACE_SCHEMA_VERSION } from "../../scripts/parity-diff.mjs";

function trace(source, checkpoints) {
  return {
    schemaVersion: TRACE_SCHEMA_VERSION,
    fixtureId: "contract-test",
    source: { kind: source, revision: source },
    checkpoints,
  };
}

test("parity differ accepts fields inside their documented tolerance", () => {
  const oracle = trace("oracle", [{
    label: "aim",
    screen: "playing",
    input: { mode: "mouse", pointerLocked: true, pointerLockAllowed: true },
    cursor: { canvas: "none", lockHintVisible: false },
    player: { x: 100, y: 200, vx: 0, vy: 0 },
    blade: { state: "held", aimX: 40, aimY: -20, reticleX: 140, reticleY: 180 },
  }]);
  const current = trace("current", [{
    ...oracle.checkpoints[0],
    player: { x: 104, y: 204, vx: 20, vy: -20 },
    blade: { state: "held", aimX: 43, aimY: -23, reticleX: 147, reticleY: 187 },
  }]);
  assert.equal(compareParityTraces(oracle, current).passed, true);
});

test("parity differ reports the first lifecycle divergence with its checkpoint and field", () => {
  const base = {
    label: "capture",
    screen: "playing",
    input: { mode: "mouse", pointerLocked: true, pointerLockAllowed: true },
    cursor: { canvas: "none", lockHintVisible: false },
    blade: { state: "held" },
  };
  const report = compareParityTraces(
    trace("oracle", [base]),
    trace("current", [{ ...base, input: { ...base.input, pointerLocked: false } }]),
  );
  assert.equal(report.passed, false);
  assert.deepEqual(report.firstDivergence, {
    checkpointIndex: 0,
    label: "capture",
    field: "input.pointerLocked",
    oracle: true,
    current: false,
    tolerance: 0,
  });
});

test("parity differ reports tick misalignment without inventing a physics regression", () => {
  const base = {
    label: "swing",
    screen: "playing",
    input: { mode: "mouse", pointerLocked: true, pointerLockAllowed: true },
    cursor: { drawn: false, lockHintVisible: false },
    blade: { state: "held", x: 100 },
  };
  const report = compareParityTraces(
    trace("oracle", [{ ...base, simulationTick: 40 }]),
    trace("current", [{ ...base, simulationTick: 42, blade: { state: "held", x: 500 } }]),
  );
  assert.equal(report.divergenceCount, 1);
  assert.equal(report.unalignedCheckpointCount, 1);
  assert.equal(report.firstDivergence.field, "simulationTick");
});

test("parity differ treats grounded state as strict and movement timers as tolerant", () => {
  const base = {
    label: "landing",
    screen: "playing",
    simulationTick: 80,
    input: { mode: "keyboard", pointerLocked: true, pointerLockAllowed: true },
    cursor: { drawn: false, lockHintVisible: false },
    player: { x: 100, y: 200, vx: 0, vy: 0, onGround: true, coyote: 0.1,
      jumpBuffer: 0, dashTimer: 0.05, dashCooldown: 0.4 },
    blade: { state: "held" },
  };
  const tolerated = compareParityTraces(
    trace("oracle", [base]),
    trace("current", [{ ...base, player: { ...base.player, coyote: 0.11,
      dashTimer: 0.04, dashCooldown: 0.39 } }]),
  );
  assert.equal(tolerated.passed, true);

  const airborne = compareParityTraces(
    trace("oracle", [base]),
    trace("current", [{ ...base, player: { ...base.player, onGround: false } }]),
  );
  assert.equal(airborne.firstDivergence.field, "player.onGround");
});

test("parity differ locks enemy attack phases while tolerating sub-frame motion drift", () => {
  const base = {
    label: "charge",
    screen: "playing",
    simulationTick: 64,
    input: { mode: "keyboard", pointerLocked: true, pointerLockAllowed: true },
    cursor: { drawn: false, lockHintVisible: false },
    player: { onGround: true },
    blade: { state: "held" },
    enemies: [{
      kind: "charger", behavior: "bull", attack: "commit", onGround: true,
      x: 900, y: 700, vx: -800, vy: 0, hp: 100, stun: 0,
      spawnT: 0, aliveT: 0.5, attackTime: 0.4, attackCooldown: 0,
      attackDirection: -1, chargePower: 0.5,
    }],
  };
  const tolerated = compareParityTraces(
    trace("oracle", [base]),
    trace("current", [{
      ...base,
      enemies: [{ ...base.enemies[0], x: 907, vx: -760, attackTime: 0.415 }],
    }]),
  );
  assert.equal(tolerated.passed, true);

  const wrongPhase = compareParityTraces(
    trace("oracle", [base]),
    trace("current", [{
      ...base,
      enemies: [{ ...base.enemies[0], attack: "recover" }],
    }]),
  );
  assert.equal(wrongPhase.firstDivergence.field, "enemies.0.attack");
});

test("parity differ locks ranged AI and projectile family while tolerating flight drift", () => {
  const base = {
    label: "volley",
    screen: "playing",
    simulationTick: 96,
    input: { mode: "mouse", pointerLocked: true, pointerLockAllowed: true },
    cursor: { drawn: false, lockHintVisible: false },
    player: { onGround: true },
    blade: { state: "held" },
    enemies: [{ kind: "ranged", behavior: "", aiState: "kite", onGround: true,
      aimTimer: 2.3, windTime: -0.01, windMax: 0.7 }],
    projectiles: [{ family: "ordinaryProjectile", kind: "dart", deflected: false,
      perfect: false, charged: false, x: 900, y: 700, vx: -800, vy: 20, life: 5.9 }],
  };
  const tolerated = compareParityTraces(
    trace("oracle", [base]),
    trace("current", [{ ...base, projectiles: [{ ...base.projectiles[0], x: 911, vx: -760 }] }]),
  );
  assert.equal(tolerated.passed, true);

  const wrongFamily = compareParityTraces(
    trace("oracle", [base]),
    trace("current", [{ ...base, projectiles: [{ ...base.projectiles[0], family: "groundShock" }] }]),
  );
  assert.equal(wrongFamily.firstDivergence.field, "projectiles.0.family");
});
