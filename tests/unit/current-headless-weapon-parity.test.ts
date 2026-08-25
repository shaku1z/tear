import { describe, expect, it } from "vitest";

import type { CommandEnvelope } from "../../src/domain/envelopes";
import { GhostProductionReplayWorld, createGhostV3, type GhostReplayTrident } from "../../src/ghost";
import type { GameAction } from "../../src/input/game-action";
import { TearGameplayEventBus, type TearGameplayEvent } from "../../src/gameplay/runtime/gameplay-events";
import { WEAPON_IDS, type WeaponId } from "../../src/gameplay/weapon-selection";
import { projectGameplayEventForParity } from "../../src/tearbench/gameplay-causal-events";
import {
  CANONICAL_ENGINEERING_SCENARIOS,
  createProductionGhostReplayComposition,
  createProductionHeadlessEnvironment,
  forgeExitLaunchSnapshot,
  type TearCausalEventV1,
  type TearObservationV1,
} from "../../src/tearbench";

const REPLAY_TRIDENT: GhostReplayTrident = {
  command: { kind: "command", status: "verified", available: true, resumable: true, seekable: false,
    reason: "source-owned headless semantic command trace" },
  state: { kind: "state", status: "verified", available: true, resumable: true, seekable: true,
    reason: "source-owned lawful State Forge checkpoint" },
  visual: { kind: "visual", status: "absent", available: false, resumable: false, seekable: false,
    reason: "ordinary headless execution has no renderer" },
};

function canonicalWeaponScenario(weaponId: WeaponId) {
  const matching = CANONICAL_ENGINEERING_SCENARIOS.filter((scenario) =>
    scenario.subject.kind === "weapon" && scenario.subject.id === weaponId);
  if (matching.length !== 1 || matching[0]?.backends.includes("headless") !== true) {
    throw new RangeError(`current ${weaponId} requires exactly one supported production-headless scenario`);
  }
  return matching[0];
}

function exerciseCurrentHeadlessWeapon(weaponId: WeaponId) {
  const scenario = canonicalWeaponScenario(weaponId);
  const environment = createProductionHeadlessEnvironment({ captureSourceTracks: true });
  const startupEvents: TearCausalEventV1[] = [];
  try {
    environment.reset(scenario);
    for (let tick = 0; tick < 120 && !startupEvents.some((event) => event.type === "enemy.spawned"); tick += 1) {
      startupEvents.push(...environment.step([]).events ?? []);
    }
    if (!startupEvents.some((event) => event.type === "enemy.spawned")) {
      throw new Error(`current ${weaponId} headless run did not naturally spawn a production actor`);
    }

    const source = environment.captureCheckpoint();
    const forgedSnapshot = forgeExitLaunchSnapshot(source.snapshot, {
      id: `current-headless-${weaponId}-overlap`, kind: "one-frame-boundary",
      boundary: "overlap", position: "at", ticks: 0,
    });
    environment.restoreStateForgeEvaluation({ source, forgedSnapshot });
    const opening = environment.policyObservation();
    const target = opening.entities.find((entity) => entity.kind !== "projectile");
    if (target === undefined) throw new Error(`current ${weaponId} headless overlap lost its production actor`);
    const angle = Math.atan2(target.y - opening.blade.handY, target.x - opening.blade.handX);
    const targetTurn = Math.round((((angle / (Math.PI * 2)) % 1 + 1) % 1) * 1_000_000) % 1_000_000;
    const observations: TearObservationV1[] = [];
    const events: TearCausalEventV1[] = [];
    const commands: CommandEnvelope<GameAction>[] = [];
    let nextCommandId = source.checkpoint.nextCommandId;
    let terminal = environment.restoreStateForgeEvaluation({ source, forgedSnapshot });
    for (let tick = 0; tick < 120; tick += 1) {
      const actions: GameAction[] = tick === 0
        ? [{ type: "aim", turn: weaponId === "hammer" ? 462_000
          : weaponId === "chainblade" ? targetTurn : 0, magnitude: 1_000 },
          { type: "weapon", intent: weaponId === "riftlock" ? "primary" : "throw", phase: "pressed" }]
        : tick === 15 && weaponId !== "riftlock"
          ? [{ type: "weapon", intent: "recall", phase: "pressed" }]
          : [];
      commands.push(...actions.map((command) => Object.freeze({
        kind: "command" as const, id: ++nextCommandId, tick: forgedSnapshot.tick + tick + 1, command,
      })));
      const transition = environment.step(actions);
      terminal = transition.observation;
      events.push(...transition.events ?? []);
      observations.push(environment.policyObservation());
      if (weaponId === "riftlock") {
        if (observations.at(-1)?.entities.some((entity) => entity.kind === "projectile"
          && entity.ownerId === "player" && entity.state?.startsWith("weaponProjectile"))) break;
      } else if (events.some((event) => event.type === "blade.caught")) break;
    }
    const replayEvents: TearGameplayEvent[] = [];
    const replayClock: { current: () => number } = { current: () => forgedSnapshot.tick };
    const gameplayEvents = new TearGameplayEventBus(() => replayClock.current());
    gameplayEvents.subscribe((event) => { replayEvents.push(event); });
    const ghost = createGhostV3({ id: `current-headless-${weaponId}-independent-ghost`,
      rulesetVersion: forgedSnapshot.provenance.build.rulesetVersion,
      sourceClassification: "native-v3", trident: REPLAY_TRIDENT, actions: commands,
      snapshots: [forgedSnapshot], events: [] });
    const replay = new GhostProductionReplayWorld(ghost, createProductionGhostReplayComposition({
      seed: forgedSnapshot.seed, weaponId,
      inputSnapshots: new Map([[forgedSnapshot.tick, source.input]]), gameplayEvents,
    }));
    replayClock.current = () => replay.simulation()?.scheduler.tick ?? forgedSnapshot.tick;
    const replayResult = replay.seek(terminal.tick);
    return { opening, observations, events, startupEvents,
      nativeEvents: environment.sourceTracks().nativeEvents,
      replayEvents, replayResult, replayTerminal: replay.simulation()?.lastResult?.state, terminal };
  } finally {
    environment.dispose();
  }
}

