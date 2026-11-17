/**
 * Scene package contract (`tear-scene-package` v1): the one manifest format a
 * painted stage background is delivered in, and the pure maths every consumer
 * shares (validation, parallax camera, coverage, surface binding).
 *
 * This module has no runtime imports so the `pnpm scene` CLI can load it with
 * Node's type stripping; keep it that way (type-only imports are erased).
 */

export const SCENE_PACKAGE_FORMAT = "tear-scene-package";
export const SCENE_PACKAGE_VERSION = 1;
export const SCENE_MAX_IMAGE_EDGE = 4096;
/**
 * The size rule every package meets (docs/BACKGROUND_WORKFLOW.md, "Size rule").
 * Sized from Verdant Sanctum with modest headroom: 539,325 bytes as AVIF at
 * quality 62 and 21.65 MiB decoded. A package declares its own budgets at or
 * under these limits; a release build also has a share for all its scene art
 * (config/scene-budgets.json).
 */
export const SCENE_ENCODED_LIMIT = 600_000;
export const SCENE_DECODED_LIMIT = 24 * 1024 * 1024;
/**
 * Most image pixels a layer may hold per world unit. The game's canvas tops out
 * at 2.5 device pixels per logical pixel (canvas-viewport.ts), so more than
 * this is detail no supported canvas can show.
 */
export const SCENE_MAX_PIXELS_PER_UNIT = 2.5;

export type Rect = readonly [x: number, y: number, w: number, h: number];
export type Point = readonly [x: number, y: number];

export type SceneSourceOrigin = "owner-supplied" | "image-tool" | "derived" | "procedural";

/** Custody record for every image that contributed pixels to the package. */
export interface SceneSource {
  readonly id: string;
  readonly description: string;
  readonly origin: SceneSourceOrigin;
  readonly licence: string;
  readonly sha256: string;
  /** Exact tool and prompt for image-tool sources, so a step can be re-run. */
  readonly tool?: string;
  readonly prompt?: string;
  readonly derivedFrom?: readonly string[];
}

export interface SceneImage {
  readonly id: string;
  readonly file: string;
  readonly width: number;
  readonly height: number;
  readonly alpha: boolean;
  readonly bytes: number;
  readonly sha256: string;
  readonly sources: readonly string[];
}

/**
 * depth: 1 moves exactly with the gameplay plane, below 1 is farther away
 * (moves and zooms less), above 1 is nearer. `plane: "front"` layers draw over
 * platforms and must stay out of the gameplay region (validated).
 */
export interface SceneLayer {
  readonly id: string;
  readonly image: string;
  readonly rect: Rect;
  readonly depth: number;
  readonly plane: "back" | "front";
  readonly opacity: number;
  /** A covering layer must fill the camera at every supported viewport. */
  readonly covers: boolean;
}

/**
 * Readability shading drawn over the back plane at runtime, so the painting
 * itself stays untouched. A `band` darkens from its top edge and fades out over
 * its last `feather` px (behind a HUD row); a `pool` is an ellipse filling its
 * rect that fades out over `feather` px towards its edge (a soft local wash).
 * Positioned in world px at `depth`, like a layer.
 */
export interface SceneShade {
  readonly id: string;
  readonly kind: "band" | "pool";
  readonly rect: Rect;
  readonly depth: number;
  readonly color: string;
  readonly opacity: number;
  readonly feather: number;
}

/**
 * Moving water: the part of a painted layer under `mask` is redrawn in
 * horizontal rows that slide and stretch a little, so the painted surface and
 * the reflections in it ripple while everything outside the mask stays still.
 * Rows are thin and move little at the far edge (`rect` top) and grow towards
 * the near edge, by `far` (far size as a share of near size), so the motion
 * follows the painted perspective. `glints` are short bright strokes on the
 * surface that fade in and out and drift.
 */
