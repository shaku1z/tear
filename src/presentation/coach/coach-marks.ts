/**
 * Coach marks: the one data-driven system for in-run prompts, nudges and success beats
 * in the Tutorial and the Playground. A mark is data (what to say, which controls, where
 * it points); this module owns the pure parts: placement that keeps clear of the action
 * and the HUD, a priority queue with timing, and the fade curve. The renderer only
 * measures text and draws the result.
 */

export interface CoachRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface CoachPoint {
  readonly x: number;
  readonly y: number;
}

/** prompt: what to do now · nudge: help when stuck · success: you did it · info: a fact about the screen. */
export type CoachTone = "prompt" | "nudge" | "success" | "info";

export interface CoachMark {
  /** Stable id: re-offering the same id refreshes the mark instead of stacking a copy. */
  readonly id: string;
  /** Marks on the same channel replace each other; different channels may show together. */
  readonly channel: string;
  readonly tone: CoachTone;
  readonly title?: string;
  readonly text: string;
  /** Already worded for the active device (see `src/domain/prompt-vocabulary.ts`). */
  readonly keys: readonly string[];
  /** Screen point the mark refers to (the player, a target), or undefined to sit in its home slot. */
  readonly anchor?: CoachPoint;
  /** Higher wins its channel. */
  readonly priority: number;
  /** Seconds the mark stays before fading; `Infinity` keeps it until dismissed or replaced. */
  readonly seconds: number;
  /**
   * What the mark is about this time (an arena, one call-out). A re-offer of the same id with a
   * different occasion is a new showing and starts its time again; without one, a re-offer keeps
   * the time the mark has left.
   */
  readonly occasion?: string;
}

export interface CoachPlacementInput {
  readonly size: Readonly<{ w: number; h: number }>;
  readonly anchor: CoachPoint;
  /** Safe drawable area (screen minus safe insets). */
  readonly bounds: CoachRect;
  /** Things the mark must not cover: the player, HUD groups, touch controls, other marks. */
  readonly avoid: readonly CoachRect[];
  /** Distance kept from the anchor and from every avoided rectangle. */
  readonly gap: number;
}

export interface CoachPlacement extends CoachRect {
  /** Area still covering an avoided rectangle; 0 when a clear slot exists. */
  readonly overlap: number;
}

const area = (rect: CoachRect): number => Math.max(0, rect.w) * Math.max(0, rect.h);

export function intersection(a: CoachRect, b: CoachRect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x),
    h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

export function inflate(rect: CoachRect, by: number): CoachRect {
  return { x: rect.x - by, y: rect.y - by, w: rect.w + by * 2, h: rect.h + by * 2 };
}

function clampInto(rect: CoachRect, bounds: CoachRect): CoachRect {
  return {
    x: Math.min(Math.max(rect.x, bounds.x), bounds.x + bounds.w - rect.w),
    y: Math.min(Math.max(rect.y, bounds.y), bounds.y + bounds.h - rect.h),
    w: rect.w,
    h: rect.h,
  };
}

/**
 * Candidate slots around the anchor in reading order of preference: above (centred,
 * then leaning left/right), beside, below, then progressively further above so a mark
 * can climb over a crowded floor. Each slot is clamped into the bounds.
 */
function candidates(input: CoachPlacementInput): readonly CoachRect[] {
  const { size, anchor, gap } = input,
    { w, h } = size;
  const above = anchor.y - gap - h,
    below = anchor.y + gap,
    centreX = anchor.x - w / 2;
  const raw: CoachRect[] = [
    { x: centreX, y: above, w, h },
    { x: anchor.x - w + gap, y: above, w, h },
    { x: anchor.x - gap, y: above, w, h },
    { x: anchor.x + gap * 2, y: anchor.y - h / 2, w, h },
    { x: anchor.x - gap * 2 - w, y: anchor.y - h / 2, w, h },
    { x: centreX, y: below, w, h },
    { x: anchor.x + gap * 2, y: anchor.y, w, h },
    { x: anchor.x - gap * 2 - w, y: anchor.y, w, h },
  ];
  for (let step = 1; step <= 4; step++) {
    const y = above - step * (h + gap);
    raw.push({ x: centreX, y, w, h }, { x: anchor.x - w + gap, y, w, h }, { x: anchor.x - gap, y, w, h });
  }
  // A player tucked under the HUD or a screen edge: drop beside and then below the body.
  for (let step = 1; step <= 4; step++) {
    const y = anchor.y + step * (h / 2 + gap);
    raw.push({ x: anchor.x + gap * 2, y, w, h }, { x: anchor.x - gap * 2 - w, y, w, h });
  }
  return raw.map((rect) => clampInto(rect, input.bounds));
}

