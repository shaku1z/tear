import { describe, expect, it } from "vitest";

import {
  AURORA_TRACK_TRAVEL,
  assertAuroraTrackFieldState,
  createAuroraTrackFieldState,
  type AuroraTrackFieldState,
  type AuroraTrackVariant,
} from "../../src/gameplay/environment/aurora-track";
import {
  advanceAuroraTrack,
  applyAuroraTrackSpeed,
  auroraTrackSpeed,
  type AuroraTrackActor,
} from "../../src/gameplay/environment/aurora-track-runtime";
import { createEnvironmentRuntime } from "../../src/gameplay/environment/environment-runtime";
import { bindPaleEnvironmentActors } from "./environment-feature-fixture";
import { environmentHash } from "../../src/tearbench/environment-codec";
import { EnvelopeSequencer } from "../../src/domain/envelopes";
import { createProductionCombatSimulation, createProductionReplayWorld } from "../../src/tearbench";

type Actor = { -readonly [Key in keyof AuroraTrackActor]: AuroraTrackActor[Key] };

/** A road over x 0 to 100, y 0 to 40, running east, whose first cycle starts at tick 0: awake from 72 to 432. */
function track(variant: AuroraTrackVariant = "stage", startTick = 0): AuroraTrackFieldState {
  return createAuroraTrackFieldState({
    id: "aurora:stage:1",
    ownerId: "pale-traverse",
    variant,
    direction: 1,
    geometry: { x: 0, y: 0, w: 100, h: 40 },
    startTick,
  });
}
const AWAKE = 100;

function actor(id: string, kind: AuroraTrackActor["kind"], overrides: Partial<Actor> = {}): Actor {
  return { id, kind, x: 20, y: 20, vx: 100, intentX: 1, fieldSpeed: 1, ...overrides };
}

function speedOn(field: AuroraTrackFieldState, tick: number, subject: Actor): number {
  return auroraTrackSpeed(advanceAuroraTrack(field, tick, [subject]), subject);
}