export interface SceneWater {
  readonly id: string;
  readonly kind: "water";
  /** The layer whose paint moves; the water is drawn right after it. */
  readonly layer: string;
  /** Image whose alpha says where water is, stretched over `rect`. */
  readonly mask: string;
  /** Layer-space area the mask covers, inside the layer's rect. */
  readonly rect: Rect;
  readonly rows: number;
  readonly far: number;
  /** World px a near row slides sideways and stretches vertically. */
  readonly slide: number;
  readonly swell: number;
  /** Wave crests between the far and near edge, and seconds for one to pass. */
  readonly waves: number;
  readonly period: number;
  readonly glints?: {
    readonly count: number;
    readonly color: string;
    readonly opacity: number;
    /** World px of a near glint, and world px a second it drifts sideways. */
    readonly length: number;
    readonly drift: number;
  };
}

/** Everything in a scene that moves. Each kind is drawn by the shared renderer from this data alone. */
export type SceneMotion = SceneWater;

/**
 * How the game draws this stage's platforms and floor. Platforms are never part
 * of the painted layers: the stage's platform material draws them from the real
 * collision geometry, above the back plane and below actors. The package only
 * binds that material and gives it a texture and shading.
 */
export interface ScenePlatformBinding {
  /** Platform material id; must match the stage's presentation definition. */
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

export interface ScenePackage {
  readonly format: typeof SCENE_PACKAGE_FORMAT;
  readonly version: typeof SCENE_PACKAGE_VERSION;
  readonly id: string;
  readonly stageId: string;
  readonly title: string;
  readonly world: { readonly width: number; readonly height: number; readonly groundY: number };
  readonly camera: SceneCameraContract;
  readonly edge: { readonly color: string; readonly feather: number };
  /** Colour the HUD/actor ink polarity is derived from while the scene shows. */
  readonly theme: { readonly paper: string };
  readonly palette: Readonly<Record<string, string>>;
  readonly sources: readonly SceneSource[];
  readonly images: readonly SceneImage[];
  readonly layers: readonly SceneLayer[];
  readonly shading: readonly SceneShade[];
  /** What moves; empty for a still scene. Reduced motion and low graphics draw none of it. */
  readonly motion: readonly SceneMotion[];
  readonly platforms: ScenePlatformBinding;
  /** Encoded bytes the package's image files may total. */
  readonly encodedBudget: number;
  /** Decoded RGBA bytes the package may hold (width x height x 4, summed). */
  readonly decodedBudget: number;
}

type Raw = Record<string, unknown>;

export class ScenePackageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScenePackageError";
  }
}

function fail(path: string, message: string): never {
  throw new ScenePackageError(`${path}: ${message}`);
}

function record(value: unknown, path: string): Raw {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(path, "expected an object");
  return value as Raw;
}

function list(value: unknown, path: string, max = 64): readonly unknown[] {
  if (!Array.isArray(value)) fail(path, "expected an array");
  if (value.length > max) fail(path, `more than ${String(max)} entries`);
  return value as readonly unknown[];
}

function text(value: unknown, path: string, max = 4000): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max) fail(path, "expected a non-empty string");
  return value;
}

function id(value: unknown, path: string): string {
  const result = text(value, path, 64);
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(result)) fail(path, "ids are lower-case kebab-case");
  return result;
}

function finite(value: unknown, path: string, min = -1e6, max = 1e6): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    fail(path, `expected a number in [${String(min)}, ${String(max)}]`);
  }
  return value;
}

function integer(value: unknown, path: string, min: number, max: number): number {
  const result = finite(value, path, min, max);
  if (!Number.isInteger(result)) fail(path, "expected an integer");
  return result;
}

function color(value: unknown, path: string): string {
  const result = text(value, path, 9);
  if (!/^#[0-9a-f]{6}$/u.test(result)) fail(path, "colours are #rrggbb lower-case");
  return result;
}

function digest(value: unknown, path: string): string {
  const result = text(value, path, 64);
  if (!/^[a-f0-9]{64}$/u.test(result)) fail(path, "expected a sha256 hex digest");
  return result;
}

function rect(value: unknown, path: string): Rect {
  const items = list(value, path, 4);
  if (items.length !== 4) fail(path, "expected [x, y, w, h]");
  const [x, y, w, h] = items.map((item, index) => finite(item, `${path}[${String(index)}]`));
  if (x === undefined || y === undefined || w === undefined || h === undefined || w <= 0 || h <= 0) {
    fail(path, "width and height must be positive");
  }
  return Object.freeze([x, y, w, h] as const);
}

function unique<T extends { readonly id: string }>(items: readonly T[], path: string): readonly T[] {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) fail(path, `duplicate id "${item.id}"`);
    seen.add(item.id);
  }
  return Object.freeze(items);
}

