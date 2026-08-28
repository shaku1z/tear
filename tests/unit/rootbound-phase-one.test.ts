import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import type { EnemyProjectile } from "../../src/gameplay/entities/enemy-contracts";
import { createEnvironmentRuntime } from "../../src/gameplay/environment/environment-runtime";
import { DIFFICULTY_CATALOG } from "../../src/gameplay/run/difficulty-catalog";
import {
  ROOTBOUND_PHASE_ONE_ATTACK_ORDER,
  ROOTBOUND_PHASE_ONE_CADENCE,
  ROOTBOUND_CANOPY_STEP,
  ROOTBOUND_SEED_ARC,
  ROOTBOUND_ROOTLINE,
  ROOTBOUND_VINE_SWEEP,
  type RootboundPhaseOneAttack,
} from "../../src/gameplay/entities/enemy-types/rootbound";
import { createEnemyHarness } from "./enemy-test-harness";

type PhaseOneBoss = InstanceType<ReturnType<typeof createEnemyHarness>["types"]["Rootbound"]> & {
  pendingAttack: RootboundPhaseOneAttack | null;
  attackIndex: number;
  completePhaseOneAttack(): void;
  selectNextPhaseOneAttack(): RootboundPhaseOneAttack | null;
};

function boss() {
  const harness = createEnemyHarness();
  return { harness, actor: new harness.types.Rootbound(
    CONFIG.view.w / 2,
    CONFIG.world.groundY - CONFIG.boss.h / 2,
  ) as PhaseOneBoss };
}

