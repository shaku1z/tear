import type { GameRuntimeDependencies } from "./game-runtime-dependencies";
import type {
  GameBlade,
  GameEnemy,
  GameFloater,
  GamePlayer,
  GameProjectile,
  GameRun,
  GameSlowZone,
  GameTemporaryWall,
} from "./game-runtime-state";
import type { LiveGameHostState } from "./live-game-host-state";
import type { LiveWorldEntityConstructionPort } from "./live-world-entity-factory";
import type { RunRandomStreamsSnapshot } from "../simulation/run-random";
import type { RunRandomStreamName } from "../simulation/run-random";
import type { RandomSource } from "../domain/random";
import type { TearWorldServices } from "../gameplay/runtime/tear-world-context";
import type { LegacyGhostRuntimeState } from "../replay/legacy-compat";
import type { CombatEntityIdentityState } from "../gameplay/combat/combat-entity-runtime";
import type { RewardSelectionSnapshot } from "../gameplay/run/reward-selection";
import type { UpgradeDefinition } from "../gameplay/upgrades";
import type { TearCodecValue, TearCodecWorld } from "../tearbench/state-codecs";
import type { TearLiveRestoreContext, TearLiveWorldAdapter } from "../tearbench/live-state-snapshot";
import {
  applyTearCodecConfiguration,
  decodeTearCodecValue,
  hydrateTearCodecWorld,
  type TearStagedWorld,
  type TearWorldConstructionPort,
} from "../tearbench/detached-world-hydrator";

interface Platform {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly floor?: boolean;
  readonly oneway?: boolean;
}
type Candidate = TearStagedWorld<
  GameRun,
  GamePlayer,
  GameBlade,
  GameEnemy,
  GameProjectile,
  RewardSelectionSnapshot<UpgradeDefinition>,
  GameFloater,
  GameSlowZone,
  GameTemporaryWall,
  Platform,
  RunRandomStreamsSnapshot,
  CombatEntityIdentityState,
  LegacyGhostRuntimeState
>;
type StateForgeWorldServices = Pick<
  TearWorldServices<RunRandomStreamsSnapshot, RunRandomStreamName, RandomSource, GameRuntimeDependencies["CONFIG"]>,
  "configuration" | "random"
>;

export interface LiveStateForgeAdapterOptions {
  readonly dependencies: GameRuntimeDependencies;
  readonly entities: LiveWorldEntityConstructionPort;
  readonly worldServices: StateForgeWorldServices;
  readonly state: LiveGameHostState;
  readonly actorId: (entity: object, prefix: "enemy" | "projectile") => string;
  readonly bindActorId: (entity: object, id: string) => void;
  readonly platforms: () => Platform[];
  readonly stageIndex: () => number;
  readonly restoreStageIndex: (index: number) => void;
  readonly replacePlatforms: (platforms: Platform[]) => void;
  readonly slowZones: () => GameSlowZone[];
  readonly walls: () => GameTemporaryWall[];
  readonly screen: () => string;
  readonly setScreen: (screen: string) => void;
  readonly focus: () => number;
  readonly setFocus: (focus: number) => void;
  readonly tick: () => number;
  readonly setTick: (tick: number) => void;
  /** Removes browser-only input projection from a newly committed actor pair. */
  readonly clearInputProjection: () => void;
  readonly reward: () => RewardSelectionSnapshot<UpgradeDefinition> | null;
  readonly restoreReward: (snapshot: RewardSelectionSnapshot<UpgradeDefinition> | null) => void;
  readonly captureGhost: () => LegacyGhostRuntimeState;
  readonly restoreGhost: (state: LegacyGhostRuntimeState) => void;
  readonly captureIdentityState: () => CombatEntityIdentityState;
  readonly restoreIdentityState: (state: CombatEntityIdentityState) => void;
  readonly runtimeState: () => Readonly<Record<string, unknown>>;
  readonly restoreRuntimeState: (state: Readonly<Record<string, unknown>>) => void;
  readonly captureCinema: () => unknown;
  /** Validates the candidate's behavior-bearing cinematic binding before commit mutation. */
  readonly validateCinema: (runtime: Readonly<Record<string, unknown>>, run: GameRun, stageIndex: number) => void;
}

