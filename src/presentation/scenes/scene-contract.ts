/**
 * Scene layout: what the scene renderer composes for a stage (layers by image
 * name, the camera range and the platform binding) and the camera maths every
 * consumer shares (parallax, viewport overscan, coverage). The layer images are
 * canvases the game paints from the stage's art recipe (src/presentation/stage-art).
 */

export type Rect = readonly [x: number, y: number, w: number, h: number];
/**
 * depth: 1 moves exactly with the gameplay plane, below 1 is farther away
 * (moves and zooms less), above 1 is nearer. `plane: "front"` layers draw over
 * platforms and must stay out of the gameplay region (the painter refuses one that does not).
 */
export interface SceneLayer {
  readonly id: string;
  readonly image: string;
  readonly rect: Rect;
  readonly depth: number;
  readonly plane: "back" | "front";
  readonly opacity: number;
  /** A covering layer fills the camera at every supported viewport. */
  readonly covers: boolean;
}

/**
 * How the game draws this stage's platforms and floor. Platforms are never part
 * of the painted layers: the stage's platform material draws them from the real
 * collision geometry, above the back plane and below actors. The scene only
 * binds that material and gives it a texture and contact shadows.
 */
export interface ScenePlatformBinding {
  /** Platform material id, from the stage's presentation definition. */
  readonly material: string;
  /**
   * Surface strip (lit top edge at row 0), anchored to each surface's top and
   * repeated horizontally in world space, so it never stretches with a
   * platform's width or swims with the camera.
   */
  readonly texture: string;
  /** World px per texture px. */
  readonly scale: number;
  /** Fill below the strip (the floor body down to the view edge). */
  readonly fill: string;
  /** Soft contact shadow cast onto the back plane below each platform. */
  readonly shadow: { readonly color: string; readonly opacity: number; readonly length: number };
}

export interface SceneCameraContract {
  /** World px a depth-0 layer slides across as the player crosses the arena. */
  readonly playerShift: number;
  readonly zoomMin: number;
  readonly zoomMax: number;
  /** Largest screen-shake offset, logical px. */
  readonly shake: number;
}

export interface SceneWorld {
  readonly width: number;
  readonly height: number;
  readonly groundY: number;
}

/** What the renderer composes: the camera contract, layers by image name and the platform binding. */
export interface SceneLayout {
  readonly world: SceneWorld;
  readonly camera: SceneCameraContract;
  readonly edge: { readonly color: string; readonly feather: number };
  /** Colour the HUD/actor ink polarity is derived from while the scene shows. */
  readonly theme: { readonly paper: string };
  readonly layers: readonly SceneLayer[];
  /** What moves, in drawing order within each layer. */
  readonly live: readonly SceneLive[];
  readonly platforms: ScenePlatformBinding;
}

/** Camera state the renderer receives from the world frame. */
export interface SceneCamera {
  readonly cx: number;
  readonly cy: number;
  readonly scale: number;
  readonly ox: number;
  readonly oy: number;
  /** -1 at the left edge of the arena, +1 at the right. */
  readonly playerX: number;
}

/**
 * Transform from layer coordinates into the world space the canvas is already
 * in (world camera applied). A layer of depth d is drawn as if the camera had
 * zoom 1 + (z - 1) d and shake o d, and slides against the player by
 * slide = playerX playerShift (1 - d): its screen position is
 * S = c + o d + s (q - c - slide).
 * Returns [scale, translateX, translateY] for `translate(tx, ty); scale(k)`.
 */
export function layerTransform(
  camera: SceneCamera,
  depth: number,
  playerShift: number,
): readonly [k: number, tx: number, ty: number] {
  const zoom = Math.max(0.01, camera.scale);
  const layerScale = 1 + (zoom - 1) * depth;
  const k = layerScale / zoom;
  const slide = camera.playerX * playerShift * (1 - depth);
  const tx = camera.cx + (camera.ox * (depth - 1)) / zoom - k * (camera.cx + slide);
  const ty = camera.cy + (camera.oy * (depth - 1)) / zoom - k * camera.cy;
  return [k, tx, ty];
}

/** Logical screen rectangle (world units at zoom 1) for a CSS viewport. */
export function viewportWorldRect(world: SceneWorld, cssWidth: number, cssHeight: number): Rect {
  const scale = Math.min(cssWidth / world.width, cssHeight / world.height);
  const overscanX = Math.max(0, (cssWidth / scale - world.width) / 2);
  const overscanY = Math.max(0, (cssHeight / scale - world.height) / 2);
  return [0 - overscanX, 0 - overscanY, world.width + overscanX * 2, world.height + overscanY * 2];
}

/**
 * Layer-space rectangle a layer must cover so it fills `screen` for every
 * camera in the scene's camera contract (zoom range, shake, player anywhere). With
 * `floorY`, rows below the floor surface are left to the floor.
 */
