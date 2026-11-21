import { describe, expect, it } from "vitest";

import { GhostReplayWorld, createPracticeFromHere, type GhostReplaySimulation } from "../../src/ghost/replay-world";
import { createGhostV3, type GhostReplayTrident } from "../../src/ghost/truth-kernel";
import { CODEC_REGISTRY } from "../../src/gameplay/snapshot/codec-ids";
import {
  captureCodecState,
  createDefaultStateCodecRegistry,
  type TearCodecWorld,
  type TearCodecValue,
} from "../../src/gameplay/snapshot/state-codec";
import type { TearCausalEventV1 } from "../../src/tearbench";
import type { TearSnapshotV1 } from "../../src/gameplay/snapshot/snapshot-contract";
import { stableVerificationHash } from "../../src/domain/hash";
import { INACTIVE_CINEMATIC_DIRECTOR_STATE_V1 } from "../../src/gameplay/runtime/cinematic-director";

const trident: GhostReplayTrident = {
  command: { kind: "command", status: "verified", available: true, resumable: true, seekable: false, reason: "test" },
  state: { kind: "state", status: "verified", available: true, resumable: true, seekable: true, reason: "test" },
  visual: { kind: "visual", status: "absent", available: false, resumable: false, seekable: false, reason: "test" },
};

function emptyWorld(): TearCodecWorld {
  const world = { components: new Map(), references: new Map(), entityIds: new Set(["player", "blade"]) };
  for (const id of CODEC_REGISTRY.ids) world.components.set(id, {});
  world.components.set("tear.player.v1", { id: "player", x: 5, y: 0, hp: 100, maxHp: 100 });
  world.components.set("tear.blade.v1", { id: "blade", ownerId: "player", weaponId: "sword" });
  world.components.set("tear.enemy.v1", []);
  world.components.set("tear.boss.v1", []);
  world.components.set("tear.projectile.v1", []);
  world.components.set("tear.platform.v1", []);
  world.components.set("tear.hazard.v1", { slowZones: [], walls: [] });
  world.components.set("tear.run.v1", {
    mode: "endless",
    difficulty: "normal",
    wave: 1,
    tick: 5,
    elapsedTicks: 5,
  });
  world.components.set("tear.world.v1", { clock: 5, identityState: {} });
  world.components.set("tear.ui.v1", { screen: "playing", focusId: "-1" });
  world.components.set("tear.reward.v1", { selection: null });
  world.components.set("tear.configuration.v1", { rulesetVersion: "rules", values: {} });
  world.components.set("tear.rng.v1", { combat: { algorithm: "mulberry32", state: 1 } });
  world.components.set("tear.cinematic.v1", INACTIVE_CINEMATIC_DIRECTOR_STATE_V1);
  return world;
}

const simulation: GhostReplaySimulation = {
  createWorld: emptyWorld,
  validateWorld: () => [],
  apply(world, envelope) {
    const player = structuredClone(world.components.get("tear.player.v1")) as { id: string; x: number; y: number };
    if (envelope.command.type === "move") player.x += envelope.command.x / 1_000;
    if (envelope.command.type === "dash") player.x += envelope.command.x / 100;
    world.components.set("tear.player.v1", player);
    const worldState = structuredClone(world.components.get("tear.world.v1")) as {
      clock: number;
      identityState: TearCodecValue;
      commandTrace?: string[];
    };
    worldState.commandTrace = [...(worldState.commandTrace ?? []), envelope.command.type];
    world.components.set("tear.world.v1", worldState);
  },
  advance(world, _fromTick, toTick) {
    const run = structuredClone(world.components.get("tear.run.v1")) as { elapsedTicks: number };
    run.elapsedTicks = toTick;
    world.components.set("tear.run.v1", run);
  },
  semanticProjection(world) {
    return {
      player: world.components.get("tear.player.v1"),
      run: world.components.get("tear.run.v1"),
    };
  },
};

function snapshot(): TearSnapshotV1 {
  const world = emptyWorld();
  const captured = captureCodecState(world, createDefaultStateCodecRegistry());
  return {
    format: "tear-contract",
    kind: "snapshot",
    schemaVersion: 1,
    id: "keyframe-5",
    tick: 5,
    stateClass: "recorded-canonical",
    seed: "1",
    hashes: {
      exact: "exact",
      semantic: stableVerificationHash(simulation.semanticProjection(world)),
      visual: "visual",
      progression: "progression",
      environment: "environment",
    },
    provenance: {
      actor: "developer",
      producer: "test",
      build: {
        version: "0.1.0",
        revision: "test",
        target: "unit",
        rulesetVersion: "rules",
        contentHash: "content",
        configHash: "config",
      },
      executionClass: "engineering",
      observationClass: "structured-state",
      trainingConsent: "no-training",
    },
    rng: {},
    codecs: captured.codecs,
    state: captured.state,
  };
}