const ORIGINS: readonly SceneSourceOrigin[] = ["owner-supplied", "image-tool", "derived", "procedural"];

function source(value: unknown, path: string): SceneSource {
  const raw = record(value, path);
  const origin = raw.origin;
  if (typeof origin !== "string" || !ORIGINS.includes(origin as SceneSourceOrigin))
    fail(`${path}.origin`, "unknown origin");
  const result: SceneSource = {
    id: id(raw.id, `${path}.id`),
    description: text(raw.description, `${path}.description`),
    origin: origin as SceneSourceOrigin,
    licence: text(raw.licence, `${path}.licence`),
    sha256: digest(raw.sha256, `${path}.sha256`),
    ...(raw.tool === undefined ? {} : { tool: text(raw.tool, `${path}.tool`) }),
    ...(raw.prompt === undefined ? {} : { prompt: text(raw.prompt, `${path}.prompt`, 8000) }),
    ...(raw.derivedFrom === undefined
      ? {}
      : { derivedFrom: Object.freeze(list(raw.derivedFrom, `${path}.derivedFrom`).map((item) => id(item, path))) }),
  };
  if (result.origin === "image-tool" && (result.tool === undefined || result.prompt === undefined)) {
    fail(path, "image-tool sources record the exact tool and prompt");
  }
  if (result.origin === "derived" && (result.derivedFrom?.length ?? 0) === 0) fail(path, "derived sources name inputs");
  return Object.freeze(result);
}

function image(value: unknown, path: string, sources: ReadonlySet<string>): SceneImage {
  const raw = record(value, path);
  const file = text(raw.file, `${path}.file`, 96);
  // One format: AVIF. A browser that cannot decode it keeps the stage's coded background.
  if (!/^[a-z0-9][a-z0-9-]*\.avif$/u.test(file)) fail(`${path}.file`, "plain kebab-case .avif file");
  const used = list(raw.sources, `${path}.sources`).map((item) => id(item, `${path}.sources`));
  if (used.length === 0) fail(`${path}.sources`, "every image names its sources");
  for (const item of used) if (!sources.has(item)) fail(`${path}.sources`, `unknown source "${item}"`);
  if (typeof raw.alpha !== "boolean") fail(`${path}.alpha`, "expected a boolean");
  return Object.freeze({
    id: id(raw.id, `${path}.id`),
    file,
    width: integer(raw.width, `${path}.width`, 1, SCENE_MAX_IMAGE_EDGE),
    height: integer(raw.height, `${path}.height`, 1, SCENE_MAX_IMAGE_EDGE),
    alpha: raw.alpha,
    bytes: integer(raw.bytes, `${path}.bytes`, 1, SCENE_ENCODED_LIMIT),
    sha256: digest(raw.sha256, `${path}.sha256`),
    sources: Object.freeze(used),
  });
}

function shade(value: unknown, path: string): SceneShade {
  const raw = record(value, path);
  if (raw.kind !== "band" && raw.kind !== "pool") fail(`${path}.kind`, 'expected "band" or "pool"');
  const area = rect(raw.rect, `${path}.rect`);
  return Object.freeze({
    id: id(raw.id, `${path}.id`),
    kind: raw.kind,
    rect: area,
    depth: finite(raw.depth, `${path}.depth`, 0, 1.5),
    color: color(raw.color, `${path}.color`),
    opacity: finite(raw.opacity, `${path}.opacity`, 0, 1),
    feather: finite(raw.feather, `${path}.feather`, 0, Math.max(area[2], area[3])),
  });
}

function layer(value: unknown, path: string, images: ReadonlyMap<string, SceneImage>): SceneLayer {
  const raw = record(value, path);
  const imageId = id(raw.image, `${path}.image`);
  if (!images.has(imageId)) fail(`${path}.image`, `unknown image "${imageId}"`);
  if (raw.plane !== "back" && raw.plane !== "front") fail(`${path}.plane`, 'expected "back" or "front"');
  return Object.freeze({
    id: id(raw.id, `${path}.id`),
    image: imageId,
    rect: rect(raw.rect, `${path}.rect`),
    depth: finite(raw.depth, `${path}.depth`, 0, 1.5),
    plane: raw.plane,
    opacity: raw.opacity === undefined ? 1 : finite(raw.opacity, `${path}.opacity`, 0, 1),
    covers: raw.covers === true,
  });
}

