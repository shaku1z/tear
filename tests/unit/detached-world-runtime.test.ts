import { describe, expect, it } from "vitest";
import { INACTIVE_CINEMATIC_DIRECTOR_STATE_V1 } from "../../src/gameplay/runtime/cinematic-director";

import { EnvelopeSequencer, type CommandEnvelope } from "../../src/domain/envelopes";
import { TearGameplayEventBus } from "../../src/gameplay/runtime/gameplay-events";
import type { GameAction } from "../../src/input/game-action";
import {
  hydrateTearCodecWorld,
  TearHydratedWorldRuntime,
  type TearCodecId,
  type TearCodecValue,
  type TearCodecWorld,
  type TearStagedWorld,
  type TearWorldConstructionPort,
  type TearWorldHydrationContext,
} from "../../src/tearbench";

interface FixturePlayer extends Record<string, unknown> {
  kind: "player";
  x: number;
  y: number;
  direction: number;
  dash: boolean;
  primaryTicks: number;
  currentTick: number;
}

interface FixtureBlade extends Record<string, unknown> {
  kind: "blade";
  primary: boolean;
}

interface FixtureRun extends Record<string, unknown> {
  tick: number;
  mods: Record<string, unknown>;
}

interface FixtureEnemy extends Record<string, unknown> {
  kind: "enemy";
}

interface FixtureProjectile extends Record<string, unknown> {
  kind: "projectile";
}

type FixtureData = Record<string, unknown>;
type FixtureWorld = TearStagedWorld<
  FixtureRun,
  FixturePlayer,
  FixtureBlade,
  FixtureEnemy,
  FixtureProjectile,
  null,
  FixtureData,
  FixtureData,
  FixtureData,
  FixtureData,
  FixtureData,
  FixtureData,
  FixtureData
>;

interface FixtureSnapshot {
  readonly tick: number;
  readonly x: number;
  readonly primaryTicks: number;
  readonly primaryHeld: boolean;
}

function codecWorld(tick = 0): TearCodecWorld {
  const components = new Map<TearCodecId, TearCodecValue>();
  components.set("tear.player.v1", { id: "player", x: 0, y: 0, hp: 100, maxHp: 100 });
  components.set("tear.blade.v1", { id: "blade", ownerId: "player", weaponId: "sword", x: 0, y: 0 });
  components.set("tear.run.v1", { mode: "endless", stage: 0, tick, mods: {}, player: { $ref: "player" }, blade: { $ref: "blade" } });
  components.set("tear.world.v1", { clock: tick, floaters: [], ghost: { recording: null }, identityState: {}, runtime: {} });
  components.set("tear.enemy.v1", []);
  components.set("tear.boss.v1", []);
  components.set("tear.projectile.v1", []);
  components.set("tear.platform.v1", []);
  components.set("tear.hazard.v1", { slowZones: [], walls: [] });
  components.set("tear.ui.v1", { screen: "playing", focusId: "-1" });
  components.set("tear.reward.v1", { selection: null });
  components.set("tear.configuration.v1", { rulesetVersion: "fixture", values: {} });
  components.set("tear.rng.v1", {});
  components.set("tear.cinematic.v1", INACTIVE_CINEMATIC_DIRECTOR_STATE_V1 as never);
  return { components, references: new Map(), entityIds: new Set(["player", "blade"]) };
}

const constructionPort: TearWorldConstructionPort<
  FixtureRun,
  FixturePlayer,
  FixtureBlade,
  FixtureEnemy,
  FixtureProjectile,
  null
> = {
  createPlayer: (x, y) => ({ kind: "player", x, y, direction: 0, dash: false, primaryTicks: 0, currentTick: 0 }),
  createBlade: () => ({ kind: "blade", primary: false }),
  createEnemy: () => { throw new Error("fixture should not construct enemies"); },
  createProjectile: () => { throw new Error("fixture should not construct projectiles"); },
  hydrateReward: () => null,
};

const hydrationContext: TearWorldHydrationContext = {
  requireIdentity(id) {
    if (id !== "player" && id !== "blade") throw new RangeError(`unknown fixture identity: ${id}`);
    return { id };
  },
};

function hydrateWorld(tick = 0): FixtureWorld {
  return hydrateTearCodecWorld<
    FixtureRun,
    FixturePlayer,
    FixtureBlade,
    FixtureEnemy,
    FixtureProjectile,
    null,
    FixtureData,
    FixtureData,
    FixtureData,
    FixtureData,
    FixtureData,
    FixtureData,
    FixtureData
  >(constructionPort, codecWorld(tick), hydrationContext);
}

function actionsByTick(): ReadonlyMap<number, readonly CommandEnvelope<GameAction>[]> {
  const sequencer = new EnvelopeSequencer();
  const actions = [
    sequencer.command(2, { type: "move", x: 1_000, y: 0 } as const),
    sequencer.command(15, { type: "weapon", intent: "primary", phase: "pressed" } as const),
    sequencer.command(30, { type: "dash", x: 1_000, y: 0 } as const),
    sequencer.command(45, { type: "weapon", intent: "primary", phase: "released" } as const),
    sequencer.command(50, { type: "move", x: 0, y: 0 } as const),
  ];
  const grouped = new Map<number, CommandEnvelope<GameAction>[]>();
  for (const action of actions) grouped.set(action.tick, [...(grouped.get(action.tick) ?? []), action]);
  return grouped;
}

