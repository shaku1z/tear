import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import {
  WHITE_HART_ATTACK_IDS, WHITE_HART_PHASE_ATTACKS,
} from "../../src/gameplay/entities/enemy-types/white-hart";
import type { EnemyProjectile } from "../../src/gameplay/entities/enemy-contracts";
import { createEnemyHarness, createTestPlayer } from "./enemy-test-harness";

type Hart = InstanceType<ReturnType<typeof createEnemyHarness>["types"]["WhiteHart"]>;

function step(boss: Hart, ticks: number, projectiles: EnemyProjectile[] = [],
  player = createTestPlayer(), platforms = createEnemyHarness().platforms): void {
  for (let tick = 0; tick < ticks; tick += 1) boss.update(1 / 120, platforms, player, projectiles);
}

function phaseBoss(phase: 1 | 2 | 3) {
  const harness = createEnemyHarness();
  const boss = new harness.types.WhiteHart(420, CONFIG.world.groundY - CONFIG.whiteHart.h / 2);
  boss.onGround = true;
  if (phase > 1) {
    boss.hp = boss.maxHp * (phase === 2 ? 0.5 : 0.2);
    boss.update(1 / 120, harness.platforms, harness.player, []);
    boss.state = "idle"; boss.stateT = 0; boss.atk = "idle";
  } else boss.stateT = 0;
  return { ...harness, boss };
}

function collectAttacks(phase: 1 | 2 | 3): readonly string[] {
  const { boss, player, platforms } = phaseBoss(phase), projectiles: EnemyProjectile[] = [];
  const observed: string[] = [];
  let priorState = boss.state;
  for (let tick = 0; tick < 4_000 && observed.length < 4; tick += 1) {
    boss.update(1 / 120, platforms, player, projectiles);
    if (boss.state === "windup" && priorState !== "windup") observed.push(boss.atk);
    priorState = boss.state;
  }
  return observed;
}

