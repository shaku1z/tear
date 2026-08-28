import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { ROOTBOUND_LAST_SPRING, type RootboundLastSpringStage } from "../../src/gameplay/entities/enemy-types/rootbound";
import { createRootboundRegrowthConnections, ROOTBOUND_REGROWTH_TIMING, type RootboundRegrowthState } from "../../src/gameplay/environment/regrowth-link";
import { createRootboundBloomPattern } from "../../src/gameplay/environment/bloom-well";
import { createEnemyHarness } from "./enemy-test-harness";
import { BossArenaRules, createBossArena } from "../../src/gameplay/training/arena-rules";
import { createEnvironmentRuntime, type RootboundEnvironmentActor } from "../../src/gameplay/environment/environment-runtime";

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

  it("drives the existing living arena through warning, broken, reforming, and stable", () => {
    const { actor, harness } = resolvedBoss();
    const platforms = createBossArena("rootbound", CONFIG.view.w, CONFIG.view.h, CONFIG.world.groundY, CONFIG.bossArena.reformWarn)
      ?.map((platform) => ({ ...platform })) ?? [];
    const broken: typeof platforms = [];
    expect(actor.startLastSpring()).toBe(true);
    actor.update(ROOTBOUND_LAST_SPRING.warning, platforms, harness.player, []);
    const route = platforms.find((platform) => platform.arenaFractureRequest?.reason === "rootbound-last-spring");
    if (route === undefined) throw new Error("Last Spring must request one authored living route fracture");
    const rules = new BossArenaRules(CONFIG.bossArena, CONFIG.colors);
    rules.update({ platforms, broken }, 0, null, [actor], true);
    expect(route.arenaState).toBe("warning");
    rules.update({ platforms, broken }, CONFIG.bossArena.crackWarn, null, [actor], true);
    expect(route.arenaState).toBe("broken");
    expect(platforms.filter((platform) => platform.oneway)).toHaveLength(4);
    rules.update({ platforms, broken }, CONFIG.bossArena.brokenDuration - CONFIG.bossArena.crackWarn + 0.05, null, [actor], true);
    expect(route.arenaState).toBe("reforming");
    rules.update({ platforms, broken }, CONFIG.bossArena.reformWarn, null, [actor], true);
    expect(route.arenaState).toBe("stable");
    expect(platforms).toContain(route);
    expect(broken).toEqual([]);
  });

  it("materializes Regrowth through the environment owner and clears every terminal collection", () => {
    const harness = createEnemyHarness();
    const actor = new harness.types.Rootbound(CONFIG.view.w / 2, CONFIG.world.groundY - CONFIG.boss.h / 2) as PhaseThreeBoss;
    actor.hp = actor.maxHp * 0.2;
    actor.update(1 / 120, harness.platforms, harness.player, []);
    actor.cinematicRequest = null;
    actor.cinematicT = 0;
    const environment = createEnvironmentRuntime({ stageId: "verdant-sanctum", worldId: "rootbound-phase-three" });
    environment.setRootboundActorsSource(() => [Object.freeze({
      id: "enemy:rootbound-live",
      source: actor,
      beginRegrowth: (startTick: number, ids: readonly string[]) => actor.beginRegrowth(startTick, ids),
      advanceRegrowth: (tick: number, ids: ReadonlySet<string>, brokenChannel = false) => actor.advanceRegrowth(tick, ids, brokenChannel),
      state: Object.freeze({
        stage: null,
        geometry: Object.freeze({ x: actor.x, y: actor.y, w: 0, h: 0 }),
        damage: 0,
        cleanupReason: null,
        ownerPosition: Object.freeze({ x: actor.x, y: actor.y }),
        arena: Object.freeze({ width: CONFIG.view.w, groundY: CONFIG.world.groundY }),
        phase: actor.phase,
        regrowth: actor.regrowthState,
        bloomPattern: actor.bossBloomPattern(),
      }),
    }) satisfies RootboundEnvironmentActor]);
    environment.step(100, 1 / 120, () => undefined, new Set(["enemy:rootbound-live"]));
    expect(environment.combatObjects()).toHaveLength(3);
    expect(environment.routes()).toHaveLength(3);
    expect(actor.regrowthState).toMatchObject({ phase: "channeling", startTick: 100 });

    const severed = environment.combatObjects()[0];
    if (severed === undefined) throw new Error("Regrowth must install a severable connection");
    environment.cleanupCombatObject(severed.id, "natural-expiry", 101);
    environment.step(100 + ROOTBOUND_REGROWTH_TIMING.channelTicks, 1 / 120, () => undefined, new Set(["enemy:rootbound-live"]));
    expect(actor.regrowthState).toMatchObject({ phase: "resolved", interruptClassification: "partial-interrupt" });
    expect(environment.combatObjects().every((object) => object.state === "expired")).toBe(true);
    expect(environment.routes().every((route) => route.state === "expired")).toBe(true);

    actor.state = "idle";
    actor.stateT = 0;
    actor.startLastSpring();
    environment.step(700, 1 / 120, () => undefined, new Set(["enemy:rootbound-live"]));
    expect(environment.fields().some((field) => field.patternId?.includes("last-spring") === true)).toBe(true);
    actor.cleanupEncounter("death");
    environment.clear("boss-terminal");
    expect(environment.snapshot()).toMatchObject({ fields: [], combatObjects: [], routes: [] });
    expect(actor).toMatchObject({ lastSpringStage: null, lastSpringT: 0, lastSpringHitSpent: false, cleanupReason: "death" });
  });

  it("cleans active final-phase ownership across retry, defeat, victory, and abandon boundaries", () => {
    const cases = [
      { label: "retry", bossReason: "retry", environmentReason: "retry" },
      { label: "defeat", bossReason: "death", environmentReason: "defeat" },
      { label: "victory", bossReason: "death", environmentReason: "boss-terminal" },
      { label: "abandon", bossReason: "exit", environmentReason: "abandon" },
    ] as const;
    for (const entry of cases) {
      const { actor } = resolvedBoss();
      expect(actor.startLastSpring()).toBe(true);
      const environment = createEnvironmentRuntime({ stageId: "verdant-sanctum", worldId: `rootbound-${entry.label}` });
      const links = createRootboundRegrowthConnections({ ownerId: "enemy:rootbound", ownerPosition: { x: actor.x, y: actor.y }, startTick: 10,
        rootNodes: [{ id: "left-remnant", x: 280, y: 800 }, { id: "heart-root", x: 800, y: 800 }, { id: "right-remnant", x: 1_320, y: 800 }] });
      links.combatObjects.forEach((value) => environment.addCombatObject(value));
      links.routes.forEach((value) => environment.addRoute(value));
      createRootboundBloomPattern({ patternId: "last-spring", bossOwnerId: "enemy:rootbound", stageOwnerId: "verdant-sanctum",
        startTick: 10, arenaWidth: CONFIG.view.w, groundY: CONFIG.world.groundY }).forEach((value) => environment.addField(value));
      actor.cleanupEncounter(entry.bossReason);
      environment.clear(entry.environmentReason);
      expect(environment.snapshot()).toMatchObject({ fields: [], combatObjects: [], routes: [] });
      expect(actor).toMatchObject({ cleanupReason: entry.bossReason, lastSpringStage: null, lastSpringT: 0,
        lastSpringHitSpent: false, regrowthState: { phase: "resolved", resolvedHealFraction: 0 } });
    }
  });
});