function createRuntime(world: FixtureWorld): Readonly<{
  runtime: TearHydratedWorldRuntime<FixtureWorld, FixtureSnapshot>;
  order: string[];
  eventTicks: number[];
}> {
  const order: string[] = [];
  const eventTicks: number[] = [];
  let eventTick = world.tick;
  const events = new TearGameplayEventBus(() => eventTick);
  events.subscribe((event) => { eventTicks.push(event.tick); });
  const runtime = new TearHydratedWorldRuntime(world, {
    applyCanonicalInput(current, input, tick) {
      order.push(`apply:${String(tick)}`);
      eventTick = tick;
      current.player.direction = (input.right() ? 1 : 0) - (input.left() ? 1 : 0);
      current.player.dash = input.dashPressed();
      current.player.currentTick = tick;
      current.blade.primary = input.primaryHeld;
    },
    step(current, seconds) {
      order.push(`step:${String(current.player.currentTick)}`);
      current.player.x += current.player.direction * 420 * seconds;
      if (current.player.dash) current.player.x += 80;
      if (current.blade.primary) current.player.primaryTicks += 1;
      if (current.player.currentTick % 20 === 0) {
        events.emit({ kind: "effect", effect: "fixture-beat", x: current.player.x, y: current.player.y });
      }
    },
    snapshot(current, tick, input) {
      order.push(`snapshot:${String(tick)}`);
      return Object.freeze({
        tick,
        x: Math.round(current.player.x * 1_000),
        primaryTicks: current.player.primaryTicks,
        primaryHeld: input.primaryHeld,
      });
    },
  }, { ticksPerSecond: 60, events });
  return Object.freeze({ runtime, order, eventTicks });
}

function runAtRenderRate(renderRate: number): Readonly<{
  state: FixtureSnapshot;
  stateHash: string;
  eventTicks: readonly number[];
  order: readonly string[];
}> {
  const run = createRuntime(hydrateWorld());
  const actions = actionsByTick();
  for (let frame = 0; frame < renderRate; frame += 1) {
    run.runtime.advance(1_000 / renderRate, (tick) => actions.get(tick) ?? []);
  }
  const result = run.runtime.simulation.lastResult;
  if (result === null) throw new Error("fixture runtime did not advance");
  return Object.freeze({ state: result.state, stateHash: result.stateHash,
    eventTicks: Object.freeze([...run.eventTicks]), order: Object.freeze([...run.order]) });
}

describe("detached hydrated-world runtime", () => {
  it("routes hydrated worlds through the shared canonical action, event, and hash lifecycle", () => {
    const live = runAtRenderRate(60);
    expect(live).toMatchObject({ state: { tick: 60 }, eventTicks: [20, 40, 60] });
    expect(live.order.slice(0, 3)).toEqual(["apply:1", "step:1", "snapshot:1"]);

    for (const renderRate of [30, 144]) {
      const candidate = runAtRenderRate(renderRate);
      expect(candidate.state).toEqual(live.state);
      expect(candidate.stateHash).toBe(live.stateHash);
      expect(candidate.eventTicks).toEqual(live.eventTicks);
      expect(candidate.order).toEqual(live.order);
    }

    const exact = createRuntime(hydrateWorld());
    const actions = actionsByTick();
    for (let tick = 1; tick <= 60; tick += 1) exact.runtime.advanceOne(actions.get(tick) ?? []);
    expect(exact.runtime.simulation.lastResult?.state).toEqual(live.state);
    expect(exact.runtime.simulation.lastResult?.stateHash).toBe(live.stateHash);
    expect(exact.eventTicks).toEqual(live.eventTicks);
    expect(exact.order).toEqual(live.order);
  });

  it("replaces only fully hydrated worlds and clears held and edge input state", () => {
    const first = hydrateWorld(7);
    const run = createRuntime(first);
    const sequencer = new EnvelopeSequencer();
    run.runtime.advanceOne([
      sequencer.command(8, { type: "move", x: 1_000, y: 0 }),
      sequencer.command(8, { type: "weapon", intent: "primary", phase: "pressed" }),
    ]);
    const firstX = first.player.x;
    expect(firstX).toBeGreaterThan(0);
    expect(first.blade.primary).toBe(true);

    const second = hydrateWorld(100);
    run.runtime.replace(second);
    expect(run.runtime.world()).toBe(second);
    expect(run.runtime.simulation.scheduler.tick).toBe(100);
    expect(run.runtime.simulation.input.snapshot().primaryHeld).toBe(false);
    run.runtime.advanceOne([]);

    expect(second.player.x).toBe(0);
    expect(second.blade.primary).toBe(false);
    expect(first.player.x).toBe(firstX);
    expect(first.blade.primary).toBe(true);
  });
});
