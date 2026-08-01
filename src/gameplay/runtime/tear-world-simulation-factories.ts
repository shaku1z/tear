import { createBlade } from "../entities/blade";
import { createEnemyTypes } from "../entities/enemies";
import { createMirrorTypes } from "../entities/mirror";
import { createPlayer } from "../entities/player";
import { createProjectile } from "../entities/projectile";
import { getWeapon } from "../weapons";

type BladeOptions = Parameters<typeof createBlade>[0];
type PlayerOptions = Parameters<typeof createPlayer>[0];
type ProjectileOptions = Parameters<typeof createProjectile>[0];
type EnemyOptions = Parameters<typeof createEnemyTypes>[0];
type MirrorOptions = Parameters<typeof createMirrorTypes>[0];

/** Renderer-neutral structural ports for the entities in one simulated world. */
export interface TearWorldEntityPresentationPorts {
  readonly blade: BladeOptions["presentation"];
  readonly player: PlayerOptions["presentation"];
  readonly projectile: ProjectileOptions["presentation"];
  readonly enemy: Readonly<{
    readonly port: NonNullable<EnemyOptions["presentation"]>;
    readonly install: (types: ReturnType<typeof createEnemyTypes>) => void;
  }>;
  readonly mirror: MirrorOptions["presentation"];
}

/** Geometry and authored visual-feedback helpers used by the entity rules. */
export interface TearWorldSimulationGeometry {
  readonly aabbOverlap: PlayerOptions["aabbOverlap"] & EnemyOptions["aabbOverlap"];
  readonly clamp: BladeOptions["clamp"] & PlayerOptions["clamp"] & ProjectileOptions["clamp"] & EnemyOptions["clamp"] & MirrorOptions["clamp"];
  readonly len: BladeOptions["len"] & PlayerOptions["len"] & ProjectileOptions["len"] & EnemyOptions["len"];
  readonly lerp: BladeOptions["lerp"] & ProjectileOptions["lerp"] & EnemyOptions["lerp"] & MirrorOptions["lerp"];
  readonly lerpAngle: BladeOptions["lerpAngle"] & MirrorOptions["lerpAngle"];
  readonly segPointDist: EnemyOptions["segPointDist"];
  readonly segSegmentDist: EnemyOptions["segSegmentDist"];
}

/**
 * The inward services one world's entity constructors capture. No application
 * singleton, Canvas renderer, or presentation module is selected here: the
 * composition target supplies all structural presentation ports and feedback
 * dependencies explicitly.
 */
export interface TearWorldSimulationFactoryOptions {
  readonly clock: BladeOptions["CLOCK"] & ProjectileOptions["CLOCK"] & EnemyOptions["CLOCK"] & MirrorOptions["CLOCK"];
  readonly config: BladeOptions["CONFIG"];
  readonly graphics: PlayerOptions["GFX"];
  readonly effects: PlayerOptions["FX"] & ProjectileOptions["FX"] & EnemyOptions["FX"] & MirrorOptions["FX"];
  readonly sound: ProjectileOptions["SFX"] & EnemyOptions["SFX"] & MirrorOptions["SFX"];
  readonly input: BladeOptions["Input"] & PlayerOptions["Input"];
  readonly random: Readonly<{ enemyAi: EnemyOptions["GAME_RANDOM"]; boss: MirrorOptions["GAME_RANDOM"] }>;
  readonly presentation: TearWorldEntityPresentationPorts;
  readonly geometry: TearWorldSimulationGeometry;
  readonly cosmeticRandom: EnemyOptions["cosmeticRandom"];
  readonly getWeapon?: MirrorOptions["getWeapon"];
  readonly clipper?: NonNullable<EnemyOptions["Clipper"]>;
}

export type TearWorldSimulationFactories = Readonly<{
  Blade: ReturnType<typeof createBlade>;
  Player: ReturnType<typeof createPlayer>;
  Projectile: ReturnType<typeof createProjectile>;
  enemyTypes: ReturnType<typeof createEnemyTypes>;
  mirrorTypes: ReturnType<typeof createMirrorTypes>;
}>;

/**
 * Builds one world's entity constructors from structural ports. Constructing
 * this twice captures distinct clocks, RNG streams, feedback sinks, and
 * presentation adapters while preserving the shared production entity logic.
 */
export function createTearWorldSimulationFactories(
  options: TearWorldSimulationFactoryOptions,
): TearWorldSimulationFactories {
  const { clock: CLOCK, config: CONFIG, graphics: GFX, effects: FX, sound: SFX, input: Input, presentation, geometry } = options;
  const Blade = createBlade({
    CLOCK, CONFIG, Input, presentation: presentation.blade,
    clamp: geometry.clamp, len: geometry.len, lerp: geometry.lerp, lerpAngle: geometry.lerpAngle,
  });
  const Player = createPlayer({
    CONFIG, FX, GFX, Input, presentation: presentation.player,
    aabbOverlap: geometry.aabbOverlap, clamp: geometry.clamp, len: geometry.len,
  });
  const Projectile = createProjectile({
    CLOCK, CONFIG, FX, SFX, presentation: presentation.projectile,
    clamp: geometry.clamp, len: geometry.len, lerp: geometry.lerp,
  });
  const enemyTypes = createEnemyTypes({
    CLOCK, CONFIG, ...(options.clipper === undefined ? {} : { Clipper: options.clipper }),
    FX, GAME_RANDOM: options.random.enemyAi, Projectile, SFX, presentation: presentation.enemy.port,
    aabbOverlap: geometry.aabbOverlap, clamp: geometry.clamp, cosmeticRandom: options.cosmeticRandom,
    len: geometry.len, lerp: geometry.lerp, segPointDist: geometry.segPointDist, segSegmentDist: geometry.segSegmentDist,
  });
  presentation.enemy.install(enemyTypes);
  const mirrorTypes = createMirrorTypes({
    Blade, CLOCK, CONFIG, Enemy: enemyTypes.Enemy, FX, GAME_RANDOM: options.random.boss,
    Player, Projectile, SFX, presentation: presentation.mirror,
    clamp: geometry.clamp, getWeapon: options.getWeapon ?? getWeapon, lerp: geometry.lerp, lerpAngle: geometry.lerpAngle,
  });
  return Object.freeze({ Blade, Player, Projectile, enemyTypes, mirrorTypes });
}
