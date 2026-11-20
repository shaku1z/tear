import type { SceneBitmap, SceneCanvas } from "./scene-renderer";

/** A canvas a stage paints a layer into, off the DOM where possible. */
export function createSceneCanvas(width: number, height: number): SceneCanvas & SceneBitmap {
  if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** Gives back a painted layer's pixel memory at once instead of waiting for garbage collection. */
export function releaseSceneBitmap(image: SceneBitmap): void {
  if (!("getContext" in image)) return;
  image.width = 0;
  image.height = 0;
}
