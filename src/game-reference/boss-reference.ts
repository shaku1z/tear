import { BOSS_DEFINITIONS, type BossDefinition, type BossDefinitionId } from "../gameplay/run/boss-definitions";
import { STAGES, type StageDefinition, type StageId } from "../gameplay/stages";

export interface GameReferenceBossV1 {
  readonly id: BossDefinitionId;
  readonly name: string;
  readonly stageId: StageId;
  readonly phaseMarks: readonly [number, number];
}

export interface BossReferenceProjectionInput {
  readonly bossDefinitions: readonly BossDefinition[];
  readonly stages: readonly StageDefinition[];
}

export const CANONICAL_BOSS_IDS: readonly BossDefinitionId[] = Object.freeze(BOSS_DEFINITIONS.map((definition) => definition.id));
export const EXPECTED_BOSS_COUNT = CANONICAL_BOSS_IDS.length;
const ACTIVE_STAGE_IDS = Object.freeze(STAGES.map((stage) => stage.id));

function record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${path} must be an object`);
  return value as Record<string, unknown>;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new TypeError(`${path} must be a non-empty string`);
  return value;
}

function finite(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${path} must be a finite number`);
  return value;
}

function exactKeys(value: Record<string, unknown>, path: string, expected: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const allowed = [...expected].sort();
  if (actual.length !== allowed.length || actual.some((key, index) => key !== allowed[index])) throw new TypeError(`${path} has unexpected or missing fields`);
}

function expectedAt<T>(values: readonly T[], index: number, path: string): T {
  const value = values[index];
  if (value === undefined) throw new TypeError(`${path}[${String(index)}] is missing from the canonical signature`);
  return value;
}

function assertExactOrderedIds(actual: readonly string[], expected: readonly string[], path: string): void {
  if (new Set(actual).size !== actual.length) throw new TypeError(`${path} must not contain duplicate IDs`);
  if (actual.length !== expected.length || actual.some((id, index) => id !== expected[index])) throw new TypeError(`${path} must use the exact canonical authored order`);
}

function assertCanonicalIdSet(actual: readonly string[], expected: readonly string[], path: string): void {
  if (new Set(actual).size !== actual.length) throw new TypeError(`${path} must not contain duplicate IDs`);
  if (actual.length !== expected.length || [...actual].sort().some((id, index) => id !== [...expected].sort()[index])) throw new TypeError(`${path} must contain the exact canonical ID set`);
}

function isBossId(value: string): value is BossDefinitionId {
  return CANONICAL_BOSS_IDS.some((id) => id === value);
}

function isStageId(value: string): value is StageId {
  return ACTIVE_STAGE_IDS.some((id) => id === value);
}

function phaseMarks(value: unknown, path: string): readonly [number, number] {
  if (!Array.isArray(value) || value.length !== 2) throw new TypeError(`${path} must contain exactly two phase marks`);
  const first = finite(value[0], `${path}[0]`);
  const second = finite(value[1], `${path}[1]`);
  if (!(first > second && second > 0 && first < 1)) throw new RangeError(`${path} must contain two descending marks in (0, 1)`);
  return Object.freeze([first, second] as [number, number]);
}

function canonicalStageForBoss(id: BossDefinitionId): StageId {
  const stage = STAGES.find((candidate) => candidate.boss === id);
  if (stage === undefined) throw new Error(`missing canonical stage for boss ${id}`);
  return stage.id;
}

function sourceStageBossMap(stages: readonly StageDefinition[], path: string): ReadonlyMap<BossDefinitionId, StageId> {
  if (!Array.isArray(stages)) throw new TypeError(`${path} must be an array`);
  const stageIds = stages.map((stage, index) => text(record(stage, `${path}[${String(index)}]`).id, `${path}[${String(index)}].id`));
  assertCanonicalIdSet(stageIds, ACTIVE_STAGE_IDS, `${path} IDs`);
  const stagesById = new Map<StageId, Record<string, unknown>>();
  stages.forEach((stage, index) => {
    const source = record(stage, `${path}[${String(index)}]`);
    const id = text(source.id, `${path}[${String(index)}].id`);
    if (!isStageId(id)) throw new TypeError(`${path}[${String(index)}].id is not canonical`);
    stagesById.set(id, source);
  });
  const result = new Map<BossDefinitionId, StageId>();
  for (const stageId of ACTIVE_STAGE_IDS) {
    const source = stagesById.get(stageId);
    const canonical = STAGES.find((candidate) => candidate.id === stageId);
    if (source === undefined || canonical === undefined) throw new TypeError(`${path} is missing canonical stage ${stageId}`);
    const boss = text(source.boss, `${path}.${stageId}.boss`);
    if (!isBossId(boss)) throw new TypeError(`${path}.${stageId}.boss is not canonical`);
    if (boss !== canonical.boss) throw new TypeError(`${path}.${stageId}.boss does not match the canonical stage mapping`);
    if (result.has(boss)) throw new TypeError(`${path} must map each boss exactly once`);
    result.set(boss, stageId);
  }
  if (result.size !== EXPECTED_BOSS_COUNT || CANONICAL_BOSS_IDS.some((id) => !result.has(id))) throw new TypeError(`${path} must form a ${String(EXPECTED_BOSS_COUNT)}-way boss/stage bijection`);
  return result;
}

