import { createGameplayCausalEvent } from "../tearbench/gameplay-causal-events";
import type { ProductionHeadlessAcademyIntakeItem } from "../tearbench/production-headless-academy-intake";
import { GHOST_REPLAY_CONTEXT_PROVENANCE_KEY, GhostStreamingRecorder, createGhostReplayRunContext } from "../ghost";
import type { GhostLocalVault } from "../ghost";
import type { ProductionReplayBootstrap } from "../tearbench/production-replay-composition";
import { captureAcademyCandidateTracks } from "./academy-candidate-tracks";
import {
  attestAcademyCandidateSource,
  createAcademyCandidateTerminalAnchor,
  type TearAcademyCandidateSourceAttestationV1,
} from "./academy-candidate-source-attestation";

export interface TearAcademyCandidateCapsuleMaterializationRequest {
  readonly vault: GhostLocalVault;
  readonly capsuleId: string;
  readonly createdAt: string;
  readonly completedAt: string;
  readonly chunkEntries?: number;
  readonly maxPendingWrites?: number;
}

export interface TearAcademyCandidateCapsuleMaterializationReceiptV1 {
  readonly format: "tear-academy-candidate-capsule-materialization";
  readonly schemaVersion: 1;
  readonly candidateId: string;
  readonly capsuleId: string;
  readonly attestation: TearAcademyCandidateSourceAttestationV1;
}

function bootstrap(candidate: ProductionHeadlessAcademyIntakeItem): ProductionReplayBootstrap {
  const value: unknown = candidate.artifact.bootstrap;
  if (value === undefined || value === null || typeof value !== "object"
    || !("build" in value) || !("rng" in value)) {
    throw new RangeError("C31 capsule materialization requires a C30 run-start bootstrap");
  }
  return value as ProductionReplayBootstrap;
}

/**
 * Materializes a candidate only after it has left the bounded C30 intake.
 * The synchronous worker callback stays storage-free; this explicit C31 drain
 * writes a C27 Vault source capsule containing real C30 commands/native facts
 * and the source terminal anchor, then returns its verified attestation.
 */
export async function materializeAcademyCandidateCapsule(
  candidate: ProductionHeadlessAcademyIntakeItem,
  request: TearAcademyCandidateCapsuleMaterializationRequest,
): Promise<TearAcademyCandidateCapsuleMaterializationReceiptV1> {
  if (request.capsuleId.trim().length === 0 || Number.isNaN(Date.parse(request.createdAt))
    || Number.isNaN(Date.parse(request.completedAt))) {
    throw new TypeError("C31 capsule materialization requires a capsule ID and valid timestamps");
  }
  const origin = bootstrap(candidate);
  const scenario = candidate.artifact.scenario;
  const context = createGhostReplayRunContext({
    runId: candidate.episodeId, seed: scenario.seed, mode: scenario.start.mode,
    difficulty: scenario.start.difficulty, weaponId: scenario.start.weapon,
    ticksPerSecond: 120, build: origin.build, rng: origin.rng,
  });
  const sourceTracks = captureAcademyCandidateTracks(candidate);
  const recorder = new GhostStreamingRecorder({
    sessionId: request.capsuleId, createdAt: request.createdAt,
    chunkEntries: request.chunkEntries ?? 64, maxPendingWrites: request.maxPendingWrites ?? 2,
    vault: request.vault, provenance: Object.freeze({ [GHOST_REPLAY_CONTEXT_PROVENANCE_KEY]: context }),
  });
  await recorder.start();
  for (const action of candidate.artifact.actions) {
    await recorder.append({ kind: "commands", tick: action.tick, value: action });
  }
  let sequence = 0;
  for (const event of sourceTracks.nativeEvents) {
    await recorder.append({ kind: "events", tick: event.tick,
      value: createGameplayCausalEvent(event, ++sequence, `academy-c30-${candidate.episodeId}-${String(sequence)}`) });
  }
  await recorder.append({ kind: "results", tick: candidate.tick, value: createAcademyCandidateTerminalAnchor(candidate) });
  await recorder.finalize(request.completedAt);
  const attestation = await attestAcademyCandidateSource(candidate, request.vault, request.capsuleId);
  return Object.freeze({
    format: "tear-academy-candidate-capsule-materialization", schemaVersion: 1,
    candidateId: candidate.episodeId, capsuleId: request.capsuleId, attestation,
  });
}
