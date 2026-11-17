// Types for pixel-checks.mjs, so TypeScript tests can run the size rule's pixel checks.
import type { ScenePackage } from "../../src/presentation/scenes/scene-contract";

export declare const SOFT_LAYER_LIKENESS: number;
export declare const SOFT_LAYER_FLOOR_BYTES: number;
export declare const HIDDEN_DETAIL_LIMIT: number;
export declare function likeness(a: Float32Array, b: Float32Array, width: number, height: number): number;
export declare function pixelChecks(
  directory: string,
  scene: ScenePackage,
): Promise<{
  images: { id: string; seeThroughShare: number; halfSizeLikeness: number }[];
  hidden: { layer: string; share: number; detail: number }[];
  problems: string[];
}>;
