import type { GameRuntimeDependencies } from "../shell/game-runtime-dependencies";

type Backdrop = GameRuntimeDependencies["Backdrop"];
type BackdropPlatform = Parameters<Backdrop["platform"]>[1];
type BackdropStage = Parameters<Backdrop["platform"]>[2];

/** The stage a run is showing, as the world draws it at rest, and the ink the interface draws on it. */
export interface StageRestFrame {
  readonly stageId: string;
  readonly ink: string;
  readonly canvas: HTMLCanvasElement;
}

export interface StageRestFrameOptions {
  readonly dependencies: Pick<GameRuntimeDependencies, "Scenes" | "Backdrop" | "THEME" | "browserDocument">;
  readonly stage: Readonly<{
    current: BackdropStage & Readonly<{ id: string }>;
    platforms: readonly (BackdropPlatform & Readonly<{ floor?: boolean }>)[];
  }>;
  readonly width: number;
  readonly height: number;
}

/**
 * Test-build evidence hook. Draws the stage a run is showing the way the world
 * draws it with nothing happening: backdrop, platform shadows, platforms and
 * the front plane, with no actors, effects or interface. Readability checks
 * measure this frame, so they judge the stage and not what stands on it.
 * `timeSeconds` is the moment of the stage's own motion (water, motes, sway)
 * to draw. Returns undefined until the stage's own scene covers the view.
 */
export function createStageRestFrame(
  options: StageRestFrameOptions,
): (timeSeconds?: number) => StageRestFrame | undefined {
  const { Scenes, Backdrop, THEME, browserDocument } = options.dependencies;
  const { width, height } = options;
  return (timeSeconds = 0) => {
    const current = options.stage.current;
    if (!Scenes.opaque(current.id)) return undefined;
    const canvas = browserDocument.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (context === null) return undefined;
    const view = { left: 0, top: 0, right: width, bottom: height };
    const input = {
      stageId: current.id,
      camera: { cx: width / 2, cy: height / 2, scale: 1, ox: 0, oy: 0 },
      playerWorldX: width / 2,
      worldWidth: width,
      view,
      timeSeconds,
    };
    Scenes.drawBack(context, input);
    Scenes.drawShadows(context, current.id, options.stage.platforms);
    const texture = Scenes.surfaceMaterial(current.id);
    for (const platform of options.stage.platforms) {
      Backdrop.platform(context, platform, current, platform.floor === true, view, texture);
    }
    Scenes.drawFront(context, input);
    return { stageId: current.id, ink: THEME.ink, canvas };
  };
}
