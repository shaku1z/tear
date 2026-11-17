// Types for hidden-paint.mjs, so TypeScript tests can use the build's own check.
import type { ScenePackage, SceneLayer, Rect } from "../../src/presentation/scenes/scene-contract";

export interface PaintLayer {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  rect: Rect;
  depth: number;
}
export interface PaintImage {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
}
export declare function hiddenMask(
  scene: Pick<ScenePackage, "camera" | "world">,
  lower: PaintLayer,
  uppers: readonly PaintLayer[],
): Uint8Array;
export declare function layersOver(scene: Pick<ScenePackage, "layers">, layer: SceneLayer): SceneLayer[];
export declare function softenHidden(image: PaintImage, hidden: Uint8Array): Promise<PaintImage>;
export declare function hiddenDetail(image: PaintImage, hidden: Uint8Array): Promise<{ share: number; detail: number }>;