/** Pixels of a layer's image that `area` covers, as [x, y, w, h] in whole pixels. */
export function layerImageRect(image: SceneImage, layer: SceneLayer, area: Rect): Rect {
  const kx = image.width / layer.rect[2];
  const ky = image.height / layer.rect[3];
  const x = Math.floor((area[0] - layer.rect[0]) * kx);
  const y = Math.floor((area[1] - layer.rect[1]) * ky);
  const right = Math.ceil((area[0] + area[2] - layer.rect[0]) * kx);
  const bottom = Math.ceil((area[1] + area[3] - layer.rect[1]) * ky);
  return [x, y, right - x, bottom - y];
}

function motion(
  value: unknown,
  path: string,
  images: ReadonlyMap<string, SceneImage>,
  layers: readonly SceneLayer[],
): SceneMotion {
  const raw = record(value, path);
  if (raw.kind !== "water") fail(`${path}.kind`, 'expected "water"');
  const layerId = id(raw.layer, `${path}.layer`);
  const host = layers.find((item) => item.id === layerId);
  if (host === undefined) fail(`${path}.layer`, `unknown layer "${layerId}"`);
  const mask = id(raw.mask, `${path}.mask`);
  if (images.get(mask)?.alpha !== true) fail(`${path}.mask`, `"${mask}" must be an image with alpha`);
  const area = rect(raw.rect, `${path}.rect`);
  const [x, y, w, h] = host.rect;
  if (area[0] < x || area[1] < y || area[0] + area[2] > x + w + 0.01 || area[1] + area[3] > y + h + 0.01)
    fail(`${path}.rect`, `must lie inside layer "${layerId}"`);
  const glints = raw.glints === undefined ? undefined : record(raw.glints, `${path}.glints`);
  return Object.freeze({
    id: id(raw.id, `${path}.id`),
    kind: "water" as const,
    layer: layerId,
    mask,
    rect: area,
    rows: integer(raw.rows, `${path}.rows`, 4, 96),
    far: finite(raw.far, `${path}.far`, 0.05, 1),
    slide: finite(raw.slide, `${path}.slide`, 0, 12),
    swell: finite(raw.swell, `${path}.swell`, 0, 12),
    waves: finite(raw.waves, `${path}.waves`, 0.5, 40),
    period: finite(raw.period, `${path}.period`, 0.5, 60),
    ...(glints === undefined
      ? {}
      : {
          glints: Object.freeze({
            count: integer(glints.count, `${path}.glints.count`, 1, 200),
            color: color(glints.color, `${path}.glints.color`),
            opacity: finite(glints.opacity, `${path}.glints.opacity`, 0, 1),
            length: finite(glints.length, `${path}.glints.length`, 2, 200),
            drift: finite(glints.drift, `${path}.glints.drift`, -200, 200),
          }),
        }),
  });
}

function platforms(value: unknown, path: string, images: ReadonlyMap<string, SceneImage>): ScenePlatformBinding {
  const raw = record(value, path);
  const texture = id(raw.texture, `${path}.texture`);
  if (!images.has(texture)) fail(`${path}.texture`, `unknown image "${texture}"`);
  const shadow = record(raw.shadow, `${path}.shadow`);
  return Object.freeze({
    material: id(raw.material, `${path}.material`),
    texture,
    scale: finite(raw.scale, `${path}.scale`, 0.05, 8),
    fill: color(raw.fill, `${path}.fill`),
    shadow: Object.freeze({
      color: color(shadow.color, `${path}.shadow.color`),
      opacity: finite(shadow.opacity, `${path}.shadow.opacity`, 0, 1),
      length: finite(shadow.length, `${path}.shadow.length`, 0, 400),
    }),
  });
}

