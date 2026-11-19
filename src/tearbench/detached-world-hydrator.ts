import { isObject, isRecord } from "../domain/records";
import { rebindBossPracticeSource } from "../gameplay/training/boss-practice-source-restore";
import type { TearCodecValue, TearCodecWorld } from "./state-codecs";
import type { TearWorldEntityConstructionPort } from "../gameplay/runtime/tear-world-entity-construction";
import type { EnvironmentSnapshot } from "../gameplay/environment/environment-contracts";
import {
  parseUiTutorialPresentationCheckpoint,
  type UiTutorialPresentationCheckpoint,
  parseUiHudPresentationCheckpoint,
  type UiHudPresentationCheckpoint,
} from "./ui-presentation-checkpoint";
import {
  parseParticlePresentationCheckpoint,
  type ParticlePresentationCheckpoint,
} from "./particle-presentation-checkpoint";
import { parseTutorialSessionCheckpoint } from "../gameplay/training/tutorial-controller";

/**
 * The identity graph is validated before construction. Hydration only needs
 * this narrow capability, keeping it independent from live app state.
 */
export interface TearWorldHydrationContext {
  requireIdentity(id: string): unknown;
}

/**
 * Production, replay, and headless hosts supply constructors through this
 * inward-facing port. The codec hydrator owns graph decoding and reference
 * restoration; hosts retain ownership of concrete constructors and effects.
 */
export interface TearWorldConstructionPort<
  Run,
  Player extends object,
  Blade extends object,
  Enemy extends object,
  Projectile extends object,
  Reward,
> extends TearWorldEntityConstructionPort<Run, Player, Blade, Enemy, Projectile> {
  hydrateReward(payload: TearCodecValue, run: Run): Reward | null;
}

export interface TearStagedIdentityBinding {
  readonly entity: object;
  readonly id: string;
}

/**
 * A newly constructed, not-yet-committed world. It contains no live closure
 * references other than intentional stable entity references restored from the
 * codec graph.
 */
export interface TearStagedWorld<
  Run,
  Player extends object,
  Blade extends object,
  Enemy extends object,
  Projectile extends object,
  Reward,
  Floater,
  SlowZone,
  Wall,
  Platform,
  Rng,
  IdentityState,
  Ghost,
> {
  readonly run: Run;
  readonly player: Player;
  readonly blade: Blade;
  readonly enemies: Enemy[];
  readonly projectiles: Projectile[];
  readonly floaters: Floater[];
  readonly slowZones: SlowZone[];
  readonly walls: Wall[];
  readonly platforms: Platform[];
  readonly screen: string;
  readonly focus: number;
  readonly hudPresentation?: UiHudPresentationCheckpoint;
  readonly tutorialPresentation?: UiTutorialPresentationCheckpoint;
  readonly particlesPresentation?: ParticlePresentationCheckpoint;
  readonly tick: number;
  /** Historical snapshots omit accumulated seconds; never infer scaled time. */
  readonly simulationSeconds?: number;
  readonly stageIndex: number;
  readonly rng: Rng;
  readonly configuration: TearCodecValue;
  readonly reward: Reward | null;
  readonly weaponId: string;
  readonly ghost: Ghost;
  readonly identityState: IdentityState;
  readonly identityBindings: readonly TearStagedIdentityBinding[];
  readonly runtime: Readonly<Record<string, unknown>>;
  readonly environment: EnvironmentSnapshot;
}

/**
 * These are live input-projection details, not canonical game state. They
 * belong to the host adapter for the duration of one simulation tick and must
 * never survive a codec restore into a freshly constructed world.
 */
const transientInputProjectionKeys = new Set(["aiInput", "aimOverride", "lmbOverride"]);

