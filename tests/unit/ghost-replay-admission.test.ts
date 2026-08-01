import { describe, expect, it } from "vitest";

import {
  GhostCapsuleReader,
  GhostLocalVault,
  GhostStreamingRecorder,
  createLiveGhostBootstrapEvent,
  createMemoryGhostVaultBackend,
  ghostLiveBootstrapEventId,
} from "../../src/ghost";
import { stableVerificationHash } from "../../src/replay/hash";
import { INACTIVE_CINEMATIC_DIRECTOR_STATE_V1 } from "../../src/gameplay/runtime/cinematic-director";
import {
  CODEC_REGISTRY,
  captureCodecState,
  createDefaultStateCodecRegistry,
  type TearCodecId,
  type TearCodecValue,
  type TearCausalEventV1,
  type TearCodecWorld,
  type TearSnapshotV1,
  validateTearContract,
} from "../../src/tearbench";
import {
  GHOST_REPLAY_CONTEXT_FORMAT,
  GHOST_REPLAY_CONTEXT_PROVENANCE_KEY,
  GHOST_REPLAY_CONTEXT_SCHEMA_VERSION,
  GhostReplayRuntimeRegistry,
  assessGhostReplayAdmission,
  createGhostReplayRunContext,
  ghostReplayContextFingerprint,
  readGhostReplayRunContext,
  type GhostReplayBuildFingerprint,
  type GhostReplayRunContextInput,
} from "../../src/ghost/replay-admission";

const CONFIGURATION = Object.freeze({ rulesetVersion: "rules-unit", values: { gravity: 1 } });
const BUILD: GhostReplayBuildFingerprint = Object.freeze({
  version: "0.1.0",
  revision: "unit-revision",
  target: "test-standalone",
  rulesetVersion: "rules-unit",
  contentHash: "content-unit",
  configHash: stableVerificationHash(CONFIGURATION),
});

function replayContextInput(overrides: Partial<GhostReplayRunContextInput> = {}): GhostReplayRunContextInput {
  return {
    runId: "replay-admission-run",
    seed: "replay-admission-seed",
    mode: "endless",
    difficulty: "normal",
    weaponId: "sword",
    ticksPerSecond: 120,
    build: BUILD,
    rng: {
      gameplay: { algorithm: "mulberry32", seed: 7, state: 11, cursor: 0 },
      encounter: { state: "17", cursor: 3 },
    },
    ...overrides,
  };
}

