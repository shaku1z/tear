import { stableVerificationHash } from "../replay/hash";
import type { TearBuildIdentityV1 } from "../tearbench/contracts";
import type { ProductionHeadlessAcademyIntakeItem } from "../tearbench/production-headless-academy-intake";
import { GhostCapsuleReader, mapGhostCapsuleToReplayEnvelope, readGhostReplayRunContext } from "../ghost";
import type { GhostLocalVault } from "../ghost";

export const TEAR_ACADEMY_CANDIDATE_TERMINAL_ANCHOR_FORMAT = "tear-academy-candidate-terminal-anchor" as const;

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
}

/** A C27 result-track record that binds one complete capsule to a C30 terminal. */
export interface TearAcademyCandidateTerminalAnchorV1 {
  readonly format: typeof TEAR_ACADEMY_CANDIDATE_TERMINAL_ANCHOR_FORMAT;
  readonly schemaVersion: 1;
  readonly candidateHash: string;
  readonly terminal: Readonly<{
    tick: number;
    semanticHash: string;
    terminated: boolean;
    truncated: boolean;
  }>;
}

/** Immutable C31 custody evidence read from a complete C27 Vault capsule. */
export interface TearAcademyCandidateSourceAttestationV1 {
  readonly format: "tear-academy-candidate-source-attestation";
  readonly schemaVersion: 1;
  readonly candidateId: string;
  readonly candidateHash: string;
  readonly device: "semantic";
  readonly build: TearBuildIdentityV1;
  readonly replayContextHash: string;
  readonly capsuleRange: Readonly<{
    capsuleId: string;
    rootIntegrity: string;
    fromTick: 0;
    toTick: number;
    actionHash: string;
    terminalAnchorHash: string;
  }>;
  readonly attestationHash: string;
}

function candidateHash(candidate: ProductionHeadlessAcademyIntakeItem): string {
  return stableVerificationHash({
    sequence: candidate.sequence, episodeId: candidate.episodeId, tick: candidate.tick,
    scenario: candidate.artifact.scenario, actions: candidate.artifact.actions, terminal: candidate.artifact.terminal,
  });
}

function terminalAnchor(
  value: unknown,
  expectedCandidateHash: string,
  expected: ProductionHeadlessAcademyIntakeItem["artifact"]["terminal"],
): TearAcademyCandidateTerminalAnchorV1 | undefined {
  const anchor = record(value);
  if (anchor === undefined) return undefined;
  const terminal = record(anchor.terminal);
  if (anchor.format !== TEAR_ACADEMY_CANDIDATE_TERMINAL_ANCHOR_FORMAT || anchor.schemaVersion !== 1
    || anchor.candidateHash !== expectedCandidateHash || terminal?.tick !== expected.tick
    || terminal.semanticHash !== expected.semanticHash || terminal.terminated !== expected.terminated
    || terminal.truncated !== expected.truncated) return undefined;
  return Object.freeze({
    format: TEAR_ACADEMY_CANDIDATE_TERMINAL_ANCHOR_FORMAT, schemaVersion: 1,
    candidateHash: expectedCandidateHash, terminal: Object.freeze({ ...expected }),
  });
}

/**
 * Creates the terminal result record a C27 producer must write for a C30
 * candidate. This contains no synthetic terminal data: it copies the sealed
 * terminal already emitted by the shared C30 composition.
 */
export function createAcademyCandidateTerminalAnchor(
  candidate: ProductionHeadlessAcademyIntakeItem,
): TearAcademyCandidateTerminalAnchorV1 {
  const hash = candidateHash(candidate);
  return Object.freeze({
    format: TEAR_ACADEMY_CANDIDATE_TERMINAL_ANCHOR_FORMAT, schemaVersion: 1, candidateHash: hash,
    terminal: Object.freeze({ ...candidate.artifact.terminal }),
  });
}

/**
 * Reads a complete C27 capsule from its Vault and binds it to exactly one C30
 * terminal. Matching a capsule ID alone is insufficient: run bootstrap, all
 * canonical action envelopes, range, and terminal anchor must agree.
 */
export async function attestAcademyCandidateSource(
  candidate: ProductionHeadlessAcademyIntakeItem,
  vault: GhostLocalVault,
  capsuleId: string,
): Promise<TearAcademyCandidateSourceAttestationV1> {
  const expectedCandidateHash = candidateHash(candidate);
  const capsule = await new GhostCapsuleReader(vault).read(capsuleId);
  if (capsule.manifest.id !== capsuleId || capsule.manifest.status !== "complete" || capsule.manifest.schemaVersion !== 2) {
    throw new RangeError("C31 candidate requires a complete schema-v2 Vault capsule");
  }
  const context = readGhostReplayRunContext(capsule.manifest.provenance);
  if (context === undefined) throw new TypeError("C31 candidate capsule lacks a valid sealed replay context");
  const scenario = candidate.artifact.scenario;
  if (context.run.seed !== scenario.seed || context.run.mode !== scenario.start.mode
    || context.run.difficulty !== scenario.start.difficulty || context.run.weaponId !== scenario.start.weapon) {
    throw new RangeError("C31 candidate capsule bootstrap does not match the C30 source scenario");
  }
  const mapped = mapGhostCapsuleToReplayEnvelope(capsule);
  const candidateActions = candidate.artifact.actions;
  if (mapped.accepted.commands !== capsule.tracks.commands.length
    || mapped.ghost.actions.length !== candidateActions.length
    || stableVerificationHash(mapped.ghost.actions) !== stableVerificationHash(candidateActions)) {
    throw new RangeError("C31 candidate capsule command range does not match the C30 source artifact");
  }
  if (capsule.maxTick !== candidate.tick) throw new RangeError("C31 candidate capsule does not cover the exact terminal range");
  const anchor = capsule.tracks.results
    .map((entry) => entry.tick === candidate.tick ? terminalAnchor(entry.value, expectedCandidateHash, candidate.artifact.terminal) : undefined)
    .find((entry): entry is TearAcademyCandidateTerminalAnchorV1 => entry !== undefined);
  if (anchor === undefined) throw new RangeError("C31 candidate capsule lacks a matching terminal anchor");
  const build = Object.freeze({ ...context.build });
  const replayContextHash = stableVerificationHash(context);
  const actionHash = stableVerificationHash(candidateActions);
  const terminalAnchorHash = stableVerificationHash(anchor);
  const capsuleRange = Object.freeze({
    capsuleId, rootIntegrity: capsule.manifest.integrity.rootIntegrity, fromTick: 0 as const,
    toTick: candidate.tick, actionHash, terminalAnchorHash,
  });
  const attestationHash = stableVerificationHash({
    candidateId: candidate.episodeId, candidateHash: expectedCandidateHash, device: "semantic",
    build, replayContextHash, capsuleRange,
  });
  return Object.freeze({
    format: "tear-academy-candidate-source-attestation", schemaVersion: 1,
    candidateId: candidate.episodeId, candidateHash: expectedCandidateHash, device: "semantic",
    build, replayContextHash, capsuleRange, attestationHash,
  });
}
