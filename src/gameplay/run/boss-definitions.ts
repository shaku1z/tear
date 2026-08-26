/** Pure authored boss identity authority; Rootbound remains factory-unavailable until VS3-C10. */
export const BOSS_IDENTITY_IDS = Object.freeze([
  "warden", "colossus", "aldric", "rootbound", "echo", "source",
] as const);
export type BossDefinitionId = typeof BOSS_IDENTITY_IDS[number];

export interface BossDefinition {
  readonly id: BossDefinitionId;
  readonly name: string;
  readonly phaseMarks: readonly [number, number];
}

export const BOSS_DEFINITIONS = Object.freeze([
  Object.freeze({ id: "warden", name: "The Warden", phaseMarks: Object.freeze([0.65, 0.30] as const) }),
  Object.freeze({ id: "colossus", name: "Iron Colossus", phaseMarks: Object.freeze([0.60, 0.25] as const) }),
  Object.freeze({ id: "aldric", name: "Berserker King", phaseMarks: Object.freeze([0.65, 0.20] as const) }),
  Object.freeze({ id: "echo", name: "The Echo", phaseMarks: Object.freeze([0.60, 0.25] as const) }),
  Object.freeze({ id: "source", name: "The Source", phaseMarks: Object.freeze([0.58, 0.28] as const) }),
] as const satisfies readonly BossDefinition[]);

export function bossDefinition(id: BossDefinitionId): BossDefinition {
  const definition = BOSS_DEFINITIONS.find((candidate) => candidate.id === id);
  if (definition === undefined) throw new Error(`unknown boss definition ${id}`);
  return definition;
}

export function bossPhaseMarks(id: BossDefinitionId): readonly [number, number] {
  return bossDefinition(id).phaseMarks;
}

export function bossPhaseMark(id: BossDefinitionId, index: 0 | 1): number {
  return bossPhaseMarks(id)[index];
}
