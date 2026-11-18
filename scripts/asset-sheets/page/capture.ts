/**
 * Runs one scene twice and photographs it. The first pass notes, tick by tick, which looks are on screen;
 * the second pass, identical because the simulation is deterministic, takes each picture part-way through
 * the first span of its look. Stage objects and projectiles seen in any scene are photographed too, once,
 * by the first scene that shows them.
 */
import { ASSET_MANIFEST, byproductAsset, type SheetScene } from "../manifest";
import {
  createSession,
  drawRaster,
  drawSvg,
  paintedSceneReady,
  slug,
  step,
  TICKS_PER_SECOND,
  VIEW,
  type Rect,
  type Session,
} from "./session";
import { STAGERS, type Track } from "./stagers";

const PAD = 14;
/** The categories pictured from other scenes' play, by the registry their rows draw. */
const STAGE_OBJECTS = "stage-objects";
const PROJECTILES = "projectiles";
const PNG_SCALES = [1, 3] as const;
const PROJECTILE_FLAGS = [
  "charged",
  "bomb",
  "mine",
  "shock",
  "mud",
  "sweeper",
  "crownfire",
  "crescent",
  "quake",
  "embedded",
  "deflected",
] as const;

export interface Picture extends Track {
  readonly scene: string;
  readonly tick: number;
  readonly rect: Rect;
  /** The picture as SVG (vector, any size). */
  readonly svg: string;
  /** What SVG could only approximate in this picture (for example a canvas shadow). */
  readonly approximations: readonly string[];
  /** PNG data URLs with no background, keyed by scale ("1", "3"). */
  readonly png: Readonly<Record<string, string>>;
}

/** Stage objects and projectiles on screen in any scene. */
function byproductTracks(session: Session, scene: SheetScene): Track[] {
  const found: Track[] = [];
  const environment = session.replay.world.context.environment.snapshot();
  for (const object of [...environment.fields, ...environment.combatObjects, ...environment.routes])
    found.push({
      category: STAGE_OBJECTS,
      asset: byproductAsset(ASSET_MANIFEST.manifest, STAGE_OBJECTS, object.kind),
      state: slug(object.state),
      show: ["environment"],
      facts: { stage: environment.stageId, firstSeenIn: scene.id },
    });
  for (const projectile of session.replay.world.state.projectiles() as unknown as Readonly<Record<string, unknown>>[]) {
    if (projectile.dead === true) continue;
    const flags = PROJECTILE_FLAGS.filter((flag) => projectile[flag] === true);
    const named = [projectile.kind, projectile.bossAttack, projectile.sweeperStyle].filter(
      (value): value is string => typeof value === "string",
    );
    const family = typeof projectile.family === "string" ? projectile.family : "ordinaryProjectile";
    found.push({
      category: PROJECTILES,
      asset: byproductAsset(ASSET_MANIFEST.manifest, PROJECTILES, family),
      state: slug([...named, ...flags].join("-")) || "shot",
      show: ["projectiles"],
      facts: { firstSeenIn: scene.id },
    });
  }
  return found;
}

/** The smallest rectangle holding every drawn pixel, padded; null when nothing was drawn. */
function drawnBounds(context: CanvasRenderingContext2D): Rect | null {
  const { data } = context.getImageData(0, 0, VIEW.w, VIEW.h);
  let left = VIEW.w,
    top = VIEW.h,
    right = -1,
    bottom = -1;
  for (let y = 0; y < VIEW.h; y += 1)
    for (let x = 0; x < VIEW.w; x += 1)
      if ((data[(y * VIEW.w + x) * 4 + 3] ?? 0) > 10) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
  if (right < 0) return null;
  const x = Math.max(0, left - PAD),
    y = Math.max(0, top - PAD);
  return { x, y, w: Math.min(VIEW.w, right + 1 + PAD) - x, h: Math.min(VIEW.h, bottom + 1 + PAD) - y };
}

/** A picture with no background has at least one pixel nothing drew on. */
function hasClearPixel(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement): boolean {
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let alpha = 3; alpha < data.length; alpha += 4) if (data[alpha] === 0) return true;
  return false;
}

export const trackKey = (track: Pick<Track, "category" | "asset" | "state">): string =>
  `${track.category}/${track.asset}/${track.state}`;

function photograph(session: Session, scene: SheetScene, track: Track, tick: number): Picture | null {
  // Particles drift far from what made them, so they do not decide the crop.
  const solid = new Set(track.show.filter((layer) => layer !== "effects"));
  const rect = drawnBounds(drawRaster(session, solid, { x: 0, y: 0, w: VIEW.w, h: VIEW.h }, 1).context);
  if (rect === null) return null;
  const shown = new Set(track.show);
  const png: Record<string, string> = {};
  for (const scale of PNG_SCALES) {
    const raster = drawRaster(session, shown, rect, scale);
    if (scale === 1 && !hasClearPixel(raster.context, raster.canvas))
      throw new Error(`${scene.id}: ${trackKey(track)} has no transparent pixel, so something drew a background`);
    png[String(scale)] = raster.canvas.toDataURL("image/png");
  }
  const key = trackKey(track);
  const { svg, approximations } = drawSvg(session, shown, rect, slug(key), key);
  return { ...track, scene: scene.id, tick, rect, svg, approximations, png };
}

/**
 * Renders one scene. `taken` holds the keys of stage objects and projectiles that already have a picture
 * (from earlier scenes in this run or kept from an earlier run); the scene adds what it photographs.
 */
export async function renderScene(scene: SheetScene, taken: Set<string>) {
  const stager = STAGERS[scene.setup.kind];
  await paintedSceneReady(scene.stageId);
  const naturalTicks = scene.seconds * TICKS_PER_SECOND;
  const totalTicks = naturalTicks + stager.afterTicks;
  const run = (session: Session, each: (tick: number) => void) => {
    stager.prepare(session, scene);
    const ids = { next: 0 };
    for (let tick = 1; tick <= totalTicks; tick += 1) {
      step(session, tick, stager.script(session, scene, tick, naturalTicks), ids);
      each(tick);
    }
  };

  // First pass: when is each look first on screen, and for how long?
  const spans = new Map<string, { track: Track; start: number; end: number; open: boolean }>();
  const first = createSession(scene);
  run(first, (tick) => {
    const looks = [...stager.tracks(first, scene, tick, naturalTicks), ...byproductTracks(first, scene)];
    const present = new Map(looks.map((track) => [trackKey(track), track]));
    for (const [key, track] of present) {
      const span = spans.get(key);
      if (span === undefined) spans.set(key, { track, start: tick, end: tick, open: true });
      else if (span.open) span.end = tick;
    }
    for (const [key, span] of spans) if (span.open && !present.has(key)) span.open = false;
  });
  const due = new Map<number, Track[]>();
  for (const [key, span] of spans) {
    const byproduct = span.track.category !== scene.category;
    if (byproduct && taken.has(key)) continue;
    if (byproduct) taken.add(key);
    const at = span.start + Math.min(Math.floor((span.end - span.start) * 0.6), 90);
    due.set(at, [...(due.get(at) ?? []), span.track]);
  }

  // Second pass: the same ticks again, with the camera.
  const pictures: Picture[] = [];
  const empty: string[] = [];
  const second = createSession(scene);
  run(second, (tick) => {
    for (const track of due.get(tick) ?? []) {
      const picture = photograph(second, scene, track, tick);
      if (picture === null) empty.push(trackKey(track));
      else pictures.push(picture);
    }
  });
  return { pictures, empty };
}
