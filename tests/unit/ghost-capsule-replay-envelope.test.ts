import { describe, expect, it } from "vitest";

import {
  GhostCapsuleReader,
  GhostLocalVault,
  GhostStreamingRecorder,
  createMemoryGhostVaultBackend,
  mapGhostCapsuleToReplayEnvelope,
} from "../../src/ghost";
import { stableVerificationHash } from "../../src/replay/hash";
import { INACTIVE_CINEMATIC_DIRECTOR_STATE_V1 } from "../../src/gameplay/runtime/cinematic-director";
import {
  CODEC_REGISTRY,
  captureCodecState,
  createDefaultStateCodecRegistry,
  type TearCodecWorld,
  type TearSnapshotV1,
} from "../../src/tearbench";

function world(): TearCodecWorld {
  const result: TearCodecWorld = { components: new Map(), references: new Map(), entityIds: new Set(["player", "blade"]) };
  for (const id of CODEC_REGISTRY.ids) result.components.set(id, {});
  result.components.set("tear.player.v1", { id: "player", x: 5, y: 0 });
  result.components.set("tear.run.v1", { elapsedTicks: 5 });
  result.components.set("tear.cinematic.v1", INACTIVE_CINEMATIC_DIRECTOR_STATE_V1 as never);
  return result;
}

function snapshot(): TearSnapshotV1 {
  const state = world();
  const captured = captureCodecState(state, createDefaultStateCodecRegistry());
  return {
    format: "tear-contract", kind: "snapshot", schemaVersion: 1,
    id: "capsule-keyframe-5", tick: 5, stateClass: "recorded-canonical", seed: "capsule-seed",
    hashes: {
      exact: stableVerificationHash({ exact: true }), semantic: stableVerificationHash({ semantic: true }),
      visual: stableVerificationHash({ visual: true }), progression: stableVerificationHash({ progression: true }),
      environment: stableVerificationHash({ environment: true }),
    },
    provenance: {
      actor: "human", producer: "ghost-v3-live-recorder",
      build: {
        version: "0.1.0", revision: "unit", target: "test-standalone", rulesetVersion: "rules-unit",
        contentHash: "content", configHash: "config",
      },
      executionClass: "engineering", observationClass: "structured-state", trainingConsent: "no-training",
    },
    rng: {}, codecs: captured.codecs, state: captured.state,
  };
}

describe("Ghost capsule replay mapping", () => {
  it("maps verified capsule bytes into strict unverified replay truth", async () => {
    const vault = new GhostLocalVault(createMemoryGhostVaultBackend());
    const recorder = new GhostStreamingRecorder({
      sessionId: "capsule-replay", createdAt: "2026-07-28T00:00:00.000Z", chunkEntries: 1, maxPendingWrites: 1, vault,
    });
    await recorder.start();
    await recorder.append({ kind: "commands", tick: 3, value: { kind: "command", id: 1, tick: 3, command: { type: "dash", x: 1_000, y: 0 } } });
    await recorder.append({ kind: "keyframes", tick: 5, value: snapshot() });
    await recorder.append({ kind: "keyframes", tick: 5, value: { player: { x: 5, y: 0 }, blade: { state: "held" } } });
    await recorder.append({ kind: "events", tick: 6, value: {
      format: "tear-contract", kind: "event", schemaVersion: 1, id: "capsule-event", type: "boss.attack-started",
      tick: 6, phase: "enemy-ai", sequence: 1, source: "engine", payload: {},
    } });
    await recorder.append({ kind: "presentation", tick: 7, value: { camera: "player" } });
    await recorder.finalize("2026-07-28T00:01:00.000Z");

    const capsule = await new GhostCapsuleReader(vault).read("capsule-replay");
    const mapped = mapGhostCapsuleToReplayEnvelope(capsule);
    expect(mapped.accepted).toEqual({ commands: 1, events: 1, snapshots: 1, visualSamples: 2 });
    expect(mapped.ghost.rulesetVersion).toBe("rules-unit");
    expect(mapped.ghost.trident).toMatchObject({
      command: { status: "declared-unverified", available: true, resumable: false },
      state: { status: "declared-unverified", available: true, seekable: true, resumable: false },
      visual: { status: "declared-unverified", available: true, seekable: true },
    });
    expect(mapped.ghost.snapshots[0]).toMatchObject({ id: "capsule-keyframe-5", tick: 5 });
    expect(mapped.issues).toHaveLength(1);
    expect(mapped.issues[0]).toMatchObject({ track: "keyframes", tick: 5 });
  });

  it("fails closed for a malformed command track while retaining independently restorable state", () => {
    const valid = snapshot();
    const mapped = mapGhostCapsuleToReplayEnvelope({
      manifest: {
        format: "tearghost-capsule", schemaVersion: 1, id: "malformed-command", status: "complete",
        createdAt: "2026-07-28T00:00:00.000Z", recordingProfile: "coaching", chunks: [], rootIntegrity: "root",
        fidelity: { presentation: "full", downgrades: [] },
      },
      tracks: {
        commands: [
          { kind: "commands", tick: 1, value: { kind: "command", id: 1, tick: 1, command: { type: "jump" } } },
          { kind: "commands", tick: 2, value: { kind: "command", id: 2, tick: 2, command: { type: "not-real" } } },
        ],
        keyframes: [{ kind: "keyframes", tick: 5, value: valid }], rng: [], events: [], results: [], presentation: [],
      },
      maxTick: 5,
    });
    expect(mapped.ghost.actions).toEqual([]);
    expect(mapped.ghost.trident.command).toMatchObject({ status: "absent", available: false });
    expect(mapped.ghost.trident.state).toMatchObject({ available: true, seekable: true });
    expect(mapped.issues.some((entry) => entry.track === "commands")).toBe(true);
  });
});
