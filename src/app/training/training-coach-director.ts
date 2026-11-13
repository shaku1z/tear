import { CoachQueue, coachMarkAlpha, type CoachMark, type CoachPoint } from "../../presentation/coach/coach-marks";
import {
  promptAvailable,
  promptDevice,
  promptLabel,
  promptLabels,
  type PadBindingLabel,
  type PromptAction,
  type PromptDevice,
  type PromptInputMode,
} from "../../domain/prompt-vocabulary";

/** Seconds without new lesson evidence before the coach offers a demonstration. */
export const COACH_IDLE_SECONDS = 9;
/** How long the lesson prompt stays at the player before it steps back to the card. */
export const COACH_PROMPT_SECONDS = 6;
/** How long the Playground help line stays when the Playground opens. */
export const COACH_HELP_SECONDS = 8;

export interface TutorialCoachInput {
  /** Changes whenever the active exercise changes (lesson, annex, drill). */
  readonly key: string;
  readonly title: string;
  readonly goal: string;
  readonly actions: readonly PromptAction[];
  /** [current, goal] or undefined for a lesson with no counted objective. */
  readonly progress: readonly [number, number] | undefined;
  /** The completion beat is playing. */
  readonly completing: boolean;
  readonly final: boolean;
}

export interface TrainingCoachFrame {
  readonly deltaSeconds: number;
  readonly reducedMotion: boolean;
  readonly inputMode: PromptInputMode;
  readonly padLabel: PadBindingLabel;
  /** The player's head on screen, which lesson prompts point at. */
  readonly player: CoachPoint | undefined;
  readonly tutorial?: TutorialCoachInput;
  /** Present while a Playground run is on screen; the help returns for a new run or a new arena. */
  readonly playground?: Readonly<{ runKey: unknown; arena?: number }>;
}

/**
 * Decides which coach marks the Tutorial and the Playground show. It owns presentation
 * clocks only (never simulation state): a lesson prompt at the player when an exercise
 * starts (gone at the first counted evidence), a "show me" nudge after a stall, and the
 * Playground's one-line help when a Playground run opens.
 */
export class TrainingCoachDirector {
  readonly #queue = new CoachQueue();
  #lessonKey = "";
  #lessonEvidence = 0;
  #promptShown = false;
  #idle = 0;
  #playgroundKey: unknown = undefined;
  #playgroundArena: number | undefined = undefined;

  step(frame: TrainingCoachFrame): readonly Readonly<{ mark: CoachMark; alpha: number }>[] {
    const device = promptDevice(frame.inputMode);
    this.#tutorial(frame, device);
    this.#playground(frame, device);
    this.#queue.step(frame.deltaSeconds);
    return this.#queue
      .visible()
      .map(({ mark, age }) => ({ mark, alpha: coachMarkAlpha(age, mark.seconds, frame.reducedMotion) }));
  }

  #tutorial(frame: TrainingCoachFrame, device: PromptDevice): void {
    const lesson = frame.tutorial;
    if (lesson === undefined || lesson.final) {
      this.#queue.clear("lesson");
      this.#lessonKey = "";
      return;
    }
    const evidence = lesson.progress?.[0] ?? 0;
    if (lesson.key !== this.#lessonKey) {
      this.#queue.clear("lesson");
      this.#lessonKey = lesson.key;
      this.#lessonEvidence = evidence;
      this.#promptShown = false;
      this.#idle = 0;
    }
    if (evidence !== this.#lessonEvidence || lesson.completing) {
      this.#lessonEvidence = evidence;
      this.#idle = 0;
      this.#queue.dismiss(`lesson:${lesson.key}:prompt`);
      this.#queue.dismiss(`lesson:${lesson.key}:stuck`);
    } else this.#idle += Math.max(0, frame.deltaSeconds);
    const keys = promptLabels(lesson.actions, device, frame.padLabel);
    if (!this.#promptShown && evidence === 0 && !lesson.completing) {
      this.#promptShown = true;
      this.#queue.offer(this.#mark(frame, lesson, "prompt", lesson.goal, keys, COACH_PROMPT_SECONDS, 1));
    } else if (this.#queue.has(`lesson:${lesson.key}:prompt`))
      this.#queue.offer(this.#mark(frame, lesson, "prompt", lesson.goal, keys, COACH_PROMPT_SECONDS, 1));
    const stuckId = `lesson:${lesson.key}:stuck`;
    if (this.#idle >= COACH_IDLE_SECONDS && !lesson.completing) {
      this.#idle = -COACH_PROMPT_SECONDS;
      this.#queue.offer(this.#stuck(frame, lesson, device));
    } else if (this.#queue.has(stuckId)) this.#queue.offer(this.#stuck(frame, lesson, device));
  }

  #mark(
    frame: TrainingCoachFrame,
    lesson: TutorialCoachInput,
    kind: "prompt",
    text: string,
    keys: readonly string[],
    seconds: number,
    priority: number,
  ): CoachMark {
    return {
      id: `lesson:${lesson.key}:${kind}`,
      channel: "lesson",
      tone: "prompt",
      title: lesson.title,
      text,
      keys,
      ...(frame.player ? { anchor: frame.player } : {}),
      priority,
      seconds,
    };
  }

  #stuck(frame: TrainingCoachFrame, lesson: TutorialCoachInput, device: PromptDevice): CoachMark {
    const pause = promptLabel("pause", device, frame.padLabel);
    return {
      id: `lesson:${lesson.key}:stuck`,
      channel: "lesson",
      tone: "nudge",
      title: "WATCH IT DONE",
      text: "Pause and choose SHOW DEMO to see this move performed.",
      keys: pause === null ? [] : [pause],
      ...(frame.player ? { anchor: frame.player } : {}),
      priority: 2,
      seconds: COACH_PROMPT_SECONDS,
    };
  }

  #playground(frame: TrainingCoachFrame, device: PromptDevice): void {
    const playground = frame.playground;
    if (playground === undefined) {
      this.#queue.clear("help");
      this.#playgroundKey = undefined;
      return;
    }
    if (playground.runKey === this.#playgroundKey && playground.arena === this.#playgroundArena) return;
    this.#playgroundKey = playground.runKey;
    this.#playgroundArena = playground.arena;
    const shortcuts = (["build-menu", "ability-lab", "quick-spawn"] as const).filter((action) =>
      promptAvailable(action, device),
    );
    if (shortcuts.length === 0) return;
    const names = { "build-menu": "build menu", "ability-lab": "ability lab", "quick-spawn": "quick spawn" } as const;
    this.#queue.offer({
      id: "playground:help",
      channel: "help",
      tone: "info",
      title: "PLAYGROUND",
      text: shortcuts.map((action) => `${promptLabel(action, device) ?? ""} ${names[action]}`).join("  ·  "),
      keys: [],
      priority: 0,
      seconds: COACH_HELP_SECONDS,
    });
  }
}