describe("source-owned ordinary headless current-weapon parity", () => {
  it.each(WEAPON_IDS)("executes the actual %s scenario through bounded semantic headless input", (weaponId) => {
    const result = exerciseCurrentHeadlessWeapon(weaponId);
    expect(result.opening.run.weapon).toBe(weaponId);
    expect(result.startupEvents.map((event) => event.type))
      .toEqual(expect.arrayContaining(["run.started", "enemy.spawned"]));
    expect(result.replayTerminal, `${weaponId} independently replayed authoritative state`)
      .toEqual(result.terminal);
    expect(result.replayResult.tick).toBe(result.terminal.tick);
    expect(result.replayEvents, `${weaponId} independently replayed native gameplay facts`)
      .toEqual(result.nativeEvents);
    expect(result.replayEvents.map(projectGameplayEventForParity), `${weaponId} independently replayed causal projection`)
      .toEqual(result.events.map((event) => ({
        tick: event.tick, sequence: event.sequence, type: event.type, phase: event.phase,
        ...(event.actorId === undefined ? {} : { actorId: event.actorId }), payload: event.payload,
      })));
    expect(result.nativeEvents.map(projectGameplayEventForParity)).toEqual(result.events.map((event) => ({
      tick: event.tick, sequence: event.sequence, type: event.type, phase: event.phase,
      ...(event.actorId === undefined ? {} : { actorId: event.actorId }), payload: event.payload,
    })));
    if (weaponId === "riftlock") {
      expect(result.opening.blade.chambers).toBeGreaterThan(0);
      expect(result.observations.some((observation) =>
        (observation.blade.chambers ?? Number.POSITIVE_INFINITY) < (result.opening.blade.chambers ?? 0)))
        .toBe(true);
      expect(result.observations.some((observation) => observation.player.vx !== result.opening.player.vx)).toBe(true);
      expect(result.observations.some((observation) => observation.entities.some((entity) =>
        entity.kind === "projectile" && entity.ownerId === "player"
        && entity.state?.startsWith("weaponProjectile")))).toBe(true);
      expect(result.events.map((event) => event.type)).toContain("projectile.spawned");
      return;
    }
    expect(result.observations.some((observation) => observation.blade.state !== "held"), weaponId).toBe(true);
    expect(result.events.map((event) => event.type), weaponId)
      .toEqual(expect.arrayContaining(["blade.thrown", "blade.caught"]));
    expect(result.events.filter((event) => event.type.startsWith("blade."))
      .every((event) => event.payload.weaponId === weaponId), weaponId).toBe(true);
    if (weaponId === "hammer") {
      expect(result.events.map((event) => event.type)).toContain("blade.throw-resolved");
      const original = result.opening.entities.find((entity) => entity.kind !== "projectile");
      expect(result.observations.some((observation) => observation.entities.some((entity) =>
        entity.id === original?.id && (entity.hpRatio ?? 1) < (original.hpRatio ?? 0)
        && (entity.stun ?? 0) > 0))).toBe(true);
      expect(result.terminal.enemies.every((enemy) => Number.isFinite(enemy.hp))).toBe(true);
    }
    if (weaponId === "greatsword") {
      expect(result.observations.some((observation) => Math.abs(observation.blade.wheelSpin ?? 0) > 0)).toBe(true);
    }
    if (weaponId === "chainblade") {
      const samples = result.observations.slice(0, 8).map((observation) => ({
        tick: observation.tick, blade: observation.blade, enemies: observation.entities,
      }));
      expect(result.observations.map((observation) => observation.blade.state), JSON.stringify(samples))
        .toContain("hooked");
      expect(result.observations.some((observation) => observation.entities.some((entity) =>
        entity.kind !== "projectile" && (entity.bound ?? 0) > 0))).toBe(true);
      expect(result.observations.at(-1)?.blade.state).toBe("held");
    }
  });

  it("fails closed when a scenario only resets and never exercises its declared weapon", () => {
    const scenario = canonicalWeaponScenario("sword");
    const environment = createProductionHeadlessEnvironment();
    try {
      environment.reset(scenario);
      const transition = environment.step([{ type: "move", x: 1_000, y: 0 }]);
      expect((transition.events ?? []).some((event) => event.type === "blade.thrown")).toBe(false);
      expect(environment.policyObservation().blade.state).toBe("held");
    } finally {
      environment.dispose();
    }
  });
});
