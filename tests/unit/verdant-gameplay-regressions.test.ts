import { describe, expect, it } from "vitest";
import { CONFIG } from "../../src/config/game-config";
import { createEnemyHarness } from "./enemy-test-harness";
import { ROOTBOUND_REGROWTH_TIMING } from "../../src/gameplay/environment/regrowth-link";
import { BLOOM_WELL_TIMING, createBloomWellState } from "../../src/gameplay/environment/bloom-well";
import { ROOTBOUND_HEALING } from "../../src/gameplay/entities/enemy-types/rootbound";
import { ROOTBOUND_MOVES } from "../../src/gameplay/entities/enemy-types/rootbound-moves";
import {
  captureProductionReplayCheckpoint,
  createProductionGhostReplayComposition,
} from "../../src/app/world/detached/replay-composition";
import { compileResolvedTearSdlSnapshot } from "../../src/tearbench/state-setup-live-compiler";
import { buildBloomWellCycleState } from "../../src/tearbench/state-setup-factories";
import { resolveTearSdl, type TearSdlDocumentV1 } from "../../src/tearbench/tearsdl";

type Harness = ReturnType<typeof createEnemyHarness>;
type Boss = InstanceType<Harness["types"]["Rootbound"]> & {
  phaseMarker: number;
  state: "intro" | "idle" | "recover";
  stateT: number;
  lastSpringUseCount: number;
  regrowthCalled: boolean;
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
  actor.update(dt, harness.platforms, harness.player);
  skipBeat(actor);
  actor.regrowthCalled = true;
  actor.beginRegrowth(0, connections);
  actor.advanceRegrowth(ROOTBOUND_REGROWTH_TIMING.channelTicks, new Set(), false);
  actor.state = "idle";
  actor.stateT = 0;
  return actor;
}

describe("Verdant gameplay regressions", () => {
  it("keeps attacking through Phase III and repeats Last Spring instead of idling forever", () => {
    // Varied draws, so every move gets its turn rather than whichever one a fixed draw always lands on.
    const harness = createEnemyHarness([0.15, 0.85, 0.5, 0.35, 0.65, 0.95, 0.05]);
    const actor = resolvedPhaseThree(harness);
    const started = new Set<string>();
    let idleRun = 0,
      longestIdle = 0;
    for (let tick = 0; tick < 120 * 40; tick += 1) {
      // Every 4 s the player steps to the far side, so the ranged moves get their turn as well.
      if (tick % 480 === 0) harness.player.x = actor.x < CONFIG.view.w / 2 ? CONFIG.view.w - 200 : 200;
      actor.update(dt, harness.platforms, harness.player);
      const verb = actor.atk.split(":")[0] ?? "";
      if (verb !== "unavailable" && verb !== "exposed" && !verb.startsWith("regrowth")) started.add(verb);
      idleRun = actor.atk === "unavailable" ? idleRun + 1 : 0;
      longestIdle = Math.max(longestIdle, idleRun);
    }
    // Every Phase III move but Regrowth, which is played once and is already over here.
    const phaseThreeMoves = ROOTBOUND_MOVES.attacks
      .filter((move) => move.phases.includes(3) && move.id !== "regrowth")
      .map((move) => move.id);
    expect([...started].sort()).toEqual([...phaseThreeMoves].sort());
    expect(actor.lastSpringUseCount).toBeGreaterThanOrEqual(3);
    expect(longestIdle / 120).toBeLessThan(2);
  });

  it("cannot be burst through a phase: Phase I stops short of Phase III and death waits for Phase III", () => {
    const harness = createEnemyHarness();
    const actor = boss(harness);
    actor.hit(actor.maxHp * 10, 1, 0);
    expect(actor.dying).toBe(false);
    expect(actor.hp / actor.maxHp).toBeGreaterThan(actor.phaseMarks[1]);
    actor.update(dt, harness.platforms, harness.player);
    expect(actor.phaseMarker).toBe(2);
    expect(actor.cinematicRequest).toMatchObject({ id: "rootbound-garden-remembers" });
    skipBeat(actor);
    actor.hitCd = 0;
    actor.hit(actor.maxHp * 10, 1, 0);
    expect(actor).toMatchObject({ dying: false, hp: 1 });
    actor.update(dt, harness.platforms, harness.player);
    expect(actor.phaseMarker).toBe(3);
    expect(actor.cinematicRequest).toMatchObject({ id: "rootbound-nothing-here-dies" });
  });

  it("cannot die while Regrowth channels, and enough hits during the channel break it", () => {
    const harness = createEnemyHarness();
    const actor = boss(harness);
    actor.hp = actor.maxHp * 0.2;
    actor.update(dt, harness.platforms, harness.player);
    skipBeat(actor);
    actor.regrowthCalled = true;
    expect(actor.beginRegrowth(0, connections)).toBe(true);
    expect(actor.regrowthChannelBroken()).toBe(false);
    actor.hit(actor.maxHp * (ROOTBOUND_HEALING.regrowthBreak / 2), 1, 0);
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

  it("never deals contact damage: its body blocks, and not while it is burrowed", () => {
    const harness = createEnemyHarness();
    const actor = boss(harness);
    actor.introT = 0;
    let blocked = 0;
    let burrowedBlocks = 0;
    for (let tick = 0; tick < 120 * 30; tick += 1) {
      actor.update(dt, harness.platforms, harness.player);
      expect(actor.contactDamageEnabled()).toBe(false);
      if (actor.bodyBlocks()) blocked += 1;
      if (actor.hidden && actor.bodyBlocks()) burrowedBlocks += 1;
    }
    expect(blocked).toBeGreaterThan(0);
    expect(burrowedBlocks).toBe(0);
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
      resolveTearSdl(buildBloomWellCycleState(base, well)),
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