describe("White Hart route-first phases", () => {
  it("selects all twelve attacks in stable phase-local order", () => {
    expect(WHITE_HART_ATTACK_IDS).toHaveLength(12);
    expect(collectAttacks(1)).toEqual(WHITE_HART_PHASE_ATTACKS[1]);
    expect(collectAttacks(2)).toEqual(WHITE_HART_PHASE_ATTACKS[2]);
    expect(collectAttacks(3)).toEqual(WHITE_HART_PHASE_ATTACKS[3]);
    expect(collectAttacks(3)).toEqual(collectAttacks(3));
  });

  it("warns before Antler Run, applies direct damage once, and accepts a strong antler parry", () => {
    const { boss, platforms } = phaseBoss(1);
    const player = createTestPlayer({ x: 760, y: boss.y });
    const projectiles: EnemyProjectile[] = [];
    boss.update(1 / 120, platforms, player, projectiles);
    expect(boss).toMatchObject({ atk: "antler-run", state: "windup", auroraBossChargeActive: false });
    expect(boss.routeTelegraph).toHaveLength(2);
    while (boss.state === "windup") boss.update(1 / 120, platforms, player, projectiles);
    expect(boss.state).toBe("commit");
    for (let tick = 0; tick < 120 && boss.state === "commit"; tick += 1) boss.update(1 / 120, platforms, player, projectiles);
    expect(player.damage.length).toBeLessThanOrEqual(1);

    const second = phaseBoss(1).boss;
    second.update(1 / 120, platforms, player, []);
    while (second.state === "windup") second.update(1 / 120, platforms, player, []);
    expect(second.batonStrike).toBeGreaterThan(0);
    expect(second.parryBaton(true)).toBe(true);
    expect(second).toMatchObject({ state: "recover", parryOutcome: "perfect", auroraBossChargeActive: false });
    expect(second.stun).toBeGreaterThanOrEqual(1);
    expect(second.blocksDamage()).toBe(false);
  });

  it("creates parryable Aurora Volley shards and two readable Snowbound landing waves", () => {
    const { boss, player, platforms } = phaseBoss(1), projectiles: EnemyProjectile[] = [];
    boss.attackCursor = 2; boss.stateT = 0;
    boss.update(1 / 120, platforms, player, projectiles);
    while (boss.state === "windup") boss.update(1 / 120, platforms, player, projectiles);
    expect(projectiles).toHaveLength(3);
    expect(projectiles.every((shot) => shot.kind === "aurora-shard" && !shot.unparryable
      && shot.counterplay === "deflect/return" && shot.bossAttack === "aurora-volley")).toBe(true);

    const leap = phaseBoss(1); const waves: EnemyProjectile[] = [];
    leap.boss.attackCursor = 1; leap.boss.stateT = 0;
    for (let tick = 0; tick < 360 && waves.length === 0; tick += 1) leap.boss.update(1 / 120, leap.platforms, leap.player, waves);
    expect(waves.filter((shot) => shot.kind === "snowbound-wave")).toHaveLength(2);
    expect(waves.every((shot) => !shot.unparryable && shot.counterplay === "jump/deflect")).toBe(true);
  });

  it("retires owned projectiles at phase boundaries and encounter cleanup", () => {
    const first = phaseBoss(1); const volley: EnemyProjectile[] = [];
    first.boss.attackCursor = 2; first.boss.stateT = 0;
    while (volley.length === 0) first.boss.update(1 / 120, first.platforms, first.player, volley);
    first.boss.hp = first.boss.maxHp * 0.5;
    first.boss.update(1 / 120, first.platforms, first.player, volley);
    expect(volley.every((projectile) => projectile.dead && projectile.harmless
      && projectile.shatterReason === "phase-transition")).toBe(true);
    expect(first.boss.ownedAttackProjectiles).toEqual([]);

    const second = phaseBoss(1); const cleanupVolley: EnemyProjectile[] = [];
    second.boss.attackCursor = 2; second.boss.stateT = 0;
    while (cleanupVolley.length === 0) second.boss.update(1 / 120, second.platforms, second.player, cleanupVolley);
    second.boss.cleanupEncounter("retry");
    expect(cleanupVolley.every((projectile) => projectile.dead && projectile.harmless
      && projectile.shatterReason === "encounter-cleanup")).toBe(true);
    expect(second.boss.ownedAttackProjectiles).toEqual([]);
  });

  it("emits bounded route requests for Ghost Tracks, Hushed Crossing, and a player-usable Frozen Wake", () => {
    for (const [cursor, attack, expected] of [[0, "ghost-tracks", 3], [2, "frozen-wake", 1], [3, "hushed-crossing", 3]] as const) {
      const { boss, player, platforms } = phaseBoss(2); boss.attackCursor = cursor; boss.stateT = 0;
      boss.update(1 / 120, platforms, player, []);
      expect(boss.atk).toBe(attack);
      expect(boss.pendingEnvironmentRequests).toHaveLength(expected);
      if (attack === "frozen-wake") expect(boss.pendingEnvironmentRequests[0]).toMatchObject({
        kind: "boss-wake", patternId: "white-hart-frozen-wake",
      });
      else expect(boss.pendingEnvironmentRequests.filter((request) => request.kind === "ghost-track"
        && request.threatening)).toHaveLength(1);
    }
  });

  it("uses the reforming arena seam for Fracture Step and allows a downward slam to launch the Hart", () => {
    const { boss, player, platforms } = phaseBoss(3); boss.attackCursor = 0; boss.stateT = 0;
    for (let tick = 0; tick < 360 && !platforms.some((platform) => platform.arenaFractureRequest); tick += 1) {
      boss.update(1 / 120, platforms, player, []);
    }
    expect(platforms.find((platform) => platform.arenaPlatId)?.arenaFractureRequest).toEqual({
      reason: "white-hart-fracture-step", color: "#78e6d0",
    });

    const launched = phaseBoss(3); launched.boss.attackCursor = 0; launched.boss.stateT = 0;
    while (launched.boss.state !== "commit") launched.boss.update(1 / 120, launched.platforms, launched.player, []);
    expect(launched.boss.onBladeImpulse({ isSlam: true, empSlam: true, tipVY: 900 })).toBe(true);
    expect(launched.boss).toMatchObject({ state: "recover", parryOutcome: "perfect" });
    expect(launched.boss.vy).toBeLessThan(0);
  });

  it("keeps Endless Return interruptible and requires the strong final counter for Last Crossing", () => {
    const endless = phaseBoss(3); endless.boss.attackCursor = 2; endless.boss.stateT = 0;
    while (!(endless.boss.state === "commit" && endless.boss.batonStrike > 0)) {
      endless.boss.update(1 / 120, endless.platforms, endless.player, []);
    }
    expect(endless.boss.parryBaton(false)).toBe(true);
    expect(endless.boss.state).toBe("recover");

    const last = phaseBoss(3); last.boss.attackCursor = 3; last.boss.stateT = 0;
    while (!(last.boss.state === "commit" && last.boss.batonStrike > 0)) {
      last.boss.update(1 / 120, last.platforms, last.player, []);
    }
    expect(last.boss.parryBaton(false)).toBe(true);
    expect(last.boss.state).toBe("commit");
    last.boss.batonStrike = 0.1;
    expect(last.boss.parryBaton(true)).toBe(true);
    expect(last.boss).toMatchObject({ state: "recover", parryOutcome: "perfect" });
  });

  it("has no regeneration, phase invulnerability, clone creation, global ice, or unavoidable contact damage", () => {
    const { boss, player, platforms } = phaseBoss(3); boss.hp -= 100;
    const before = boss.hp; step(boss, 240, [], player, platforms);
    expect(boss.hp).toBe(before);
    expect(boss.blocksDamage()).toBe(false);
    expect(boss.contactDamageEnabled()).toBe(false);
    expect(platforms.find((platform) => platform.floor)?.arenaFractureRequest).toBeUndefined();
    const frozen = phaseBoss(2); frozen.boss.attackCursor = 2; frozen.boss.stateT = 0;
    frozen.boss.update(1 / 120, frozen.platforms, frozen.player, []);
    const wake = frozen.boss.pendingEnvironmentRequests.find((request) => request.kind === "boss-wake");
    expect(wake?.kind === "boss-wake" ? wake.geometry.w : CONFIG.view.w).toBeLessThan(CONFIG.view.w);
  });
});