export function requiredLayerRect(
  scene: Pick<SceneLayout, "camera" | "world">,
  depth: number,
  screen: Rect,
  floorY?: number,
): Rect {
  const cx = scene.world.width / 2,
    cy = scene.world.height / 2;
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  const { zoomMin, zoomMax, shake, playerShift } = scene.camera;
  for (const zoom of [zoomMin, 1, zoomMax]) {
    for (const ox of [-shake, shake]) {
      for (const oy of [-shake, shake]) {
        for (const playerX of [-1, 1]) {
          const layerScale = 1 + (zoom - 1) * depth;
          const slide = playerX * playerShift * (1 - depth);
          // Invert S = c + o d + s (q - c - slide) at the screen corners.
          // Below the floor surface's screen row the floor covers the view.
          const floorRow = floorY === undefined ? Infinity : cy + oy + zoom * (floorY - cy) + 2;
          for (const [sx, sy] of [
            [screen[0], screen[1]],
            [screen[0] + screen[2], Math.min(screen[1] + screen[3], floorRow)],
          ] as const) {
            const qx = cx + slide + (sx - cx - ox * depth) / layerScale;
            const qy = cy + (sy - cy - oy * depth) / layerScale;
            left = Math.min(left, qx);
            right = Math.max(right, qx);
            top = Math.min(top, qy);
            bottom = Math.max(bottom, qy);
          }
        }
      }
    }
  }
  return [left, top, right - left, bottom - top];
}

/**
 * How far (world px) a front layer can reach above the floor surface, at the
 * extremes of the camera contract. Front layers may only dress the floor body
 * and below, so they never hide anything that stands or flies in the arena.
 */
export function frontLayerIntrusion(
  scene: Pick<SceneLayout, "camera" | "world">,
  item: Pick<SceneLayer, "rect" | "depth">,
): number {
  const [, y] = item.rect;
  const cy = scene.world.height / 2;
  let reach = -Infinity;
  for (const zoom of [scene.camera.zoomMin, 1, scene.camera.zoomMax]) {
    for (const oy of [-scene.camera.shake, scene.camera.shake]) {
      // Screen y of the layer top, mapped back to the gameplay plane.
      const layerScale = 1 + (zoom - 1) * item.depth;
      const screenY = cy + oy * item.depth + layerScale * (y - cy);
      const worldY = cy + (screenY - cy - oy) / zoom;
      reach = Math.max(reach, scene.world.groundY - worldY);
    }
  }
  return Math.max(0, reach);
}

/**
 * What moves in a painted stage. Every entry belongs to one layer and draws
 * right after it, in that layer's coordinates, so it shares the layer's depth
 * and plane. Positions and sizes are world units; times are seconds. Each entry
 * is a closed form of the frame's time, so nothing is stored between frames.
 */
export type SceneLive = SceneLiveWater | SceneLiveMotes | SceneLivePart;

/** One row of water: the layer's own paint between two rows, slid sideways. */
export interface SceneWaterRow {
  readonly y: number;
  readonly h: number;
  /** Farthest the row slides either way. */
  readonly reach: number;
  readonly phase: number;
}

/** A short streak of light that fades in and out on the water. */
export interface SceneGlint {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly period: number;
  readonly phase: number;
}

export interface SceneLiveWater {
  readonly kind: "water";
  readonly layer: string;
  readonly rows: readonly SceneWaterRow[];
  /** Seconds for one pass of the slower wave train. */
  readonly period: number;
  readonly glints: readonly SceneGlint[];
  /** Glint colour as "r,g,b". */
  readonly glintColor: string;
  readonly glintAlpha: number;
}

export interface SceneMote {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly phase: number;
}

export interface SceneLiveMotes {
  readonly kind: "motes";
  readonly layer: string;
  /** Motes drift across this area and wrap, fading at its edges. */
  readonly area: Rect;
  readonly motes: readonly SceneMote[];
  /** Mote colour as "r,g,b". */
  readonly color: string;
  readonly alpha: number;
  /** World units per second. */
  readonly drift: readonly [x: number, y: number];
  /** Sideways wander either way, and the seconds one wander takes. */
  readonly wobble: number;
  readonly period: number;
}

/** A part swings from one edge: slices across its width lean in a travelling wave. */
export interface SceneSway {
  readonly pivot: "top" | "bottom";
  readonly slices: number;
  /** Farthest the free edge moves either way. */
  readonly reach: number;
  readonly period: number;
  /** Turns of the wave across the part's width. */
  readonly travel: number;
}

/** A part fades between `low` and fully shown. */
export interface SceneBreathe {
  readonly low: number;
  readonly period: number;
}

/** A piece of the picture painted on its own image so it can move. */
export interface SceneLivePart {
  readonly kind: "part";
  readonly layer: string;
  readonly image: string;
  readonly rect: Rect;
  readonly blend: "source-over" | "lighter";
  readonly sway?: SceneSway;
  readonly breathe?: SceneBreathe;
}