// Input projection is owned by the live frame lifecycle, not State Forge.
// Excluding it prevents a constructor's optional undefined fields from
// becoming codec nulls during a restore/rollback before another frame runs.
const skippedKeys = new Set(["cfg", "weapon", "aiInput", "aimOverride", "lmbOverride", "presentation"]);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function encode(
  value: unknown,
  identities: ReadonlyMap<object, string>,
  stack = new WeakSet(),
): TearCodecValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol") return null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object") throw new TypeError(`unsupported live snapshot value: ${typeof value}`);
  const identity = identities.get(value);
  if (identity !== undefined) return Object.freeze({ $ref: identity });
  if (stack.has(value)) return null;
  stack.add(value);
  if (value instanceof Set) {
    const encoded = Object.freeze({ $set: Object.freeze([...value].map((entry) => encode(entry, identities, stack))) });
    stack.delete(value);
    return encoded;
  }
  if (value instanceof Map) {
    // Without this a Map encodes as `{}`: its entries are lost and a restore
    // installs a plain object where gameplay expects Map methods.
    const encoded = Object.freeze({ $map: Object.freeze([...value].map(([key, entry]) =>
      Object.freeze([encode(key, identities, stack), encode(entry, identities, stack)]))) });
    stack.delete(value);
    return encoded;
  }
  if (Array.isArray(value)) {
    const encoded = Object.freeze(value.map((entry) => encode(entry, identities, stack)));
    stack.delete(value);
    return encoded;
  }
  const encoded: Record<string, TearCodecValue> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!skippedKeys.has(key) && typeof entry !== "function") encoded[key] = encode(entry, identities, stack);
  }
  stack.delete(value);
  return Object.freeze(encoded);
}

function hydrateUpgrade(
  dependencies: GameRuntimeDependencies,
  value: unknown,
): UpgradeDefinition | null {
  if (value === null) return null;
  if (!record(value) || typeof value.id !== "string") throw new TypeError("reward choice requires a production upgrade id");
  const upgrade = dependencies.UPGRADES.find((entry) => entry.id === value.id);
  if (upgrade === undefined) throw new TypeError(`reward choice references unknown production upgrade ${value.id}`);
  return upgrade;
}

function hydrateReward(
  dependencies: GameRuntimeDependencies,
  payload: TearCodecValue,
): RewardSelectionSnapshot<UpgradeDefinition> | null {
  if (!record(payload) || !("selection" in payload)) throw new TypeError("reward codec requires selection");
  if (payload.selection === null) return null;
  const decoded = decodeTearCodecValue(payload.selection, new Map());
  if (!record(decoded) || !Array.isArray(decoded.choices) || !Array.isArray(decoded.reserveChoices)) {
    throw new TypeError("reward selection payload is malformed");
  }
  const reservedChoice = hydrateUpgrade(dependencies, decoded.reservedChoice);
  return Object.freeze({
    ...decoded,
    choices: Object.freeze(decoded.choices.map((choice) => {
      const upgrade = hydrateUpgrade(dependencies, choice);
      if (upgrade === null) throw new TypeError("reward choices cannot contain null");
      return upgrade;
    })),
    reserveChoices: Object.freeze(decoded.reserveChoices.map((choice) => {
      const upgrade = hydrateUpgrade(dependencies, choice);
      if (upgrade === null) throw new TypeError("reserve choices cannot contain null");
      return upgrade;
    })),
    reservedChoice,
  }) as RewardSelectionSnapshot<UpgradeDefinition>;
}

