import { stableVerificationHash } from "../replay/hash";
import type { TearCausalEventV1 } from "../tearbench/contracts";
import type { GhostEnvelopeV3 } from "./truth-kernel";

export type GhostChallengeKind =
  | "chase-your-best" | "seed-locked-race" | "beat-this-run" | "boss-memory"
  | "daily-echo" | "learning-ghost" | "nemesis-ghost" | "tearbot-reference";

export const GHOST_CHALLENGE_KINDS = Object.freeze([
  "chase-your-best", "seed-locked-race", "beat-this-run", "boss-memory",
  "daily-echo", "learning-ghost", "nemesis-ghost", "tearbot-reference",
] as const satisfies readonly GhostChallengeKind[]);

export interface GhostChallengeDefinition {
  readonly id: string;
  readonly kind: GhostChallengeKind;
  readonly sourceGhostId: string;
  readonly sourceRootHash: string;
  readonly rulesVersion: string;
  readonly seedPolicy: Readonly<{
    kind: "locked" | "daily-derived" | "source-derived";
    seed: string;
  }>;
  readonly conditions: readonly Readonly<{ metric: string; operator: "<=" | ">=" | "=="; value: number | string }>[];
}

export interface GhostChallengeAttemptProof {
  readonly format: "ghost-challenge-proof";
  readonly schemaVersion: 1;
  readonly challenge: GhostChallengeDefinition;
  readonly attemptCapsule: Readonly<{ id: string; rootHash: string }>;
  readonly lineage: Readonly<{
    relation: "challenge";
    parentGhostId: string;
    parentRootHash: string;
  }>;
  readonly completed: boolean;
  readonly observedConditions: Readonly<Record<string, number | string>>;
  readonly proofHash: string;
}

function conditionSatisfied(
  condition: GhostChallengeDefinition["conditions"][number],
  actual: number | string | undefined,
): boolean {
  if (actual === undefined) return false;
  if (condition.operator === "==") return actual === condition.value;
  if (typeof actual !== "number" || typeof condition.value !== "number") return false;
  return condition.operator === "<=" ? actual <= condition.value : actual >= condition.value;
}

export function createChallengeAttemptProof(
  challenge: GhostChallengeDefinition,
  attemptCapsule: GhostChallengeAttemptProof["attemptCapsule"],
  observedConditions: Readonly<Record<string, number | string>>,
): GhostChallengeAttemptProof {
  const completed = challenge.conditions.every((condition) =>
    conditionSatisfied(condition, observedConditions[condition.metric]));
  const proofData = {
    challenge,
    attemptCapsule,
    lineage: {
      relation: "challenge" as const,
      parentGhostId: challenge.sourceGhostId,
      parentRootHash: challenge.sourceRootHash,
    },
    completed,
    observedConditions,
  };
  return Object.freeze({
    format: "ghost-challenge-proof",
    schemaVersion: 1,
    ...proofData,
    lineage: Object.freeze(proofData.lineage),
    proofHash: stableVerificationHash(proofData),
  });
}

export function verifyChallengeAttemptProof(proof: GhostChallengeAttemptProof): boolean {
  return proof.proofHash === stableVerificationHash({
    challenge: proof.challenge,
    attemptCapsule: proof.attemptCapsule,
    lineage: proof.lineage,
    completed: proof.completed,
    observedConditions: proof.observedConditions,
  });
}

export interface GhostLiveOverlayFrame {
  readonly sourceGhostId: string;
  readonly tick: number;
  readonly visibleEvents: readonly TearCausalEventV1[];
  readonly interactive: false;
  readonly revealsFuture: false;
  readonly revealsHiddenState: false;
}

export function createFairLiveGhostOverlay(
  source: GhostEnvelopeV3,
  currentTick: number,
): GhostLiveOverlayFrame {
  if (!Number.isSafeInteger(currentTick) || currentTick < 0) throw new RangeError("overlay tick must be non-negative");
  const visibleEvents = source.events.filter((event) =>
    event.tick <= currentTick && event.source !== "developer"
    && !["system.exception", "test.invariant-failed", "agent.target-changed"].includes(event.type));
  return Object.freeze({
    sourceGhostId: source.id,
    tick: currentTick,
    visibleEvents: Object.freeze(visibleEvents),
    interactive: false,
    revealsFuture: false,
    revealsHiddenState: false,
  });
}

