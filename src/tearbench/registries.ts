import { BOSS_DEFINITIONS, BOSS_IDENTITY_IDS, type BossDefinitionId } from "../gameplay/run/boss-definitions";
import { DIFFICULTY_IDS as GAME_DIFFICULTY_IDS, type DifficultyId } from "../gameplay/run/difficulty-catalog";
import { MODE_IDS as GAME_MODE_IDS, type ModeDefinition } from "../gameplay/run/mode-catalog";
import {
  ENEMY_IDENTITY_IDS as GAME_ENEMY_IDENTITY_IDS,
  PUBLISHED_ENEMY_IDENTITY_IDS,
} from "../gameplay/run/content-director";
import {
  PUBLISHED_STAGE_IDS,
  STAGE_IDS as GAME_STAGE_IDS,
  bossIdsAvailableOn,
  type StageId,
} from "../gameplay/stages";
import { CANONICAL_UPGRADE_IDS as GAME_UPGRADE_IDS } from "../gameplay/upgrades";
import { GAMEPLAY_EVENT_KIND_IDS as GAME_EVENT_KIND_IDS } from "../gameplay/runtime/gameplay-events";
import { ENVIRONMENT_OBJECT_KIND_IDS as GAME_ENVIRONMENT_OBJECT_KIND_IDS, type EnvironmentObjectKind } from "../gameplay/environment/environment-object-kinds";
import { WEAPON_IDS as GAME_WEAPON_IDS, type WeaponId } from "../gameplay/weapon-selection";

const STABLE_ID_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

export interface StableRegistry<TId extends string> {
  readonly ids: readonly TId[];
  has(value: string): value is TId;
  assert(value: string): TId;
}

export function createStableRegistry<const TIds extends readonly string[]>(
  label: string,
  ids: TIds,
): StableRegistry<TIds[number]> {
  const seen = new Set<string>();
  for (const id of ids) {
    if (!STABLE_ID_PATTERN.test(id)) throw new TypeError(`${label} contains invalid stable id: ${id}`);
    if (seen.has(id)) throw new TypeError(`${label} contains duplicate stable id: ${id}`);
    seen.add(id);
  }
  const frozen = Object.freeze([...ids]);
  return Object.freeze({
    ids: frozen,
    has(value: string): value is TIds[number] { return seen.has(value); },
    assert(value: string): TIds[number] {
      if (!seen.has(value)) throw new RangeError(`unknown ${label} id: ${value}`);
      return value;
    },
  });
}

/** Canonical scenario capabilities are owned here, not inferred from catalog prose. */
export const GAMEPLAY_SCENARIO_SUBJECT_IDS = Object.freeze([
  "boot", "movement", "dash", "blade", "parry", "wave", "draft", "variant-selection",
] as const);
export const GAMEPLAY_SCENARIO_SUBJECT_REGISTRY = createStableRegistry(
  "gameplay scenario subject", GAMEPLAY_SCENARIO_SUBJECT_IDS,
);
export const HEADLESS_GAMEPLAY_SCENARIO_SUBJECT_IDS = Object.freeze([
  "boot", "movement", "dash",
] as const);
export const ENVIRONMENT_FIELD_SCENARIO_SUBJECT_IDS = Object.freeze(["generic-field", "verdant-bloom-well"] as const);
export const ENVIRONMENT_COMBAT_OBJECT_SCENARIO_SUBJECT_IDS = Object.freeze(["generic-combat-object", "verdant-root-network", "rootbound-graft-anchor"] as const);
export const ENVIRONMENT_FIELD_SCENARIO_SUBJECT_REGISTRY = createStableRegistry("environment field scenario subject", ENVIRONMENT_FIELD_SCENARIO_SUBJECT_IDS);
export const ENVIRONMENT_COMBAT_OBJECT_SCENARIO_SUBJECT_REGISTRY = createStableRegistry("environment combat-object scenario subject", ENVIRONMENT_COMBAT_OBJECT_SCENARIO_SUBJECT_IDS);