function factoryId(enemy: GameEnemy): string {
  if (typeof enemy.bossId === "string" && enemy.bossId.length > 0) return enemy.bossId;
  if (enemy.kind === "support" && "supportType" in enemy && typeof enemy.supportType === "string") {
    return enemy.supportType;
  }
  if (enemy.kind === "wisp" && enemy.isVoidWisp === true) return "void-wisp";
  return enemy.kind;
}

function captureWorld(options: LiveStateForgeAdapterOptions): TearCodecWorld {
  const player = options.state.player();
  const blade = options.state.blade();
  const run = options.state.run();
  if (player === undefined || blade === undefined || run === null) throw new Error("State Forge capture requires a live run");
  const enemies = options.state.enemies();
  const projectiles = options.state.projectiles();
  const identities = new Map<object, string>([[player, "player"], [blade, "blade"]]);
  for (const enemy of enemies) identities.set(enemy, options.actorId(enemy, "enemy"));
  for (const projectile of projectiles) identities.set(projectile, options.actorId(projectile, "projectile"));
  const entity = (value: object, id: string, extra: Readonly<Record<string, TearCodecValue>>): TearCodecValue =>
    Object.freeze({
      ...Object.fromEntries(Object.entries(value)
        .filter(([key, entry]) => !skippedKeys.has(key) && typeof entry !== "function")
        .map(([key, entry]) => [key, encode(entry, identities)])),
      id,
      ...extra,
    });
  const components = new Map<Parameters<TearCodecWorld["components"]["set"]>[0], TearCodecValue>();
  components.set("tear.player.v1", entity(player, "player", {}));
  components.set("tear.blade.v1", entity(blade, "blade", {
    ownerId: "player", weaponId: run.weaponId,
  }));
  components.set("tear.run.v1", Object.freeze({
    ...(encode(run, identities) as Readonly<Record<string, TearCodecValue>>),
    mode: run.mode, difficulty: run.diff, stage: options.stageIndex(), wave: run.wave,
    tick: options.tick(), score: run.score,
  }));
  components.set("tear.world.v1", Object.freeze({
    clock: options.tick(), runtime: encode(options.runtimeState(), identities),
    floaters: encode(options.state.floaters(), identities),
    ghost: encode(options.captureGhost(), identities),
    identityState: encode(options.captureIdentityState(), identities),
  }));
  const encodedEnemies = enemies.map((enemy) => entity(enemy, identities.get(enemy) ?? "", {
    factoryId: factoryId(enemy),
  }));
  components.set("tear.enemy.v1", Object.freeze(encodedEnemies.filter((_, index) => !enemies[index]?.isBoss)));
  components.set("tear.boss.v1", Object.freeze(encodedEnemies.filter((_, index) => enemies[index]?.isBoss)));
  components.set("tear.projectile.v1", Object.freeze(projectiles.map((projectile) =>
    entity(projectile, identities.get(projectile) ?? "", { factoryId: "projectile" }))));
  components.set("tear.platform.v1", encode(options.platforms(), identities));
  components.set("tear.hazard.v1", Object.freeze({
    slowZones: encode(options.slowZones(), identities),
    walls: encode(options.walls(), identities),
  }));
  components.set("tear.ui.v1", Object.freeze({ screen: options.screen(), focusId: String(options.focus()) }));
  components.set("tear.reward.v1", Object.freeze({ selection: encode(options.reward(), identities) }));
  components.set("tear.configuration.v1", Object.freeze({
    rulesetVersion: "live", values: encode(options.worldServices.configuration.value, identities),
  }));
  components.set("tear.rng.v1", encode(options.worldServices.random.snapshot(), identities));
  components.set("tear.cinematic.v1", encode(options.captureCinema(), identities));
  return { components, references: new Map(), entityIds: new Set() };
}

function createWorldConstructionPort(
  dependencies: GameRuntimeDependencies,
  entities: LiveWorldEntityConstructionPort,
): TearWorldConstructionPort<
  GameRun,
  GamePlayer,
  GameBlade,
  GameEnemy,
  GameProjectile,
  RewardSelectionSnapshot<UpgradeDefinition>
