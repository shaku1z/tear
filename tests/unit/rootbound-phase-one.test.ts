import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import type { EnemyProjectile } from "../../src/gameplay/entities/enemy-contracts";
import {
  ROOTBOUND_PHASE_ONE_ATTACK_ORDER,
  ROOTBOUND_PHASE_ONE_CADENCE,
  ROOTBOUND_SEED_ARC,
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
        expect(entry.actor).toMatchObject({ state: "idle", stateT: 0, atk: "unavailable", availableAttacks: ["vine-sweep", "seed-arc"] });
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
});