/** Parses untrusted JSON into a frozen package or throws `ScenePackageError`. */
export function validateScenePackage(input: unknown): ScenePackage {
  const raw = record(input, "package");
  if (raw.format !== SCENE_PACKAGE_FORMAT) fail("package.format", `expected "${SCENE_PACKAGE_FORMAT}"`);
  if (raw.version !== SCENE_PACKAGE_VERSION) fail("package.version", `expected ${String(SCENE_PACKAGE_VERSION)}`);
  const world = record(raw.world, "package.world");
  const camera = record(raw.camera, "package.camera");
  const edge = record(raw.edge, "package.edge");
  const theme = record(raw.theme, "package.theme");
  const paletteRaw = record(raw.palette ?? {}, "package.palette");
  const palette: Record<string, string> = {};
  for (const [key, value] of Object.entries(paletteRaw))
    palette[id(key, "package.palette")] = color(value, `package.palette.${key}`);
  const sources = unique(
    list(raw.sources, "package.sources").map((item, index) => source(item, `package.sources[${String(index)}]`)),
    "package.sources",
  );
  const sourceIds = new Set(sources.map((item) => item.id));
  for (const item of sources) {
    for (const input of item.derivedFrom ?? [])
      if (!sourceIds.has(input)) fail(`source ${item.id}`, `unknown input "${input}"`);
  }
  const images = unique(
    list(raw.images, "package.images").map((item, index) => image(item, `package.images[${String(index)}]`, sourceIds)),
    "package.images",
  );
  const imageMap = new Map(images.map((item) => [item.id, item]));
  const layers = unique(
    list(raw.layers, "package.layers").map((item, index) => layer(item, `package.layers[${String(index)}]`, imageMap)),
    "package.layers",
  );
  if (!layers.some((item) => item.covers && item.plane === "back"))
    fail("package.layers", "needs a covering back layer");
  const zoomMin = finite(camera.zoomMin, "package.camera.zoomMin", 0.25, 1);
  const result: ScenePackage = Object.freeze({
    format: SCENE_PACKAGE_FORMAT,
    version: SCENE_PACKAGE_VERSION,
    id: id(raw.id, "package.id"),
    stageId: id(raw.stageId, "package.stageId"),
    title: text(raw.title, "package.title", 120),
    world: Object.freeze({
      width: finite(world.width, "package.world.width", 1, 10000),
      height: finite(world.height, "package.world.height", 1, 10000),
      groundY: finite(world.groundY, "package.world.groundY", 0, 10000),
    }),
    camera: Object.freeze({
      playerShift: finite(camera.playerShift, "package.camera.playerShift", 0, 400),
      zoomMin,
      zoomMax: finite(camera.zoomMax, "package.camera.zoomMax", 1, 4),
      shake: finite(camera.shake, "package.camera.shake", 0, 200),
    }),
    edge: Object.freeze({
      color: color(edge.color, "package.edge.color"),
      feather: finite(edge.feather, "package.edge.feather", 0, 400),
    }),
    theme: Object.freeze({ paper: color(theme.paper, "package.theme.paper") }),
    palette: Object.freeze(palette),
    sources,
    images,
    layers,
    shading: unique(
      (raw.shading === undefined ? [] : list(raw.shading, "package.shading")).map((item, index) =>
        shade(item, `package.shading[${String(index)}]`),
      ),
      "package.shading",
    ),
    motion: unique(
      (raw.motion === undefined ? [] : list(raw.motion, "package.motion", 16)).map((item, index) =>
        motion(item, `package.motion[${String(index)}]`, imageMap, layers),
      ),
      "package.motion",
    ),
    platforms: platforms(raw.platforms, "package.platforms", imageMap),
    encodedBudget: integer(raw.encodedBudget, "package.encodedBudget", 1, SCENE_ENCODED_LIMIT),
    decodedBudget: integer(raw.decodedBudget, "package.decodedBudget", 1, SCENE_DECODED_LIMIT),
  });
  const encoded = encodedBytes(result);
  if (encoded > result.encodedBudget) {
    fail("package.encodedBudget", `${String(encoded)} encoded bytes exceed ${String(result.encodedBudget)}`);
  }
  const decoded = decodedBytes(result);
  if (decoded > result.decodedBudget) {
    fail("package.decodedBudget", `${String(decoded)} decoded bytes exceed ${String(result.decodedBudget)}`);
  }
  for (const item of layers) {
    const density = layerPixelsPerUnit(result, item);
    if (density > SCENE_MAX_PIXELS_PER_UNIT)
      fail(
        `layer ${item.id}`,
        `${density.toFixed(2)} image pixels per world unit; no supported canvas shows more than ${String(SCENE_MAX_PIXELS_PER_UNIT)}`,
      );
  }
  for (const item of layers.filter((entry) => entry.plane === "front")) {
    const intrusion = frontLayerIntrusion(result, item);
    if (intrusion > 0)
      fail(`layer ${item.id}`, `front layer reaches ${intrusion.toFixed(1)} px into the gameplay region`);
  }
  return result;
}

