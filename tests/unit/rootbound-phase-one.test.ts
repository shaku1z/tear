import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import {
  ROOTBOUND_PHASE_ONE_ATTACK_ORDER,
  ROOTBOUND_PHASE_ONE_CADENCE,
  type RootboundPhaseOneAttack,
} from "../../src/gameplay/entities/enemy-types/rootbound";
import { createEnemyHarness } from "./enemy-test-harness";

type PhaseOneBoss = InstanceType<ReturnType<typeof createEnemyHarness>["types"]["Rootbound"]> & {
  pendingAttack: RootboundPhaseOneAttack | null;
  attackIndex: number;
  completePhaseOneAttack(): void;
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
        expect(entry.actor).toMatchObject({ state: "idle", stateT: 0, atk: "unavailable", availableAttacks: [] });
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
    actor.update(10, harness.platforms, harness.player, []);
    expect(actor).toMatchObject({ pendingAttack: "vine-sweep", attackIndex: 1, atk: "unavailable" });
  });
});