describe("Aurora Track", () => {
  it("warns, wakes and sleeps on absolute ticks, and a stage road wakes again", () => {
    const at = (tick: number) => advanceAuroraTrack(track("stage", 300), tick, []).state;
    expect(at(0)).toBe("dormant");
    expect(at(299)).toBe("dormant");
    expect(at(300)).toBe("warning");
    expect(at(371)).toBe("warning");
    expect(at(372)).toBe("active");
    expect(at(731)).toBe("active");
    expect(at(732)).toBe("cooldown");
    expect(at(1_211)).toBe("cooldown");
    expect(at(1_212)).toBe("warning");
    expect(at(1_284)).toBe("active");
  });

  it("ends a boss's wake after its one cycle, for the environment to fade and remove", () => {
    const wake = track("boss-wake");
    expect(advanceAuroraTrack(wake, 371, []).state).toBe("active");
    expect(advanceAuroraTrack(wake, 372, [])).toMatchObject({ state: "expired", cleanupReason: "natural-expiry" });
    const ended = advanceAuroraTrack(wake, 372, []);
    expect(advanceAuroraTrack(ended, 400, [])).toBe(ended);
  });

  it("raises the top speed of someone travelling its way on it, and of nobody else", () => {
    const full = AURORA_TRACK_TRAVEL.topSpeed;
    expect(speedOn(track(), AWAKE, actor("player", "player"))).toBe(full);
    // Standing on it, meaning to go against it, moving against it, beside it, above it.
    expect(speedOn(track(), AWAKE, actor("player", "player", { intentX: 0, vx: 0 }))).toBe(1);
    expect(speedOn(track(), AWAKE, actor("player", "player", { intentX: -1, vx: -100 }))).toBe(1);
    expect(speedOn(track(), AWAKE, actor("player", "player", { intentX: 1, vx: -100 }))).toBe(1);
    expect(speedOn(track(), AWAKE, actor("player", "player", { x: 120 }))).toBe(1);
    expect(speedOn(track(), AWAKE, actor("player", "player", { y: -1 }))).toBe(1);
  });

  it("gives nothing while it warns or sleeps", () => {
    expect(speedOn(track(), 10, actor("player", "player"))).toBe(1);
    expect(speedOn(track(), 500, actor("player", "player"))).toBe(1);
  });

  it("carries each kind of actor by its share of the row, and leaves held and flying enemies alone", () => {
    const { topSpeed, targets } = AURORA_TRACK_TRAVEL;
    const speed = (kind: AuroraTrackActor["kind"], overrides: Partial<Actor> = {}) =>
      speedOn(track(), AWAKE, actor("subject", kind, overrides));
    expect(speed("player")).toBe(1 + (topSpeed - 1) * targets.player);
    expect(speed("light-enemy")).toBe(1 + (topSpeed - 1) * targets["light-enemy"]);
    expect(speed("heavy-enemy")).toBeCloseTo(1 + (topSpeed - 1) * targets["heavy-enemy"]);
    expect(speed("heavy-enemy")).toBeLessThan(speed("light-enemy"));
    expect(speed("boss")).toBe(1);
    expect(speed("light-enemy", { held: true })).toBe(1);
  });

  it("fades the raise over the carry after the road is left, and ends it at once on a stop or a turn", () => {
    const hero = actor("player", "player");
    let field = advanceAuroraTrack(track(), AWAKE, [hero]);
    hero.x = 140;
    const speeds: number[] = [];
    for (let tick = AWAKE + 1; tick <= AWAKE + AURORA_TRACK_TRAVEL.carryTicks; tick += 1) {
      field = advanceAuroraTrack(field, tick, [hero]);
      speeds.push(auroraTrackSpeed(field, hero));
    }
    expect(speeds[0]).toBeLessThan(AURORA_TRACK_TRAVEL.topSpeed);
    expect(speeds.every((speed, index) => index === 0 || speed < (speeds[index - 1] ?? 0))).toBe(true);
    expect(speeds.at(-1)).toBe(1);
    expect(field.carryStates).toEqual([]);

    const stopper = actor("player", "player");
    let stopped = advanceAuroraTrack(track(), AWAKE, [stopper]);
    stopper.x = 140;
    stopped = advanceAuroraTrack(stopped, AWAKE + 1, [stopper]);
    expect(auroraTrackSpeed(stopped, stopper)).toBeGreaterThan(1);
    stopper.intentX = 0;
    stopped = advanceAuroraTrack(stopped, AWAKE + 2, [stopper]);
    expect(auroraTrackSpeed(stopped, stopper)).toBe(1);
  });

  it("lets a carry run down when the road falls asleep under a traveller", () => {
    const hero = actor("player", "player");
    let field = advanceAuroraTrack(track(), 431, [hero]);
    expect(auroraTrackSpeed(field, hero)).toBe(AURORA_TRACK_TRAVEL.topSpeed);
    field = advanceAuroraTrack(field, 432, [hero]);
    expect(field.state).toBe("cooldown");
    expect(auroraTrackSpeed(field, hero)).toBeLessThan(AURORA_TRACK_TRAVEL.topSpeed);
    expect(auroraTrackSpeed(field, hero)).toBeGreaterThan(1);
  });

  it("sets each actor's speed to the most any road gives it, and back to 1 with none", () => {
    const hero = actor("player", "player");
    const bystander = actor("enemy:1", "light-enemy", { intentX: 0, vx: 0, fieldSpeed: 1.4 });
    const field = advanceAuroraTrack(track(), AWAKE, [hero, bystander]);
    applyAuroraTrackSpeed([field, track()], [hero, bystander]);
    expect(hero.fieldSpeed).toBe(AURORA_TRACK_TRAVEL.topSpeed);
    expect(bystander.fieldSpeed).toBe(1);
    applyAuroraTrackSpeed([], [hero]);
    expect(hero.fieldSpeed).toBe(1);
  });

  it("tells the actor it is carried, and whether it is on the road", () => {
    const seen: [number, boolean][] = [];
    const hound = actor("enemy:hound", "light-enemy", { onInfluenced: (direction, on) => seen.push([direction, on]) });
    const field = advanceAuroraTrack(track(), AWAKE, [hound]);
    hound.x = 140;
    advanceAuroraTrack(field, AWAKE + 1, [hound]);
    expect(seen).toEqual([
      [1, true],
      [1, false],
    ]);
  });

  it("restores a traveller's speed from the road's carry, isolates worlds, and clears the speed with the roads", () => {
    const hero = actor("player", "player");
    const first = createEnvironmentRuntime({
      stageId: "pale-traverse",
      worldId: "aurora-a",
      availableActorIds: () => new Set(["player"]),
    });
    bindPaleEnvironmentActors(first, "aurora-track", () => [hero]);
    first.addField(track());
    first.step(AWAKE, 1 / 120, () => undefined);
    expect(hero.fieldSpeed).toBe(AURORA_TRACK_TRAVEL.topSpeed);
    const snapshot = first.snapshot();
    const restoredField = snapshot.fields[0];
    if (restoredField === undefined) throw new Error("restored Aurora Track is missing");
    assertAuroraTrackFieldState(restoredField);
    expect(restoredField.carryStates).toEqual([{ actorId: "player", direction: 1, remainingTicks: 48 }]);

    const restoredHero = actor("player", "player");
    const second = createEnvironmentRuntime({
      stageId: "pale-traverse",
      worldId: "aurora-b",
      availableActorIds: () => new Set(["player"]),
    });
    bindPaleEnvironmentActors(second, "aurora-track", () => [restoredHero]);
    second.replace({ ...snapshot, worldId: "aurora-b" });
    expect(restoredHero.fieldSpeed).toBe(AURORA_TRACK_TRAVEL.topSpeed);
    expect(environmentHash(second.snapshot())).toBe(environmentHash(snapshot));
    first.step(AWAKE + 1, 1 / 120, () => undefined);
    second.step(AWAKE + 1, 1 / 120, () => undefined);
    expect(environmentHash(second.snapshot())).toBe(environmentHash(first.snapshot()));
    second.clear("retry");
    expect(second.snapshot().fields).toEqual([]);
    expect(restoredHero.fieldSpeed).toBe(1);
    expect(first.snapshot().fields).toHaveLength(1);
    expect(hero.fieldSpeed).toBe(AURORA_TRACK_TRAVEL.topSpeed);
  });

  it("prunes carry owned by actors that no longer exist without orphaning the stage-owned Track", () => {
    const runtime = createEnvironmentRuntime({
      stageId: "pale-traverse",
      worldId: "aurora-prune",
      availableActorIds: () => new Set<string>(),
    });
    runtime.addField(
      Object.freeze({
        ...track(),
        carryStates: Object.freeze([
          Object.freeze({ actorId: "despawned-enemy", direction: 1 as const, remainingTicks: 12 }),
        ]),
      }),
    );
    runtime.step(1, 1 / 120, () => undefined);
    const prunedField = runtime.snapshot().fields[0];
    if (prunedField === undefined) throw new Error("pruned Aurora Track is missing");
    assertAuroraTrackFieldState(prunedField);
    expect(prunedField.carryStates).toEqual([]);
  });

  it("fails closed on duplicate identities and on state that is not finite", () => {
    expect(() => advanceAuroraTrack(track(), 1, [actor("same", "player"), actor("same", "light-enemy")])).toThrow(
      /duplicate Aurora Track actor ID/u,
    );
    expect(() => advanceAuroraTrack(track(), 1, [actor("bad", "player", { vx: Number.NaN })])).toThrow(/finite state/u);
  });

  it("carries the player of the detached production combat world through the same binding", () => {
    const replay = createProductionReplayWorld({ seed: "pale-aurora-detached" });
    const core = createProductionCombatSimulation<{ tick: number }>(replay, { snapshot: (tick) => ({ tick }) });
    const environment = replay.world.context.environment;
    environment.setStage("pale-traverse", "restore");
    environment.addField(
      createAuroraTrackFieldState({
        id: "detached-track",
        ownerId: "pale-traverse",
        variant: "stage",
        direction: 1,
        geometry: { x: 0, y: 620, w: 1600, h: 220 },
        startTick: 0,
      }),
    );
    core.simulationRuntime.reset(0);
    const sequence = new EnvelopeSequencer();
    const player = replay.world.state.player() as never as { fieldSpeed: number };
    for (let tick = 1; tick <= 80; tick += 1)
      core.simulationRuntime.advanceOne([sequence.command(tick, { type: "move", x: 1_000, y: 0 })]);
    expect(player.fieldSpeed).toBe(AURORA_TRACK_TRAVEL.topSpeed);
    const field = environment.snapshot().fields[0];
    if (field === undefined) throw new Error("the detached Aurora Track is missing");
    assertAuroraTrackFieldState(field);
    expect(field.carryStates).toEqual([{ actorId: "player", direction: 1, remainingTicks: 48 }]);
  });
});
