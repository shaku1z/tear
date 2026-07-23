import { stableVerificationHash } from "../replay/hash";

export interface TearAstutenessVector {
  readonly mechanicalExecution: number;
  readonly strategicPlanning: number;
  readonly perception: number;
  readonly adaptation: number;
  readonly recovery: number;
  readonly styleControl: number;
  readonly interfaceFluency: number;
}

export interface TearBoundedRationality {
  readonly reactionMilliseconds: number;
  readonly actionErrorRate: number;
  readonly aimNoise: number;
  readonly planningHorizonTicks: number;
  readonly memoryTicks: number;
  readonly observationFields: readonly string[];
}

export interface TearBotLevel {
  readonly id: `level-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}` | "level-omega";
  readonly label: string;
  readonly public: boolean;
  readonly privileged: boolean;
  readonly provisional: boolean;
  readonly astuteness: TearAstutenessVector;
  readonly bounds: TearBoundedRationality;
}

export interface TearBotOrthogonalConfiguration {
  readonly gameDifficulty: "easy" | "normal" | "hard" | "extreme" | "onehit";
  readonly mechanicalSkill: number;
  readonly strategicAstuteness: number;
  readonly qaAggression: number;
}

const HUMAN_OBSERVATION_FIELDS = Object.freeze([
  "player-position", "player-health-ratio", "blade-visible-state", "visible-entities",
  "visible-projectiles", "screen", "visible-choices", "audio-cues",
]);

