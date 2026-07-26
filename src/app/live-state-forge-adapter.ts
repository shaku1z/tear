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
import type { RunRandomStreamsSnapshot } from "../simulation/run-random";
import type { LegacyGhostRuntimeState } from "../replay/legacy-compat";
import type { CombatEntityIdentityState } from "../gameplay/combat/combat-entity-runtime";
import type { RewardSelectionSnapshot } from "../gameplay/run/reward-selection";
import type { UpgradeDefinition } from "../gameplay/upgrades";
import type { TearCodecValue, TearCodecWorld } from "../tearbench/state-codecs";
import type { TearLiveRestoreContext, TearLiveWorldAdapter } from "../tearbench/live-state-snapshot";

interface Platform {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly floor?: boolean;
  readonly oneway?: boolean;
}
type Candidate = Readonly<{
  run: GameRun;
  player: GamePlayer;
  blade: GameBlade;
  enemies: GameEnemy[];
  projectiles: GameProjectile[];
  floaters: GameFloater[];
  slowZones: GameSlowZone[];
  walls: GameTemporaryWall[];
  platforms: Platform[];
  screen: string;
  focus: number;
  tick: number;
  rng: RunRandomStreamsSnapshot;
  configuration: TearCodecValue;
  reward: RewardSelectionSnapshot<UpgradeDefinition> | null;
  weaponId: string;
  ghost: LegacyGhostRuntimeState;
  identityState: CombatEntityIdentityState;
  identityBindings: readonly Readonly<{ entity: object; id: string }>[];
  runtime: Readonly<Record<string, unknown>>;
}>;

export interface LiveStateForgeAdapterOptions {
  readonly dependencies: GameRuntimeDependencies;
  readonly state: LiveGameHostState;
  readonly actorId: (entity: object, prefix: "enemy" | "projectile") => string;
  readonly bindActorId: (entity: object, id: string) => void;
  readonly platforms: () => Platform[];
  readonly replacePlatforms: (platforms: Platform[]) => void;
  readonly slowZones: () => GameSlowZone[];
  readonly walls: () => GameTemporaryWall[];
  readonly screen: () => string;
  readonly setScreen: (screen: string) => void;
  readonly focus: () => number;
  readonly setFocus: (focus: number) => void;
  readonly tick: () => number;
  readonly setTick: (tick: number) => void;
  readonly rng: () => RunRandomStreamsSnapshot;
  readonly restoreRng: (snapshot: RunRandomStreamsSnapshot) => void;
  readonly restoreConfiguration: () => void;
  readonly reward: () => RewardSelectionSnapshot<UpgradeDefinition> | null;
  readonly restoreReward: (snapshot: RewardSelectionSnapshot<UpgradeDefinition> | null) => void;
  readonly captureGhost: () => LegacyGhostRuntimeState;
  readonly restoreGhost: (state: LegacyGhostRuntimeState) => void;
  readonly captureIdentityState: () => CombatEntityIdentityState;
  readonly restoreIdentityState: (state: CombatEntityIdentityState) => void;
  readonly runtimeState: () => Readonly<Record<string, unknown>>;
  readonly restoreRuntimeState: (state: Readonly<Record<string, unknown>>) => void;
}

const skippedKeys = new Set(["cfg", "weapon", "aiInput", "presentation"]);

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

function decode(value: TearCodecValue, identities: ReadonlyMap<string, object>): unknown {
  if (Array.isArray(value)) {
    return (value as readonly TearCodecValue[]).map((entry) => decode(entry, identities));
  }
  if (value === null || typeof value !== "object") return value;
  if ("$ref" in value && typeof value.$ref === "string") {
    const identity = identities.get(value.$ref);
    if (identity === undefined) throw new RangeError(`snapshot reference target is missing: ${value.$ref}`);
    return identity;
  }
  if ("$set" in value && Array.isArray(value.$set)) {
    return new Set((value.$set as readonly TearCodecValue[]).map((entry) => decode(entry, identities)));
  }
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, decode(entry, identities)]));
}

function applyEncoded(target: object, value: TearCodecValue, identities: ReadonlyMap<string, object>): void {
  if (!record(value)) throw new TypeError("live instance payload must be an object");
  for (const [key, entry] of Object.entries(value)) {
    if (key === "id" || key === "factoryId" || key === "ownerId") continue;
    Reflect.set(target, key, decode(entry, identities));
  }
}