> {
  return Object.freeze({
    ...entities,
    hydrateReward: (payload: TearCodecValue) => hydrateReward(dependencies, payload),
  });
}

function stageWorld(
  options: LiveStateForgeAdapterOptions,
  world: TearCodecWorld,
  context: TearLiveRestoreContext,
): Candidate {
  return hydrateTearCodecWorld<
    GameRun,
    GamePlayer,
    GameBlade,
    GameEnemy,
    GameProjectile,
    RewardSelectionSnapshot<UpgradeDefinition>,
    GameFloater,
    GameSlowZone,
    GameTemporaryWall,
    Platform,
    RunRandomStreamsSnapshot,
    CombatEntityIdentityState,
    LegacyGhostRuntimeState
  >(createWorldConstructionPort(options.dependencies, options.entities), world, context);
}

export function createLiveStateForgeAdapter(
  options: LiveStateForgeAdapterOptions,
): TearLiveWorldAdapter<Candidate> {
  const adapter: TearLiveWorldAdapter<Candidate> = {
    capture: () => captureWorld(options),
    stage: (world, context) => stageWorld(options, world, context),
    validate(candidate) {
      const issues: string[] = [];
      if (!(candidate.player.maxHp > 0) || candidate.player.hp < 0 || candidate.player.hp > candidate.player.maxHp) {
        issues.push("player health is outside legal bounds");
      }
      if (!Number.isSafeInteger(candidate.tick) || candidate.tick < 0) issues.push("simulation tick is invalid");
      if (!Number.isSafeInteger(candidate.stageIndex) || candidate.stageIndex < 0 ||
        candidate.stageIndex >= options.dependencies.STAGES.length) issues.push("campaign stage index is invalid");
      if (candidate.enemies.some((enemy) => !Number.isFinite(enemy.x) || !Number.isFinite(enemy.y))) {
        issues.push("enemy transform is not finite");
      }
      try { options.validateCinema(candidate.runtime, candidate.run, candidate.stageIndex); }
      catch (error) { issues.push(error instanceof Error ? error.message : String(error)); }
      return Object.freeze(issues);
    },
    commit(candidate) {
      options.worldServices.configuration.resetToBase();
      const weapon = options.dependencies.applyWeapon(options.worldServices.configuration.value, candidate.weaponId);
      // Hydrate codec values into a detached snapshot, then reconcile them
      // through the service. Entity constructors retain nested config records.
      const restoredConfiguration = options.worldServices.configuration.snapshot();
      applyTearCodecConfiguration(restoredConfiguration, candidate.configuration, new Map());
      options.worldServices.configuration.restore(restoredConfiguration);
      candidate.blade.weapon = weapon;
      candidate.blade.model = weapon.model;
      options.state.setRun(candidate.run);
      options.state.setPlayer(candidate.player);
      options.state.setBlade(candidate.blade);
      options.state.setEnemies(candidate.enemies);
      options.state.setProjectiles(candidate.projectiles);
      options.state.setFloaters(candidate.floaters);
      options.state.setSlowZones(candidate.slowZones);
      options.state.setTemporaryWalls(candidate.walls);
      options.restoreStageIndex(candidate.stageIndex);
      options.replacePlatforms(candidate.platforms);
      options.worldServices.random.restore(candidate.rng);
      options.restoreGhost(candidate.ghost);
      options.restoreIdentityState(candidate.identityState);
      options.restoreReward(candidate.reward);
      for (const binding of candidate.identityBindings) options.bindActorId(binding.entity, binding.id);
      options.setTick(candidate.tick);
      options.clearInputProjection();
      options.setFocus(candidate.focus);
      options.setScreen(candidate.screen);
      // Runtime restoration is deliberately last. In particular, an inactive
      // cinema snapshot destructively clears its current binding; no later
      // commit action may throw and make the prior active binding unavailable
      // to the transactional rollback candidate.
      options.restoreRuntimeState(candidate.runtime);
    },
  };
  return Object.freeze(adapter);
}
