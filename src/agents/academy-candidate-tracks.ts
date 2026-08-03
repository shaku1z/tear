import type { CommandEnvelope } from "../domain/envelopes";
import type { CanonicalGameplayState } from "../gameplay/runtime/canonical-state";
import type { GameAction } from "../input/game-action";
import { stableVerificationHash } from "../replay/hash";
import {
  createProductionHeadlessEnvironment,
  type ProductionHeadlessAcademyIntakeItem,
  type ProductionHeadlessTerminalArtifact,
} from "../tearbench";

export interface TearAcademyCandidateTrackBundleV1 {
  readonly format: "tear-academy-candidate-tracks";
  readonly schemaVersion: 1;
  readonly candidateId: string;
  readonly candidateHash: string;
  readonly captureClass: "c30-terminal-reconstruction";
  readonly observations: readonly CanonicalGameplayState[];
  readonly actions: readonly CommandEnvelope<GameAction>[];
  readonly terminal: ProductionHeadlessTerminalArtifact["terminal"];
  readonly unavailableTracks: readonly ("native-events" | "reward-components" | "intents" | "build-device-provenance")[];
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
 * composition. This preserves real canonical observations/actions/timing but
 * intentionally does not invent native event, reward, intent, or device tracks.
 */
export function captureAcademyCandidateTracks(candidate: ProductionHeadlessAcademyIntakeItem): TearAcademyCandidateTrackBundleV1 {
  const artifact = candidateTerminal(candidate);
  const actionsByTick = new Map<number, GameAction[]>();
  for (const envelope of artifact.actions) {
    const actions = actionsByTick.get(envelope.tick) ?? [];
    actions.push(envelope.command);
    actionsByTick.set(envelope.tick, actions);
  }
  const environment = createProductionHeadlessEnvironment();
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
    const actions = Object.freeze(artifact.actions.map((entry) => Object.freeze({
      kind: entry.kind, id: entry.id, tick: entry.tick, command: Object.freeze({ ...entry.command }),
    })));
    const unavailableTracks = Object.freeze([
      "native-events", "reward-components", "intents", "build-device-provenance",
    ] as const);
    const candidateHash = stableVerificationHash({
      sequence: candidate.sequence, episodeId: candidate.episodeId, tick: candidate.tick,
      scenario: artifact.scenario, actions, terminal: artifact.terminal,
    });
    const bundleHash = stableVerificationHash({ candidateHash, observations, actions, terminal, unavailableTracks });
    return Object.freeze({
      format: "tear-academy-candidate-tracks", schemaVersion: 1,
      candidateId: candidate.episodeId, candidateHash, captureClass: "c30-terminal-reconstruction",
      observations: Object.freeze(observations), actions, terminal: Object.freeze({ ...terminal }), unavailableTracks, bundleHash,
    });
  } finally {
    environment.dispose();
  }
}