function restoreCapturedConfiguration(
  target: object,
  payload: TearCodecValue,
  identities: ReadonlyMap<string, object>,
): void {
  if (!record(payload) || !record(payload.values)) {
    throw new TypeError("live configuration payload requires encoded values");
  }
  const values = decode(payload.values, identities);
  if (!record(values)) throw new TypeError("decoded live configuration must be an object");
  const mutable = target as Record<string, unknown>;
  for (const [key, value] of Object.entries(values)) mutable[key] = value;
}

function component(world: TearCodecWorld, id: Parameters<TearCodecWorld["components"]["get"]>[0]): TearCodecValue {
  const value = world.components.get(id);
  if (value === undefined) throw new TypeError(`live snapshot component is missing: ${id}`);
  return value;
}

function arrayComponent(world: TearCodecWorld, id: Parameters<TearCodecWorld["components"]["get"]>[0]): readonly TearCodecValue[] {
  const value = component(world, id);
  if (!Array.isArray(value)) throw new TypeError(`live snapshot component must be an array: ${id}`);
  return value as readonly TearCodecValue[];
}

function stringField(value: TearCodecValue, key: string): string {
  if (!record(value) || typeof value[key] !== "string") throw new TypeError(`live payload requires ${key}`);
  return value[key];
}

function numberField(value: TearCodecValue, key: string): number {
  if (!record(value) || typeof value[key] !== "number") throw new TypeError(`live payload requires numeric ${key}`);
  return value[key];
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
  const decoded = decode(payload.selection, new Map());
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

function createEnemy(
  dependencies: GameRuntimeDependencies,
  payload: TearCodecValue,
): GameEnemy {
  const x = numberField(payload, "x");
  const y = numberField(payload, "y");
  const factoryId = stringField(payload, "factoryId");
  switch (factoryId) {
    case "charger": return new dependencies.Charger(x, y);
    case "ranged": return new dependencies.Ranged(x, y);
    case "flyer": return new dependencies.Flyer(x, y);
    case "bomber": return new dependencies.Bomber(x, y);
    case "armored": return new dependencies.Armored(x, y);
    case "wraith": return new dependencies.Wraith(x, y);
    case "chimera": return new dependencies.Chimera(x, y);
    case "warden": return new dependencies.Warden(x, y);
    case "colossus": return new dependencies.Colossus(x, y);
    case "aldric": return new dependencies.Aldric(x, y);
    case "echo": return new dependencies.Echo(x, y);
    case "source": return new dependencies.Source(x, y);
    case "void-wisp": return new dependencies.VoidWisp(x, y);
    case "reflection": return new dependencies.ReflectionEnemy(x, y) as unknown as GameEnemy;
    case "priest":
    case "herald":
    case "mender":
    case "anchor":
      return new dependencies.Support(x, y, factoryId);
    default: return new dependencies.Boss(x, y);
  }
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
    mode: run.mode, difficulty: run.diff, stage: 0, wave: run.wave,
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
    rulesetVersion: "live", values: encode(options.dependencies.CONFIG, identities),
  }));
  components.set("tear.rng.v1", encode(options.rng(), identities));
  return { components, references: new Map(), entityIds: new Set() };
}

