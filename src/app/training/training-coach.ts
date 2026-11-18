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
/** How long the lesson prompt stays at the player before it steps back to the strip. */
export const COACH_PROMPT_SECONDS = 6;
/** How long the Playground help line stays when the Playground opens. */
export const COACH_HELP_SECONDS = 8;
/** How long a counted step ("2 of 3") shows at the player. */
export const COACH_STEP_SECONDS = 1;
/** How long the "learned" line shows when an exercise completes. */
export const COACH_LEARNED_SECONDS = 3;

export interface TutorialCoachInput {
  /** Changes whenever the active exercise changes (lesson, weapon step, opponent). */
  readonly key: string;
  readonly kind: "lesson" | "weapon" | "enemy" | "boss";
  readonly title: string;
  readonly goal: string;
  /** One line on what the exercise does for you in a real run. */
  readonly why: string;
  readonly actions: readonly PromptAction[];
  /** [current, goal] or undefined for an exercise with no counted objective. */
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
 * clocks only (never simulation state): the goal and its controls at the player when an
 * exercise starts (gone at the first counted step), a short count at each counted step,
 * a "learned" line with why it matters when the exercise completes, a demonstration
 * offer after a stall, and the Playground's one-line help when a Playground run opens.
 */
export class TrainingCoach {
  readonly #queue = new CoachQueue();
  #lessonKey = "";
  #lessonEvidence = 0;
  #completing = false;
  #learnedId = "";
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
      this.#completing = false;
      this.#promptShown = false;
      this.#idle = 0;
    }
    if (lesson.completing && !this.#completing) this.#learned(frame, lesson);
    this.#completing = lesson.completing;
    if (evidence !== this.#lessonEvidence || lesson.completing) {
      if (evidence > this.#lessonEvidence && !lesson.completing) this.#counted(frame, lesson, evidence);
      this.#lessonEvidence = evidence;
      this.#idle = 0;
      this.#queue.dismiss(`lesson:${lesson.key}:prompt`);
      this.#queue.dismiss(`lesson:${lesson.key}:stuck`);
    } else this.#idle += Math.max(0, frame.deltaSeconds);
    const keys = promptLabels(lesson.actions, device, frame.padLabel);
    // The next goal waits until the previous exercise's "learned" line has played.
    const settled = !this.#queue.has(this.#learnedId);
    if (!this.#promptShown && settled && evidence === 0 && !lesson.completing) {
      this.#promptShown = true;
      this.#idle = 0;
      this.#queue.offer(this.#mark(frame, lesson, "prompt", lesson.goal, keys, COACH_PROMPT_SECONDS, 1));
    } else if (this.#queue.has(`lesson:${lesson.key}:prompt`))
      this.#queue.offer(this.#mark(frame, lesson, "prompt", lesson.goal, keys, COACH_PROMPT_SECONDS, 1));
    const stuckId = `lesson:${lesson.key}:stuck`;
    if (this.#idle >= COACH_IDLE_SECONDS && !lesson.completing) {
      this.#idle = -COACH_PROMPT_SECONDS;
      this.#queue.offer(this.#stuck(frame, lesson, device));
    } else if (this.#queue.has(stuckId)) this.#queue.offer(this.#stuck(frame, lesson, device));
  }

  /** A short count at the player for each counted step of a multi-step goal. */
  #counted(frame: TrainingCoachFrame, lesson: TutorialCoachInput, evidence: number): void {
    const goal = lesson.progress?.[1] ?? 0;
    if (goal <= 1 || evidence >= goal) return;
    this.#queue.offer({
      id: `beat:${lesson.key}:${String(evidence)}`,
      channel: "beat",
      tone: "success",
      text: `${String(evidence)} of ${String(goal)}`,
      keys: [],
      ...(frame.player ? { anchor: frame.player } : {}),
      priority: 1,
      seconds: COACH_STEP_SECONDS,
    });
  }

  /** The exercise is complete: name it and say what it is for. */
  #learned(frame: TrainingCoachFrame, lesson: TutorialCoachInput): void {
    this.#learnedId = `beat:${lesson.key}:learned`;
    this.#queue.offer({
      id: this.#learnedId,
      channel: "beat",
      tone: "success",
      title: `${lesson.kind === "lesson" ? "LEARNED" : "DONE"} · ${lesson.title}`,
      text: lesson.why,
      keys: [],
      ...(frame.player ? { anchor: frame.player } : {}),
      priority: 3,
      seconds: COACH_LEARNED_SECONDS,
    });
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
    // Keyboard names its shortcuts; touch and controller reach the same menu through pause.
    const shortcuts = (["playground-menu", "abilities", "quick-spawn"] as const).filter((action) =>
      promptAvailable(action, device),
    );
    const names = { "playground-menu": "menu", abilities: "abilities", "quick-spawn": "spawn" } as const;
    const pause = promptLabel("pause", device, frame.padLabel);
    const text =
      shortcuts.length > 0
        ? shortcuts.map((action) => `${promptLabel(action, device) ?? ""} ${names[action]}`).join("  ·  ")
        : "Pause for the Playground menu.";
    this.#queue.offer({
      id: "playground:help",
      channel: "help",
      tone: "info",
      title: "PLAYGROUND",
      text,
      keys: shortcuts.length > 0 || pause === null ? [] : [pause],
      priority: 0,
      seconds: COACH_HELP_SECONDS,
    });
  }
}