export type GhostStudioCamera = "source" | "player-follow" | "blade-follow" | "target-follow" | "free-authored";
export type GhostStudioAspectRatio = "16:9" | "9:16" | "1:1" | "4:3";

export interface GhostStudioClip {
  readonly id: string;
  readonly sourceFromTick: number;
  readonly sourceToTick: number;
  readonly outputOrder: number;
  readonly speed: 0.25 | 0.5 | 1 | 2 | 4;
  readonly camera: GhostStudioCamera;
  readonly caption?: string;
}

export interface GhostStudioEditDecisionList {
  readonly format: "ghost-studio-edl";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly sourceGhostId: string;
  readonly sourceRootHash: string;
  readonly aspectRatio: GhostStudioAspectRatio;
  readonly clips: readonly GhostStudioClip[];
  readonly title: string;
  readonly credits: string;
  readonly edlHash: string;
}

export function createStudioEdl(input: Omit<GhostStudioEditDecisionList, "format" | "schemaVersion" | "edlHash">): GhostStudioEditDecisionList {
  const clips = [...input.clips].sort((left, right) => left.outputOrder - right.outputOrder);
  if (clips.some((clip) => clip.sourceFromTick < 0 || clip.sourceToTick < clip.sourceFromTick)) {
    throw new TypeError("Studio clip range is invalid");
  }
  if (new Set(clips.map((clip) => clip.id)).size !== clips.length) throw new TypeError("Studio clip IDs must be unique");
  const data = {
    id: input.id,
    sourceGhostId: input.sourceGhostId,
    sourceRootHash: input.sourceRootHash,
    aspectRatio: input.aspectRatio,
    clips: Object.freeze(clips.map((clip) => Object.freeze({ ...clip }))),
    title: input.title,
    credits: input.credits,
  };
  return Object.freeze({
    format: "ghost-studio-edl",
    schemaVersion: 1,
    ...data,
    edlHash: stableVerificationHash(data),
  });
}

export interface GhostStudioRenderer {
  render(input: Readonly<{
    source: GhostEnvelopeV3;
    edl: GhostStudioEditDecisionList;
  }>): Promise<Readonly<{ mimeType: "video/webm" | "image/gif"; bytes: Uint8Array; thumbnail: string }>>;
}

export interface GhostStudioMediaExport {
  readonly fileName: string;
  readonly mimeType: "video/webm" | "image/gif";
  readonly bytes: Uint8Array;
  readonly thumbnail: string;
  readonly sourceRootHash: string;
  readonly edlHash: string;
  readonly generatedLocally: true;
  readonly screenRecordingRequired: false;
}

export async function renderStudioMediaLocally(
  source: GhostEnvelopeV3,
  edl: GhostStudioEditDecisionList,
  renderer: GhostStudioRenderer,
): Promise<GhostStudioMediaExport> {
  if (edl.sourceGhostId !== source.id || edl.sourceRootHash !== source.rootHash) {
    throw new TypeError("Studio EDL source identity does not match Ghost");
  }
  const rendered = await renderer.render({ source, edl });
  if (rendered.bytes.byteLength === 0) throw new TypeError("Studio renderer returned empty media");
  return Object.freeze({
    fileName: `${edl.id}.${rendered.mimeType === "video/webm" ? "webm" : "gif"}`,
    mimeType: rendered.mimeType,
    bytes: rendered.bytes.slice(),
    thumbnail: rendered.thumbnail,
    sourceRootHash: source.rootHash,
    edlHash: edl.edlHash,
    generatedLocally: true,
    screenRecordingRequired: false,
  });
}

export interface GhostRunDna {
  readonly dimensions: Readonly<{
    aggression: number;
    precision: number;
    mobility: number;
    defense: number;
    experimentation: number;
  }>;
  readonly sourceMetrics: Readonly<Record<string, number>>;
  readonly formulaVersion: "run-dna-v1";
}

export function calculateRunDna(metrics: Readonly<Record<string, number>>): GhostRunDna {
  const ratio = (numerator: string, denominator: string): number => {
    const top = metrics[numerator] ?? 0;
    const bottom = Math.max(1, metrics[denominator] ?? 0);
    return Math.max(0, Math.min(1, top / bottom));
  };
  return Object.freeze({
    dimensions: Object.freeze({
      aggression: ratio("attacks", "combatTicks"),
      precision: 1 - ratio("misses", "attacks"),
      mobility: ratio("movingTicks", "combatTicks"),
      defense: 1 - ratio("damageTaken", "maxHp"),
      experimentation: ratio("distinctManeuvers", "availableManeuvers"),
    }),
    sourceMetrics: Object.freeze({ ...metrics }),
    formulaVersion: "run-dna-v1",
  });
}

