import type { CoachPoint, CoachRect } from "../../presentation/coach/coach-marks";
import type { TouchControlLayout } from "../../input/touch-control-layout";
import type { WorldCamera } from "../../presentation/world/world-frame";
import type { WorldRect } from "../../presentation/world/contracts";
import type { PadBindingLabel, PromptInputMode } from "../../domain/prompt-vocabulary";
import type { TrainingExercise } from "../../gameplay/training/training-exercises";
import { TrainingCoach, type TrainingCallout, type TrainingCoachFrame } from "../training/training-coach";

/** World point to screen point through the frame camera (see `renderWorldFrame`). */
export function worldToScreen(camera: WorldCamera, x: number, y: number): CoachPoint {
  return {
    x: camera.cx + camera.ox + (x - camera.cx) * camera.scale,
    y: camera.cy + camera.oy + (y - camera.cy) * camera.scale,
  };
}

/** A world box (centre and half extents: the player, an enemy) as its screen rectangle. */
export function worldBoxToScreen(
  camera: WorldCamera,
  box: Readonly<{ x: number; y: number; hw: number; hh: number }>,
): CoachRect {
  const topLeft = worldToScreen(camera, box.x - box.hw, box.y - box.hh),
    bottomRight = worldToScreen(camera, box.x + box.hw, box.y + box.hh);
  return { x: topLeft.x, y: topLeft.y, w: bottomRight.x - topLeft.x, h: bottomRight.y - topLeft.y };
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
  /** The live enemies' boxes: no mark covers an enemy, named or not. */
  readonly enemies?: readonly Readonly<{ x: number; y: number; hw: number; hh: number }>[];
  /** World distance from the player the held blade can reach (`blade.aimRadius + blade.length`). */
  readonly bladeReach?: number;
  readonly exercise?: Readonly<{
    teaching: TrainingExercise;
    progress: readonly [number, number] | undefined;
    completing: boolean;
  }>;
  readonly lessonCard: WorldRect | undefined;
  readonly touchLayout: TouchControlLayout | undefined;
  /** Call-outs posted since the last frame, at world points. */
  readonly callouts?: readonly TrainingCallout[];
}

/**
 * Builds one coach frame per HUD frame: projects the player onto the screen, lists what
 * the marks must avoid (the player, the blade reach, every enemy, the lesson card, the
 * touch controls) and asks the coach which marks are visible.
 */
export function createTrainingCoachPresentation() {
  const coach = new TrainingCoach();
  return {
    frame(sources: TrainingCoachSources) {
      const avoid: CoachRect[] = [];
      let anchor: CoachPoint | undefined;
      if (sources.camera && sources.player) {
        const { x, y, hw, hh } = sources.player;
        const body = worldBoxToScreen(sources.camera, sources.player);
        anchor = { x: body.x + body.w / 2, y: body.y };
        // The held blade orbits the player (hilt within `aimRadius`, then `length` to the
        // tip): the whole reach is action, so a mark sits outside it.
        const reach = sources.bladeReach ?? 0,
          near = worldToScreen(sources.camera, x - hw - reach, y - hh - reach),
          far = worldToScreen(sources.camera, x + hw + reach, y + hh);
        avoid.push(body, { x: near.x, y: near.y, w: far.x - near.x, h: far.y - near.y });
      }
      if (sources.camera) {
        const camera = sources.camera;
        avoid.push(...(sources.enemies ?? []).map((enemy) => worldBoxToScreen(camera, enemy)));
      }
      if (sources.lessonCard) avoid.push(sources.lessonCard);
      if (sources.touchLayout) avoid.push(...touchControlRects(sources.touchLayout));
      const exercise = sources.exercise,
        camera = sources.camera;
      const callouts = (sources.callouts ?? []).map(({ text, tone, target }) =>
        target && camera ? { text, tone, target: worldBoxToScreen(camera, target) } : { text, tone },
      );
      const frame: TrainingCoachFrame = {
        deltaSeconds: sources.deltaSeconds,
        reducedMotion: sources.reducedMotion,
        inputMode: sources.inputMode,
        padLabel: sources.padLabel,
        player: anchor,
        ...(callouts.length > 0 ? { callouts } : {}),
        ...(sources.mode === "tutorial" && exercise
          ? {
              tutorial: {
                key: exercise.teaching.key,
                kind: exercise.teaching.kind,
                title: exercise.teaching.title,
                why: exercise.teaching.why,
                progress: exercise.progress,
                completing: exercise.completing,
                final: exercise.teaching.final,
              },
            }
          : {}),
        ...(sources.mode === "playground"
          ? { playground: { runKey: sources.run, ...(sources.arena === undefined ? {} : { arena: sources.arena }) } }
          : {}),
      };
      return { marks: coach.step(frame), avoid };
    },
  };
}
