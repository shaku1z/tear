import type { CommandEnvelope } from "../domain/envelopes";
import type { CanonicalGameplayState } from "../gameplay/runtime/canonical-state";
import type { TearGameplayEvent } from "../gameplay/runtime/gameplay-events";
import type { GameAction } from "../input/game-action";
import { stableVerificationHash } from "../replay/hash";
import type { ProductionWaveRewardIntent } from "../tearbench";
import {
  createProductionHeadlessEnvironment,
  type ProductionHeadlessAcademyIntakeItem,
  type ProductionHeadlessTerminalArtifact,
} from "../tearbench";

export type TearAcademyCandidateUnavailableTrack = "build-device-provenance" | "capsule-range";

export interface TearAcademyCandidateTrackBundleV1 {
  readonly format: "tear-academy-candidate-tracks";
  readonly schemaVersion: 1;
  readonly candidateId: string;
  readonly candidateHash: string;
  readonly captureClass: "c30-terminal-reconstruction";
  readonly observations: readonly CanonicalGameplayState[];
  readonly actions: readonly CommandEnvelope<GameAction>[];
  readonly nativeEvents: readonly TearGameplayEvent[];
  readonly rewardComponents: readonly Readonly<{ tick: number; value: unknown }>[];
  readonly intents: readonly ProductionWaveRewardIntent[];
  readonly source: Readonly<{
    execution: "production-headless";
    device: "semantic";
    buildProvenance: Readonly<{ status: "unavailable"; reason: string }>;
    capsuleRange: Readonly<{ status: "unavailable"; reason: string }>;
  }>;
  readonly terminal: ProductionHeadlessTerminalArtifact["terminal"];
  readonly unavailableTracks: readonly TearAcademyCandidateUnavailableTrack[];
  readonly bundleHash: string;
}

function candidateTerminal(value: unknown): ProductionHeadlessTerminalArtifact {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Academy track capture requires a valid C30 terminal candidate");
  }
  const candidate = value as Readonly<Record<string, unknown>>;
  const artifact = candidate.artifact;
  const tick = candidate.tick;
  if (candidate.format !== "tearbench-production-headless-academy-intake" || candidate.schemaVersion !== 1
    || typeof tick !== "number" || !Number.isSafeInteger(tick) || tick < 1
    || artifact === null || typeof artifact !== "object" || Array.isArray(artifact)) {
    throw new TypeError("Academy track capture requires a valid C30 terminal candidate");
  }
  const terminalArtifact = artifact as Readonly<Record<string, unknown>>;
  const terminal = terminalArtifact.terminal;
  if (terminalArtifact.format !== "tearbench-production-headless-terminal" || terminalArtifact.schemaVersion !== 1
    || terminal === null || typeof terminal !== "object" || Array.isArray(terminal)) {
    throw new TypeError("Academy track capture requires a valid C30 terminal candidate");
  }
  const terminalRecord = terminal as Readonly<Record<string, unknown>>;
  if (terminalRecord.tick !== candidate.tick || typeof terminalRecord.semanticHash !== "string"
    || !/^[a-f0-9]{16}$/u.test(terminalRecord.semanticHash)) {
    throw new TypeError("Academy track capture requires a valid C30 terminal candidate");
  }
  return terminalArtifact as unknown as ProductionHeadlessTerminalArtifact;
}

/**
 * Reconstructs one bounded C30 terminal through the shared production
 * composition. Native gameplay facts, reward snapshots, and planner intents
 * come from an instrumented production composition and must still reconstruct
 * the sealed C30 terminal exactly. The C30 terminal itself carries neither an
 * attested build/provenance identity nor a Ghost capsule range, so both remain
 * explicitly unavailable and fail closed at admission.
 */
export function captureAcademyCandidateTracks(candidate: ProductionHeadlessAcademyIntakeItem): TearAcademyCandidateTrackBundleV1 {
  const artifact = candidateTerminal(candidate);
  const actionsByTick = new Map<number, GameAction[]>();
  for (const envelope of artifact.actions) {
    const actions = actionsByTick.get(envelope.tick) ?? [];
    actions.push(envelope.command);
    actionsByTick.set(envelope.tick, actions);
  }
  const environment = createProductionHeadlessEnvironment({ captureSourceTracks: true });
  try {
    const observations: CanonicalGameplayState[] = [environment.reset(artifact.scenario)];
    let terminal: ProductionHeadlessTerminalArtifact["terminal"] | undefined;
    for (let tick = 1; tick <= artifact.terminal.tick; tick += 1) {
      const transition = environment.step(Object.freeze([...(actionsByTick.get(tick) ?? [])]));
      observations.push(transition.observation);
      if (transition.artifact !== undefined) {
        if (tick !== artifact.terminal.tick) throw new RangeError("C30 candidate terminated before its declared terminal tick");
        terminal = (transition.artifact as ProductionHeadlessTerminalArtifact).terminal;
      }
    }
    if (terminal === undefined || stableVerificationHash(observations.at(-1)) !== artifact.terminal.semanticHash
      || terminal.terminated !== artifact.terminal.terminated || terminal.truncated !== artifact.terminal.truncated) {
      throw new RangeError("C30 candidate reconstruction does not match its terminal artifact");
    }
    const sourceTracks = environment.sourceTracks();
    const actions = Object.freeze(artifact.actions.map((entry) => Object.freeze({
      kind: entry.kind, id: entry.id, tick: entry.tick, command: Object.freeze({ ...entry.command }),
    })));
    if (sourceTracks.rewardComponents.length !== observations.length
      || sourceTracks.rewardComponents.some((entry, index) => entry.tick !== observations[index]?.tick)) {
      throw new RangeError("C31 reward source track does not cover each reconstructed observation");
    }
    const source = Object.freeze({
      execution: "production-headless" as const,
      device: sourceTracks.device,
      buildProvenance: Object.freeze({ status: "unavailable" as const,
        reason: "C30 terminal intake has no attested build or provenance coordinate" }),
      capsuleRange: Object.freeze({ status: "unavailable" as const,
        reason: "C30 terminal intake has no source Ghost capsule coordinate or tick range" }),
    });
    const unavailableTracks = Object.freeze(["build-device-provenance", "capsule-range"] as const);
    const candidateHash = stableVerificationHash({
      sequence: candidate.sequence, episodeId: candidate.episodeId, tick: candidate.tick,
      scenario: artifact.scenario, actions, terminal: artifact.terminal,
    });
    const bundleHash = stableVerificationHash({
      candidateHash, observations, actions, nativeEvents: sourceTracks.nativeEvents,
      rewardComponents: sourceTracks.rewardComponents, intents: sourceTracks.intents, source, terminal, unavailableTracks,
    });
    return Object.freeze({
      format: "tear-academy-candidate-tracks", schemaVersion: 1,
      candidateId: candidate.episodeId, candidateHash, captureClass: "c30-terminal-reconstruction",
      observations: Object.freeze(observations), actions,
      nativeEvents: sourceTracks.nativeEvents, rewardComponents: sourceTracks.rewardComponents,
      intents: sourceTracks.intents, source, terminal: Object.freeze({ ...terminal }), unavailableTracks, bundleHash,
    });
  } finally {
    environment.dispose();
  }
}
