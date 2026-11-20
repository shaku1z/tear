/**
 * A stage's platform surface texture, from its painted scene. Every platform
 * material takes one: it fills the platform's surface and returns true, or
 * returns false (no recipe, not painted yet) and the material keeps its own fill.
 */
export interface SurfaceTexture {
  draw(
    context: CanvasRenderingContext2D,
    rectangle: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
    floor: boolean,
  ): boolean;
}
