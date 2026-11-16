import { describe, expect, it } from "vitest";
import { CONFIG } from "../../src/config/game-config";
import { createEnemyHarness } from "./enemy-test-harness";
import { bindVerdantEnvironmentActors } from "./environment-feature-fixture";
import { createEnvironmentRuntime } from "../../src/gameplay/environment/environment-runtime";
import { ROOTBOUND_REGROWTH_TIMING } from "../../src/gameplay/environment/regrowth-link";
import { BLOOM_WELL_TIMING, createBloomWellState } from "../../src/gameplay/environment/bloom-well";
import {
  ROOTBOUND_CANOPY_STEP,
  ROOTBOUND_ENCOUNTER,
  ROOTBOUND_PHASE_THREE_ATTACK_ORDER,
} from "../../src/gameplay/entities/enemy-types/rootbound";
import { createRootbinderState, severRootLink } from "../../src/gameplay/entities/rootbinder-runtime";
import {
  captureProductionReplayCheckpoint,
  createProductionGhostReplayComposition,
} from "../../src/tearbench/production-replay-composition";
import { compileResolvedTearSdlSnapshot } from "../../src/tearbench/state-forge-live-compiler";
import { forgeBloomWellCycleState } from "../../src/tearbench/state-forge-factories";
import { resolveTearSdl, type TearSdlDocumentV1 } from "../../src/tearbench/tearsdl";

type Harness = ReturnType<typeof createEnemyHarness>;
type Boss = InstanceType<Harness["types"]["Rootbound"]> & {
  phaseMarker: number;
  state: "intro" | "idle" | "recover";
  stateT: number;
  pendingAttack: string | null;
  lastSpringStage: string | null;
  lastSpringUseCount: number;
  canopyStepStage: string | null;
  regrowthState: Readonly<{ phase: string }>;
  beginRegrowth(startTick: number, connectionIds: readonly string[]): boolean;
  advanceRegrowth(tick: number, ids: ReadonlySet<string>, broken?: boolean): unknown;
  regrowthChannelBroken(): boolean;
  contactDamageEnabled(): boolean;
};

const connections = ["rootbound:regrowth:1", "rootbound:regrowth:2", "rootbound:regrowth:3"] as const;
const dt = 1 / 120;

function boss(harness: Harness): Boss {
  return new harness.types.Rootbound(CONFIG.view.w / 2, CONFIG.world.groundY - CONFIG.boss.h / 2);
}

function skipBeat(actor: Boss): void {
  actor.cinematicRequest = null;
  actor.cinematicT = 0;
}

function resolvedPhaseThree(harness: Harness): Boss {
  const actor = boss(harness);
  actor.hp = actor.maxHp * 0.2;
  actor.update(dt, harness.platforms, harness.player, []);
  skipBeat(actor);
  actor.beginRegrowth(0, connections);
  actor.advanceRegrowth(ROOTBOUND_REGROWTH_TIMING.channelTicks, new Set(), false);
  actor.state = "idle";
  actor.stateT = 0;
  return actor;
}