function normalized(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function compileTearBotLevel(level: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | "omega"): TearBotLevel {
  if (level === "omega") {
    return Object.freeze({
      id: "level-omega",
      label: "OMEGA — PRIVILEGED / NON-HUMAN",
      public: false,
      privileged: true,
      provisional: true,
      astuteness: Object.freeze({
        mechanicalExecution: 1, strategicPlanning: 1, perception: 1, adaptation: 1,
        recovery: 1, styleControl: 1, interfaceFluency: 1,
      }),
      bounds: Object.freeze({
        reactionMilliseconds: 0,
        actionErrorRate: 0,
        aimNoise: 0,
        planningHorizonTicks: 120 * 60,
        memoryTicks: Number.MAX_SAFE_INTEGER,
        observationFields: Object.freeze(["privileged-diagnostic-state", "future-script", "exact-rng-state"]),
      }),
    });
  }
  const skill = (level - 1) / 8;
  return Object.freeze({
    id: `level-${String(level)}` as TearBotLevel["id"],
    label: `TearBot Level ${String(level)} (Provisional Synthetic)`,
    public: true,
    privileged: false,
    provisional: true,
    astuteness: Object.freeze({
      mechanicalExecution: normalized(0.2 + skill * 0.72),
      strategicPlanning: normalized(0.12 + skill * 0.76),
      perception: normalized(0.25 + skill * 0.65),
      adaptation: normalized(0.1 + skill * 0.78),
      recovery: normalized(0.15 + skill * 0.75),
      styleControl: normalized(0.08 + skill * 0.7),
      interfaceFluency: normalized(0.3 + skill * 0.65),
    }),
    bounds: Object.freeze({
      reactionMilliseconds: Math.round(480 - skill * 360),
      actionErrorRate: 0.24 - skill * 0.2,
      aimNoise: 0.3 - skill * 0.25,
      planningHorizonTicks: Math.round(30 + skill * 330),
      memoryTicks: Math.round(120 + skill * 1_080),
      observationFields: HUMAN_OBSERVATION_FIELDS,
    }),
  });
}

export function validateHumanInformationFirewall(level: TearBotLevel): readonly string[] {
  if (level.privileged) return level.id === "level-omega" ? [] : ["only Level Omega may be privileged"];
  const issues: string[] = [];
  if (level.bounds.reactionMilliseconds < 100) issues.push("reaction time is below the public human-like minimum");
  const allowed = new Set(HUMAN_OBSERVATION_FIELDS);
  for (const field of level.bounds.observationFields) if (!allowed.has(field)) issues.push(`privileged observation field: ${field}`);
  if (level.bounds.planningHorizonTicks > 600) issues.push("planning horizon exceeds the public human-like limit");
  return Object.freeze(issues);
}

export interface TearScenarioItem {
  readonly id: string;
  readonly difficulty: number;
  readonly discrimination: Partial<TearAstutenessVector>;
  readonly domain: string;
  readonly weapon: string;
  readonly mode: string;
  readonly gameDifficulty: string;
}

export function itemResponseProbability(level: TearBotLevel, item: TearScenarioItem): number {
  const entries = Object.entries(item.discrimination) as [keyof TearAstutenessVector, number][];
  const weighted = entries.reduce((sum, [dimension, weight]) => sum + level.astuteness[dimension] * weight, 0);
  const scale = entries.reduce((sum, [, weight]) => sum + Math.abs(weight), 0) || 1;
  const logit = weighted / scale * 6 - item.difficulty * 6;
  return 1 / (1 + Math.exp(-logit));
}

export interface TearLadderEvaluation {
  readonly levelId: TearBotLevel["id"];
  readonly itemId: string;
  readonly probability: number;
  readonly passed: boolean;
}

export interface TearLadderReport {
  readonly monotonic: boolean;
  readonly adjacentSeparation: readonly number[];
  readonly humanLike: boolean;
  readonly byDomain: Readonly<Record<string, number>>;
  readonly byWeapon: Readonly<Record<string, number>>;
  readonly byMode: Readonly<Record<string, number>>;
  readonly byDifficulty: Readonly<Record<string, number>>;
}

function means(
  evaluations: readonly TearLadderEvaluation[],
  items: readonly TearScenarioItem[],
  field: "domain" | "weapon" | "mode" | "gameDifficulty",
): Readonly<Record<string, number>> {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const groups = new Map<string, number[]>();
  for (const result of evaluations) {
    const key = itemById.get(result.itemId)?.[field];
    if (key === undefined) continue;
    const values = groups.get(key) ?? [];
    values.push(result.probability);
    groups.set(key, values);
  }
  return Object.freeze(Object.fromEntries([...groups].map(([key, values]) => [
    key, values.reduce((sum, value) => sum + value, 0) / values.length,
  ])));
}

export function evaluateTearBotLadder(
  levels: readonly TearBotLevel[],
  items: readonly TearScenarioItem[],
): Readonly<{ evaluations: readonly TearLadderEvaluation[]; report: TearLadderReport }> {
  const evaluations = Object.freeze(levels.flatMap((level) => items.map((item) => {
    const probability = itemResponseProbability(level, item);
    return Object.freeze({
      levelId: level.id,
      itemId: item.id,
      probability,
      passed: probability >= 0.5,
    });
  })));
  const levelMeans = levels.map((level) => {
    const values = evaluations.filter((entry) => entry.levelId === level.id).map((entry) => entry.probability);
    return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  });
  const adjacentSeparation = Object.freeze(levelMeans.slice(1).map((value, index) => value - (levelMeans[index] ?? 0)));
  return Object.freeze({
    evaluations,
    report: Object.freeze({
      monotonic: adjacentSeparation.every((value) => value > 0),
      adjacentSeparation,
      humanLike: levels.filter((level) => level.public).every((level) => validateHumanInformationFirewall(level).length === 0),
      byDomain: means(evaluations, items, "domain"),
      byWeapon: means(evaluations, items, "weapon"),
      byMode: means(evaluations, items, "mode"),
      byDifficulty: means(evaluations, items, "gameDifficulty"),
    }),
  });
}

export interface TearHumanAnchor {
  readonly dimension: keyof TearAstutenessVector;
  readonly value: number;
  readonly sampleCount: number;
  readonly consent: "anonymous-improvement" | "public-training";
}

export function applyHumanAnchors(
  level: TearBotLevel,
  anchors: readonly TearHumanAnchor[],
): TearBotLevel {
  const astuteness = { ...level.astuteness };
  for (const anchor of anchors) {
    if (!["anonymous-improvement", "public-training"].includes(anchor.consent) || anchor.sampleCount < 30) {
      throw new TypeError("human anchors require separate consent and at least 30 samples");
    }
    astuteness[anchor.dimension] = normalized(anchor.value);
  }
  return Object.freeze({ ...level, astuteness: Object.freeze(astuteness), provisional: false });
}

export interface TearFoundryPolicy {
  readonly id: string;
  readonly parentId?: string;
  readonly scores: Readonly<Record<string, number>>;
  readonly rewardDefinitionHash: string;
  readonly invariantSetHash: string;
  readonly releaseExamHash: string;
}

export interface TearFoundryCycleResult {
  readonly weakness: string;
  readonly curriculum: readonly string[];
  readonly teacherId: string;
  readonly challenger: TearFoundryPolicy;
  readonly promoted: boolean;
  readonly regressions: readonly string[];
  readonly evidenceHash: string;
}

export class TearAgentFoundry {
  #active: TearFoundryPolicy;
  readonly #archive: TearFoundryPolicy[] = [];
  readonly #frozen: Readonly<{
    rewardDefinitionHash: string;
    invariantSetHash: string;
    releaseExamHash: string;
  }>;

  constructor(active: TearFoundryPolicy) {
    this.#active = Object.freeze(structuredClone(active));
    this.#frozen = Object.freeze({
      rewardDefinitionHash: active.rewardDefinitionHash,
      invariantSetHash: active.invariantSetHash,
      releaseExamHash: active.releaseExamHash,
    });
  }

  active(): TearFoundryPolicy { return this.#active; }
  archive(): readonly TearFoundryPolicy[] { return Object.freeze([...this.#archive]); }

  runCycle(input: Readonly<{
    challenger: TearFoundryPolicy;
    holdoutMinimums: Readonly<Record<string, number>>;
    regressionTolerance: number;
  }>): TearFoundryCycleResult {
    const weakness = Object.entries(this.#active.scores).sort(([, left], [, right]) => left - right)[0]?.[0] ?? "unknown";
    const curriculum = Object.freeze([`${weakness}:foundations`, `${weakness}:recovery`, `${weakness}:adversarial`]);
    const teachers = [this.#active, ...this.#archive].sort((left, right) =>
      (right.scores[weakness] ?? 0) - (left.scores[weakness] ?? 0) || left.id.localeCompare(right.id));
    const teacherId = teachers[0]?.id ?? this.#active.id;
    const frozenMatches = input.challenger.rewardDefinitionHash === this.#frozen.rewardDefinitionHash
      && input.challenger.invariantSetHash === this.#frozen.invariantSetHash
      && input.challenger.releaseExamHash === this.#frozen.releaseExamHash;
    const regressions = Object.entries(input.holdoutMinimums)
      .filter(([domain, minimum]) => (input.challenger.scores[domain] ?? -Infinity) < minimum)
      .map(([domain]) => domain);
    const activeMean = Object.values(this.#active.scores).reduce((sum, value) => sum + value, 0)
      / Math.max(1, Object.keys(this.#active.scores).length);
    const challengerMean = Object.values(input.challenger.scores).reduce((sum, value) => sum + value, 0)
      / Math.max(1, Object.keys(input.challenger.scores).length);
    const promoted = frozenMatches && regressions.length === 0
      && challengerMean >= activeMean + input.regressionTolerance;
    if (promoted) {
      this.#archive.push(this.#active);
      this.#active = Object.freeze(structuredClone(input.challenger));
    } else {
      this.#archive.push(Object.freeze(structuredClone(input.challenger)));
    }
    return Object.freeze({
      weakness,
      curriculum,
      teacherId,
      challenger: input.challenger,
      promoted,
      regressions: Object.freeze(regressions),
      evidenceHash: stableVerificationHash({
        active: this.#active.id,
        challenger: input.challenger.id,
        weakness,
        curriculum,
        teacherId,
        regressions,
        promoted,
        frozenMatches,
      }),
    });
  }

  monitorAndRollback(metrics: Readonly<Record<string, number>>, minimums: Readonly<Record<string, number>>): boolean {
    const unhealthy = Object.entries(minimums).some(([domain, minimum]) => (metrics[domain] ?? -Infinity) < minimum);
    const previous = this.#archive.at(-1);
    if (!unhealthy || previous === undefined) return false;
    const failed = this.#active;
    this.#active = previous;
    this.#archive.splice(this.#archive.length - 1, 1, failed);
    return true;
  }
}
