import { describe, expect, it } from "vitest";

import {
  GhostLensRegistry,
  GhostReplayWorld,
  GhostTheaterTransport,
  alignGhostsBySemanticEvent,
  createGhostV3,
  createPracticeFromHere,
  diffTrajectories,
  type GhostReplaySimulation,
  type GhostReplayTrident,
} from "../../src/ghost";
import {
  CODEC_REGISTRY,
  captureCodecState,
  createDefaultStateCodecRegistry,
  type TearCodecWorld,
  type TearCausalEventV1,
  type TearSnapshotV1,
} from "../../src/tearbench";
import { stableVerificationHash } from "../../src/replay/hash";

const trident: GhostReplayTrident = {
  command: { kind: "command", status: "verified", available: true, resumable: true, seekable: false, reason: "test" },
  state: { kind: "state", status: "verified", available: true, resumable: true, seekable: true, reason: "test" },
  visual: { kind: "visual", status: "absent", available: false, resumable: false, seekable: false, reason: "test" },
};

function emptyWorld(): TearCodecWorld {
  const world = { components: new Map(), references: new Map(), entityIds: new Set(["player", "blade"]) };
  for (const id of CODEC_REGISTRY.ids) world.components.set(id, {});
  world.components.set("tear.player.v1", { id: "player", x: 5, y: 0 });
  world.components.set("tear.run.v1", { elapsedTicks: 5 });
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
    format: "tear-contract", kind: "snapshot", schemaVersion: 1,
    id: "keyframe-5", tick: 5, stateClass: "recorded-canonical", seed: "1",
    hashes: {
      exact: "exact",
      semantic: stableVerificationHash(simulation.semanticProjection(world)),
      visual: "visual", progression: "progression", environment: "environment",
    },
    provenance: {
      actor: "developer", producer: "test",
      build: {
        version: "0.1.0", revision: "test", target: "unit", rulesetVersion: "rules",
        contentHash: "content", configHash: "config",
      },
      executionClass: "engineering", observationClass: "structured-state", trainingConsent: "no-training",
    },
    rng: {}, codecs: captured.codecs, state: captured.state,
  };
}

function causalEvent(id: string, tick: number): TearCausalEventV1 {
  return {
    format: "tear-contract", kind: "event", schemaVersion: 1,
    id, type: "boss.attack-started", tick, phase: "enemy-ai", sequence: 1,
    source: "engine", payload: {},
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

describe("Ghost replay world, Theater, and practice", () => {
  it("produces equal semantic hashes for full playback and seek-to-tick", () => {
    const source = ghost();
    const full = new GhostReplayWorld(source, simulation).playFull(30);
    const seek = new GhostReplayWorld(source, simulation).seek(30);
    expect(seek.semanticHash).toBe(full.semanticHash);
    expect(seek).toMatchObject({ tick: 30, usedSnapshotId: "keyframe-5", presentationFallback: true });
    expect(seek.correction).toBeUndefined();
  });

  it("creates a safe unranked Practice From Here child without mutating its source", () => {
    const source = ghost();
    const before = JSON.stringify(source);
    const sourceSnapshot = source.snapshots[0];
    if (sourceSnapshot === undefined) throw new Error("fixture snapshot is missing");
    for (const mode of [
      "exact-practice", "repetition-drill", "counterfactual-sandbox", "race-practice", "coach-assisted",
    ] as const) {
      const child = createPracticeFromHere(source, sourceSnapshot, mode);
      expect(child).toMatchObject({
        mode, rankedEligible: false, leaderboardEligible: false,
        lineage: { parentId: source.id, parentRootHash: source.rootHash, forkTick: 5 },
      });
    }
    expect(JSON.stringify(source)).toBe(before);
  });

  it("prevents public Theater from enabling a developer-only Lens", () => {
    const lenses = new GhostLensRegistry();
    lenses.register({ id: "public-events", visibility: "public", requiredTracks: ["state"], describe: () => ({}) });
    lenses.register({ id: "hitboxes", visibility: "developer", requiredTracks: ["state"], describe: () => ({}) });
    expect(lenses.available(ghost(), "public").map((lens) => lens.id)).toEqual(["public-events"]);
    expect(lenses.available(ghost(), "developer").map((lens) => lens.id)).toEqual(["public-events", "hitboxes"]);
  });

  it("supports Theater transport, semantic navigation, accessibility, and mobile layout", () => {
    const source = ghost();
    const theater = new GhostTheaterTransport(source.events, 390);
    theater.play();
    theater.speed(2);
    theater.camera("target");
    theater.accessibility(true, true);
    expect(theater.nextEvent("boss.attack-started")?.tick).toBe(20);
    expect(theater.state()).toMatchObject({
      playing: true, tick: 20, speed: 2, camera: "target",
      reducedMotion: true, highContrast: true, layout: "mobile",
    });
  });

  it("aligns nine runs by semantic event and computes trajectory differences", () => {
    const ghosts = Array.from({ length: 9 }, (_, index) => ghost(`run-${String(index)}`, 20 + index * 3));
    const aligned = alignGhostsBySemanticEvent(ghosts, "boss.attack-started");
    expect(aligned).toHaveLength(1);
    expect(Object.keys(aligned[0]?.ticksByGhost ?? {})).toHaveLength(9);
    expect(aligned[0]?.ticksByGhost["run-8"]).toBe(44);
    expect(diffTrajectories(
      [{ tick: 1, x: 0, y: 0 }, { tick: 2, x: 2, y: 0 }],
      [{ tick: 1, x: 3, y: 4 }, { tick: 2, x: 2, y: 0 }],
    )).toEqual([{ tick: 1, distance: 5 }, { tick: 2, distance: 0 }]);
  });
});
