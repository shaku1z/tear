import type { ScreenRectangle } from "../../presentation/render-pipeline";
import { stageBeatProgress, type StageBeat } from "../../gameplay/stage-beat";
import { clamp } from "../../domain/geometry";
import { shownTo, type OverlayLayer, type OverlayViewer } from "./overlay-audience";

/** The running scene, as far as the overlay needs it. */
export interface RunOverlayCinema {
  readonly active: boolean;
  readonly hideHud: boolean;
  readonly playerMode?: string | undefined;
  /** The running script (a chapter is `kind: "chapter"`) and beat (`hud` returns the HUD early). */
  readonly script?: Readonly<{ kind?: string }> | null | undefined;
  readonly beat?: Readonly<{ hud?: boolean }> | undefined;
}

export interface BeatBannerModel {
  readonly text: string;
  readonly mark: string | null;
  readonly line?: string;
  readonly color: string;
  readonly alpha: number;
  readonly reveal: number;
}

/** One frame's state over the world. */
export interface RunOverlayFrame {
  readonly context: CanvasRenderingContext2D;
  /** The rectangle the frame is shown in: every screen-framed layer is drawn to it. */
  readonly screen: ScreenRectangle;
  readonly playing: boolean;
  /** False when a capture leaves the interface out. */
  readonly interfaceShown: boolean;
  /** Whether the stage's own post layer applies (a biome run). */
  readonly biome: boolean;
  readonly cinema: RunOverlayCinema;
  /** The whole-screen inverted flash a parry raises, 0 when none. */
  readonly parryFlash: number;
  readonly stageBeat: StageBeat | null;
  readonly waveBannerSeconds: number;
  readonly stageBannerSeconds: number;
  readonly rankPopup: Readonly<{ seconds: number; text: string; multiplier: number }>;
  /** Whether the device's touch controls can show (touch is active and no controller is). */
  readonly touchControls: boolean;
}

/** What draws each layer. The overlay decides whether and in what order. */
export interface RunOverlayPainters {
  backdropPost(): void;
  hud(): void;
  beatBanner(model: BeatBannerModel): void;
  scene(screen: ScreenRectangle): void;
  touchControls(): void;
  waveBanner(): void;
  stageBanner(): void;
  reticle(): void;
  font(size: number, bold: boolean): string;
  trickColor(multiplier: number): string;
}

export interface RunOverlay {
  /** Everything play draws over the world, in play's order: what follows the world and comes before the screens. */
  draw(frame: RunOverlayFrame, painters: RunOverlayPainters): void;
  /** The blade's aim mark, drawn last over a playing frame. */
  drawReticle(frame: RunOverlayFrame, painters: RunOverlayPainters): void;
}

/**
 * What play draws over the world, for one viewer. Play draws it for the player; a replay draws the same layers
 * in the same order on the same conditions for a watcher, and OVERLAY_LAYERS leaves the player's own out.
 */
export function createRunOverlay(viewer: OverlayViewer): RunOverlay {
  const handoff = createChapterHandoff();
  const seen = (layer: OverlayLayer): boolean => shownTo(layer, viewer);
  return Object.freeze({
    draw(frame: RunOverlayFrame, paint: RunOverlayPainters): void {
      const { context, screen, cinema } = frame;
      if (frame.biome && seen("backdropPost")) paint.backdropPost();
      if (frame.parryFlash > 0 && seen("parryFlash")) {
        context.save();
        context.globalCompositeOperation = "difference";
        context.globalAlpha = clamp(frame.parryFlash, 0, 1);
        context.fillStyle = "#fff";
        context.fillRect(screen.x, screen.y, screen.w, screen.h);
        context.restore();
      }
      // The HUD belongs to live play; run overlays (pause, draft, results) carry their own summary.
      handoff.observe(cinema.active && cinema.script?.kind === "chapter", frame.waveBannerSeconds);
      if (!frame.interfaceShown) return;
      // A scene keeps running under the pause and draft screens; the rest belongs to the playing frame.
      const playing = frame.playing;
      // The HUD returns on a chapter's READY beat (before control); a boss arrival never hides it.
      if (playing && (!cinema.active || !cinema.hideHud || cinema.beat?.hud === true)) paint.hud();
      const beat = frame.stageBeat;
      if (playing && beat !== null && !cinema.active && seen("stageBeat")) {
        // In over the first sixth of the hold, out over the last fifth; the rule is drawn by the first third.
        const progress = stageBeatProgress(beat);
        paint.beatBanner({
          text: beat.title,
          mark: beat.mark,
          ...(beat.line === null ? {} : { line: beat.line }),
          color: beat.accent,
          alpha: Math.min(1, progress * 6, (1 - progress) * 5),
          reveal: Math.min(1, progress * 3),
        });
      }
      if (cinema.active && seen("cinematic")) paint.scene(screen);
      if (!playing) return;
      if (frame.touchControls && (!cinema.active || cinema.playerMode === "finalBlade") && seen("touchControls"))
        paint.touchControls();
      // The stage banner owns the announcement band while it shows (no duplicate WAVE title).
      // The chapter that hands off to a wave already announced it; its WAVE banner is not repeated.
      if (frame.waveBannerSeconds > 0 && frame.stageBannerSeconds <= 0 && !cinema.active && !handoff.muted())
        paint.waveBanner();
      if (frame.stageBannerSeconds > 0 && !cinema.active) paint.stageBanner();
      const rank = frame.rankPopup;
      if (rank.seconds > 0 && seen("rankPopup")) {
        const fade = clamp(rank.seconds, 0, 1);
        context.save();
        context.globalAlpha = fade;
        context.fillStyle = paint.trickColor(rank.multiplier);
        context.textAlign = "center";
        context.font = paint.font(42 + (1 - fade) * 18, true);
        context.fillText(rank.text, screen.x + screen.w / 2, screen.y + screen.h / 2 - 140);
        context.restore();
      }
    },
    drawReticle(frame: RunOverlayFrame, paint: RunOverlayPainters): void {
      const { cinema } = frame;
      if (!frame.interfaceShown || !frame.playing) return;
      if (!cinema.active || cinema.playerMode === "landing" || cinema.playerMode === "finalBlade") paint.reticle();
    },
  });
}

/**
 * Tracks the hand-off from a chapter cinematic to its first wave: the wave banner that
 * activation raises in the same tick is muted until it has run out.
 */
function createChapterHandoff() {
  let chapterActive = false;
  let muted = false;
  return Object.freeze({
    observe(active: boolean, bannerSeconds: number): void {
      if (chapterActive && !active) muted = bannerSeconds > 0;
      else if (bannerSeconds <= 0) muted = false;
      chapterActive = active;
    },
    muted: () => muted,
  });
}
