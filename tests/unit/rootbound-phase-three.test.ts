import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { ROOTBOUND_LAST_SPRING, type RootboundLastSpringStage } from "../../src/gameplay/entities/enemy-types/rootbound";
import { ROOTBOUND_REGROWTH_TIMING, type RootboundRegrowthState } from "../../src/gameplay/environment/regrowth-link";
import { createEnemyHarness } from "./enemy-test-harness";

type PhaseThreeBoss = InstanceType<ReturnType<typeof createEnemyHarness>["types"]["Rootbound"]> & {
  regrowthState: RootboundRegrowthState;
  beginRegrowth(startTick: number, connectionIds: readonly string[]): boolean;
  advanceRegrowth(tick: number, activeConnectionIds: ReadonlySet<string>, bossChannelBroken?: boolean): RootboundRegrowthState;
  lastSpringStage: RootboundLastSpringStage | null;
  lastSpringT: number;
  lastSpringUseCount: number;
  startLastSpring(): boolean;
  bossBloomPattern(): string | null;
};

const connectionIds = ["rootbound:regrowth:1", "rootbound:regrowth:2", "rootbound:regrowth:3"] as const;

function resolvedBoss(): Readonly<{ actor: PhaseThreeBoss; harness: ReturnType<typeof createEnemyHarness> }> {
  const harness = createEnemyHarness();
  const actor = new harness.types.Rootbound(CONFIG.view.w / 2, CONFIG.world.groundY - CONFIG.boss.h / 2) as PhaseThreeBoss;
  actor.hp = actor.maxHp * 0.2;
  actor.update(1 / 120, harness.platforms, harness.player, []);
  actor.cinematicRequest = null;
  actor.cinematicT = 0;
  actor.beginRegrowth(0, connectionIds);
  actor.advanceRegrowth(ROOTBOUND_REGROWTH_TIMING.channelTicks, new Set(), false);
  actor.state = "idle";
  actor.stateT = 0;
  return { actor, harness };
}

describe("Rootbound Last Spring", () => {
  it("runs one authored warning, Bloom, commit, and punish sequence", () => {
    const { actor, harness } = resolvedBoss();
    expect(actor.startLastSpring()).toBe(true);
    expect(actor).toMatchObject({ lastSpringStage: "warning", lastSpringUseCount: 1, atk: "last-spring:warning" });
    expect(actor.bossBloomPattern()).toBe("last-spring");

    actor.update(ROOTBOUND_LAST_SPRING.warning, harness.platforms, harness.player, []);
    expect(actor).toMatchObject({ lastSpringStage: "bloom", atk: "last-spring:bloom" });
    expect(harness.platforms.find((platform) => platform.arenaPlatId)?.arenaFractureRequest).toEqual({
      reason: "rootbound-last-spring", color: "#e4c95a",
    });
    actor.update(ROOTBOUND_LAST_SPRING.bloom, harness.platforms, harness.player, []);
    expect(actor).toMatchObject({ lastSpringStage: "commit", atk: "last-spring:commit" });
    actor.update(ROOTBOUND_LAST_SPRING.commit, harness.platforms, harness.player, []);
    expect(actor).toMatchObject({ lastSpringStage: "punish", atk: "last-spring:punish" });
    expect(harness.player.damage).toHaveLength(1);
    expect(harness.player.damage[0]?.amount).toBe(ROOTBOUND_LAST_SPRING.damage);
    actor.update(ROOTBOUND_LAST_SPRING.punish, harness.platforms, harness.player, []);
    expect(actor).toMatchObject({ lastSpringStage: "complete", state: "recover", atk: "unavailable" });
    expect(actor.startLastSpring()).toBe(false);
  });
});