function stageWorld(
  options: LiveStateForgeAdapterOptions,
  world: TearCodecWorld,
  context: TearLiveRestoreContext,
): Candidate {
  const playerPayload = component(world, "tear.player.v1");
  const bladePayload = component(world, "tear.blade.v1");
  const runPayload = component(world, "tear.run.v1");
  const enemyPayloads = [...arrayComponent(world, "tear.enemy.v1"), ...arrayComponent(world, "tear.boss.v1")];
  const projectilePayloads = arrayComponent(world, "tear.projectile.v1");
  const player = new options.dependencies.Player(numberField(playerPayload, "x"), numberField(playerPayload, "y")) as GamePlayer;
  const blade = new options.dependencies.Blade() as GameBlade;
  const enemies = enemyPayloads.map((payload) => createEnemy(options.dependencies, payload));
  const projectiles = projectilePayloads.map((payload) => new options.dependencies.Projectile(
    numberField(payload, "x"), numberField(payload, "y"), numberField(payload, "vx"), numberField(payload, "vy"),
  ) as GameProjectile);
  const identities = new Map<string, object>([["player", player], ["blade", blade]]);
  const identityBindings: Readonly<{ entity: object; id: string }>[] = [];
  enemyPayloads.forEach((payload, index) => {
    const id = stringField(payload, "id");
    context.requireIdentity(id);
    const enemy = enemies[index];
    if (enemy === undefined) throw new Error("enemy staging index is missing");
    identities.set(id, enemy);
    identityBindings.push(Object.freeze({ entity: enemy, id }));
  });
  projectilePayloads.forEach((payload, index) => {
    const id = stringField(payload, "id");
    context.requireIdentity(id);
    const projectile = projectiles[index];
    if (projectile === undefined) throw new Error("projectile staging index is missing");
    identities.set(id, projectile);
    identityBindings.push(Object.freeze({ entity: projectile, id }));
  });
  applyEncoded(player, playerPayload, identities);
  applyEncoded(blade, bladePayload, identities);
  enemyPayloads.forEach((payload, index) => {
    const enemy = enemies[index];
    if (enemy === undefined) throw new Error("enemy apply index is missing");
    applyEncoded(enemy, payload, identities);
  });
  projectilePayloads.forEach((payload, index) => {
    const projectile = projectiles[index];
    if (projectile === undefined) throw new Error("projectile apply index is missing");
    applyEncoded(projectile, payload, identities);
  });
  const weaponId = stringField(bladePayload, "weaponId");
  const run = decode(runPayload, identities) as GameRun;
  const worldPayload = component(world, "tear.world.v1");
  const hazards = component(world, "tear.hazard.v1");
  const ui = component(world, "tear.ui.v1");
  return Object.freeze({
    run, player, blade, enemies, projectiles,
    floaters: record(worldPayload) && Array.isArray(worldPayload.floaters)
      ? decode(worldPayload.floaters, identities) as GameFloater[] : [],
    slowZones: record(hazards) && Array.isArray(hazards.slowZones)
      ? decode(hazards.slowZones, identities) as GameSlowZone[] : [],
    walls: record(hazards) && Array.isArray(hazards.walls)
      ? decode(hazards.walls, identities) as GameTemporaryWall[] : [],
    platforms: decode(component(world, "tear.platform.v1"), identities) as Platform[],
    screen: stringField(ui, "screen"),
    focus: Number.parseInt(stringField(ui, "focusId"), 10),
    tick: numberField(runPayload, "tick"),
    rng: decode(component(world, "tear.rng.v1"), identities) as RunRandomStreamsSnapshot,
    configuration: component(world, "tear.configuration.v1"),
    reward: hydrateReward(options.dependencies, component(world, "tear.reward.v1")),
    weaponId,
    ghost: record(worldPayload) && record(worldPayload.ghost)
      ? decode(worldPayload.ghost, identities) as LegacyGhostRuntimeState
      : { recording: null },
    identityState: record(worldPayload) && record(worldPayload.identityState)
      ? decode(worldPayload.identityState, identities) as CombatEntityIdentityState
      : { nextEntityId: 1, nextWallSequence: 1, nextSlowZoneSequence: 1, claimedIds: [] },
    identityBindings: Object.freeze(identityBindings),
    runtime: decode(record(worldPayload) && record(worldPayload.runtime)
      ? worldPayload.runtime : {}, identities) as Readonly<Record<string, unknown>>,
  });
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
      if (candidate.enemies.some((enemy) => !Number.isFinite(enemy.x) || !Number.isFinite(enemy.y))) {
        issues.push("enemy transform is not finite");
      }
      return Object.freeze(issues);
    },
    commit(candidate) {
      options.restoreConfiguration();
      const weapon = options.dependencies.applyWeapon(candidate.weaponId);
      restoreCapturedConfiguration(options.dependencies.CONFIG, candidate.configuration, new Map());
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
      options.replacePlatforms(candidate.platforms);
      options.restoreRng(candidate.rng);
      options.restoreGhost(candidate.ghost);
      options.restoreIdentityState(candidate.identityState);
      options.restoreReward(candidate.reward);
      options.restoreRuntimeState(candidate.runtime);
      for (const binding of candidate.identityBindings) options.bindActorId(binding.entity, binding.id);
      options.setTick(candidate.tick);
      options.setFocus(candidate.focus);
      options.setScreen(candidate.screen);
    },
  };
  return Object.freeze(adapter);
}