function causalEvent(id: string, tick: number): TearCausalEventV1 {
  return {
    format: "tear-contract",
    kind: "event",
    schemaVersion: 1,
    id,
    type: "boss.attack-started",
    tick,
    phase: "enemy-ai",
    sequence: 1,
    source: "engine",
    payload: {},
  };
}

function ghost(id = "replay-fixture", eventTick = 20) {
  const keyframe = snapshot();
  return createGhostV3({
    id,
    rulesetVersion: "rules",
    sourceClassification: "native-v3",
    trident,
    actions: [
      { kind: "command", id: 1, tick: 10, command: { type: "move", x: 1_000, y: 0 } },
      { kind: "command", id: 2, tick: 20, command: { type: "dash", x: 1_000, y: 0 } },
    ],
    snapshots: [keyframe],
    events: [causalEvent(`${id}-attack`, eventTick)],
  });
}

function sameTickGhost() {
  return createGhostV3({
    ...ghost("same-tick-replay"),
    actions: [
      // The keyframe at tick 5 already includes this group.
      { kind: "command", id: 1, tick: 5, command: { type: "move", x: 1_000, y: 0 } },
      { kind: "command", id: 2, tick: 5, command: { type: "dash", x: 1_000, y: 0 } },
      { kind: "command", id: 3, tick: 10, command: { type: "move", x: 1_000, y: 0 } },
      { kind: "command", id: 4, tick: 10, command: { type: "dash", x: 1_000, y: 0 } },
    ],
  });
}

describe("Ghost replay world and practice", () => {
  it("produces equal semantic hashes for full playback and seek-to-tick", () => {
    const source = ghost();
    const full = new GhostReplayWorld(source, simulation).playFull(30);
    const seek = new GhostReplayWorld(source, simulation).seek(30);
    expect(seek.semanticHash).toBe(full.semanticHash);
    expect(seek).toMatchObject({ tick: 30, usedSnapshotId: "keyframe-5", presentationFallback: true });
    expect(seek.correction).toBeUndefined();
  });

  it("applies every command in a same-tick group once and keeps authored order across repeated seeks", () => {
    const source = sameTickGhost();
    const advances: [number, number][] = [];
    const replay = new GhostReplayWorld(source, {
      ...simulation,
      advance(world, fromTick, toTick) {
        advances.push([fromTick, toTick]);
        simulation.advance(world, fromTick, toTick);
      },
    });

    replay.seek(5);
    expect(replay.world().components.get("tear.player.v1")).toMatchObject({ x: 5 });
    expect(replay.world().components.get("tear.world.v1")).not.toHaveProperty("commandTrace");

    replay.seek(10);
    const firstWorld = replay.world();
    expect(firstWorld.components.get("tear.player.v1")).toMatchObject({ x: 16 });
    expect(firstWorld.components.get("tear.world.v1")).toMatchObject({ commandTrace: ["move", "dash"] });
    expect(advances.filter(([from, to]) => from === 5 && to === 10)).toHaveLength(1);

    replay.seek(10);
    const secondWorld = replay.world();
    expect(secondWorld.components.get("tear.player.v1")).toMatchObject({ x: 16 });
    expect(secondWorld.components.get("tear.world.v1")).toMatchObject({ commandTrace: ["move", "dash"] });
    expect(advances.filter(([from, to]) => from === 5 && to === 10)).toHaveLength(2);

    replay.seek(5);
    expect(replay.world().components.get("tear.player.v1")).toMatchObject({ x: 5 });
    expect(replay.world().components.get("tear.world.v1")).not.toHaveProperty("commandTrace");
  });

  it("skips a future group without discarding later authored commands before the seek target", () => {
    const source = sameTickGhost();
    const replay = new GhostReplayWorld(
      createGhostV3({
        ...source,
        actions: [{ kind: "command", id: 5, tick: 30, command: { type: "move", x: 99_000, y: 0 } }, ...source.actions],
      }),
      simulation,
    );

    replay.seek(10);
    expect(replay.world().components.get("tear.player.v1")).toMatchObject({ x: 16 });
    expect(replay.world().components.get("tear.world.v1")).toMatchObject({ commandTrace: ["move", "dash"] });
  });

  it("creates a safe unranked Practice From Here child without mutating its source", () => {
    const source = ghost();
    const before = JSON.stringify(source);
    const sourceSnapshot = source.snapshots[0];
    if (sourceSnapshot === undefined) throw new Error("fixture snapshot is missing");
    for (const mode of ["exact-practice", "repetition-drill", "counterfactual-sandbox", "race-practice"] as const) {
      const child = createPracticeFromHere(source, sourceSnapshot, mode);
      expect(child).toMatchObject({
        mode,
        rankedEligible: false,
        leaderboardEligible: false,
        lineage: { parentId: source.id, parentRootHash: source.rootHash, forkTick: 5 },
      });
    }
    expect(JSON.stringify(source)).toBe(before);
  });
});
