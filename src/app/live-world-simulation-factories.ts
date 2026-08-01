import type { TearWorldEntityPresentationPorts } from "../gameplay/runtime/tear-world-simulation-factories";
import { createLegacyEnemyPresentation } from "../presentation/enemies/legacy-enemy-renderers";
import { createBladeRenderer } from "../presentation/entities/blade-renderer";
import { createMirrorRenderer } from "../presentation/entities/mirror-renderer";
import { createPlayerRenderer } from "../presentation/entities/player-renderer";
import { createProjectileRenderer } from "../presentation/entities/projectile-renderer";

type EnemyPresentationOptions = Parameters<typeof createLegacyEnemyPresentation>[0];

/**
 * The application-facing renderer adapter for one world. It binds Canvas
 * renderers to structural entity ports; constructor selection remains in the
 * portable gameplay factory.
 */
export interface LiveWorldSimulationPresentationAdapterOptions {
  readonly clock: { readonly sim: number };
  readonly effects: Parameters<typeof createMirrorRenderer>[0]["effects"];
  readonly ui: EnemyPresentationOptions["UI"];
  readonly configuration: Readonly<{
    accessibility: EnemyPresentationOptions["A11Y"];
    config: EnemyPresentationOptions["CONFIG"];
    graphics: EnemyPresentationOptions["GFX"];
    theme: EnemyPresentationOptions["THEME"];
  }>;
  readonly geometry: Readonly<{
    clamp: EnemyPresentationOptions["clamp"];
    len: EnemyPresentationOptions["len"];
    lerp: EnemyPresentationOptions["lerp"];
  }>;
  readonly cosmeticRandom: () => number;
}

/**
 * Builds the real Canvas renderer ports for one world.
 *
 * Configuration, graphics, theme, accessibility, geometry, and cosmetic random
 * remain shared application values; they are presentation or tuning inputs, not
 * per-world simulation state. Everything a running world mutates — the clock,
 * effect sink, sound sink, input source, and named RNG streams — arrives here
 * explicitly. Constructing this twice yields two fully independent factory
 * sets; the live application still constructs exactly one.
 */
export function createLiveWorldSimulationPresentationAdapter(
  options: LiveWorldSimulationPresentationAdapterOptions,
): TearWorldEntityPresentationPorts {
  const { clock, effects, ui, configuration, geometry, cosmeticRandom } = options;
  const { accessibility, config, graphics, theme } = configuration;
  const playerPresentation = createPlayerRenderer({ colors: config.colors, graphics, theme, clamp: geometry.clamp });
  const bladePresentation = createBladeRenderer({
    clock, config, graphics, theme, clamp: geometry.clamp, len: geometry.len, lerp: geometry.lerp,
  });
  const projectilePresentation = createProjectileRenderer({ clock, config, graphics, theme, clamp: geometry.clamp });
  const mirrorPresentation = createMirrorRenderer({
    clock, config, effects, graphics, theme, clamp: geometry.clamp, cosmeticRandom,
  });
  const enemyPresentation = createLegacyEnemyPresentation({
    A11Y: accessibility, CLOCK: clock, CONFIG: config, GFX: graphics, THEME: theme, UI: ui,
    clamp: geometry.clamp, len: geometry.len, lerp: geometry.lerp,
  });
  return Object.freeze({
    blade: bladePresentation,
    player: playerPresentation,
    projectile: projectilePresentation,
    enemy: Object.freeze({ port: enemyPresentation, install: enemyPresentation.install }),
    mirror: mirrorPresentation,
  });
}
