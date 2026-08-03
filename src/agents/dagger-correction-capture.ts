import type { GameAction } from "../input/game-action";
import { stableVerificationHash } from "../replay/hash";
import { createProductionHeadlessEnvironment, type TearScenarioV1 } from "../tearbench";
import type { TearAgentIntentTrace, TearAgentProfileId } from "./contracts";
import type { TearPolicyArtifactRegistry } from "./policy-artifact-registry";
import { TearActivePolicyRuntime, type TearPolicyDecisionReceipt } from "./policy-runtime";
import { projectStructuredPolicyFeatures } from "./policy-feature-vector";
import { TearAgentOrchestrator } from "./scripted-policy";

export interface TearDaggerCorrectionCaptureOptionsV1 {
  readonly maxCorrections?: number;
  readonly teacherProfile?: TearAgentProfileId;
}

export interface TearDaggerCorrectionCandidateV1 {
  readonly tick: number;
  readonly beforeObservationHash: string;
  readonly afterStateHash: string;
  /** Shared C32/C33 numeric observation contract, retained for later approved-only training. */
  readonly features: readonly number[];
  readonly challengerActions: readonly GameAction[];
  readonly challengerReceipt: TearPolicyDecisionReceipt;
  readonly teacherActions: readonly GameAction[];
  readonly teacherTrace: TearAgentIntentTrace;
  readonly correctionHash: string;
}

/**
 * A bounded, source-world DAgger capture. The challenger is the active C32
 * artifact and the teacher is the existing scripted policy. Challenger actions
 * alone advance the shared C29/C30 production composition; teacher actions are
 * recorded only as a correction proposal for later governed review.
 */
export interface TearDaggerCorrectionCaptureV1 {
  readonly format: "tear-dagger-correction-capture";
  readonly schemaVersion: 1;
  readonly artifact: Readonly<{ id: string; hash: string }>;
  readonly scenario: Readonly<{ id: string; version: number; seed: string; hash: string }>;
  readonly maxCorrections: number;
  readonly corrections: readonly TearDaggerCorrectionCandidateV1[];
  readonly terminal: Readonly<{ tick: number; semanticHash: string; terminated: boolean; truncated: boolean }>;
  readonly captureHash: string;
}

function actionHash(actions: readonly GameAction[]): string { return stableVerificationHash(actions); }
function validLimit(value: number): boolean { return Number.isSafeInteger(value) && value >= 1 && value <= 256; }

export async function captureTearDaggerCorrections(
  registry: TearPolicyArtifactRegistry,
  scenario: TearScenarioV1,
  options: TearDaggerCorrectionCaptureOptionsV1 = {},
): Promise<TearDaggerCorrectionCaptureV1> {
  const maxCorrections = options.maxCorrections ?? 32;
  if (!validLimit(maxCorrections)) throw new TypeError("DAgger correction capture requires a bounded correction limit");
  const active = await registry.active();
  if (active === undefined) throw new RangeError("DAgger correction capture requires an active verified artifact");
  const challenger = new TearActivePolicyRuntime(registry, options.teacherProfile ?? "competent");
  const teacher = new TearAgentOrchestrator(options.teacherProfile ?? "competent");
  await challenger.reset();
  const environment = createProductionHeadlessEnvironment();
  try {
    let terminal = environment.reset(scenario), terminated = false, truncated = false;
    const corrections: TearDaggerCorrectionCandidateV1[] = [];
    while (!terminated && !truncated && terminal.tick < scenario.maxTicks) {
      const observation = environment.policyObservation();
      const challengerDecision = challenger.decide({ state: observation, ui: { screen: "playing" } });
      const teacherDecision = teacher.decide({ state: observation, ui: { screen: "playing" } });
      const beforeObservationHash = stableVerificationHash(observation);
      const transition = environment.step(challengerDecision.actions);
      terminal = transition.observation; terminated = transition.terminated; truncated = transition.truncated;
      if (corrections.length < maxCorrections && actionHash(challengerDecision.actions) !== actionHash(teacherDecision.actions)) {
        const draft = {
          tick: observation.tick, beforeObservationHash, afterStateHash: stableVerificationHash(transition.observation),
          features: Object.freeze([...projectStructuredPolicyFeatures({ state: observation, ui: { screen: "playing" } })]),
          challengerActions: Object.freeze(structuredClone(challengerDecision.actions)),
          challengerReceipt: Object.freeze(structuredClone(challengerDecision.receipt)),
          teacherActions: Object.freeze(structuredClone(teacherDecision.actions)),
          teacherTrace: Object.freeze(structuredClone(teacherDecision.trace)),
        };
        corrections.push(Object.freeze({ ...draft, correctionHash: stableVerificationHash(draft) }));
      }
    }
    const draft = {
      format: "tear-dagger-correction-capture" as const, schemaVersion: 1 as const,
      artifact: Object.freeze({ id: active.artifactId, hash: active.artifactHash }),
      scenario: Object.freeze({ id: scenario.id, version: scenario.version, seed: scenario.seed, hash: stableVerificationHash(scenario) }),
      maxCorrections, corrections: Object.freeze(corrections),
      terminal: Object.freeze({ tick: terminal.tick, semanticHash: stableVerificationHash(terminal), terminated, truncated }),
    };
    return Object.freeze({ ...draft, captureHash: stableVerificationHash(draft) });
  } finally { environment.dispose(); }
}
