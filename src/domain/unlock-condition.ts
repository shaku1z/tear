/**
 * The one condition language for "has the player earned this". Music unlocks, achievements and cosmetics
 * all state their requirement in it and ask `conditionMet`; none keeps its own evaluator.
 *
 * Adding a kind of requirement means one more member of `UnlockCondition`, one more case in
 * `parseCondition`, `conditionMet` and `conditionProgress`, and one more answer in `ProgressFacts`.
 */
import { isRecord, PROFILE_NAME } from "./identifiers";

export type UnlockCondition =
  | Readonly<{ type: "default" }>
  | Readonly<{ type: "boss-defeat"; bossId: string }>
  | Readonly<{ type: "biome-enter"; biome: string }>
  | Readonly<{ type: "stat-threshold"; stat: string; goal: number }>
  | Readonly<{ type: "achievement"; id: string }>
  | Readonly<{ type: "all"; of: readonly UnlockCondition[] }>;

/** What the profile can answer. Built by `progressFacts`; never reads the simulation. */
export interface ProgressFacts {
  bossDefeated(bossId: string): boolean;
  biomeEntered(biome: string): boolean;
  stat(key: string): number;
  achievementUnlocked(id: string): boolean;
}

/** How deeply "all" may nest. */
const MAX_CONDITION_DEPTH = 3;

/**
 * Reads a value as a condition. Builds a fresh, typed condition rather than casting, and records every
 * reason a value is not one in `problems` (prefixed by `where`). Returns null when it is not valid.
 */
function parseCondition(value: unknown, where: string, problems: string[], depth: number): UnlockCondition | null {
  if (!isRecord(value) || typeof value.type !== "string") {
    problems.push(`${where}: condition must have a type`);
    return null;
  }
  const kind = value.type;
  const reference = (key: string): string | null => {
    const found = value[key];
    if (typeof found === "string" && PROFILE_NAME.test(found)) return found;
    problems.push(`${where}: ${kind} needs a valid ${key}`);
    return null;
  };
  switch (kind) {
    case "default":
      return { type: "default" };
    case "boss-defeat": {
      const bossId = reference("bossId");
      return bossId === null ? null : { type: "boss-defeat", bossId };
    }
    case "biome-enter": {
      const biome = reference("biome");
      return biome === null ? null : { type: "biome-enter", biome };
    }
    case "achievement": {
      const id = reference("id");
      return id === null ? null : { type: "achievement", id };
    }
    case "stat-threshold": {
      const stat = reference("stat");
      const goal = value.goal;
      if (typeof goal !== "number" || !Number.isFinite(goal) || goal <= 0) {
        problems.push(`${where}: stat-threshold needs a positive goal`);
        return null;
      }
      return stat === null ? null : { type: "stat-threshold", stat, goal };
    }
    case "all": {
      if (depth >= MAX_CONDITION_DEPTH || !Array.isArray(value.of) || value.of.length === 0) {
        problems.push(`${where}: "all" needs a short, non-empty "of" list`);
        return null;
      }
      const parts = value.of.map((entry: unknown) => parseCondition(entry, where, problems, depth + 1));
      const valid = parts.filter((part): part is UnlockCondition => part !== null);
      return valid.length === parts.length ? { type: "all", of: valid } : null;
    }
    default:
      problems.push(`${where}: unknown condition type ${kind}`);
      return null;
  }
}

/** The condition a value states, or null when it is not a valid one (an unreadable condition is never met). */
export function conditionFrom(value: unknown): UnlockCondition | null {
  return parseCondition(value, "", [], 0);
}

/** Every reason a condition value is invalid; empty when valid. `where` prefixes each message. */
export function conditionProblems(value: unknown, where: string): string[] {
  const problems: string[] = [];
  parseCondition(value, where, problems, 0);
  return problems;
}

/** Whether the facts satisfy the condition. */
export function conditionMet(condition: UnlockCondition, facts: ProgressFacts): boolean {
  switch (condition.type) {
    case "default":
      return true;
    case "boss-defeat":
      return facts.bossDefeated(condition.bossId);
    case "biome-enter":
      return facts.biomeEntered(condition.biome);
    case "stat-threshold":
      return facts.stat(condition.stat) >= condition.goal;
    case "achievement":
      return facts.achievementUnlocked(condition.id);
    case "all":
      return condition.of.every((entry) => conditionMet(entry, facts));
  }
}

/** How far along a condition is, as counts for a progress bar: a stat against its goal, parts met, or 0/1. */
export function conditionProgress(
  condition: UnlockCondition,
  facts: ProgressFacts,
): Readonly<{ current: number; goal: number }> {
  switch (condition.type) {
    case "stat-threshold":
      return { current: facts.stat(condition.stat), goal: condition.goal };
    case "all":
      return { current: condition.of.filter((entry) => conditionMet(entry, facts)).length, goal: condition.of.length };
    default:
      return { current: conditionMet(condition, facts) ? 1 : 0, goal: 1 };
  }
}