function bootstrapSnapshot(context: ReturnType<typeof createGhostReplayRunContext>): TearSnapshotV1 {
  const world: TearCodecWorld = {
    components: new Map<TearCodecId, TearCodecValue>(), references: new Map(), entityIds: new Set(),
  };
  for (const id of CODEC_REGISTRY.ids) world.components.set(id, {});
  world.components.set("tear.configuration.v1", CONFIGURATION);
  world.components.set("tear.cinematic.v1", INACTIVE_CINEMATIC_DIRECTOR_STATE_V1 as never);
  world.components.set("tear.rng.v1", Object.freeze(Object.fromEntries(Object.entries(context.rng).map(([name, value]) => [name,
    Object.freeze({ algorithm: value.algorithm, ...(value.seed === undefined ? {} : { seed: value.seed }), state: value.state,
      ...(value.cursor === undefined ? {} : { cursor: value.cursor }) }),
  ]))));
  const captured = captureCodecState(world, createDefaultStateCodecRegistry());
  const snapshot: TearSnapshotV1 = Object.freeze({
    format: "tear-contract", kind: "snapshot", schemaVersion: 1,
    id: "replay-admission-bootstrap", tick: 0, stateClass: "recorded-canonical", seed: context.run.seed,
    hashes: {
      exact: stableVerificationHash(captured.state), semantic: stableVerificationHash(captured.state),
      visual: stableVerificationHash({ visual: "unit" }), progression: stableVerificationHash(captured.state["tear.run.v1"]),
      environment: stableVerificationHash(captured.state["tear.world.v1"]),
    },
    provenance: {
      actor: "human" as const, producer: "ghost-replay-admission-test", build: context.build,
      sourceId: ghostLiveBootstrapEventId("replay-admission-run"),
      executionClass: "engineering" as const, observationClass: "structured-state" as const, trainingConsent: "no-training" as const,
    },
    rng: Object.freeze(Object.fromEntries(Object.entries(context.rng).map(([name, value]) => [name,
      Object.freeze({ algorithm: value.algorithm, state: value.state })]))),
    codecs: captured.codecs, state: captured.state,
  });
  const validation = validateTearContract(snapshot);
  if (!validation.ok) throw new TypeError(validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
  return snapshot;
}

async function completeCapsule(provenance: Readonly<Record<string, unknown>>) {
  const context = readGhostReplayRunContext(provenance);
  if (context === undefined) throw new TypeError("test capsule requires a valid replay context");
  const vault = new GhostLocalVault(createMemoryGhostVaultBackend());
  const recorder = new GhostStreamingRecorder({
    sessionId: "replay-admission-run",
    createdAt: "2026-07-30T00:00:00.000Z",
    chunkEntries: 1,
    maxPendingWrites: 1,
    vault,
    provenance,
  });
  await recorder.start();
  await recorder.append({ kind: "events", tick: 0, value: createLiveGhostBootstrapEvent("replay-admission-run", provenance) });
  await recorder.append({ kind: "keyframes", tick: 0, value: bootstrapSnapshot(context) });
  await recorder.append({ kind: "commands", tick: 1, value: { command: { type: "jump", phase: "pressed" } } });
  await recorder.finalize("2026-07-30T00:00:01.000Z");
  return new GhostCapsuleReader(vault).read("replay-admission-run");
}

describe("Ghost V3 replay admission", () => {
  it("creates an immutable, canonical 120 Hz bootstrap context", () => {
    const context = createGhostReplayRunContext({
      ...replayContextInput(),
      seed: 42,
      rng: {
        gameplay: { state: 11, seed: 7, cursor: 0 },
        encounter: { algorithm: "xoroshiro128", state: "17", cursor: 3 },
      },
    });

    expect(context).toMatchObject({
      format: GHOST_REPLAY_CONTEXT_FORMAT,
      schemaVersion: GHOST_REPLAY_CONTEXT_SCHEMA_VERSION,
      run: {
        id: "replay-admission-run", seed: "42", mode: "endless", difficulty: "normal", weaponId: "sword",
      },
      simulation: { ticksPerSecond: 120, initialState: "seeded-run-start" },
      build: BUILD,
      rng: {
        encounter: { algorithm: "xoroshiro128", state: "17", cursor: 3 },
        gameplay: { algorithm: "mulberry32", seed: "7", state: "11", cursor: 0 },
      },
    });
    expect(Object.keys(context.rng)).toEqual(["encounter", "gameplay"]);
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.run)).toBe(true);
    expect(Object.isFrozen(context.rng.gameplay)).toBe(true);

    expect(() => createGhostReplayRunContext({ ...replayContextInput(), ticksPerSecond: 60 })).toThrow(/must be 120/u);
    expect(() => createGhostReplayRunContext({ ...replayContextInput(), rng: {} })).toThrow(/named streams/u);
  });

  it("reads only a complete valid context from the reserved provenance field", () => {
    const context = createGhostReplayRunContext(replayContextInput());
    expect(readGhostReplayRunContext({ [GHOST_REPLAY_CONTEXT_PROVENANCE_KEY]: context })).toEqual(context);
    expect(readGhostReplayRunContext({ seed: "legacy-seed", mode: "endless" })).toBeUndefined();
    expect(readGhostReplayRunContext({
      [GHOST_REPLAY_CONTEXT_PROVENANCE_KEY]: { ...context, schemaVersion: 2 },
    })).toBeUndefined();
    expect(ghostReplayContextFingerprint(context)).toBe(ghostReplayContextFingerprint(structuredClone(context)));
    expect(readGhostReplayRunContext({
      [GHOST_REPLAY_CONTEXT_PROVENANCE_KEY]: {
        ...context,
        simulation: { ...context.simulation, ticksPerSecond: 60 },
      },
    })).toBeUndefined();
  });

  it("keeps a real complete capsule unavailable until a detached runtime is registered", async () => {
    const context = createGhostReplayRunContext(replayContextInput());
    const capsule = await completeCapsule({ [GHOST_REPLAY_CONTEXT_PROVENANCE_KEY]: context });

    const admission = assessGhostReplayAdmission(capsule);
    expect(admission).toMatchObject({
      status: "unavailable",
      context,
      reason: "no compatible detached replay runtime is registered for this capsule fingerprint",
    });
  });

  it("admits only an exact registered runtime fingerprint", async () => {
    const context = createGhostReplayRunContext(replayContextInput());
    const capsule = await completeCapsule({ [GHOST_REPLAY_CONTEXT_PROVENANCE_KEY]: context });
    const registry = new GhostReplayRuntimeRegistry();
    registry.register({ id: "detached-unit-runtime", ticksPerSecond: 120, build: context.build });

    expect(assessGhostReplayAdmission(capsule, registry)).toMatchObject({
      status: "compatible",
      runtimeId: "detached-unit-runtime",
      context,
    });

    const mismatch = new GhostReplayRuntimeRegistry();
    mismatch.register({
      id: "wrong-revision-runtime",
      ticksPerSecond: 120,
      build: { ...context.build, revision: "other-revision" },
    });
    expect(assessGhostReplayAdmission(capsule, mismatch)).toMatchObject({ status: "unavailable" });
  });

  it("fails closed for incomplete, tampered, or context-less capsules", async () => {
    const context = createGhostReplayRunContext(replayContextInput());
    const capsule = await completeCapsule({ [GHOST_REPLAY_CONTEXT_PROVENANCE_KEY]: context });

    const incomplete = assessGhostReplayAdmission({
      ...capsule,
      manifest: { ...capsule.manifest, status: "recording" },
    });
    expect(incomplete.status).toBe("rejected");
    if (incomplete.status === "rejected") expect(incomplete.reason).toMatch(/status recording/u);

    const tampered = assessGhostReplayAdmission({
      ...capsule,
      manifest: { ...capsule.manifest, rootIntegrity: "tampered-root" },
    });
    expect(tampered.status).toBe("rejected");
    if (tampered.status === "rejected") expect(tampered.reason).toMatch(/root integrity/u);

    const invalidContext = assessGhostReplayAdmission({
      ...capsule,
      manifest: {
        ...capsule.manifest,
        provenance: { [GHOST_REPLAY_CONTEXT_PROVENANCE_KEY]: { ...context, format: "legacy-context" } },
      },
    });
    expect(invalidContext.status).toBe("rejected");
    if (invalidContext.status === "rejected") {
      expect(invalidContext.reason).toMatch(/lacks a valid immutable replay bootstrap context/u);
    }
  });

  it("fails closed when a claimed replay bootstrap is not sealed to its keyframes", async () => {
    const context = createGhostReplayRunContext(replayContextInput());
    const capsule = await completeCapsule({ [GHOST_REPLAY_CONTEXT_PROVENANCE_KEY]: context });
    const snapshotEntry = capsule.tracks.keyframes[0];
    const bootstrapEntry = capsule.tracks.events[0];
    if (snapshotEntry === undefined || bootstrapEntry === undefined) throw new Error("test fixture lost bootstrap evidence");
    const snapshot = snapshotEntry.value as TearSnapshotV1;
    const bootstrap = bootstrapEntry.value as TearCausalEventV1;

    const wrongSource = assessGhostReplayAdmission({
      ...capsule,
      tracks: {
        ...capsule.tracks,
        keyframes: [{ ...snapshotEntry, value: {
          ...snapshot,
          provenance: { ...snapshot.provenance, sourceId: "other-bootstrap" },
        } }],
      },
    });
    expect(wrongSource).toMatchObject({ status: "rejected" });
    if (wrongSource.status === "rejected") expect(wrongSource.reason).toMatch(/does not cite/u);

    const mismatchedContext = assessGhostReplayAdmission({
      ...capsule,
      tracks: {
        ...capsule.tracks,
        events: [{ ...bootstrapEntry, value: {
          ...bootstrap,
          payload: { ...bootstrap.payload, provenance: {
            ...(bootstrap.payload.provenance as Record<string, unknown>),
            [GHOST_REPLAY_CONTEXT_PROVENANCE_KEY]: {
              ...context, run: { ...context.run, seed: "other-seed" },
            },
          } },
        } }],
      },
    });
    expect(mismatchedContext).toMatchObject({ status: "rejected" });
    if (mismatchedContext.status === "rejected") expect(mismatchedContext.reason).toMatch(/does not match/u);

    const duplicateTickZero = assessGhostReplayAdmission({
      ...capsule,
      tracks: {
        ...capsule.tracks,
        keyframes: [...capsule.tracks.keyframes, {
          ...snapshotEntry, value: { ...snapshot, id: "replay-admission-bootstrap-copy" },
        }],
      },
    });
    expect(duplicateTickZero).toMatchObject({ status: "rejected" });
    if (duplicateTickZero.status === "rejected") expect(duplicateTickZero.reason).toMatch(/exactly one.*tick-zero/u);

    const staleConfigHash = assessGhostReplayAdmission({
      ...capsule,
      tracks: {
        ...capsule.tracks,
        keyframes: [{ ...snapshotEntry, value: {
          ...snapshot,
          provenance: { ...snapshot.provenance, build: {
            ...snapshot.provenance.build, configHash: "stale-config-hash",
          } },
        } }],
      },
    });
    expect(staleConfigHash).toMatchObject({ status: "rejected" });
    if (staleConfigHash.status === "rejected") expect(staleConfigHash.reason).toMatch(/configuration hash/u);
  });
});
