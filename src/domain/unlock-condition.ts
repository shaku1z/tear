/**
 * One condition language for "has the player earned this": the shape the music unlocks already use
 * (`default`, `boss-defeat`, `biome-enter`) and the shape achievements already use (`stat-threshold`),
 * plus `achievement` and `all` so a cosmetic can combine them. Cosmetics read it through
 * `conditionMet`; music and achievements keep their own call sites and can move to this evaluator
 * without a change of data, because their shapes are a subset of it.
 */
export type UnlockCondition =
  | Readonly<{ type: "default" }>
  | Readonly<{ type: "boss-defeat"; bossId: string }>
  | Readonly<{ type: "biome-enter"; biome: string }>
  | Readonly<{ type: "stat-threshold"; stat: string; goal: number }>
  | Readonly<{ type: "achievement"; id: string }>
  | Readonly<{ type: "all"; of: readonly UnlockCondition[] }>;

/** What the profile can answer. Built by the profile store; never reads the simulation. */
export interface ProgressFacts {
  bossDefeated(bossId: string): boolean;
  biomeEntered(biome: string): boolean;
  stat(key: string): number;
  achievementUnlocked(id: string): boolean;
}

const NAME = /^[A-Za-z0-9_-]{1,64}$/u;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Every reason a condition value is invalid; empty when valid. `where` prefixes each message. */
export function conditionProblems(value: unknown, where: string, depth = 0): string[] {
  if (!record(value) || typeof value.type !== "string") return [`${where}: condition must have a type`];
  const need = (key: string): string[] =>
    typeof value[key] === "string" && NAME.test(value[key])
      ? []
      : [`${where}: ${String(value.type)} needs a valid ${key}`];
  switch (value.type) {
    case "default":
      return [];
    case "boss-defeat":
      return need("bossId");
    case "biome-enter":
      return need("biome");
    case "achievement":
      return need("id");
    case "stat-threshold":
      return [
        ...need("stat"),
        ...(typeof value.goal === "number" && Number.isFinite(value.goal) && value.goal > 0
          ? []
          : [`${where}: stat-threshold needs a positive goal`]),
      ];
    case "all":
      if (depth >= 3 || !Array.isArray(value.of) || value.of.length === 0)
        return [`${where}: "all" needs a short, non-empty "of" list`];
      return value.of.flatMap((entry: unknown) => conditionProblems(entry, where, depth + 1));
    default:
      return [`${where}: unknown condition type ${value.type}`];
  }
}

/** Whether the facts satisfy the condition. An invalid condition is never met. */
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
      return condition.of.length > 0 && condition.of.every((entry) => conditionMet(entry, facts));
    default:
      return false;
  }
}
