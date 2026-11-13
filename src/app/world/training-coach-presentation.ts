import type { CoachPoint, CoachRect } from "../../presentation/coach/coach-marks";
import type { TouchControlLayout } from "../../input/touch-control-layout";
import type { WorldCamera } from "../../presentation/world/world-frame";
import type { WorldRect } from "../../presentation/world/contracts";
import type { PadBindingLabel, PromptInputMode } from "../../domain/prompt-vocabulary";
import type { LiveTutorialLessonView } from "../../gameplay/training/live-tutorial-runtime";
import { lessonPromptActions } from "../../presentation/world/tutorial-input-prompts";
import { TrainingCoachDirector, type TrainingCoachFrame } from "../training/training-coach-director";

/** World point to screen point through the frame camera (see `renderWorldFrame`). */
export function worldToScreen(camera: WorldCamera, x: number, y: number): CoachPoint {
  return {
    x: camera.cx + camera.ox + (x - camera.cx) * camera.scale,
    y: camera.cy + camera.oy + (y - camera.cy) * camera.scale,
  };
}

/** The on-screen touch controls as rectangles a coach mark must keep clear of. */
export function touchControlRects(layout: TouchControlLayout): readonly CoachRect[] {
  return [layout.jump, layout.dash, layout.throwB, layout.pause, layout.joystickHome].map((circle) => ({
    x: circle.x - circle.r,
    y: circle.y - circle.r,
    w: circle.r * 2,
    h: circle.r * 2,
  }));
}

export interface TrainingCoachSources {
  readonly mode: "tutorial" | "playground" | "other";
  readonly run: object;
  /** The Playground arena; the help line returns when it changes. */
  readonly arena?: number;
  readonly deltaSeconds: number;
  readonly reducedMotion: boolean;
  readonly inputMode: PromptInputMode;
  readonly padLabel: PadBindingLabel;
  readonly camera: WorldCamera | undefined;
  readonly player: Readonly<{ x: number; y: number; hw: number; hh: number }> | undefined;
  /** World distance from the player the held blade can reach (`blade.aimRadius + blade.length`). */
  readonly bladeReach?: number;
  readonly lesson?: Readonly<{
    index: number;
    view: LiveTutorialLessonView;
    completing: boolean;
  }>;
  readonly lessonCard: WorldRect | undefined;
  readonly touchLayout: TouchControlLayout | undefined;
}

/**
 * Builds one coach frame per HUD frame: projects the player onto the screen, lists what
 * the marks must avoid (the player, the lesson card, the touch controls) and asks the
 * director which marks are visible.
 */
export function createTrainingCoachPresentation() {
  const director = new TrainingCoachDirector();
  return {
    frame(sources: TrainingCoachSources) {
      const avoid: CoachRect[] = [];
      let anchor: CoachPoint | undefined;
      if (sources.camera && sources.player) {
        const { x, y, hw, hh } = sources.player;
        const topLeft = worldToScreen(sources.camera, x - hw, y - hh),
          bottomRight = worldToScreen(sources.camera, x + hw, y + hh);
        anchor = { x: (topLeft.x + bottomRight.x) / 2, y: topLeft.y };
        // The held blade orbits the player (hilt within `aimRadius`, then `length` to the
        // tip): the whole reach is action, so a mark sits outside it.
        const reach = sources.bladeReach ?? 0,
          near = worldToScreen(sources.camera, x - hw - reach, y - hh - reach),
          far = worldToScreen(sources.camera, x + hw + reach, y + hh);
        avoid.push({ x: topLeft.x, y: topLeft.y, w: bottomRight.x - topLeft.x, h: bottomRight.y - topLeft.y });
        avoid.push({ x: near.x, y: near.y, w: far.x - near.x, h: far.y - near.y });
      }
      if (sources.lessonCard) avoid.push(sources.lessonCard);
      if (sources.touchLayout) avoid.push(...touchControlRects(sources.touchLayout));
      const lesson = sources.lesson;
      const frame: TrainingCoachFrame = {
        deltaSeconds: sources.deltaSeconds,
        reducedMotion: sources.reducedMotion,
        inputMode: sources.inputMode,
        padLabel: sources.padLabel,
        player: anchor,
        ...(sources.mode === "tutorial" && lesson
          ? {
              tutorial: {
                key: `${String(lesson.index)}:${lesson.view.t}`,
                title: lesson.view.t,
                goal: lesson.view.d,
                actions: lessonPromptActions(lesson.view.keys),
                progress: lesson.view.need === undefined ? undefined : lesson.view.prog(),
                completing: lesson.completing,
                final: lesson.view.final === true,
              },
            }
          : {}),
        ...(sources.mode === "playground"
          ? { playground: { runKey: sources.run, ...(sources.arena === undefined ? {} : { arena: sources.arena }) } }
          : {}),
      };
      return { marks: director.step(frame), avoid };
    },
  };
}