function projectDefinition(value: unknown, expected: BossDefinition, path: string): Readonly<{ id: BossDefinitionId; name: string; phaseMarks: readonly [number, number] }> {
  const source = record(value, path);
  exactKeys(source, path, ["id", "name", "phaseMarks"]);
  const id = text(source.id, `${path}.id`);
  if (id !== expected.id) throw new TypeError(`${path}.id must use the exact canonical authored order`);
  const name = text(source.name, `${path}.name`);
  if (name !== expected.name) throw new TypeError(`${path}.name does not match the canonical authored boss name`);
  const marks = phaseMarks(source.phaseMarks, `${path}.phaseMarks`);
  if (marks[0] !== expected.phaseMarks[0] || marks[1] !== expected.phaseMarks[1]) throw new TypeError(`${path}.phaseMarks do not match the canonical authored thresholds`);
  return Object.freeze({ id: expected.id, name: expected.name, phaseMarks: marks });
}

/** Projects authored boss identity and phase thresholds without runtime constructors. */
export function projectBossReference(input: BossReferenceProjectionInput): readonly GameReferenceBossV1[] {
  if (!Array.isArray(input.bossDefinitions)) throw new TypeError("bossDefinitions must be an array");
  const definitionIds = input.bossDefinitions.map((definition, index) => text(record(definition, `bossDefinitions[${String(index)}]`).id, `bossDefinitions[${String(index)}].id`));
  assertExactOrderedIds(definitionIds, CANONICAL_BOSS_IDS, "bossDefinitions");
  const stageByBoss = sourceStageBossMap(input.stages, "stages");
  const bosses = Object.freeze(input.bossDefinitions.map((definition, index) => {
    const expected = expectedAt(BOSS_DEFINITIONS, index, "bossDefinitions");
    const projected = projectDefinition(definition, expected, `bossDefinitions[${String(index)}]`);
    const stageId = stageByBoss.get(projected.id);
    if (stageId === undefined) throw new TypeError(`missing stage mapping for boss ${projected.id}`);
    return Object.freeze({ id: projected.id, name: projected.name, stageId, phaseMarks: projected.phaseMarks });
  }));
  return validateProjectedBosses(bosses, "gameReference.collections.bosses.items");
}

/** Strictly validates an imported, data-only boss catalog and returns a frozen copy. */
export function validateProjectedBosses(value: unknown, path: string): readonly GameReferenceBossV1[] {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`);
  const ids = value.map((entry, index) => text(record(entry, `${path}[${String(index)}]`).id, `${path}[${String(index)}].id`));
  assertExactOrderedIds(ids, CANONICAL_BOSS_IDS, path);
  const bosses = Object.freeze(value.map((entry, index) => {
    const source = record(entry, `${path}[${String(index)}]`);
    exactKeys(source, `${path}[${String(index)}]`, ["id", "name", "stageId", "phaseMarks"]);
    const expected = expectedAt(BOSS_DEFINITIONS, index, path);
    const id = text(source.id, `${path}[${String(index)}].id`);
    if (id !== expected.id) throw new TypeError(`${path}[${String(index)}].id must use the exact canonical authored order`);
    const name = text(source.name, `${path}[${String(index)}].name`);
    if (name !== expected.name) throw new TypeError(`${path}[${String(index)}].name does not match the canonical authored boss name`);
    const stageId = text(source.stageId, `${path}[${String(index)}].stageId`);
    if (!isStageId(stageId) || stageId !== canonicalStageForBoss(expected.id)) throw new TypeError(`${path}[${String(index)}].stageId does not match the canonical stage mapping`);
    const marks = phaseMarks(source.phaseMarks, `${path}[${String(index)}].phaseMarks`);
    if (marks[0] !== expected.phaseMarks[0] || marks[1] !== expected.phaseMarks[1]) throw new TypeError(`${path}[${String(index)}].phaseMarks do not match the canonical authored thresholds`);
    return Object.freeze({ id: expected.id, name: expected.name, stageId, phaseMarks: marks });
  }));
  const stageIds = bosses.map((boss) => boss.stageId);
  assertCanonicalIdSet(stageIds, ACTIVE_STAGE_IDS, `${path}.stageId`);
  return bosses;
}
