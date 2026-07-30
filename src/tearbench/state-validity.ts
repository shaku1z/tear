import type { TearStateClass } from "./contracts";

export interface TearStateValidationIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface TearStructuralValidityReport {
  readonly valid: boolean;
  readonly issues: readonly TearStateValidationIssue[];
}

export interface TearRuleReachabilityReport {
  readonly reachable: boolean;
  readonly reasons: readonly string[];
}

export interface TearPopulationPlausibilityReport {
  readonly plausible: boolean;
  readonly provisional: boolean;
  readonly reasons: readonly string[];
  readonly modelId?: string;
  readonly sampleCount?: number;
}

export interface TearStateValidityInput {
  readonly stateClass: TearStateClass;
  readonly start: Readonly<{
    mode: string;
    difficulty: string;
    weapon: string;
    wave?: number;
    boss?: string;
    bossPhase?: string;
  }>;
  readonly state?: Readonly<Record<string, unknown>>;
  readonly constraints?: Readonly<Record<string, unknown>>;
  readonly populationModel?: Readonly<{
    id: string;
    consented: boolean;
    sampleCount: number;
    acceptedProfileIds?: readonly string[];
  }>;
}

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteIssues(value: unknown, path: string, depth = 0): TearStateValidationIssue[] {
  if (depth > 32) return [{ path, code: "depth", message: "state nesting exceeds 32 levels" }];
  if (typeof value === "number" && !Number.isFinite(value)) {
    return [{ path, code: "finite", message: "numeric state must be finite" }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => finiteIssues(entry, `${path}[${String(index)}]`, depth + 1));
  }
  if (!record(value)) return [];
  return Object.entries(value).flatMap(([key, entry]) => {
    if (key === "__proto__" || key === "prototype" || key === "constructor") {
      return [{ path: `${path}.${key}`, code: "dangerous-key", message: "constructor-selecting keys are forbidden" }];
    }
    return finiteIssues(entry, `${path}.${key}`, depth + 1);
  });
}

function numeric(state: Readonly<Record<string, unknown>>, key: string): number | undefined {
  const value = state[key];
  return typeof value === "number" ? value : undefined;
}

export function evaluateTearStateValidity(input: TearStateValidityInput): Readonly<{
  structural: TearStructuralValidityReport;
  reachability: TearRuleReachabilityReport;
  plausibility: TearPopulationPlausibilityReport;
}> {
  const state = input.state ?? {};
  const issues = finiteIssues(state, "state");
  const wave = input.start.wave ?? 1;
  if (!Number.isSafeInteger(wave) || wave < 1) {
    issues.push({ path: "start.wave", code: "wave", message: "wave must be a positive safe integer" });
  }
  const hp = numeric(state, "playerHp");
  const maxHp = numeric(state, "playerMaxHp");
  if (hp !== undefined && maxHp !== undefined && (maxHp <= 0 || hp < 0 || hp > maxHp)) {
    issues.push({ path: "state.playerHp", code: "health", message: "player health must be within [0, maxHp]" });
  }
  const enemyCount = numeric(state, "enemyCount");
  if (enemyCount !== undefined && (!Number.isSafeInteger(enemyCount) || enemyCount < 0)) {
    issues.push({ path: "state.enemyCount", code: "enemy-count", message: "enemy count must be non-negative" });
  }
  const reachabilityReasons: string[] = [];
  if (input.stateClass === "adversarial-impossible") {
    reachabilityReasons.push("state is intentionally classified as adversarial-impossible");
  }
  if (input.start.bossPhase !== undefined && input.start.boss === undefined) {
    reachabilityReasons.push("a boss phase cannot be reached without a declared boss");
  }
  if (wave > 1 && input.stateClass === "reconstructed-reachable"
    && input.constraints?.legalProgression !== true && !record(state.progressionLedger)) {
    reachabilityReasons.push("reconstructed waves after wave 1 require a legal progression ledger");
  }
  if (state.corruptionProfile !== undefined && input.stateClass !== "adversarial-impossible") {
    reachabilityReasons.push("corruption profiles must use adversarial-impossible state class");
  }
  const plausibilityReasons: string[] = [];
  let plausible = input.stateClass !== "plausible-population";
  let provisional = false;
  if (input.stateClass === "plausible-population") {
    const model = input.populationModel;
    if (model === undefined) {
      provisional = true;
      plausibilityReasons.push("no versioned population model was supplied");
    } else if (!model.consented) {
      plausibilityReasons.push("population evidence lacks training consent");
    } else if (!Number.isSafeInteger(model.sampleCount) || model.sampleCount < 100) {
      provisional = true;
      plausibilityReasons.push("population model has fewer than 100 consented samples");
    } else {
      const profile = typeof state.profileId === "string" ? state.profileId : undefined;
      plausible = profile === undefined || model.acceptedProfileIds?.includes(profile) !== false;
      if (!plausible) plausibilityReasons.push(`profile ${profile ?? "(missing)"} is outside the population model`);
    }
  }
  return Object.freeze({
    structural: Object.freeze({ valid: issues.length === 0, issues: Object.freeze(issues) }),
    reachability: Object.freeze({
      reachable: reachabilityReasons.length === 0,
      reasons: Object.freeze(reachabilityReasons),
    }),
    plausibility: Object.freeze({
      plausible,
      provisional,
      reasons: Object.freeze(plausibilityReasons),
      ...(input.populationModel === undefined ? {} : {
        modelId: input.populationModel.id,
        sampleCount: input.populationModel.sampleCount,
      }),
    }),
  });
}
