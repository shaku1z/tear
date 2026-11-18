import { projectBloomWellPresentation } from "../../gameplay/environment/bloom-well-presentation-facts";
import type { EnvironmentSnapshot } from "../../gameplay/environment/environment-contracts";
import { buildEnvironmentPresentationSnapshot } from "../../gameplay/environment/presentation-snapshot";
import { projectRootbinderPresentation } from "../../gameplay/environment/rootbinder-presentation-facts";
import { renderBloomWellPresentation } from "../../presentation/environment/bloom-well-presentation";
import { renderPaleEnvironmentPresentation } from "../../presentation/environment/pale-environment-presentation";
import { renderRootbinderPresentation } from "../../presentation/environment/rootbinder-presentation";
import { renderVerdantEnvironmentPresentation } from "../../presentation/environment/verdant-environment-presentation";

export interface EnvironmentLayerOptions {
  readonly highContrast: boolean;
  readonly reducedMotion: boolean;
  readonly lowGraphics: boolean;
  readonly flashScale: number;
  readonly timeSeconds: number;
  /** False where nothing may be heard, such as a replay being scrubbed. */
  readonly audioEnabled: boolean;
}

/**
 * Enemy kinds drawn by this layer instead of an enemy renderer of their own. A replay frame skips these and
 * refuses any other enemy that has no renderer, so a missing renderer still fails loudly.
 */
export const ENVIRONMENT_DRAWN_ENEMY_KINDS: readonly string[] = ["rootbinder"];

export function isEnvironmentDrawnEnemy(enemy: { readonly kind?: string }): boolean {
  return enemy.kind !== undefined && ENVIRONMENT_DRAWN_ENEMY_KINDS.includes(enemy.kind);
}

/** The part of an enemy this layer reads: a Rootbinder is drawn here, not by an enemy renderer. */
interface EnvironmentLayerEnemy {
  readonly kind?: string;
  readonly rootbinderOwnerId?: string;
  readonly rootbinderState?: {
    x: number;
    y: number;
    state: Parameters<typeof projectRootbinderPresentation>[0]["state"];
  };
}

/**
 * Draws every stage object of one world frame: Bloom Wells, the Verdant and Pale objects, and each
 * Rootbinder with the links it owns. The live world and the replay viewer both draw through this.
 */
export function renderEnvironmentLayer(
  canvas: CanvasRenderingContext2D,
  snapshot: EnvironmentSnapshot,
  enemies: readonly EnvironmentLayerEnemy[],
  options: EnvironmentLayerOptions,
): void {
  const { timeSeconds, audioEnabled, ...presentationOptions } = options;
  for (const field of snapshot.fields) {
    if (field.kind !== "bloom-well") continue;
    renderBloomWellPresentation(
      canvas,
      projectBloomWellPresentation(field, { ...presentationOptions, audioEnabled }),
      timeSeconds,
    );
  }
  const environmentPresentation = buildEnvironmentPresentationSnapshot(snapshot);
  renderVerdantEnvironmentPresentation(canvas, environmentPresentation, { ...presentationOptions, timeSeconds });
  renderPaleEnvironmentPresentation(canvas, environmentPresentation, { ...presentationOptions, timeSeconds });
  for (const enemy of enemies) {
    if (!isEnvironmentDrawnEnemy(enemy)) continue;
    const rootState = enemy.rootbinderState;
    if (rootState === undefined || enemy.rootbinderOwnerId === undefined) continue;
    const owned = snapshot.combatObjects.filter((object) => object.ownerId === enemy.rootbinderOwnerId);
    const generationOf = (id: string): number => Number(/:(?:network|leash):g(\d+)/u.exec(id)?.[1] ?? 0);
    const latestGeneration = owned.reduce((latest, object) => Math.max(latest, generationOf(object.id)), 0);
    const visible =
      latestGeneration === 0 ? owned : owned.filter((object) => generationOf(object.id) === latestGeneration);
    renderRootbinderPresentation(
      canvas,
      projectRootbinderPresentation(rootState, visible, { ...presentationOptions, audioEnabled }),
    );
  }
}