/**
 * The first candidate that clears every avoided rectangle (with the gap); when none
 * does, the candidate with the least covered area, nearest the anchor on ties.
 */
export function placeCoachMark(input: CoachPlacementInput): CoachPlacement {
  const avoid = input.avoid.map((rect) => inflate(rect, input.gap / 2));
  let best: CoachPlacement | undefined,
    bestDistance = Infinity;
  for (const rect of candidates(input)) {
    const overlap = avoid.reduce((sum, other) => sum + intersection(rect, other), 0);
    const distance = Math.hypot(rect.x + rect.w / 2 - input.anchor.x, rect.y + rect.h / 2 - input.anchor.y);
    if (overlap === 0) return { ...rect, overlap };
    if (best === undefined || overlap < best.overlap || (overlap === best.overlap && distance < bestDistance)) {
      best = { ...rect, overlap };
      bestDistance = distance;
    }
  }
  return (
    best ?? { x: input.bounds.x, y: input.bounds.y, w: input.size.w, h: input.size.h, overlap: area(input.bounds) }
  );
}

/** Seconds a mark takes to fade in and out (instant under reduced motion). */
export const COACH_FADE_SECONDS = 0.25;

/** Opacity of a mark `age` seconds after it appeared, given its lifetime. */
export function coachMarkAlpha(age: number, seconds: number, reducedMotion: boolean): number {
  if (age < 0 || age >= seconds) return 0;
  if (reducedMotion) return 1;
  const fadeIn = Math.min(1, age / COACH_FADE_SECONDS),
    fadeOut = Number.isFinite(seconds) ? Math.min(1, (seconds - age) / COACH_FADE_SECONDS) : 1;
  return Math.max(0, Math.min(fadeIn, fadeOut));
}

interface QueuedMark {
  mark: CoachMark;
  age: number;
}

/**
 * One visible mark per channel: an offer replaces a lower- or equal-priority mark on its
 * channel (a re-offer of the same id keeps its age so it does not flicker, unless it names a
 * different occasion, which starts it again), a weaker offer
 * waits until the stronger mark expires. Marks offered with `once` never return after
 * they were shown and dismissed or expired.
 */
export class CoachQueue {
  readonly #visible = new Map<string, QueuedMark>();
  readonly #waiting = new Map<string, CoachMark[]>();
  readonly #retired = new Set<string>();

  offer(mark: CoachMark, options: Readonly<{ once?: boolean }> = {}): void {
    if (options.once === true && this.#retired.has(mark.id)) return;
    const current = this.#visible.get(mark.channel);
    if (current?.mark.id === mark.id) {
      if (mark.occasion !== undefined && mark.occasion !== current.mark.occasion) current.age = 0;
      current.mark = mark;
      return;
    }
    if (current === undefined || mark.priority >= current.mark.priority) {
      this.#visible.set(mark.channel, { mark, age: 0 });
      if (options.once === true) this.#retired.add(mark.id);
      return;
    }
    const waiting = (this.#waiting.get(mark.channel) ?? []).filter((entry) => entry.id !== mark.id);
    waiting.push(mark);
    this.#waiting.set(mark.channel, waiting);
    if (options.once === true) this.#retired.add(mark.id);
  }

  dismiss(id: string): void {
    for (const [channel, entry] of this.#visible)
      if (entry.mark.id === id) {
        this.#visible.delete(channel);
        this.#promote(channel);
      }
    for (const [channel, waiting] of this.#waiting)
      this.#waiting.set(
        channel,
        waiting.filter((mark) => mark.id !== id),
      );
  }

  /** Drop every mark on a channel (a lesson changed, a screen closed). */
  clear(channel?: string): void {
    if (channel === undefined) {
      this.#visible.clear();
      this.#waiting.clear();
      return;
    }
    this.#visible.delete(channel);
    this.#waiting.delete(channel);
  }

  step(deltaSeconds: number): void {
    for (const [channel, entry] of [...this.#visible]) {
      entry.age += Math.max(0, deltaSeconds);
      if (entry.age >= entry.mark.seconds) {
        this.#visible.delete(channel);
        this.#promote(channel);
      }
    }
  }

  visible(): readonly Readonly<{ mark: CoachMark; age: number }>[] {
    return [...this.#visible.values()].map(({ mark, age }) => ({ mark, age }));
  }

  has(id: string): boolean {
    return [...this.#visible.values()].some((entry) => entry.mark.id === id);
  }

  #promote(channel: string): void {
    const waiting = this.#waiting.get(channel);
    if (!waiting?.length) return;
    waiting.sort((a, b) => b.priority - a.priority);
    const next = waiting.shift();
    if (next) this.#visible.set(channel, { mark: next, age: 0 });
  }
}
