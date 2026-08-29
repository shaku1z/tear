import { describe, expect, it } from "vitest";

import { createAuroraTrackFieldState, type AuroraTrackFieldState } from "../../src/gameplay/environment/aurora-track";
import { advanceAuroraTrack, type AuroraTransportActor, type AuroraTransportKind } from "../../src/gameplay/environment/aurora-track-runtime";
import { createEnvironmentRuntime } from "../../src/gameplay/environment/environment-runtime";
import { environmentHash } from "../../src/tearbench/environment-codec";
import { EnvelopeSequencer } from "../../src/domain/envelopes";
import { createProductionCombatSimulation, createProductionReplayWorld } from "../../src/tearbench";

function track(state: "warning" | "active" | "cooldown" = "active"): AuroraTrackFieldState {
  return Object.freeze({ ...createAuroraTrackFieldState({ id: "aurora:stage:1", ownerId: "pale-traverse", variant: "stage",
    direction: 1, geometry: { x: 0, y: 0, w: 100, h: 40 }, startTick: 0 }), state, stateTick: 0 });
}

function actor(id: string, kind: AuroraTransportKind, overrides: Partial<AuroraTransportActor> = {}): AuroraTransportActor {
  return { id, kind, x: 20, y: 20, vx: 100, intentX: 1, normalAcceleration: 600, maximumSpeed: 300, ...overrides };
}

function simulate(renderHz: 30 | 60 | 144): Readonly<{ vx: number; hash: string }> {
  const field = track();
  const hero = actor("player", "player");
  let current = field;
  let accumulator = 0;
  let tick = 0;
  const renderSeconds = 1 / renderHz;
  while (tick < 120) {
    accumulator += renderSeconds;
    while (accumulator + 1e-12 >= 1 / 120 && tick < 120) {
      tick += 1;
      current = advanceAuroraTrack(current, tick, 1 / 120, [hero]).field;
      accumulator -= 1 / 120;
    }
  }
  return Object.freeze({ vx: hero.vx, hash: environmentHash({ stageId: "pale-traverse", fields: [current], combatObjects: [], routes: [] }) });
}