export interface GhostCareerEntry {
  readonly ghostId: string;
  readonly completedAt: string;
  readonly mode: string;
  readonly difficulty: string;
  readonly score: number;
  readonly result: "victory" | "defeat" | "retired";
  readonly dna: GhostRunDna;
}

export class GhostCareerArchive {
  readonly #entries = new Map<string, GhostCareerEntry>();

  add(entry: GhostCareerEntry): void {
    if (this.#entries.has(entry.ghostId)) throw new TypeError(`career Ghost already exists: ${entry.ghostId}`);
    if (!Number.isFinite(entry.score) || entry.score < 0) throw new TypeError("career score must be finite and non-negative");
    this.#entries.set(entry.ghostId, Object.freeze({
      ...entry,
      dna: Object.freeze({
        ...entry.dna,
        dimensions: Object.freeze({ ...entry.dna.dimensions }),
        sourceMetrics: Object.freeze({ ...entry.dna.sourceMetrics }),
      }),
    }));
  }

  list(): readonly GhostCareerEntry[] {
    return Object.freeze([...this.#entries.values()].sort((left, right) =>
      right.completedAt.localeCompare(left.completedAt) || left.ghostId.localeCompare(right.ghostId)));
  }

  summary(): Readonly<{
    runs: number;
    victories: number;
    bestScore: number;
    averageDna: GhostRunDna["dimensions"];
  }> {
    const entries = [...this.#entries.values()];
    const average = (dimension: keyof GhostRunDna["dimensions"]): number =>
      entries.reduce((sum, entry) => sum + entry.dna.dimensions[dimension], 0) / Math.max(1, entries.length);
    const averageDna = Object.freeze({
      aggression: average("aggression"),
      precision: average("precision"),
      mobility: average("mobility"),
      defense: average("defense"),
      experimentation: average("experimentation"),
    });
    return Object.freeze({
      runs: entries.length,
      victories: entries.filter((entry) => entry.result === "victory").length,
      bestScore: entries.reduce((best, entry) => Math.max(best, entry.score), 0),
      averageDna,
    });
  }
}

export type GhostAuthoredMove =
  | "approach" | "retreat" | "jump" | "dash" | "slash" | "throw" | "recall" | "parry" | "wait";

export interface GhostNemesisGrammar {
  readonly id: string;
  readonly sourceGhostId: string;
  readonly allowedMoves: readonly GhostAuthoredMove[];
  readonly weights: Readonly<Record<GhostAuthoredMove, number>>;
  readonly minimumReactionTicks: number;
  readonly maximumBranchDepth: number;
  readonly privileged: false;
}

export function distillNemesisGrammar(source: GhostEnvelopeV3): GhostNemesisGrammar {
  const counts = new Map<GhostAuthoredMove, number>();
  const add = (move: GhostAuthoredMove): void => { counts.set(move, (counts.get(move) ?? 0) + 1); };
  for (const action of source.actions) {
    if (action.command.type === "move") add(action.command.x === 0 ? "wait" : action.command.x > 0 ? "approach" : "retreat");
    else if (action.command.type === "jump") add("jump");
    else if (action.command.type === "dash") add("dash");
    else if (action.command.type === "weapon") add(
      action.command.intent === "throw" ? "throw"
        : action.command.intent === "recall" ? "recall"
          : action.command.intent === "primary" ? "slash" : "parry");
  }
  if (counts.size === 0) counts.set("wait", 1);
  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
  const allowedMoves = Object.freeze([...counts.keys()].sort());
  const zeroWeights = Object.fromEntries([
    "approach", "retreat", "jump", "dash", "slash", "throw", "recall", "parry", "wait",
  ].map((move) => [move, 0])) as Record<GhostAuthoredMove, number>;
  for (const [move, count] of counts) zeroWeights[move] = count / total;
  return Object.freeze({
    id: `nemesis-${source.id}`,
    sourceGhostId: source.id,
    allowedMoves,
    weights: Object.freeze(zeroWeights),
    minimumReactionTicks: 12,
    maximumBranchDepth: 3,
    privileged: false,
  });
}
