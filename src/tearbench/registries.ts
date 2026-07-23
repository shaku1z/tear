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

export const EVENT_IDS = Object.freeze([
  "run.started", "run.paused", "run.resumed", "run.completed", "run.defeated", "run.abandoned", "run.continued",
  "stage.entered", "stage.exited", "wave.started", "wave.spawn-completed", "wave.cleared",
  "boss.intro-started", "boss.intro-finished", "boss.phase-changed", "boss.attack-started",
  "boss.attack-committed", "boss.attack-resolved", "boss.defeated",
  "player.jump-started", "player.dash-started", "player.damaged", "player.healed",
  "player.shield-absorbed", "player.revived", "player.fell-out",
  "blade.swing-committed", "blade.hit", "blade.launch", "blade.slam", "blade.power-slam",
  "blade.thrown", "blade.embedded", "blade.recalled", "blade.caught", "blade.stolen",
  "combat.deflect", "combat.perfect-parry", "combat.kill", "combat.multikill", "combat.style-rank-changed",
  "projectile.spawned", "projectile.deflected", "projectile.owner-changed", "projectile.hit", "projectile.expired",
  "enemy.spawned", "enemy.attack-started", "enemy.status-changed", "enemy.defeated",
  "status.applied", "status.refreshed", "status.expired", "status.detonated",
  "draft.opened", "draft.offered", "draft.rerolled", "draft.selected", "tier.offered", "tier.selected",
  "weapon.selected",
  "world.platform-created", "world.platform-mutated", "world.platform-destroyed",
  "world.hazard-started", "world.hazard-resolved", "world.void-scroll-started", "world.void-rescue",
  "ui.screen-entered", "ui.screen-exited", "ui.focus-changed", "ui.action-confirmed",
  "system.checkpoint", "system.integrity-warning", "system.drift-detected", "system.exception",
  "system.storage-pressure",
  "practice.fork-created", "practice.restart", "challenge.started", "challenge.completed",
  "test.invariant-failed", "test.branch-diverged", "test.failure-minimized",
  "agent.objective-changed", "agent.target-changed", "agent.recovery-started", "agent.human-takeover",
] as const);

export const EVENT_REGISTRY = createStableRegistry("event", EVENT_IDS);
export type TearEventId = typeof EVENT_IDS[number];

export const ENTITY_KIND_IDS = Object.freeze([
  "player", "blade", "projectile", "platform", "hazard",
  "charger", "ranged", "flyer", "bomber", "armored", "priest", "mender", "herald", "anchor", "wraith", "chimera",
  "warden", "colossus", "aldric", "echo", "source",
] as const);
export const ENTITY_KIND_REGISTRY = createStableRegistry("entity kind", ENTITY_KIND_IDS);
export type TearEntityKindId = typeof ENTITY_KIND_IDS[number];

export const WEAPON_IDS = Object.freeze(["sword", "hammer", "spear", "chainblade", "ringblade"] as const);
export const WEAPON_REGISTRY = createStableRegistry("weapon", WEAPON_IDS);
export type TearWeaponId = typeof WEAPON_IDS[number];

export const BOSS_IDS = Object.freeze(["warden", "colossus", "aldric", "echo", "source"] as const);
export const BOSS_REGISTRY = createStableRegistry("boss", BOSS_IDS);
export type TearBossId = typeof BOSS_IDS[number];

export const RUN_MODE_IDS = Object.freeze([
  "campaign", "endless", "gauntlet", "playground", "tutorial", "bossonly", "sandbox",
] as const);
export const RUN_MODE_REGISTRY = createStableRegistry("run mode", RUN_MODE_IDS);
export type TearRunModeId = typeof RUN_MODE_IDS[number];

export const DIFFICULTY_IDS = Object.freeze(["easy", "normal", "hard", "extreme", "onehit"] as const);
export const DIFFICULTY_REGISTRY = createStableRegistry("difficulty", DIFFICULTY_IDS);
export type TearDifficultyId = typeof DIFFICULTY_IDS[number];

export const CODEC_IDS = Object.freeze([
  "tear.player.v1", "tear.blade.v1", "tear.run.v1", "tear.world.v1", "tear.enemy.v1",
  "tear.boss.v1", "tear.projectile.v1", "tear.platform.v1", "tear.hazard.v1", "tear.ui.v1",
  "tear.configuration.v1", "tear.rng.v1",
] as const);
export const CODEC_REGISTRY = createStableRegistry("codec", CODEC_IDS);
export type TearCodecId = typeof CODEC_IDS[number];

export const INVARIANT_IDS = Object.freeze([
  "runtime.finite-state", "player.finite-transform", "blade.finite-transform", "entity.unique-id",
  "entity.valid-owner", "player.valid-health", "world.legal-bounds", "wave.valid-completion",
  "boss.valid-phase", "ui.valid-focus", "runtime.pause-freezes-simulation", "runtime.no-softlock",
  "replay.monotonic-time", "test.production-isolation",
] as const);
export const INVARIANT_REGISTRY = createStableRegistry("invariant", INVARIANT_IDS);
export type TearInvariantId = typeof INVARIANT_IDS[number];

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