/** Recreates declarative codec data and its stable object references. */
export function decodeTearCodecValue(value: TearCodecValue, identities: ReadonlyMap<string, object>): unknown {
  if (Array.isArray(value))
    return (value as readonly TearCodecValue[]).map((entry) => decodeTearCodecValue(entry, identities));
  if (!isObject(value)) return value;
  if ("$ref" in value && typeof value.$ref === "string") {
    const identity = identities.get(value.$ref);
    if (identity === undefined) throw new RangeError(`snapshot reference target is missing: ${value.$ref}`);
    return identity;
  }
  if ("$map" in value && Array.isArray(value.$map)) {
    return new Map(
      (value.$map as readonly (readonly TearCodecValue[])[]).map((pair) => [
        decodeTearCodecValue(pair[0] as TearCodecValue, identities),
        decodeTearCodecValue(pair[1] as TearCodecValue, identities),
      ]),
    );
  }
  if ("$set" in value && Array.isArray(value.$set)) {
    return new Set((value.$set as readonly TearCodecValue[]).map((entry) => decodeTearCodecValue(entry, identities)));
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, decodeTearCodecValue(entry, identities)]),
  );
}

/** Applies a codec object to a newly constructed instance without changing identity metadata. */
export function applyTearCodecPayload(
  target: object,
  value: TearCodecValue,
  identities: ReadonlyMap<string, object>,
): void {
  if (!isRecord(value)) throw new TypeError("live instance payload must be an object");
  for (const [key, entry] of Object.entries(value)) {
    if (key === "id" || key === "factoryId" || key === "ownerId" || transientInputProjectionKeys.has(key)) continue;
    // Constructors retain the world's stable tuning owner; its codec restores values.
    if (key === "config" && "config" in target) continue;
    if (key === "variantId") {
      Reflect.set(target, "variant", decodeTearCodecValue(entry, identities));
      continue;
    }
    Reflect.set(target, key, decodeTearCodecValue(entry, identities));
  }
}

function component(world: TearCodecWorld, id: Parameters<TearCodecWorld["components"]["get"]>[0]): TearCodecValue {
  const value = world.components.get(id);
  if (value === undefined) throw new TypeError(`live snapshot component is missing: ${id}`);
  return value;
}

function arrayComponent(
  world: TearCodecWorld,
  id: Parameters<TearCodecWorld["components"]["get"]>[0],
): readonly TearCodecValue[] {
  const value = component(world, id);
  if (!Array.isArray(value)) throw new TypeError(`live snapshot component must be an array: ${id}`);
  return value as readonly TearCodecValue[];
}

function stringField(value: TearCodecValue, key: string): string {
  if (!isRecord(value) || typeof value[key] !== "string") throw new TypeError(`live payload requires ${key}`);
  return value[key];
}

function numberField(value: TearCodecValue, key: string): number {
  if (!isRecord(value) || typeof value[key] !== "number") throw new TypeError(`live payload requires numeric ${key}`);
  return value[key];
}

/**
 * Constructs a fresh production-shaped object graph from State Forge codecs.
 * It intentionally has no commit operation: live/browser mutation belongs to
 * an outward adapter, while replay/headless hosts can keep the staged world.
 */
/**
 * Restores a captured configuration payload onto a live configuration object.
 * Hydration is not complete without it: entity tuning reads configuration, so
 * a world restored without its captured values would simulate differently from
 * the world the snapshot came from.
 */
export function applyTearCodecConfiguration(
  target: object,
  payload: TearCodecValue,
  identities: ReadonlyMap<string, object> = new Map(),
): void {
  if (!isRecord(payload) || !isRecord(payload.values)) {
    throw new TypeError("configuration payload requires encoded values");
  }
  const values = decodeTearCodecValue(payload.values, identities);
  if (!isRecord(values)) throw new TypeError("decoded configuration must be an object");
  const mutable = target as Record<string, unknown>;
  for (const [key, value] of Object.entries(values)) mutable[key] = value;
}

export function hydrateTearCodecWorld<
  Run,
  Player extends object,
  Blade extends object,
  Enemy extends object,
  Projectile extends object,
  Reward,
  Floater,
  SlowZone,
  Wall,
  Platform,
  Rng,
  IdentityState,
  Ghost,
>(
  port: TearWorldConstructionPort<Run, Player, Blade, Enemy, Projectile, Reward>,
  world: TearCodecWorld,
  context: TearWorldHydrationContext,
): TearStagedWorld<
  Run,
  Player,
  Blade,
  Enemy,
  Projectile,
  Reward,
  Floater,
  SlowZone,
  Wall,
  Platform,
  Rng,
  IdentityState,
  Ghost
