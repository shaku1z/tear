import type { RunDifficulty, RunDifficultyScaling } from "./session";

export interface DifficultyStartDefinition {
  readonly id: RunDifficulty;
  readonly oneHit?: boolean;
  readonly mods?: Readonly<{
    readonly dmg?: number;
    readonly coin?: number;
    readonly score?: number;
    readonly hp?: number;
    readonly count?: number;
  }>;
}

export interface RemoteRunScaling {
  readonly coinMult: number;
  readonly scoreMult: number;
  readonly enemyHpMult: number;
  readonly enemyDensityMult: number;
}

export interface RunStartPlan {
  readonly difficulty: RunDifficulty;
  readonly oneHit: boolean;
  readonly playerDamageMultiplier: number;
  readonly scaling: RunDifficultyScaling;
}

function positive(value: number | undefined, fallback = 1): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** Derives per-run difficulty values without mutating the shared difficulty definition. */
export function planRunStart(
  requested: RunDifficulty,
  definitions: readonly DifficultyStartDefinition[],
  remote: RemoteRunScaling,
): RunStartPlan {
  const definition = definitions.find((candidate) => candidate.id === requested) ?? definitions[0];
  if (definition === undefined) throw new Error("at least one run difficulty is required");
  const mods = definition.mods ?? {};
  return Object.freeze({
    difficulty: definition.id,
    oneHit: definition.oneHit === true,
    playerDamageMultiplier: positive(mods.dmg),
    scaling: Object.freeze({
      coin: positive(mods.coin) * positive(remote.coinMult),
      score: positive(mods.score) * positive(remote.scoreMult),
      enemyHp: positive(mods.hp) * positive(remote.enemyHpMult),
      enemyCount: positive(mods.count) * positive(remote.enemyDensityMult),
    }),
  });
}
