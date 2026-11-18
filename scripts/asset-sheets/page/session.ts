/**
 * One run of the game's detached world (the one replays use) for a scene, and drawing its frames through the
 * game's own frame path with chosen layers left out, onto a canvas or into SVG.
 */
import {
  createBrowserGhostReplayPresentation,
  type ReplayFrameLayer,
} from "../../../src/app/replay/browser-ghost-studio-media";
import { CONFIG } from "../../../src/config/game-config";
import { clamp } from "../../../src/domain/geometry";
import { createSceneCanvas, loadSceneBitmap, releaseSceneBitmap } from "../../../src/presentation/scenes/scene-bitmap";
import { createSceneLibrary } from "../../../src/presentation/scenes/scene-library";
import { SCENE_PACKAGES } from "../../../src/presentation/scenes/scene-registry";
import { createUi } from "../../../src/presentation/ui";
import { createProductionGhostReplayComposition } from "../../../src/tearbench/production-replay-composition";
import type { SheetScene } from "../manifest";
import { createSvgContext } from "./svg-context";

export const VIEW = { w: CONFIG.view.w, h: CONFIG.view.h };
export const TICKS_PER_SECOND = 120;
export const ALL_LAYERS: readonly ReplayFrameLayer[] = [
  "backdrop",
  "platforms",
  "hazards",
  "environment",
  "enemies",
  "projectiles",
  "player",
  "blade",
  "effects",
];
export type { ReplayFrameLayer };

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** The fields of a world actor the stagers read. */
export interface Actor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  state?: string;
  atk?: string;
  rootbinderState?: { readonly state: string };
  phase?: number;
  isBoss?: boolean;
  dead?: boolean;
  dying?: boolean;
  deathT?: number;
  deathDur?: number;
  flash?: number;
  spawnT?: number;
  introT?: number;
  onGround?: boolean;
  iframe?: number;
  dashTimer?: number;
  takeHit?(damage: number, knockX: number, knockY: number): unknown;
  takeDamage?(damage: number, fromX: number): unknown;
}

let hidden: ReadonlySet<ReplayFrameLayer> = new Set();
let sceneClock = 0;
const paintedScenes = createSceneLibrary({
  packages: SCENE_PACKAGES,
  loadImage: loadSceneBitmap,
  createCanvas: createSceneCanvas,
  releaseImage: releaseSceneBitmap,
  // A clock the page owns: painted backgrounds fade in over real time in the game, never here.
  now: () => sceneClock,
  lowGraphics: () => false,
  reducedMotion: () => false,
});

/** Loads the stage's painted scene: platform shading and surface materials come from it. */
export async function paintedSceneReady(stageId: string): Promise<void> {
  paintedScenes.show(stageId);
  for (let waited = 0; paintedScenes.status(stageId) === "loading"; waited += 1) {
    if (waited > 600) throw new Error(`painted scene for ${stageId} did not load`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  sceneClock += 60_000;
}

export function createSession(scene: SheetScene) {
  const weaponId = scene.setup.kind === "player" || scene.setup.kind === "weapon" ? scene.setup.weaponId : "sword";
  const ui = createUi({
    CLOCK: { sim: 0 },
    presentation: { view: CONFIG.view, colors: CONFIG.colors, overscan: { x: 0, y: 0 } },
    Input: { mode: "mouse" },
    clamp,
    controllerGlyph: () => "",
  });
  const presentation = createBrowserGhostReplayPresentation(document, ui, {
    zoom: 1,
    hidden: () => hidden,
    scenes: paintedScenes,
  });
  return createProductionGhostReplayComposition({
    seed: `asset-sheets:${scene.id}`,
    mode: "tutorial",
    weaponId,
    difficulty: "normal",
    ...presentation,
  }).create(undefined);
}
export type Session = ReturnType<typeof createSession>;

export const enemiesOf = (session: Session): Actor[] => session.replay.world.state.enemies();
export const playerOf = (session: Session): Actor => session.replay.world.state.player() as unknown as Actor;
export const slug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");

export type Command = Readonly<Record<string, unknown>> & { readonly type: string };

/** One simulation tick with the given player commands. */
export function step(session: Session, tick: number, commands: readonly Command[], ids: { next: number }): void {
  const actions = commands.map((command) => ({ kind: "command" as const, id: ++ids.next, tick, command }));
  session.advanceApplicationFrame(1 / TICKS_PER_SECOND, { key: tick % TICKS_PER_SECOND === 0 });
  session.simulation.advanceOne(actions as never);
}

interface FrameView {
  draw(target: CanvasRenderingContext2D, area: Rect): void;
}
function drawFrame(
  session: Session,
  show: ReadonlySet<ReplayFrameLayer>,
  target: CanvasRenderingContext2D,
  area: Rect,
) {
  hidden = new Set(ALL_LAYERS.filter((layer) => !show.has(layer)));
  try {
    (session as unknown as { renderView(): FrameView }).renderView().draw(target, area);
  } finally {
    hidden = new Set();
  }
}

/** The frame on a transparent canvas, cropped to `rect` and drawn at `scale` (not enlarged afterwards). */
export function drawRaster(session: Session, show: ReadonlySet<ReplayFrameLayer>, rect: Rect, scale: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(rect.w * scale);
  canvas.height = Math.round(rect.h * scale);
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("no 2d canvas");
  drawFrame(session, show, context, { x: -rect.x * scale, y: -rect.y * scale, w: VIEW.w * scale, h: VIEW.h * scale });
  return { canvas, context };
}

const measure = document.createElement("canvas").getContext("2d");

/** The same frame as SVG: every shape the game draws, as vectors, cropped to `rect`. */
export function drawSvg(
  session: Session,
  show: ReadonlySet<ReplayFrameLayer>,
  rect: Rect,
  idPrefix: string,
  title: string,
): { svg: string; approximations: string[] } {
  if (measure === null) throw new Error("no 2d canvas");
  const context = createSvgContext(VIEW.w, VIEW.h, measure, idPrefix);
  drawFrame(session, show, context, { x: 0, y: 0, w: VIEW.w, h: VIEW.h });
  const svg = context.document(rect, title);
  // A malformed document would show nothing in most viewers; fail the scene instead of writing it.
  const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
  if (parsed.getElementsByTagName("parsererror").length > 0) throw new Error(`${title}: the SVG is not well formed`);
  return { svg, approximations: [...context.approximations].sort() };
}
