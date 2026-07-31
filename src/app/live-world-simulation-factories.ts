import { A11Y, CONFIG, GFX, THEME } from "../config/game-config";
import { aabbOverlap, clamp, len, lerp, lerpAngle, segPointDist, segSegmentDist } from "../domain/geometry";
import { createBlade } from "../gameplay/entities/blade";
import { createEnemyTypes } from "../gameplay/entities/enemies";
import { createMirrorTypes } from "../gameplay/entities/mirror";
import { createPlayer } from "../gameplay/entities/player";
import { createProjectile } from "../gameplay/entities/projectile";
import { getWeapon } from "../gameplay/weapons";
import { cosmeticRandom } from "../presentation/cosmetic-random";
import { createLegacyEnemyPresentation } from "../presentation/enemies/legacy-enemy-renderers";
import { createBladeRenderer } from "../presentation/entities/blade-renderer";
import { createMirrorRenderer } from "../presentation/entities/mirror-renderer";
import { createPlayerRenderer } from "../presentation/entities/player-renderer";
import { createProjectileRenderer } from "../presentation/entities/projectile-renderer";

type BladeOptions = Parameters<typeof createBlade>[0];
type PlayerOptions = Parameters<typeof createPlayer>[0];
type ProjectileOptions = Parameters<typeof createProjectile>[0];
type EnemyOptions = Parameters<typeof createEnemyTypes>[0];
type MirrorOptions = Parameters<typeof createMirrorTypes>[0];
type EnemyPresentationOptions = Parameters<typeof createLegacyEnemyPresentation>[0];

/**
 * The outward services one world's entity constructors capture. Each field is
 * supplied by the caller rather than read from a module singleton, so a second
 * world can be built with its own clock, RNG streams, and effect sinks.
 */
export interface LiveWorldSimulationFactoryOptions {
  readonly clock: BladeOptions["CLOCK"] & ProjectileOptions["CLOCK"] & EnemyOptions["CLOCK"] & MirrorOptions["CLOCK"];
  readonly effects: PlayerOptions["FX"] & ProjectileOptions["FX"] & EnemyOptions["FX"] & MirrorOptions["FX"];
  readonly sound: ProjectileOptions["SFX"] & EnemyOptions["SFX"] & MirrorOptions["SFX"];
  readonly input: BladeOptions["Input"] & PlayerOptions["Input"];
  readonly ui: EnemyPresentationOptions["UI"];
  readonly random: Readonly<{ enemyAi: EnemyOptions["GAME_RANDOM"]; boss: MirrorOptions["GAME_RANDOM"] }>;
  readonly clipper?: NonNullable<EnemyOptions["Clipper"]>;
}

export type LiveWorldSimulationFactories = Readonly<{
  Blade: ReturnType<typeof createBlade>;
  Player: ReturnType<typeof createPlayer>;
  Projectile: ReturnType<typeof createProjectile>;
  enemyPresentation: ReturnType<typeof createLegacyEnemyPresentation>;
  enemyTypes: ReturnType<typeof createEnemyTypes>;
  mirrorTypes: ReturnType<typeof createMirrorTypes>;
}>;

/**
 * Builds one world's entity constructors and their renderers.
 *
 * Configuration, graphics, theme, accessibility, geometry, and cosmetic random
 * remain shared application values; they are presentation or tuning inputs, not
 * per-world simulation state. Everything a running world mutates — the clock,
 * effect sink, sound sink, input source, and named RNG streams — arrives here
 * explicitly. Constructing this twice yields two fully independent factory
 * sets; the live application still constructs exactly one.
 */
export function createLiveWorldSimulationFactories(
  options: LiveWorldSimulationFactoryOptions,
): LiveWorldSimulationFactories {
  const { clock, effects: FX, sound: SFX, input: Input, ui: UI } = options;
  const playerPresentation = createPlayerRenderer({ colors: CONFIG.colors, graphics: GFX, theme: THEME, clamp });
  const bladePresentation = createBladeRenderer({ clock, config: CONFIG, graphics: GFX, theme: THEME, clamp, len, lerp });
  const projectilePresentation = createProjectileRenderer({ clock, config: CONFIG, graphics: GFX, theme: THEME, clamp });
  const mirrorPresentation = createMirrorRenderer({
    clock, config: CONFIG, effects: FX, graphics: GFX, theme: THEME, clamp, cosmeticRandom,
  });
  const Blade = createBlade({ CLOCK: clock, CONFIG, Input, presentation: bladePresentation, clamp, len, lerp, lerpAngle });
  const Player = createPlayer({ CONFIG, FX, GFX, Input, presentation: playerPresentation, aabbOverlap, clamp, len });
  const Projectile = createProjectile({ CLOCK: clock, CONFIG, FX, SFX, presentation: projectilePresentation, clamp, len, lerp });
  const enemyPresentation = createLegacyEnemyPresentation({ A11Y, CLOCK: clock, CONFIG, GFX, THEME, UI, clamp, len, lerp });
  const enemyTypes = createEnemyTypes({
    CLOCK: clock, CONFIG, ...(options.clipper === undefined ? {} : { Clipper: options.clipper }),
    FX, GAME_RANDOM: options.random.enemyAi, Projectile, SFX,
    presentation: enemyPresentation,
    aabbOverlap, clamp, cosmeticRandom, len, lerp, segPointDist, segSegmentDist,
  });
  enemyPresentation.install(enemyTypes);
  const mirrorTypes = createMirrorTypes({
    Blade, CLOCK: clock, CONFIG, Enemy: enemyTypes.Enemy, FX, GAME_RANDOM: options.random.boss,
    Player, Projectile, SFX, presentation: mirrorPresentation,
    clamp, getWeapon, lerp, lerpAngle,
  });
  return Object.freeze({ Blade, Player, Projectile, enemyPresentation, enemyTypes, mirrorTypes });
}
