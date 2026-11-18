import type { SceneBitmap, SceneCanvas } from "./scene-contract";

/** A canvas the scene library bakes shading into, off the DOM where possible. */
export function createSceneCanvas(width: number, height: number): SceneCanvas & SceneBitmap {
  if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** Gives back a scene image's pixel memory at once instead of waiting for garbage collection. */
export function releaseSceneBitmap(image: SceneBitmap): void {
  if (typeof ImageBitmap === "function" && image instanceof ImageBitmap) image.close();
  else if ("getContext" in image) {
    image.width = 0;
    image.height = 0;
  }
}

/**
 * Fetches and decodes one scene image off the main thread where the browser
 * allows it, then copies it into a canvas once. Scene images are AVIF outside
 * the PWA precache, so a stage's art costs nothing until that stage is first
 * shown. A browser that cannot decode AVIF rejects here, and the stage keeps
 * its coded background.
 *
 * The copy matters: Chrome keeps a bitmap decoded from a file outside the GPU
 * and re-uploads it as the game's canvas draws it, which cost about 50 ms a
 * frame on Verdant (its plates are large and drawn every frame). A canvas
 * source stays on the GPU, and Verdant then costs the same as without art.
 */
export async function loadSceneBitmap(url: string): Promise<SceneBitmap> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`scene image ${url}: HTTP ${String(response.status)}`);
  const decoded = await createImageBitmap(await response.blob());
  const canvas = createSceneCanvas(decoded.width, decoded.height);
  const context = canvas.getContext("2d");
  if (context === null) return decoded;
  context.drawImage(decoded, 0, 0);
  decoded.close();
  return canvas;
}
