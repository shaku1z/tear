import type {
  AchievementsScreenView,
  CodexScreenView,
  LeaderboardsScreenView,
  LegacyScreenRendererRegistry,
  PlaygroundScreenView,
  ProfileScreenView,
  ReplayScreenView,
  RenameScreenView,
  ScreenAction,
  ScreenControl,
  ScreenRenderContext,
  ScreenUiPort,
  SettingsScreenView,
  ShopScreenView,
} from "./contracts";
import { createDraftRenderers } from "./draft-reserve-tierup";
import { createMenuSetupRenderers } from "./menu-setup";
import { createPauseResultRenderers } from "./pause-results";
import type { createColdScreenRenderers } from "./cold-screen-renderers";

export interface LiveScreenButton {
  readonly [key: string]: unknown;
  readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly label: string;
  readonly enabled?: boolean; readonly sel?: boolean; readonly ghost?: boolean;
  readonly hero?: boolean; readonly glyph?: string; readonly sub?: string;
  readonly accent?: string; readonly confirm?: boolean; readonly _hideBox?: boolean;
  readonly size?: number; readonly action: () => void;
}

export interface LiveScreenRendererOptions {
  readonly canvas: CanvasRenderingContext2D;
  readonly ui: ScreenUiPort;
  readonly width: number;
  readonly height: number;
  readonly time: () => number;
  readonly enterAmount: () => number;
  readonly scroll: () => number;
  readonly focus: () => number;
  readonly touch: () => boolean;
  readonly reducedMotion: () => boolean;
  readonly dispatch: (action: ScreenAction) => void;
  readonly enqueue: (button: LiveScreenButton) => void;
  readonly renderPreview: (id: string, bounds: Readonly<{ x: number; y: number; w: number; h: number }>) => void;
}

function toButton(control: ScreenControl, dispatch: (action: ScreenAction) => void): LiveScreenButton {
  return {
    x: control.x, y: control.y, w: control.w, h: control.h, label: control.label,
    ...(control.enabled === undefined ? {} : { enabled: control.enabled }),
    ...(control.selected === undefined ? {} : { sel: control.selected }),
    ...(control.ghost === undefined ? {} : { ghost: control.ghost }),
    ...(control.hero === undefined ? {} : { hero: control.hero }),
    ...(control.glyph === undefined ? {} : { glyph: control.glyph }),
    ...(control.sub === undefined ? {} : { sub: control.sub }),
    ...(control.accent === undefined ? {} : { accent: control.accent }),
    ...(control.confirm === undefined ? {} : { confirm: control.confirm }),
    ...(control.hiddenBox === undefined ? {} : { _hideBox: control.hiddenBox }),
    ...(control.size === undefined ? {} : { size: control.size }), action: () => { dispatch(control.action); },
  };
}

type ColdScreenRenderers = ReturnType<typeof createColdScreenRenderers>;

function createColdScreenBoundary(context: ScreenRenderContext): ColdScreenRenderers {
  let renderers: ColdScreenRenderers | undefined;
  let loading: Promise<void> | undefined;

  function ensureLoaded(): void {
    loading ??= import("./cold-screen-renderers").then((module) => {
      renderers = module.createColdScreenRenderers(context);
    });
  }

  function loadingFrame(): void {
    ensureLoaded();
    context.ui.header(context.canvas, "LOADING", "opening the archive", context.enterAmount, context.ui.t.color.accent);
    context.ui.text(context.canvas, "â—‡", context.width / 2, context.height / 2, 36, "center", 0.5);
  }

  return Object.freeze({
    codex(view: CodexScreenView) { if (renderers) renderers.codex(view); else loadingFrame(); },
    shop(view: ShopScreenView) { if (renderers) renderers.shop(view); else loadingFrame(); },
    profile(view: ProfileScreenView) { if (renderers) renderers.profile(view); else loadingFrame(); },
    achievements(view: AchievementsScreenView) { if (renderers) renderers.achievements(view); else loadingFrame(); },
    leaderboards(view: LeaderboardsScreenView) { if (renderers) renderers.leaderboards(view); else loadingFrame(); },
    replay(view: ReplayScreenView) { if (renderers) renderers.replay(view); else loadingFrame(); },
    pgmenu(view: PlaygroundScreenView) { if (renderers) renderers.pgmenu(view); else loadingFrame(); },
    pglab(view: PlaygroundScreenView) { if (renderers) renderers.pglab(view); else loadingFrame(); },
    settings(view: SettingsScreenView) { if (renderers) renderers.settings(view); else loadingFrame(); },
    rename(view: RenameScreenView) { if (renderers) renderers.rename(view); else loadingFrame(); },
  });
}

/** Composes every typed canvas screen renderer against one live context. */
export function createLiveScreenRenderers(options: LiveScreenRendererOptions): LegacyScreenRendererRegistry {
  const context: ScreenRenderContext = {
    canvas: options.canvas, ui: options.ui, width: options.width, height: options.height,
    get time() { return options.time(); },
    get enterAmount() { return options.enterAmount(); },
    get scroll() { return options.scroll(); },
    get focus() { return options.focus(); },
    get touch() { return options.touch(); },
    get reducedMotion() { return options.reducedMotion(); },
    enqueue(control: ScreenControl) { options.enqueue(toButton(control, options.dispatch)); },
    renderPreview: options.renderPreview,
  };
  const cold = createColdScreenBoundary(context);
  return Object.freeze({
    playing: () => { return; },
    ...createMenuSetupRenderers(context),
    ...createDraftRenderers(context),
    ...createPauseResultRenderers(context),
    ...cold,
  });
}