describe("Verdant gameplay regressions", () => {
  it("keeps attacking through Phase III and repeats Last Spring instead of idling forever", () => {
    const harness = createEnemyHarness();
    const actor = resolvedPhaseThree(harness);
    const started = new Set<string>();
    let idleRun = 0,
      longestIdle = 0;
    for (let tick = 0; tick < 120 * 40; tick += 1) {
      actor.update(dt, harness.platforms, harness.player, []);
      const verb = actor.atk.split(":")[0] ?? "";
      if (verb !== "unavailable" && !verb.startsWith("regrowth")) started.add(verb);
      idleRun = actor.atk === "unavailable" ? idleRun + 1 : 0;
      longestIdle = Math.max(longestIdle, idleRun);
    }
    expect([...started].sort()).toEqual([...new Set(ROOTBOUND_PHASE_THREE_ATTACK_ORDER)].sort());
    expect(actor.lastSpringUseCount).toBeGreaterThanOrEqual(3);
    expect(longestIdle / 120).toBeLessThan(2);
  });

  it("cannot be burst through a phase: Phase I stops short of Phase III and death waits for Phase III", () => {
    const harness = createEnemyHarness();
    const actor = boss(harness);
    actor.hit(actor.maxHp * 10, 1, 0);
    expect(actor.dying).toBe(false);
    expect(actor.hp / actor.maxHp).toBeGreaterThan(actor.phaseMarks[1]);
    actor.update(dt, harness.platforms, harness.player, []);
    expect(actor.phaseMarker).toBe(2);
    expect(actor.cinematicRequest).toMatchObject({ id: "rootbound-garden-remembers" });
    skipBeat(actor);
    actor.hitCd = 0;
    actor.hit(actor.maxHp * 10, 1, 0);
    expect(actor).toMatchObject({ dying: false, hp: 1 });
    actor.update(dt, harness.platforms, harness.player, []);
    expect(actor.phaseMarker).toBe(3);
    expect(actor.cinematicRequest).toMatchObject({ id: "rootbound-nothing-here-dies" });
  });

  it("cannot die while Regrowth channels, and enough hits during the channel break it", () => {
    const harness = createEnemyHarness();
    const actor = boss(harness);
    actor.hp = actor.maxHp * 0.2;
    actor.update(dt, harness.platforms, harness.player, []);
    skipBeat(actor);
    expect(actor.beginRegrowth(0, connections)).toBe(true);
    expect(actor.regrowthChannelBroken()).toBe(false);
    actor.hit(actor.maxHp * (ROOTBOUND_ENCOUNTER.regrowthBreakFraction / 2), 1, 0);
    expect(actor.regrowthChannelBroken()).toBe(false);
    actor.hitCd = 0;
    actor.hit(actor.maxHp * 10, 1, 0);
    expect(actor).toMatchObject({ dying: false, hp: 1 });
    expect(actor.regrowthChannelBroken()).toBe(true);
    actor.advanceRegrowth(1, new Set(connections), actor.regrowthChannelBroken());
    expect(actor.regrowthState.phase).toBe("resolved");
    actor.hitCd = 0;
    actor.hit(actor.maxHp * 10, 1, 0);
    expect(actor.dying).toBe(true);
  });

  it("does not deal contact damage during the opening beat after the intro", () => {
    const harness = createEnemyHarness();
    const actor = boss(harness);
    actor.introT = dt;
    actor.update(dt, harness.platforms, harness.player, []);
    actor.introT = 0;
    actor.update(dt, harness.platforms, harness.player, []);
    let firstContact = -1;
    for (let tick = 0; tick < 240 && firstContact < 0; tick += 1) {
      if (actor.contactDamageEnabled()) firstContact = tick;
      actor.update(dt, harness.platforms, harness.player, []);
    }
    expect(firstContact === -1 || firstContact / 120 >= ROOTBOUND_ENCOUNTER.openingContactGrace - dt * 2).toBe(true);
  });

  it("returns from a canopy platform to the floor beside the player", () => {
    const harness = createEnemyHarness();
    const actor = boss(harness);
    const ledge = harness.platforms[1];
    if (ledge === undefined) throw new Error("harness ledge missing");
    actor.x = ledge.x + ledge.w / 2;
    actor.y = ledge.y - actor.hh;
    actor.onGround = true;
    actor.state = "idle";
    actor.pendingAttack = "canopy-step";
    const pending = (): string | null => actor.pendingAttack;
    for (let tick = 0; tick < 240 && pending() !== null; tick += 1)
      actor.update(dt, harness.platforms, harness.player, []);
    expect(actor.pendingAttack).toBeNull();
    expect(actor.y).toBeCloseTo(CONFIG.world.groundY - actor.hh, 0);
    expect(Math.abs(Math.abs(actor.x - harness.player.x) - ROOTBOUND_CANOPY_STEP.floorStandoff)).toBeLessThan(1);
  });

  it("staggers a Rootbinder whose network is cut and does not relink it the next tick", () => {
    const runtime = createEnvironmentRuntime({ worldId: "world-a", stageId: "stage-1" });
    let state: "linked" | "broken" = "linked";
    let severs = 0;
    const root = createRootbinderState({ id: "enemy:binder", worldId: "world-a", stageId: "stage-1", x: 0, y: 0 });
    const ally = (id: string, x: number) => ({
      id,
      worldId: "world-a",
      stageId: "stage-1",
      kind: "ordinary" as const,
      x,
      y: 40,
      dead: false,
      dying: false,
    });
    bindVerdantEnvironmentActors(runtime, "rootbinder", () => [
      {
        id: root.id,
        state: { ...root, state, transitionTick: 1_000 },
        candidates: [ally("enemy:a", 40), ally("enemy:b", 60)],
        sever: () => {
          severs += 1;
          state = "broken";
        },
      },
    ]);
    runtime.step(1, dt, () => undefined);
    const links = runtime.combatObjects().filter((object) => object.kind === "root-link");
    expect(links).toHaveLength(2);
    for (const [index, link] of links.entries()) severRootLink(runtime, link.id, `cut-${String(index)}`, 2);
    runtime.step(2, dt, () => undefined);
    runtime.step(3, dt, () => undefined);
    expect(severs).toBe(1);
    expect(
      runtime.combatObjects().filter((object) => object.kind === "root-link" && object.state === "active"),
    ).toHaveLength(0);
  });

  it("never lets two Rootbinders link the same ally", () => {
    const runtime = createEnvironmentRuntime({ worldId: "world-a", stageId: "stage-1" });
    const shared = {
      id: "enemy:shared",
      worldId: "world-a",
      stageId: "stage-1",
      kind: "ordinary" as const,
      x: 50,
      y: 40,
      dead: false,
      dying: false,
    };
    const binder = (id: string, x: number) => {
      const root = createRootbinderState({ id, worldId: "world-a", stageId: "stage-1", x, y: 0 });
      const own = [`${id}:ally-1`, `${id}:ally-2`].map((allyId) => ({ ...shared, id: allyId, x: x + 30 }));
      return { id, state: { ...root, state: "linked" as const, transitionTick: 1_000 }, candidates: [shared, ...own] };
    };
    bindVerdantEnvironmentActors(runtime, "rootbinder", () => [binder("enemy:one", 0), binder("enemy:two", 100)]);
    runtime.step(1, dt, () => undefined);
    const targets = runtime
      .combatObjects()
      .filter((object) => object.kind === "root-link")
      .map((object) => (object as { targetId?: string }).targetId);
    expect(targets.length).toBeGreaterThanOrEqual(4);
    expect(targets.filter((target) => target === "enemy:shared")).toHaveLength(1);
  });

  it("applies Bloom lift in the production replay world, as live play does", () => {
    const source = createProductionGhostReplayComposition({ seed: "verdant-replay-lift", mode: "campaign" }).create(
      undefined,
    );
    const checkpoint = captureProductionReplayCheckpoint(source.replay, source.combat, source.waveReward, "lift");
    const base: TearSdlDocumentV1 = {
      format: "tearsdl",
      schemaVersion: 1,
      id: "verdant-replay-lift",
      stateClass: "surgical-valid",
      seed: "verdant-replay-lift",
      start: { mode: "campaign", difficulty: "normal", weapon: "sword" },
    };
    const player = source.replay.world.state.player() as { x: number; y: number };
    const well = createBloomWellState(
      {
        id: "lift-well",
        ownerId: "player",
        variant: "stage",
        geometry: { x: player.x - 100, y: player.y - 200, w: 200, h: 400 },
        patternId: "lift",
      },
      0,
    );
    const snapshot = compileResolvedTearSdlSnapshot(
      checkpoint.snapshot,
      resolveTearSdl(forgeBloomWellCycleState(base, well)),
    );
    const detached = createProductionGhostReplayComposition({ seed: "verdant-replay-lift", mode: "campaign" }).create(
      snapshot,
    );
    const live = detached.replay.world.state.player() as { x: number; y: number; vy: number };
    live.vy = 0;
    detached.replay.world.context.environment.step(BLOOM_WELL_TIMING.warningTicks + 1, dt, () => undefined);
    expect(live.vy).toBeLessThan(0);
  });
});