> {
  const playerPayload = component(world, "tear.player.v1");
  const bladePayload = component(world, "tear.blade.v1");
  const runPayload = component(world, "tear.run.v1");
  const enemyPayloads = [...arrayComponent(world, "tear.enemy.v1"), ...arrayComponent(world, "tear.boss.v1")];
  const projectilePayloads = arrayComponent(world, "tear.projectile.v1");
  context.requireIdentity("player");
  context.requireIdentity("blade");
  const player = port.createPlayer(numberField(playerPayload, "x"), numberField(playerPayload, "y"));
  const blade = port.createBlade();
  const identities = new Map<string, object>([
    ["player", player],
    ["blade", blade],
  ]);
  // The real Echo constructor needs decoded run modifiers. Keep this temporary
  // construction view separate: the final run is decoded after entity payloads
  // have been restored, matching the historic live staging order exactly.
  const constructionRun = decodeTearCodecValue(runPayload, identities) as Run;
  const enemies = enemyPayloads.map((payload) =>
    port.createEnemy(
      stringField(payload, "factoryId"),
      numberField(payload, "x"),
      numberField(payload, "y"),
      constructionRun,
    ),
  );
  const projectiles = projectilePayloads.map((payload) =>
    port.createProjectile(
      numberField(payload, "x"),
      numberField(payload, "y"),
      numberField(payload, "vx"),
      numberField(payload, "vy"),
    ),
  );
  const identityBindings: TearStagedIdentityBinding[] = [];
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
  applyTearCodecPayload(player, playerPayload, identities);
  applyTearCodecPayload(blade, bladePayload, identities);
  enemyPayloads.forEach((payload, index) => {
    const enemy = enemies[index];
    if (enemy === undefined) throw new Error("enemy apply index is missing");
    applyTearCodecPayload(enemy, payload, identities);
  });
  projectilePayloads.forEach((payload, index) => {
    const projectile = projectiles[index];
    if (projectile === undefined) throw new Error("projectile apply index is missing");
    applyTearCodecPayload(projectile, payload, identities);
  });
  const run = decodeTearCodecValue(runPayload, identities) as Run;
  enemyPayloads.forEach((payload, index) => {
    const enemy = enemies[index];
    if (enemy === undefined) throw new Error("enemy finalize index is missing");
    port.finalizeEnemy?.(stringField(payload, "factoryId"), enemy, run);
  });

  const worldPayload = component(world, "tear.world.v1");
  const hazards = component(world, "tear.hazard.v1");
  const ui = component(world, "tear.ui.v1");
  const tutorialPresentation = parseUiTutorialPresentationCheckpoint(
    isRecord(ui) ? ui.tutorialPresentation : undefined,
  );
  const runtime = decodeTearCodecValue(
    isRecord(worldPayload) && isRecord(worldPayload.runtime) ? worldPayload.runtime : {},
    identities,
  ) as Readonly<Record<string, unknown>>;
  const tutorialSession = parseTutorialSessionCheckpoint(runtime.tutorialSession);
  if (isRecord(run) && run.mode === "tutorial" && tutorialSession === undefined) {
    throw new RangeError(
      "tutorial replay requires retained tutorial behavior; historical missing behavior is unsupported",
    );
  }
  if (
    isRecord(run) &&
    run.mode === "tutorial" &&
    tutorialSession?.phase === "inactive" &&
    isRecord(runtime.lifecycle) &&
    runtime.lifecycle.phase !== "terminated"
  )
    throw new RangeError("active tutorial run cannot restore inactive behavior");
  if (tutorialSession?.active === true && (!isRecord(run) || run.mode !== "tutorial"))
    throw new RangeError("active tutorial behavior requires tutorial mode");
  const platforms = decodeTearCodecValue(component(world, "tear.platform.v1"), identities) as Platform[];
  if (
    tutorialSession?.version === 6 &&
    tutorialSession.bossPractice.bossId === "source" &&
    !tutorialSession.bossPractice.defeated
  ) {
    rebindBossPracticeSource({
      run: run as Parameters<typeof rebindBossPracticeSource>[0]["run"],
      player,
      enemies,
      platforms: platforms as object[],
    });
  }
  const hudPresentation = parseUiHudPresentationCheckpoint(isRecord(ui) ? ui.hudPresentation : undefined);
  const particlesPresentation = parseParticlePresentationCheckpoint(
    isRecord(ui) ? ui.particlesPresentation : undefined,
  );
  return Object.freeze({
    run,
    player,
    blade,
    enemies,
    projectiles,
    floaters:
      isRecord(worldPayload) && Array.isArray(worldPayload.floaters)
        ? (decodeTearCodecValue(worldPayload.floaters, identities) as Floater[])
        : [],
    slowZones:
      isRecord(hazards) && Array.isArray(hazards.slowZones)
        ? (decodeTearCodecValue(hazards.slowZones, identities) as SlowZone[])
        : [],
    walls:
      isRecord(hazards) && Array.isArray(hazards.walls)
        ? (decodeTearCodecValue(hazards.walls, identities) as Wall[])
        : [],
    platforms,
    screen: stringField(ui, "screen"),
    focus: Number.parseInt(stringField(ui, "focusId"), 10),
    ...(tutorialPresentation === undefined ? {} : { tutorialPresentation }),
    ...(hudPresentation === undefined ? {} : { hudPresentation }),
    ...(particlesPresentation === undefined ? {} : { particlesPresentation }),
    tick: numberField(runPayload, "tick"),
    ...(isRecord(worldPayload) && worldPayload.simulationSeconds !== undefined
      ? { simulationSeconds: numberField(worldPayload, "simulationSeconds") }
      : {}),
    stageIndex: numberField(runPayload, "stage"),
    rng: decodeTearCodecValue(component(world, "tear.rng.v1"), identities) as Rng,
    configuration: decodeTearCodecValue(component(world, "tear.configuration.v1"), identities) as TearCodecValue,
    reward: port.hydrateReward(component(world, "tear.reward.v1"), run),
    weaponId: stringField(bladePayload, "weaponId"),
    ghost: (isRecord(worldPayload) && isRecord(worldPayload.ghost)
      ? decodeTearCodecValue(worldPayload.ghost, identities)
      : { recording: null }) as Ghost,
    identityState:
      isRecord(worldPayload) && isRecord(worldPayload.identityState)
        ? (decodeTearCodecValue(worldPayload.identityState, identities) as IdentityState)
        : ({ nextEntityId: 1, nextWallSequence: 1, nextSlowZoneSequence: 1, claimedIds: [] } as IdentityState),
    identityBindings: Object.freeze(identityBindings),
    runtime: Object.freeze({
      ...runtime,
      cinema: decodeTearCodecValue(component(world, "tear.cinematic.v1"), identities),
    }),
    environment: Object.freeze({
      ...(isRecord(hazards) && hazards.allocator !== undefined
        ? {
            allocator: decodeTearCodecValue(hazards.allocator, identities) as NonNullable<
              EnvironmentSnapshot["allocator"]
            >,
          }
        : {}),
      ...(isRecord(hazards) && typeof hazards.worldId === "string" ? { worldId: hazards.worldId } : {}),
      stageId: isRecord(hazards) && typeof hazards.stageId === "string" ? hazards.stageId : "unknown",
      fields:
        isRecord(hazards) && Array.isArray(hazards.fields)
          ? (decodeTearCodecValue(hazards.fields, identities) as EnvironmentSnapshot["fields"])
          : [],
      combatObjects:
        isRecord(hazards) && Array.isArray(hazards.combatObjects)
          ? (decodeTearCodecValue(hazards.combatObjects, identities) as EnvironmentSnapshot["combatObjects"])
          : [],
      routes:
        isRecord(hazards) && Array.isArray(hazards.routes)
          ? (decodeTearCodecValue(hazards.routes, identities) as EnvironmentSnapshot["routes"])
          : [],
    }),
  });
}
