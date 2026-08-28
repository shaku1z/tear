import { describe, expect, it } from "vitest";

import {
  ROOTBOUND_REGROWTH_CONNECTION_COUNT,
  ROOTBOUND_REGROWTH_OUTCOMES,
  ROOTBOUND_REGROWTH_TIMING,
  advanceRootboundRegrowth,
  beginRootboundRegrowth,
  createRootboundRegrowthConnections,
  createRootboundRegrowthState,
  resolveRootboundRegrowthOutcome,
} from "../../src/gameplay/environment/regrowth-link";
import { CONFIG } from "../../src/config/game-config";
import { createEnemyHarness } from "./enemy-test-harness";

const connections = Object.freeze([
  "enemy:rootbound:regrowth:g1:1",
  "enemy:rootbound:regrowth:g1:2",
  "enemy:rootbound:regrowth:g1:3",
] as const);

describe("Rootbound Regrowth channel", () => {
  it("begins once with explicit connection identity and bounded tick progress", () => {
    const started = beginRootboundRegrowth(createRootboundRegrowthState(), 1_200, connections);
    expect(started).toMatchObject({
      phase: "channeling",
      useCount: 1,
      startTick: 1_200,
      requiredConnectionIds: connections,
      survivingConnectionIds: connections,
      progress: 0,
      interruptClassification: null,
    });

    const halfway = advanceRootboundRegrowth(started, 1_200 + ROOTBOUND_REGROWTH_TIMING.channelTicks / 2, new Set(connections), false);
    expect(halfway).toMatchObject({ phase: "channeling", progress: 0.5 });
    expect(() => advanceRootboundRegrowth(halfway, 1_199, new Set(connections), false)).toThrow(/before its start tick/u);
  });

  it("resolves exactly once from surviving connections or a broken boss channel", () => {
    const started = beginRootboundRegrowth(createRootboundRegrowthState(), 300, connections);
    const partial = advanceRootboundRegrowth(started, 300 + ROOTBOUND_REGROWTH_TIMING.channelTicks, new Set([connections[0]]), false);
    expect(partial).toMatchObject({
      phase: "resolved",
      survivingConnectionIds: [connections[0]],
      progress: 1,
      interruptClassification: "partial-interrupt",
    });

    const severed = advanceRootboundRegrowth(
      beginRootboundRegrowth(createRootboundRegrowthState(), 600, connections),
      601,
      new Set(),
      false,
    );
    expect(severed).toMatchObject({ phase: "resolved", progress: 1, interruptClassification: "full-interrupt" });

    const broken = advanceRootboundRegrowth(
      beginRootboundRegrowth(createRootboundRegrowthState(), 900, connections),
      901,
      new Set(connections),
      true,
    );
    expect(broken).toMatchObject({ phase: "resolved", survivingConnectionIds: connections, interruptClassification: "full-interrupt" });
  });

  it("rejects malformed connections and cannot reopen after its one use", () => {
    expect(() => beginRootboundRegrowth(createRootboundRegrowthState(), 0, [connections[0], connections[0]])).toThrow(/unique/u);
    const resolved = advanceRootboundRegrowth(
      beginRootboundRegrowth(createRootboundRegrowthState(), 0, connections),
      ROOTBOUND_REGROWTH_TIMING.channelTicks,
      new Set(connections),
      false,
    );
    expect(() => beginRootboundRegrowth(resolved, 1_000, connections)).toThrow(/at most once/u);
    expect(advanceRootboundRegrowth(resolved, 2_000, new Set(), true)).toBe(resolved);
  });

  it("composes exactly three cuttable connections plus data-only presentation routes", () => {
    const bundle = createRootboundRegrowthConnections({
      ownerId: "enemy:rootbound",
      ownerPosition: { x: 800, y: 420 },
      rootNodes: [
        { id: "left-remnant", x: 240, y: 700 },
        { id: "heart-root", x: 800, y: 760 },
        { id: "right-remnant", x: 1_360, y: 700 },
      ],
      startTick: 1_200,
    });
    expect(bundle.combatObjects).toHaveLength(ROOTBOUND_REGROWTH_CONNECTION_COUNT);
    expect(bundle.combatObjects.map(({ id }) => id)).toEqual(connections);
    expect(bundle.combatObjects.every((object) => object.kind === "root-link" && object.factoryId === "root-link"
      && object.ownerId === "enemy:rootbound" && object.targetId === null && !object.procEligible
      && object.counterplayTags.join(",") === "cut,break")).toBe(true);
    expect(bundle.routes.map(({ id, kind, factoryId }) => ({ id, kind, factoryId }))).toEqual(connections.map((id) => ({
      id: `${id}:route`, kind: "regrowth-link", factoryId: "regrowth-link",
    })));
    expect(() => createRootboundRegrowthConnections({
      ownerId: "enemy:rootbound", ownerPosition: { x: 0, y: 0 }, rootNodes: [], startTick: 0,
    })).toThrow(/exactly 3/u);
  });

  it("exposes the same one-use channel state through the production Rootbound type", () => {
    const harness = createEnemyHarness();
    const actor = new harness.types.Rootbound(CONFIG.view.w / 2, CONFIG.world.groundY - CONFIG.boss.h / 2) as InstanceType<
      ReturnType<typeof createEnemyHarness>["types"]["Rootbound"]
    > & {
      regrowthState: ReturnType<typeof createRootboundRegrowthState>;
      beginRegrowth(startTick: number, connectionIds: readonly string[]): boolean;
      advanceRegrowth(tick: number, activeConnectionIds: ReadonlySet<string>, bossChannelBroken?: boolean): ReturnType<typeof createRootboundRegrowthState>;
    };
    expect(actor.beginRegrowth(0, connections)).toBe(false);
    actor.hp = actor.maxHp * 0.2;
    actor.update(1 / 120, harness.platforms, harness.player, []);
    actor.cinematicRequest = null;
    actor.cinematicT = 0;
    expect(actor.beginRegrowth(500, connections)).toBe(true);
    expect(actor).toMatchObject({ atk: "regrowth:channeling", regrowthState: { phase: "channeling", useCount: 1, startTick: 500 } });
    expect(actor.beginRegrowth(501, connections)).toBe(false);
    actor.advanceRegrowth(501, new Set(), false);
    expect(actor).toMatchObject({ atk: "regrowth:full-interrupt", regrowthState: { phase: "resolved", interruptClassification: "full-interrupt" } });
  });

  it("maps full, proportional partial, and no interrupt to bounded healing and ordered recovery", () => {
    const outcomes = [
      { active: [] as string[], classification: "full-interrupt", expectedHeal: 0, recovery: ROOTBOUND_REGROWTH_OUTCOMES.fullInterruptRecovery },
      { active: [connections[0]], classification: "partial-interrupt", expectedHeal: ROOTBOUND_REGROWTH_OUTCOMES.maximumHealFraction / 3,
        recovery: ROOTBOUND_REGROWTH_OUTCOMES.partialInterruptRecovery },
      { active: [...connections], classification: "no-interrupt", expectedHeal: ROOTBOUND_REGROWTH_OUTCOMES.maximumHealFraction,
        recovery: ROOTBOUND_REGROWTH_OUTCOMES.noInterruptRecovery },
    ] as const;
    for (const outcome of outcomes) {
      const classified = advanceRootboundRegrowth(
        beginRootboundRegrowth(createRootboundRegrowthState(), 0, connections),
        ROOTBOUND_REGROWTH_TIMING.channelTicks,
        new Set(outcome.active),
        false,
      );
      const resolved = resolveRootboundRegrowthOutcome(classified, 1);
      expect(resolved.state.interruptClassification).toBe(outcome.classification);
      expect(resolved.state.resolvedHealFraction).toBeCloseTo(outcome.expectedHeal, 8);
      expect(resolved.recoverySeconds).toBe(outcome.recovery);
      expect(resolved.resolvedHealFraction).toBeLessThanOrEqual(ROOTBOUND_REGROWTH_OUTCOMES.maximumHealFraction);
      expect(resolveRootboundRegrowthOutcome(resolved.state, 1)).toEqual(resolved);
    }
    expect(ROOTBOUND_REGROWTH_OUTCOMES.fullInterruptRecovery).toBeGreaterThan(ROOTBOUND_REGROWTH_OUTCOMES.partialInterruptRecovery);
    expect(ROOTBOUND_REGROWTH_OUTCOMES.partialInterruptRecovery).toBeGreaterThanOrEqual(0.55);
  });

  it("applies the bounded outcome once to production HP and recovery", () => {
    const harness = createEnemyHarness();
    const actor = new harness.types.Rootbound(CONFIG.view.w / 2, CONFIG.world.groundY - CONFIG.boss.h / 2) as InstanceType<
      ReturnType<typeof createEnemyHarness>["types"]["Rootbound"]
    > & {
      regrowthState: ReturnType<typeof createRootboundRegrowthState>;
      beginRegrowth(startTick: number, connectionIds: readonly string[]): boolean;
      advanceRegrowth(tick: number, activeConnectionIds: ReadonlySet<string>, bossChannelBroken?: boolean): ReturnType<typeof createRootboundRegrowthState>;
    };
    actor.hp = actor.maxHp * 0.2;
    actor.update(1 / 120, harness.platforms, harness.player, []);
    actor.cinematicRequest = null;
    actor.cinematicT = 0;
    actor.hp = actor.maxHp * 0.95;
    expect(actor.beginRegrowth(100, connections)).toBe(true);
    actor.advanceRegrowth(100 + ROOTBOUND_REGROWTH_TIMING.channelTicks, new Set(connections), false);
    expect(actor.hp).toBe(actor.maxHp);
    expect(actor.regrowthState).toMatchObject({ resolvedHealFraction: 0.05, interruptClassification: "no-interrupt" });
    expect(actor).toMatchObject({ phase: 3, state: "recover", stateT: ROOTBOUND_REGROWTH_OUTCOMES.noInterruptRecovery });
    const hp = actor.hp;
    actor.advanceRegrowth(1_000, new Set(), true);
    expect(actor.hp).toBe(hp);
  });
});
