import type { SceneBitmap } from "./scene-renderer";

/**
 * Fetches and decodes one scene image off the main thread where the browser
 * allows it. Scene images are WebP outside the PWA precache, so a stage's art
 * costs nothing until that stage is first shown.
 */
export async function loadSceneBitmap(url: string): Promise<SceneBitmap> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`scene image ${url}: HTTP ${String(response.status)}`);
  return createImageBitmap(await response.blob());
}