/**
 * Decoded RGBA bytes a shown scene holds: every image, plus the canvas each
 * moving part is redrawn into (the size of the paint it moves).
 */
export function decodedBytes(
  scene: Pick<ScenePackage, "images"> & Partial<Pick<ScenePackage, "layers" | "motion">>,
): number {
  const images = scene.images.reduce((total, item) => total + item.width * item.height * 4, 0);
  return (scene.motion ?? []).reduce((total, item) => {
    const layer = scene.layers?.find((entry) => entry.id === item.layer);
    const image = scene.images.find((entry) => entry.id === layer?.image);
    if (layer === undefined || image === undefined) return total;
    const [, , w, h] = layerImageRect(image, layer, item.rect);
    return total + w * h * 4;
  }, images);
}

export function encodedBytes(scene: Pick<ScenePackage, "images">): number {
  return scene.images.reduce((total, item) => total + item.bytes, 0);
}

/** Image pixels a layer holds per world unit, on its denser axis. */
export function layerPixelsPerUnit(scene: Pick<ScenePackage, "images">, layer: SceneLayer): number {
  const image = scene.images.find((item) => item.id === layer.image);
  if (image === undefined) return 0;
  return Math.max(image.width / layer.rect[2], image.height / layer.rect[3]);
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
export function viewportWorldRect(world: ScenePackage["world"], cssWidth: number, cssHeight: number): Rect {
  const scale = Math.min(cssWidth / world.width, cssHeight / world.height);
  const overscanX = Math.max(0, (cssWidth / scale - world.width) / 2);
  const overscanY = Math.max(0, (cssHeight / scale - world.height) / 2);
  return [0 - overscanX, 0 - overscanY, world.width + overscanX * 2, world.height + overscanY * 2];
}

/**
 * Layer-space rectangle a layer must cover so it fills `screen` for every
 * camera in the package contract (zoom range, shake, player anywhere). With
 * `floorY`, rows below the floor surface are left to the floor.
 */
export function requiredLayerRect(
  scene: Pick<ScenePackage, "camera" | "world">,
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

export interface CoverageResult {
  readonly layer: string;
  readonly covered: boolean;
  /** World px the layer falls short on each side (0 when covered). */
  readonly shortfall: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number };
}

export function layerCoverage(
  scene: ScenePackage,
  layerId: string,
  cssWidth: number,
  cssHeight: number,
): CoverageResult {
  const item = scene.layers.find((entry) => entry.id === layerId);
  if (item === undefined) throw new ScenePackageError(`unknown layer "${layerId}"`);
  // The game's floor paints everything below its surface to the view edge.
  const need = requiredLayerRect(
    scene,
    item.depth,
    viewportWorldRect(scene.world, cssWidth, cssHeight),
    scene.world.groundY,
  );
  const [x, y, w, h] = item.rect;
  const shortfall = Object.freeze({
    left: Math.max(0, x - need[0]),
    top: Math.max(0, y - need[1]),
    right: Math.max(0, need[0] + need[2] - (x + w)),
    bottom: Math.max(0, need[1] + need[3] - (y + h)),
  });
  const covered = shortfall.left + shortfall.top + shortfall.right + shortfall.bottom < 0.5;
  return Object.freeze({ layer: layerId, covered, shortfall });
}

/**
 * How far (world px) a front layer can reach above the floor surface, at the
 * extremes of the camera contract. Front layers may only dress the floor body
 * and below, so they never hide anything that stands or flies in the arena.
 */
export function frontLayerIntrusion(scene: Pick<ScenePackage, "camera" | "world">, item: SceneLayer): number {
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
