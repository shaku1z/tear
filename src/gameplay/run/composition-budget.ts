import type { CampaignPoolEntry, EnemyKind } from "./content-director";

export interface CompositionBudgetDefinition {
  readonly localWaveBudgets: readonly number[];
  readonly costs: Readonly<Partial<Record<EnemyKind, number>>>;
  readonly maximumPerWave: Readonly<Partial<Record<EnemyKind, readonly number[]>>>;
}

export interface CompositionBudgetState {
  readonly spent: number;
  readonly counts: Readonly<Partial<Record<EnemyKind, number>>>;
}

export function emptyCompositionBudgetState(): CompositionBudgetState {
  return Object.freeze({ spent: 0, counts: Object.freeze({}) });
}

function localValue(values: readonly number[], localWave: number, label: string): number {
  const value = values[localWave - 1];
  if (value === undefined || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} requires a non-negative value for local wave ${String(localWave)}`);
  }
  return value;
}

export function compositionCost(definition: CompositionBudgetDefinition, kind: EnemyKind): number {
  return definition.costs[kind] ?? 0;
}

export function eligibleCompositionPool(
  pool: readonly CampaignPoolEntry[],
  definition: CompositionBudgetDefinition,
  localWave: number,
  state: CompositionBudgetState,
): readonly CampaignPoolEntry[] {
  const budget = localValue(definition.localWaveBudgets, localWave, "composition budget");
  return pool.filter((entry) => {
    if (state.spent + compositionCost(definition, entry.kind) > budget) return false;
    const maximum = definition.maximumPerWave[entry.kind];
    return maximum === undefined || (state.counts[entry.kind] ?? 0) < localValue(maximum, localWave, `${entry.kind} cap`);
  });
}

export function recordCompositionKind(
  definition: CompositionBudgetDefinition,
  state: CompositionBudgetState,
  kind: EnemyKind,
): CompositionBudgetState {
  return Object.freeze({
    spent: state.spent + compositionCost(definition, kind),
    counts: Object.freeze({ ...state.counts, [kind]: (state.counts[kind] ?? 0) + 1 }),
  });
}
