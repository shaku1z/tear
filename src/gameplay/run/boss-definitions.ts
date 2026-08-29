/** Pure authored boss identity authority. */
export const BOSS_IDENTITY_IDS = Object.freeze([
  "warden", "colossus", "aldric", "rootbound", "white-hart", "echo", "source",
] as const);
export type BossDefinitionId = typeof BOSS_IDENTITY_IDS[number];

export function isBossDefinitionId(value: string): value is BossDefinitionId {
  return BOSS_IDENTITY_IDS.some((id) => id === value);
}

export interface BossDefinition {
  readonly id: BossDefinitionId;
  readonly name: string;
  readonly phaseMarks: readonly [number, number];
}

/**
 * Authored Rootbound metadata reserved for the C10 production factory slice.
 * Keeping it outside BOSS_DEFINITIONS until construction exists prevents the
 * factory-ready roster and public projections from advertising a false boss.
 */
export const ROOTBOUND_PROVISIONAL_DEFINITION = Object.freeze({
  id: "rootbound",
  name: "The Rootbound",
  phaseMarks: Object.freeze([0.65, 0.28] as const),
} as const satisfies BossDefinition);

/** Pale boss identity promoted into the executable roster by PT3-C6. */
export const WHITE_HART_PROVISIONAL_DEFINITION = Object.freeze({
  id: "white-hart",
  name: "The White Hart",
  phaseMarks: Object.freeze([0.65, 0.28] as const),
} as const satisfies BossDefinition);

export const BOSS_DEFINITIONS = Object.freeze([
  Object.freeze({ id: "warden", name: "The Warden", phaseMarks: Object.freeze([0.65, 0.30] as const) }),
  Object.freeze({ id: "colossus", name: "Iron Colossus", phaseMarks: Object.freeze([0.60, 0.25] as const) }),
  Object.freeze({ id: "aldric", name: "Berserker King", phaseMarks: Object.freeze([0.65, 0.20] as const) }),
  ROOTBOUND_PROVISIONAL_DEFINITION,
  WHITE_HART_PROVISIONAL_DEFINITION,
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

/** Transitional production authority: authored phase work removes ordinals as attacks become real. */
export const ROOTBOUND_UNAVAILABLE_PHASE_ORDINALS = Object.freeze([2, 3] as const);
export const WHITE_HART_UNAVAILABLE_PHASE_ORDINALS = Object.freeze([] as const);
export function bossPhaseAttackAvailable(id: BossDefinitionId, phase: number): boolean {
  if (id === "rootbound") return !ROOTBOUND_UNAVAILABLE_PHASE_ORDINALS.some((ordinal) => ordinal === phase);
  if (id === "white-hart") return !WHITE_HART_UNAVAILABLE_PHASE_ORDINALS.some((ordinal) => ordinal === phase);
  return true;
}