describe("Pale Aurora fixed-step runtime", () => {
  it("advances warning, active, cooldown, and warning on exact authored ticks", () => {
    const warning = track("warning");
    expect(advanceAuroraTrack(warning, 71, 1 / 120, []).field.state).toBe("warning");
    const active = advanceAuroraTrack(warning, 72, 1 / 120, []).field;
    expect(active).toMatchObject({ state: "active", stateTick: 72 });
    const cooldown = advanceAuroraTrack(active, 432, 1 / 120, []).field;
    expect(cooldown).toMatchObject({ state: "cooldown", stateTick: 432 });
    expect(advanceAuroraTrack(cooldown, 911, 1 / 120, []).field.state).toBe("cooldown");
    expect(advanceAuroraTrack(cooldown, 912, 1 / 120, []).field).toMatchObject({ state: "warning", stateTick: 912 });
  });

  it("amplifies intentional same-direction movement without moving idle or opposing actors", () => {
    const moving = actor("moving", "player");
    const idle = actor("idle", "player", { vx: 0, intentX: 0 });
    const opposing = actor("opposing", "player", { vx: -100, intentX: -1 });
    const result = advanceAuroraTrack(track(), 1, 1 / 120, [moving, idle, opposing]);
    expect(moving.vx).toBeGreaterThan(100);
    expect(idle.vx).toBe(0);
    expect(opposing.vx).toBe(-100);
    expect(result.influencedActorIds).toEqual(["moving"]);
  });

  it("reduces heavy influence and carries eligible momentum for a bounded exit window", () => {
    const light = actor("light", "light-enemy");
    const heavy = actor("heavy", "heavy-enemy");
    const first = advanceAuroraTrack(track(), 1, 1 / 120, [light, heavy]);
    expect(light.vx - 100).toBeGreaterThan(heavy.vx - 100);
    const exiting = actor("light", "light-enemy", { x: 140, vx: light.vx });
    const carried = advanceAuroraTrack(first.field, 2, 1 / 120, [exiting]);
    expect(exiting.vx).toBeGreaterThan(light.vx);
    expect(carried.field.carryStates).toEqual([{ actorId: "light", direction: 1, remainingTicks: 47 }]);
  });

  it("uses one eligibility path for thrown blade, deflected projectile, and boss charge", () => {
    const actors = [actor("blade", "thrown-blade"), actor("shot", "deflected-projectile"), actor("hart-charge", "boss-charge")];
    const result = advanceAuroraTrack(track(), 1, 1 / 120, actors);
    expect(result.influencedActorIds).toEqual(["blade", "hart-charge", "shot"]);
    expect(actors.every((entry) => entry.vx > 100)).toBe(true);
  });

  it("is render-rate independent at the authoritative 120 Hz step", () => {
    expect(simulate(30)).toEqual(simulate(60));
    expect(simulate(60)).toEqual(simulate(144));
  });

  it("restores carry state, isolates worlds, and clears all track state through lifecycle cleanup", () => {
    const hero = actor("player", "player");
    const first = createEnvironmentRuntime({ stageId: "pale-traverse", worldId: "aurora-a", auroraTrackActors: () => [hero],
      availableActorIds: () => new Set(["player", "blade"]) });
    first.addField(track());
    first.step(1, 1 / 120, () => undefined);
    const snapshot = first.snapshot();
    expect(snapshot.fields[0]?.carryStates).toEqual([{ actorId: "player", direction: 1, remainingTicks: 48 }]);
    const restoredHero = actor("player", "player", { vx: hero.vx });
    const second = createEnvironmentRuntime({ stageId: "pale-traverse", worldId: "aurora-b",
      auroraTrackActors: () => [restoredHero], availableActorIds: () => new Set(["player", "blade"]) });
    second.replace({ ...snapshot, worldId: "aurora-b" });
    expect(environmentHash(second.snapshot())).toBe(environmentHash(snapshot));
    first.step(2, 1 / 120, () => undefined);
    second.step(2, 1 / 120, () => undefined);
    expect(restoredHero.vx).toBe(hero.vx);
    expect(environmentHash(second.snapshot())).toBe(environmentHash(first.snapshot()));
    second.clear("retry");
    expect(second.snapshot().fields).toEqual([]);
    expect(first.snapshot().fields).toHaveLength(1);
  });

  it("prunes carry owned by actors that no longer exist without orphaning the stage-owned Track", () => {
    const runtime = createEnvironmentRuntime({ stageId: "pale-traverse", worldId: "aurora-prune",
      availableActorIds: () => new Set(["blade"]) });
    runtime.addField(Object.freeze({ ...track(), carryStates: Object.freeze([
      Object.freeze({ actorId: "despawned-enemy", direction: 1 as const, remainingTicks: 12 }),
    ]) }));
    runtime.step(1, 1 / 120, () => undefined);
    expect(runtime.snapshot().fields).toHaveLength(1);
    expect(runtime.snapshot().fields[0]?.carryStates).toEqual([]);
  });

  it("fails closed on duplicate transport identities", () => {
    expect(() => advanceAuroraTrack(track(), 1, 1 / 120, [actor("same", "player"), actor("same", "light-enemy")]))
      .toThrow(/duplicate Aurora transport actor ID/u);
  });

  it("bounds added velocity without erasing velocity authored above the Track cap", () => {
    const capped = actor("capped", "player", { vx: 134, maximumSpeed: 100 });
    const external = actor("external", "player", { vx: 500, maximumSpeed: 100 });
    advanceAuroraTrack(track(), 1, 1 / 120, [capped, external]);
    expect(capped.vx).toBe(135);
    expect(external.vx).toBe(500);
    expect(() => advanceAuroraTrack(track(), 1, 1 / 120, [actor("invalid", "player", { maximumSpeed: 0 })]))
      .toThrow(/finite state/u);
  });

  it("uses the same Aurora source port in the detached production combat world", () => {
    const run = (withTrack: boolean) => {
      const replay = createProductionReplayWorld({ seed: "pale-aurora-detached" });
      const core = createProductionCombatSimulation<{ tick: number }>(replay, { snapshot: (tick) => ({ tick }) });
      const environment = replay.world.context.environment;
      environment.setStage("pale-traverse", "restore");
      if (withTrack) environment.addField(Object.freeze({ ...createAuroraTrackFieldState({ id: "detached-track",
        ownerId: "pale-traverse", variant: "stage", direction: 1,
        geometry: { x: 0, y: 620, w: 1600, h: 220 }, startTick: 0 }), state: "active" as const }));
      core.simulationRuntime.reset(0);
      const sequence = new EnvelopeSequencer();
      core.simulationRuntime.advanceOne([sequence.command(1, { type: "move", x: 1_000, y: 0 })]);
      const player = replay.world.state.player() as never as { vx: number };
      return { vx: player.vx, environment: environment.snapshot() };
    };
    const baseline = run(false);
    const influenced = run(true);
    expect(influenced.vx).toBeGreaterThan(baseline.vx);
    expect(influenced.environment.fields[0]?.carryStates).toEqual([{ actorId: "player", direction: 1, remainingTicks: 48 }]);
  });
});