export const EVENT_IDS = Object.freeze([
  "run.started", "run.paused", "run.resumed", "run.completed", "run.defeated", "run.abandoned", "run.continued",
  "stage.entered", "stage.exited", "wave.started", "wave.spawn-completed", "wave.cleared",
  "boss.intro-started", "boss.intro-finished", "boss.phase-changed", "boss.attack-started",
  "boss.attack-committed", "boss.attack-resolved", "boss.defeated",
  "player.jump-started", "player.dash-started", "player.damaged", "player.healed",
  "player.shield-absorbed", "player.revived", "player.fell-out",
  "blade.swing-committed", "blade.hit", "blade.launch", "blade.slam", "blade.power-slam",
  "blade.thrown", "blade.throw-resolved", "blade.embedded", "blade.recalled", "blade.caught", "blade.stolen",
  "combat.deflect", "combat.perfect-parry", "combat.kill", "combat.multikill", "combat.style-rank-changed",
  "projectile.spawned", "projectile.deflected", "projectile.owner-changed", "projectile.hit", "projectile.expired",
  "enemy.spawned", "enemy.attack-started", "enemy.status-changed", "enemy.defeated",
  "status.applied", "status.refreshed", "status.expired", "status.detonated",
  "draft.opened", "draft.offered", "draft.rerolled", "draft.selected", "tier.offered", "tier.selected",
  "weapon.selected",
  "world.platform-created", "world.platform-mutated", "world.platform-destroyed",
  "world.hazard-started", "world.hazard-resolved", "world.void-scroll-started", "world.void-rescue",
  "world.environment-field-started", "world.environment-field-resolved", "world.environment-combat-object-link-created", "world.environment-combat-object-damaged", "world.environment-combat-object-destroyed", "world.environment-object-cleaned",
  "ui.screen-entered", "ui.screen-exited", "ui.focus-changed", "ui.action-confirmed",
  "system.checkpoint", "system.integrity-warning", "system.drift-detected", "system.exception",
  "system.storage-pressure",
  "practice.fork-created", "practice.restart", "challenge.started", "challenge.completed",
  "test.invariant-failed", "test.branch-diverged", "test.failure-minimized",
  "agent.objective-changed", "agent.target-changed", "agent.recovery-started", "agent.human-takeover",
] as const);

export const EVENT_REGISTRY = createStableRegistry("event", EVENT_IDS);
export type TearEventId = typeof EVENT_IDS[number];

/** Native event families remain source-owned; historical causal IDs are a separate ontology. */
export const NATIVE_GAMEPLAY_EVENT_KIND_IDS = GAME_EVENT_KIND_IDS;
export const NATIVE_GAMEPLAY_EVENT_KIND_REGISTRY = createStableRegistry("native gameplay event", NATIVE_GAMEPLAY_EVENT_KIND_IDS);

export const ENTITY_KIND_IDS = Object.freeze([
  "player", "blade", "projectile", "platform", "hazard",
  ...GAME_ENEMY_IDENTITY_IDS,
  "reflection", "void-wisp",
  ...BOSS_IDENTITY_IDS,
] as const);
export const ENTITY_KIND_REGISTRY = createStableRegistry("entity kind", ENTITY_KIND_IDS);
export type TearEntityKindId = typeof ENTITY_KIND_IDS[number];

/** Environment object kinds are owned by gameplay/environment, then projected here for TearBench. */
export const ENVIRONMENT_OBJECT_KIND_IDS = GAME_ENVIRONMENT_OBJECT_KIND_IDS;
export const ENVIRONMENT_OBJECT_KIND_REGISTRY = createStableRegistry("environment object kind", ENVIRONMENT_OBJECT_KIND_IDS);
export type TearEnvironmentObjectKind = EnvironmentObjectKind;

/** Exact published coverage. Preview identities are deliberately absent here. */
export const PRODUCTION_IDENTITY_COVERAGE = Object.freeze({
  stages: PUBLISHED_STAGE_IDS,
  bosses: bossIdsAvailableOn("published"),
  enemies: PUBLISHED_ENEMY_IDENTITY_IDS,
  environmentObjectKinds: ENVIRONMENT_OBJECT_KIND_IDS,
});

/** Complete authored coverage retained for explicit Playground/State Forge engineering. */
export const ENGINEERING_IDENTITY_COVERAGE = Object.freeze({
  stages: GAME_STAGE_IDS,
  bosses: BOSS_IDENTITY_IDS,
  enemies: GAME_ENEMY_IDENTITY_IDS,
  environmentObjectKinds: ENVIRONMENT_OBJECT_KIND_IDS,
});

/** TearBench consumes the production weapon roster; retired migrations stay at the gameplay boundary. */
export const WEAPON_IDS = GAME_WEAPON_IDS;
export const WEAPON_REGISTRY = createStableRegistry("weapon", WEAPON_IDS);
export type TearWeaponId = WeaponId;

