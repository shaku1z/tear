/**
 * The stage beat: what is written on screen over a live world, as world state.
 *
 * A beat never gates input or the combat step. It is stepped one simulation tick at a time like any world
 * timer, so a saved world, a replay and a detached world show it exactly as live play does. Kinds and their
 * durations are data here; one presentation function draws every kind (plans/active/CINEMATICS_OVERHAUL.md,
 * "One system: the stage beat").
 */

import { isRecord } from "../domain/records";

/** The kinds of beat and how many simulation ticks (120 a second) each holds. */
export const STAGE_BEAT_KINDS = Object.freeze({
  /** Under the boss bar: a boss phase change, a boss's named move, and the boss arrival. 1.15 s. */
  banner: Object.freeze({ ticks: 138 }),
});

export type StageBeatKind = keyof typeof STAGE_BEAT_KINDS;

export interface StageBeat {
  readonly kind: StageBeatKind;
  /** Written in the accent colour before the title: a phase numeral ("III") or a boss's name; null for none. */
  readonly mark: string | null;
  readonly title: string;
  /** An optional short line under the title. */
  readonly line: string | null;
  readonly accent: string;
  /** Ticks shown so far; the beat ends when it reaches `ticks`. */
  readonly age: number;
  readonly ticks: number;
}

export interface BannerBeatRequest {
  readonly title: string;
  readonly accent: string;
  readonly mark?: string | null;
  readonly line?: string | null;
}

/** A new banner beat at age 0. */
export function bannerBeat(request: BannerBeatRequest): StageBeat {
  return Object.freeze({
    kind: "banner",
    mark: request.mark ?? null,
    title: request.title,
    line: request.line ?? null,
    accent: request.accent,
    age: 0,
    ticks: STAGE_BEAT_KINDS.banner.ticks,
  });
}

/** The beat one tick later, or null once it has held for its ticks. */
export function stepStageBeat(beat: StageBeat | null): StageBeat | null {
  if (beat === null || beat.age + 1 >= beat.ticks) return null;
  return Object.freeze({ ...beat, age: beat.age + 1 });
}

/** How far through its hold a beat is, 0 at its first tick and 1 at its last. */
export function stageBeatProgress(beat: StageBeat): number {
  return beat.ticks <= 1 ? 1 : Math.min(1, Math.max(0, beat.age / (beat.ticks - 1)));
}

/** The phase numeral a phase-change banner leads with: 1 to 5 as I to V. */
export function phaseNumeral(phase: number): string | null {
  return ["I", "II", "III", "IV", "V"][phase - 1] ?? null;
}

/** A combat feedback event (`BossFxEvent`, the Mirror's queue) as far as it writes a banner. */
export type FeedbackBannerEvent = Readonly<{
  banner?: string | undefined;
  mark?: string | undefined;
  color?: string | undefined;
}>;

/** A batch of feedback events a host drained in one tick, and the colour a banner takes when its event names none. */
export type FeedbackBannerBatch = readonly [events: readonly FeedbackBannerEvent[], accent: string];

/** The banner the last event of these batches writes, in order; null when none writes one. */
export function lastFeedbackBanner(...batches: readonly FeedbackBannerBatch[]): StageBeat | null {
  let last: StageBeat | null = null;
  for (const [events, accent] of batches)
    for (const event of events)
      if (event.banner)
        last = bannerBeat({ title: event.banner, accent: event.color ?? accent, mark: event.mark ?? null });
  return last;
}

/** A boss's arrival banner: its name in its colour, its epithet, and its opening line if it has one. */
export function arrivalBanner(boss: {
  readonly bossName?: string | null;
  readonly epithet?: string | null;
  readonly openingLine?: string | null;
  readonly color?: string;
}): StageBeat | null {
  const name = boss.bossName ?? "";
  if (name.length === 0) return null;
  const epithet = boss.epithet ?? "";
  return bannerBeat({
    mark: epithet.length > 0 ? name : null,
    title: epithet.length > 0 ? epithet : name,
    line: boss.openingLine ?? null,
    accent: boss.color ?? "#ffffff",
  });
}

/** Reads a saved beat back, or throws on anything that is not one. */
export function parseStageBeat(value: unknown): StageBeat | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) throw new TypeError("Invalid stage beat");
  const text = (field: unknown): field is string => typeof field === "string";
  const optional = (field: unknown): field is string | null => field === null || text(field);
  const { kind, mark, title, line, accent, age, ticks } = value;
  const hold = STAGE_BEAT_KINDS.banner.ticks;
  if (
    kind !== "banner" ||
    !optional(mark) ||
    !text(title) ||
    !optional(line) ||
    !text(accent) ||
    typeof age !== "number" ||
    !Number.isSafeInteger(age) ||
    age < 0 ||
    age >= hold ||
    ticks !== hold
  )
    throw new TypeError("Invalid stage beat");
  return Object.freeze({ kind: "banner", mark, title, line, accent, age, ticks: hold });
}