describe("Rootbound Phase I cadence", () => {
  it("selects the authored four-verb order deterministically without committing placeholder attacks", () => {
    const first = boss();
    const second = boss();
    const selected: RootboundPhaseOneAttack[] = [];
    const mirrored: RootboundPhaseOneAttack[] = [];
    for (let index = 0; index < ROOTBOUND_PHASE_ONE_ATTACK_ORDER.length * 2; index += 1) {
      for (const entry of [first, second]) {
        entry.actor.update(ROOTBOUND_PHASE_ONE_CADENCE.openingDelay, entry.harness.platforms, entry.harness.player, []);
        const target = entry === first ? selected : mirrored;
        if (entry.actor.pendingAttack !== null) target.push(entry.actor.pendingAttack);
        expect(entry.actor).toMatchObject({ state: "idle", stateT: 0, atk: "unavailable", availableAttacks: ["vine-sweep", "seed-arc", "rootline", "canopy-step"] });
        entry.actor.completePhaseOneAttack();
        expect(entry.actor).toMatchObject({ state: "recover", stateT: ROOTBOUND_PHASE_ONE_CADENCE.recovery, pendingAttack: null });
        entry.actor.update(ROOTBOUND_PHASE_ONE_CADENCE.recovery, entry.harness.platforms, entry.harness.player, []);
      }
    }
    expect(selected).toEqual([...ROOTBOUND_PHASE_ONE_ATTACK_ORDER, ...ROOTBOUND_PHASE_ONE_ATTACK_ORDER]);
    expect(mirrored).toEqual(selected);
  });

  it("does not select during intro, recovery, stun, or while a selection is pending", () => {
    const { harness, actor } = boss();
    actor.introT = 0.4;
    actor.update(1, harness.platforms, harness.player, []);
    expect(actor.pendingAttack).toBeNull();
    actor.introT = 0;
    actor.update(1 / 120, harness.platforms, harness.player, []);
    expect(actor.state).toBe("recover");
    actor.stun = 1;
    actor.update(2, harness.platforms, harness.player, []);
    expect(actor.pendingAttack).toBeNull();
    actor.stun = 0;
    actor.update(ROOTBOUND_PHASE_ONE_CADENCE.recovery, harness.platforms, harness.player, []);
    actor.update(ROOTBOUND_PHASE_ONE_CADENCE.openingDelay, harness.platforms, harness.player, []);
    expect(actor.pendingAttack).toBe("vine-sweep");
    expect(actor.selectNextPhaseOneAttack()).toBeNull();
    expect(actor).toMatchObject({ pendingAttack: "vine-sweep", attackIndex: 1, atk: "unavailable" });
  });

  it("telegraphs Vine Sweep geometry before one bounded active hit and punish recovery", () => {
    const { harness, actor } = boss();
    const player = harness.player;
    player.x = actor.x + 220;
    player.y = CONFIG.world.groundY - player.hh;

    actor.update(ROOTBOUND_PHASE_ONE_CADENCE.openingDelay, harness.platforms, player, []);
    actor.update(1 / 120, harness.platforms, player, []);
    expect(actor).toMatchObject({
      pendingAttack: "vine-sweep",
      vineSweepStage: "windup",
      atk: "vine-sweep:windup",
      vineSweepHitSpent: false,
    });
    expect(actor.vineSweepGeometry()).toMatchObject({ facing: 1, hh: ROOTBOUND_VINE_SWEEP.halfHeight });
    expect(player.damage).toEqual([]);

    actor.update(ROOTBOUND_VINE_SWEEP.windup, harness.platforms, player, []);
    expect(actor).toMatchObject({ vineSweepStage: "active", atk: "vine-sweep:active" });
    expect(player.damage).toEqual([]);
    actor.update(1 / 120, harness.platforms, player, []);
    actor.update(1 / 120, harness.platforms, player, []);
    expect(player.damage).toHaveLength(1);
    expect(player.damage[0]).toMatchObject({ amount: ROOTBOUND_VINE_SWEEP.damage, sourceX: actor.x, source: actor });

    actor.update(ROOTBOUND_VINE_SWEEP.active, harness.platforms, player, []);
    expect(actor).toMatchObject({ vineSweepStage: "follow-through", atk: "vine-sweep:follow-through" });
    actor.update(ROOTBOUND_VINE_SWEEP.followThrough, harness.platforms, player, []);
    expect(actor).toMatchObject({ pendingAttack: null, vineSweepStage: null, state: "recover", atk: "unavailable" });
  });

  it("keeps Vine Sweep safe behind the committed facing and above its near-air coverage", () => {
    for (const playerOffset of [-180, 220] as const) {
      const { harness, actor } = boss();
      const player = harness.player;
      player.x = actor.x + 220;
      actor.update(ROOTBOUND_PHASE_ONE_CADENCE.openingDelay, harness.platforms, player, []);
      actor.update(1 / 120, harness.platforms, player, []);
      player.x = actor.x + playerOffset;
      if (playerOffset > 0) player.y = actor.y - ROOTBOUND_VINE_SWEEP.halfHeight * 2 - player.hh;
      actor.update(ROOTBOUND_VINE_SWEEP.windup, harness.platforms, player, []);
      actor.update(1 / 120, harness.platforms, player, []);
      expect(player.damage, `offset ${String(playerOffset)}`).toEqual([]);
    }
  });

  it("releases a bounded, deflectable Seed Arc with visible landing ownership", () => {
    const { harness, actor } = boss();
    const shots: EnemyProjectile[] = [];
    actor.pendingAttack = "seed-arc";
    actor.update(1 / 120, harness.platforms, harness.player, shots);
    expect(actor).toMatchObject({ seedArcStage: "windup", atk: "seed-arc:windup" });
    expect(shots).toEqual([]);

    actor.update(ROOTBOUND_SEED_ARC.windup, harness.platforms, harness.player, shots);
    expect(actor).toMatchObject({ seedArcStage: "release", atk: "seed-arc:release" });
    expect(shots).toHaveLength(3);
    expect(shots.map((shot) => shot.landingX)).toEqual([
      harness.player.x - ROOTBOUND_SEED_ARC.spread,
      harness.player.x,
      harness.player.x + ROOTBOUND_SEED_ARC.spread,
    ]);
    for (const shot of shots) expect(shot).toMatchObject({
      family: "ordinaryProjectile",
      counterplay: "deflect",
      unparryable: false,
      bossAttack: "seed-arc",
      owner: actor,
      sourceEnemy: actor,
      landingY: CONFIG.world.groundY,
      groundImpact: true,
      mud: false,
      root: 0,
      dmg: ROOTBOUND_SEED_ARC.damage,
    });
    expect(Math.max(...shots.map((shot) => shot.life))).toBeLessThan(2);

    actor.update(ROOTBOUND_SEED_ARC.release, harness.platforms, harness.player, shots);
    expect(actor).toMatchObject({ pendingAttack: null, seedArcStage: null, state: "recover", atk: "unavailable" });
  });

  it("routes Rootline warning, one active hit, and cleanup through the environment owner", () => {
    const { harness, actor } = boss();
    const player = harness.player;
    const environment = createEnvironmentRuntime({ stageId: "verdant-sanctum", worldId: "rootline-test" });
    player.x = actor.x + 180;
    environment.setRootboundActorsSource(() => [Object.freeze({
      id: "rootbound:test",
      source: actor,
      state: Object.freeze({ stage: actor.rootlineStage, geometry: actor.rootlineGeometry(), damage: ROOTBOUND_ROOTLINE.damage, cleanupReason: actor.rootlineCleanupReason }),
      player: Object.freeze({
        x: player.x, y: player.y, hw: player.hw, hh: player.hh, invulnerable: Boolean(player.invulnerable),
        hazardDamageMultiplier: 1,
        takeDamage: (damage: number, sourceX: number, source: unknown) => { player.takeDamage(damage, sourceX, source as never); },
      }),
    })]);
    actor.pendingAttack = "rootline";

    actor.update(1 / 120, harness.platforms, player, []);
    environment.step(1, 1 / 120, () => undefined);
    expect(environment.fields()).toEqual([expect.objectContaining({
      kind: "rootline", ownerId: "rootbound:test", state: "warning", patternId: "rootbound-rootline",
      geometry: actor.rootlineGeometry(),
    })]);
    expect(player.damage).toEqual([]);

    actor.update(ROOTBOUND_ROOTLINE.windup, harness.platforms, player, []);
    environment.step(2, 1 / 120, () => undefined);
    expect(environment.fields()[0]).toMatchObject({ state: "active" });
    expect(player.damage).toHaveLength(1);
    environment.step(3, 1 / 120, () => undefined);
    expect(player.damage).toHaveLength(1);

    actor.update(ROOTBOUND_ROOTLINE.active, harness.platforms, player, []);
    environment.step(4, 1 / 120, () => undefined);
    expect(environment.fields()[0]).toMatchObject({ state: "cooldown" });
    actor.update(ROOTBOUND_ROOTLINE.cleanup, harness.platforms, player, []);
    environment.step(5, 1 / 120, () => undefined);
    expect(environment.fields()[0]).toMatchObject({ state: "expired", cleanupReason: "natural-expiry" });
    expect(actor).toMatchObject({ pendingAttack: null, rootlineStage: null, state: "recover" });
  });

  it("telegraphs an authored Canopy Step destination before moving without an arrival hit", () => {
    const { harness, actor } = boss();
    const player = harness.player;
    const start = { x: actor.x, y: actor.y };
    actor.pendingAttack = "canopy-step";
    actor.update(1 / 120, harness.platforms, player, []);
    expect(actor).toMatchObject({
      canopyStepStage: "telegraph",
      canopyDestination: { x: 800, y: 461, platformId: "test:ledge" },
      atk: "canopy-step:telegraph",
      x: start.x,
      y: start.y,
    });
    expect(actor.contactDamageEnabled()).toBe(false);
    expect(player.damage).toEqual([]);

    actor.update(ROOTBOUND_CANOPY_STEP.telegraph, harness.platforms, player, []);
    expect(actor).toMatchObject({ canopyStepStage: "travel", x: start.x, y: start.y });
    actor.update(ROOTBOUND_CANOPY_STEP.travel / 2, harness.platforms, player, []);
    expect(actor.y).toBeLessThan(start.y);
    actor.update(ROOTBOUND_CANOPY_STEP.travel / 2, harness.platforms, player, []);
    expect(actor).toMatchObject({ canopyStepStage: "settle", x: 800, y: 461, atk: "canopy-step:settle" });
    expect(player.damage).toEqual([]);
    actor.update(ROOTBOUND_CANOPY_STEP.settle, harness.platforms, player, []);
    expect(actor).toMatchObject({ pendingAttack: null, canopyStepStage: null, canopyDestination: null, state: "recover" });
    expect(player.damage).toEqual([]);
  });

  it("cleans every temporary Phase I owner before Phase II becomes active", () => {
    const { harness, actor } = boss();
    const environment = createEnvironmentRuntime({ stageId: "verdant-sanctum", worldId: "phase-exit" });
    environment.setRootboundActorsSource(() => [Object.freeze({
      id: "rootbound:phase-exit", source: actor,
      state: Object.freeze({ stage: actor.rootlineStage, geometry: actor.rootlineGeometry(), damage: ROOTBOUND_ROOTLINE.damage, cleanupReason: actor.rootlineCleanupReason }),
    })]);
    actor.pendingAttack = "rootline";
    actor.update(1 / 120, harness.platforms, harness.player, []);
    environment.step(1, 1 / 120, () => undefined);
    expect(environment.fields()[0]).toMatchObject({ state: "warning" });

    const seed = new harness.Projectile(actor.x, actor.y, 10, -10);
    seed.owner = actor; seed.sourceEnemy = actor; seed.bossAttack = "seed-arc";
    const projectiles: EnemyProjectile[] = [seed];
    actor.hp = actor.maxHp * actor.phaseMarks[0];
    actor.update(1 / 120, harness.platforms, harness.player, projectiles);
    expect(actor).toMatchObject({
      phase: 2, phaseMarker: 2, phaseOneExited: true, pendingAttack: null,
      vineSweepStage: null, seedArcStage: null, rootlineStage: null, canopyStepStage: null,
      state: "recover", atk: "unavailable", rootlineCleanupReason: "stage-transition",
    });
    expect(seed).toMatchObject({ dead: true, shatterReason: "phase-transition" });
    environment.step(2, 1 / 120, () => undefined);
    expect(environment.fields()[0]).toMatchObject({ state: "expired", cleanupReason: "stage-transition" });
  });

  it("keeps authored cadence fixed while current difficulty authority scales damage exactly once", () => {
    const cycleSeconds = ROOTBOUND_PHASE_ONE_CADENCE.openingDelay * ROOTBOUND_PHASE_ONE_ATTACK_ORDER.length
      + ROOTBOUND_PHASE_ONE_CADENCE.recovery * ROOTBOUND_PHASE_ONE_ATTACK_ORDER.length
      + ROOTBOUND_VINE_SWEEP.windup + ROOTBOUND_VINE_SWEEP.active + ROOTBOUND_VINE_SWEEP.followThrough
      + ROOTBOUND_SEED_ARC.windup + ROOTBOUND_SEED_ARC.release
      + ROOTBOUND_ROOTLINE.windup + ROOTBOUND_ROOTLINE.active + ROOTBOUND_ROOTLINE.cleanup
      + ROOTBOUND_CANOPY_STEP.telegraph + ROOTBOUND_CANOPY_STEP.travel + ROOTBOUND_CANOPY_STEP.settle;
    expect(cycleSeconds).toBeCloseTo(10.05);
    expect(Math.min(
      ROOTBOUND_VINE_SWEEP.windup,
      ROOTBOUND_SEED_ARC.windup,
      ROOTBOUND_ROOTLINE.windup,
      ROOTBOUND_CANOPY_STEP.telegraph,
    )).toBeGreaterThanOrEqual(0.55);

    const scaled = (damage: number, multiplier: number): number => Math.round(damage * multiplier * 10) / 10;
    expect(DIFFICULTY_CATALOG.map((difficulty) => ({
      id: difficulty.id,
      vine: difficulty.oneHit ? "fatal" : scaled(ROOTBOUND_VINE_SWEEP.damage, difficulty.modifiers.playerDamageTaken),
      seed: difficulty.oneHit ? "fatal" : scaled(ROOTBOUND_SEED_ARC.damage, difficulty.modifiers.playerDamageTaken),
      rootline: difficulty.oneHit ? "fatal" : scaled(ROOTBOUND_ROOTLINE.damage, difficulty.modifiers.playerDamageTaken),
      cycleSeconds,
    }))).toEqual([
      { id: "easy", vine: 11.7, seed: 10.4, rootline: 13, cycleSeconds },
      { id: "normal", vine: 18, seed: 16, rootline: 20, cycleSeconds },
      { id: "hard", vine: 24.3, seed: 21.6, rootline: 27, cycleSeconds },
      { id: "extreme", vine: 32.4, seed: 28.8, rootline: 36, cycleSeconds },
      { id: "onehit", vine: "fatal", seed: "fatal", rootline: "fatal", cycleSeconds },
    ]);
  });
});
