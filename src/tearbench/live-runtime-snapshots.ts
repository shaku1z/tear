import { stableVerificationHash } from "../replay/hash";
import type { TearBuildIdentityV1, TearExecutionClass, TearObservationClass, TearProvenanceV1, TearSnapshotV1, TearStateClass } from "./contracts";
import { TEAR_CONTRACT_FORMAT, TEAR_CONTRACT_VERSION } from "./contracts";
import type { LiveTearRuntimeEnvironmentContext, TearRuntimeAccessClass } from "./live-runtime-contracts";
import { restoreSnapshotIntoLiveWorld, type TearLiveRestoreResult } from "./live-state-snapshot";
import { ENTITY_KIND_REGISTRY } from "./registries";
import { captureCodecState, createDefaultStateCodecRegistry, type TearStateCodecRegistry, type TearWorldFactory, type TearCodecWorld } from "./state-codecs";
import type { TearLiveWorldAdapter } from "./live-state-snapshot";

export interface LiveRuntimeSnapshotController {
  capture(id: string, stateClass?: TearStateClass): TearSnapshotV1;
  restore(snapshot: TearSnapshotV1): TearLiveRestoreResult;
}

export interface LiveStateForgeSnapshotCapture {
  readonly id: string;
  readonly tick: number;
  readonly stateClass: TearStateClass;
  readonly seed: string;
  readonly stateForge: Pick<TearLiveWorldAdapter<unknown>, "capture">;
  readonly world?: TearCodecWorld;
  readonly rng: Readonly<Record<string, Readonly<{ algorithm?: string; state?: number | string }>>>;
  readonly registry: TearStateCodecRegistry;
  readonly observationClass: TearObservationClass;
  readonly producer: string;
  readonly target: string;
  readonly contentHash: string;
  readonly visualHash: string;
  /**
   * The stable run/bootstrap build fields for a replayable recording.  The
   * configuration hash is deliberately derived from this individual keyframe:
   * upgrades can legally mutate configuration after the tick-zero bootstrap.
   */
  readonly staticBuild?: Omit<TearBuildIdentityV1, "configHash">;
  /** Optional integrity-protected bootstrap event that this keyframe extends. */
  readonly sourceId?: TearProvenanceV1["sourceId"];
  readonly actor?: TearProvenanceV1["actor"];
  readonly executionClass?: TearExecutionClass;
  readonly trainingConsent?: TearProvenanceV1["trainingConsent"];
}

/** Captures the same fully typed codec world used by State Forge restoration. */
export function captureLiveStateForgeSnapshot(input: LiveStateForgeSnapshotCapture): TearSnapshotV1 {
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(input.id)) throw new TypeError("snapshot id is invalid");
  const world = input.world ?? input.stateForge.capture();
  const captured = captureCodecState(world, input.registry);
  const configurationHash = stableVerificationHash(captured.state["tear.configuration.v1"]);
  const build = input.staticBuild === undefined
    ? Object.freeze({
      version: "0.1.0", revision: "working-tree", target: input.target, rulesetVersion: "live",
      contentHash: input.contentHash, configHash: configurationHash,
    })
    : Object.freeze({ ...input.staticBuild, configHash: configurationHash });
  if (input.staticBuild !== undefined && (input.target !== build.target || input.contentHash !== build.contentHash)) {
    throw new TypeError("snapshot target and content hash must agree with its supplied build fingerprint");
  }
  return Object.freeze({
    format: TEAR_CONTRACT_FORMAT, kind: "snapshot", schemaVersion: TEAR_CONTRACT_VERSION,
    id: input.id, tick: input.tick, stateClass: input.stateClass, seed: input.seed,
    hashes: Object.freeze({
      exact: stableVerificationHash(captured.state),
      semantic: stableVerificationHash(Object.fromEntries(input.registry.list().map((codec) =>
        [codec.id, codec.hashProjection(world)]))),
      visual: input.visualHash,
      progression: stableVerificationHash(captured.state["tear.run.v1"]),
      environment: stableVerificationHash(captured.state["tear.world.v1"]),
    }),
    provenance: Object.freeze({
      actor: input.actor ?? "state-forge", producer: input.producer,
      build,
      ...(input.sourceId === undefined ? {} : { sourceId: input.sourceId }),
      executionClass: input.executionClass ?? "engineering", observationClass: input.observationClass,
      trainingConsent: input.trainingConsent ?? "no-training",
    }),
    rng: Object.freeze(Object.fromEntries(Object.entries(input.rng).map(([name, value]) => [
      name, Object.freeze({ algorithm: value.algorithm ?? "mulberry32", state: String(value.state) }),
    ]))),
    codecs: captured.codecs,
    state: captured.state,
  });
}

export function createLiveRuntimeSnapshotController(
  context: LiveTearRuntimeEnvironmentContext,
  accessClass: Exclude<TearRuntimeAccessClass, "C">,
  onRestored: (snapshot: TearSnapshotV1, result: Extract<TearLiveRestoreResult, { ok: true }>) => void,
): LiveRuntimeSnapshotController {
  const registry = createDefaultStateCodecRegistry();
  const factory: TearWorldFactory = Object.freeze({
    createEmpty: () => ({ components: new Map(), references: new Map(), entityIds: new Set<string>() }),
    validate: (world: ReturnType<TearWorldFactory["createEmpty"]>) =>
      registry.list().every((codec) => world.components.has(codec.id))
      ? []
      : ["not all live codec components were restored"],
  });
  const controller: LiveRuntimeSnapshotController = {
    capture(id: string, stateClass: TearStateClass = "recorded-canonical") {
      const tick = context.authoritative()?.tick ?? 0;
      const world = context.stateForge.capture();
      return captureLiveStateForgeSnapshot({
        id, tick, stateClass, stateForge: context.stateForge, world, rng: context.random(), registry,
        seed: String(context.state.run()?.runSeed ?? "unknown"),
        observationClass: accessClass === "A" ? "privileged-diagnostic" : "structured-state",
        producer: "live-tear-runtime", target: "test-standalone", contentHash: stableVerificationHash(ENTITY_KIND_REGISTRY.ids),
        visualHash: stableVerificationHash(context.screenshot()),
      });
    },
    restore(snapshot: TearSnapshotV1) {
      const result = restoreSnapshotIntoLiveWorld(snapshot, registry, factory, context.stateForge);
      if (result.ok) onRestored(snapshot, result);
      return result;
    },
  };
  return Object.freeze(controller);
}
