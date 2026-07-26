import { stableVerificationHash } from "../replay/hash";
import type { TearSnapshotV1, TearStateClass } from "./contracts";
import { TEAR_CONTRACT_FORMAT, TEAR_CONTRACT_VERSION } from "./contracts";
import type { LiveTearRuntimeEnvironmentContext, TearRuntimeAccessClass } from "./live-runtime-contracts";
import { restoreSnapshotIntoLiveWorld, type TearLiveRestoreResult } from "./live-state-snapshot";
import { ENTITY_KIND_REGISTRY } from "./registries";
import { captureCodecState, createDefaultStateCodecRegistry, type TearWorldFactory } from "./state-codecs";

export interface LiveRuntimeSnapshotController {
  capture(id: string, stateClass?: TearStateClass): TearSnapshotV1;
  restore(snapshot: TearSnapshotV1): TearLiveRestoreResult;
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
      if (!/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(id)) throw new TypeError("snapshot id is invalid");
      const world = context.stateForge.capture();
      const captured = captureCodecState(world, registry);
      const rng = context.random();
      return Object.freeze({
        format: TEAR_CONTRACT_FORMAT, kind: "snapshot", schemaVersion: TEAR_CONTRACT_VERSION,
        id, tick: context.authoritative()?.tick ?? 0, stateClass,
        seed: String(context.state.run()?.runSeed ?? "unknown"),
        hashes: Object.freeze({
          exact: stableVerificationHash(captured.state),
          semantic: stableVerificationHash(Object.fromEntries(registry.list().map((codec) =>
            [codec.id, codec.hashProjection(world)]))),
          visual: stableVerificationHash(context.screenshot()),
          progression: stableVerificationHash(captured.state["tear.run.v1"]),
          environment: stableVerificationHash(captured.state["tear.world.v1"]),
        }),
        provenance: Object.freeze({
          actor: "state-forge", producer: "live-tear-runtime",
          build: Object.freeze({
            version: "0.1.0", revision: "working-tree", target: "test-standalone", rulesetVersion: "live",
            contentHash: stableVerificationHash(ENTITY_KIND_REGISTRY.ids),
            configHash: stableVerificationHash(captured.state["tear.configuration.v1"]),
          }),
          executionClass: "engineering",
          observationClass: accessClass === "A" ? "privileged-diagnostic" : "structured-state",
          trainingConsent: "no-training",
        }),
        rng: Object.freeze(Object.fromEntries(Object.entries(rng).map(([name, value]) => [
          name, Object.freeze({ algorithm: value.algorithm ?? "mulberry32", state: String(value.state) }),
        ]))),
        codecs: captured.codecs,
        state: captured.state,
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