/** Authored boss identities accepted by explicit engineering scenarios. */
export const BOSS_IDS: readonly BossDefinitionId[] = BOSS_IDENTITY_IDS;
export const BOSS_REGISTRY = createStableRegistry("boss", BOSS_IDS);
/** Boss identities advertised by the current published ruleset. */
export const PUBLISHED_BOSS_IDS: readonly BossDefinitionId[] = PRODUCTION_IDENTITY_COVERAGE.bosses;
export const PUBLISHED_BOSS_REGISTRY = createStableRegistry("published boss", PUBLISHED_BOSS_IDS);
/** Bosses with current production constructors; Rootbound joins this at C10. */
export const BOSS_FACTORY_IDS: readonly BossDefinitionId[] = Object.freeze(BOSS_DEFINITIONS.map((boss) => boss.id));
export type TearBossId = BossDefinitionId;

export const RUN_MODE_IDS = GAME_MODE_IDS;
export const RUN_MODE_REGISTRY = createStableRegistry("run mode", RUN_MODE_IDS);
export type TearRunModeId = ModeDefinition["id"];

export const DIFFICULTY_IDS = GAME_DIFFICULTY_IDS;
export const DIFFICULTY_REGISTRY = createStableRegistry("difficulty", DIFFICULTY_IDS);
export type TearDifficultyId = DifficultyId;

/** Authored stages accepted by explicit engineering scenarios. */
export const STAGE_IDS = GAME_STAGE_IDS;
export const STAGE_REGISTRY = createStableRegistry("stage", STAGE_IDS);
/** Stages advertised by the current published ruleset. */
export const PUBLISHED_TEARBENCH_STAGE_IDS = PUBLISHED_STAGE_IDS;
export const PUBLISHED_STAGE_REGISTRY = createStableRegistry("published stage", PUBLISHED_TEARBENCH_STAGE_IDS);
export type TearStageId = StageId;

/** Upgrade identity is owned by the same canonical catalog used by production drafts. */
export const UPGRADE_IDS = GAME_UPGRADE_IDS;
export const UPGRADE_REGISTRY = createStableRegistry("upgrade", UPGRADE_IDS);
export type TearUpgradeId = typeof UPGRADE_IDS[number];

export const CODEC_IDS = Object.freeze([
  "tear.player.v1", "tear.blade.v1", "tear.run.v1", "tear.world.v1", "tear.enemy.v1",
  "tear.boss.v1", "tear.projectile.v1", "tear.platform.v1", "tear.hazard.v1", "tear.ui.v1",
  "tear.reward.v1", "tear.configuration.v1", "tear.rng.v1", "tear.cinematic.v1",
] as const);
export const CODEC_REGISTRY = createStableRegistry("codec", CODEC_IDS);
export type TearCodecId = typeof CODEC_IDS[number];

export const INVARIANT_IDS = Object.freeze([
  "runtime.finite-state", "player.finite-transform", "blade.finite-transform", "entity.unique-id",
  "entity.valid-owner", "player.valid-health", "world.legal-bounds", "wave.valid-completion",
  "boss.valid-phase", "ui.valid-focus", "runtime.pause-freezes-simulation", "runtime.no-softlock",
  "replay.monotonic-time", "replay.branch-equivalence", "test.production-isolation",
  "environment.finite-state", "environment.unique-id", "environment.valid-references", "environment.no-orphan-link", "environment.legal-transition", "environment.bounded",
] as const);
export const INVARIANT_REGISTRY = createStableRegistry("invariant", INVARIANT_IDS);
export type TearInvariantId = typeof INVARIANT_IDS[number];
/** Registered ontology IDs that are intentionally unavailable until a real input contract exists. */
export const UNSUPPORTED_INVARIANT_IDS = Object.freeze([
  "replay.branch-equivalence", "test.production-isolation",
] as const satisfies readonly TearInvariantId[]);

export const WITHIN_TICK_PHASES = Object.freeze([
  "input-canonicalized",
  "pre-simulation",
  "player-and-blade",
  "enemy-ai",
  "projectiles-and-hazards",
  "collision-and-damage",
  "deaths-and-rewards",
  "wave-draft-and-state-transitions",
  "post-simulation-commit",
  "presentation-only",
] as const);
export type TearWithinTickPhase = typeof WITHIN_TICK_PHASES[number];

export function withinTickPhaseOrder(phase: TearWithinTickPhase): number {
  const order = WITHIN_TICK_PHASES.indexOf(phase);
  if (order < 0) throw new RangeError(`unknown within-tick phase: ${phase}`);
  return order;
}
