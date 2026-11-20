import { createStableRegistry } from "../../domain/stable-registry";

/** The state codecs a snapshot carries, one per part of the game state. */
export const CODEC_IDS = Object.freeze([
  "tear.player.v1",
  "tear.blade.v1",
  "tear.run.v1",
  "tear.world.v1",
  "tear.enemy.v1",
  "tear.boss.v1",
  "tear.projectile.v1",
  "tear.platform.v1",
  "tear.hazard.v1",
  "tear.ui.v1",
  "tear.reward.v1",
  "tear.configuration.v1",
  "tear.rng.v1",
  "tear.cinematic.v1",
] as const);
export const CODEC_REGISTRY = createStableRegistry("codec", CODEC_IDS);
export type TearCodecId = (typeof CODEC_IDS)[number];
