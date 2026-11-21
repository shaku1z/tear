import { TutorialFailureCoach, type TutorialAttemptFact, type TutorialFailureView } from "./tutorial-failure-coach";
import {
  sampleTutorialGold,
  tutorialGoldContactEdges,
  tutorialGoldReference,
  type TutorialGoldCorpus,
  type TutorialGoldFrame,
  type TutorialGoldLessonId,
  type TutorialGoldReference,
} from "./tutorial-gold-reference";
import { shippingTutorialGold } from "./tutorial-gold-shipping";
import type { GameAction } from "../../input/game-action";
import type { AuthoritativeInputSnapshot } from "../runtime/authoritative-input";
import {
  MAX_POSES,
  parseTutorialCoachCheckpoint,
  type Attempt,
  type Pose,
  type TutorialCoachCheckpoint,
} from "./tutorial-coach-checkpoint";

// The shipped corpus arrives after a lesson starts; see tutorial-gold-shipping.ts.
export { loadShippingTutorialGold, shippingTutorialGold } from "./tutorial-gold-shipping";
export interface TutorialCoachView {
  readonly available: boolean;
  readonly visible: boolean;
  readonly mode: "preview" | "diagnostic" | "comparison";
  readonly rate: 1 | 0.5;
  readonly diagnosis: string;
  readonly canCompare: boolean;
  readonly reducedMotion: boolean;
  readonly adaptive?: TutorialFailureView;
  readonly tick: number;
  readonly fromTick: number;
  readonly toTick: number;
}
export interface TutorialGoldDisplay extends TutorialCoachView {
  readonly frame: TutorialGoldFrame;
  readonly platforms: TutorialGoldReference["platforms"];
  readonly glyphs: readonly string[];
  readonly contacts: readonly string[];
  readonly landmarks: TutorialGoldReference["landmarks"];
  readonly personal: readonly Pose[];
  readonly path: readonly TutorialGoldFrame[];
  readonly markers: readonly Readonly<{ kind: string; frame: TutorialGoldFrame }>[];
  readonly trail: readonly TutorialGoldFrame[];
}
function lastWhere<T>(items: readonly T[], predicate: (item: T) => boolean): T | undefined {
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index];
    if (item !== undefined && predicate(item)) return item;
  }
  return undefined;
}
/** Presentation and observed-attempt evidence only. Never emits gameplay input or objective marks. */
export class TutorialGhostCoach {
  private reference: TutorialGoldReference | undefined;
  private selection = "";
  private mode: TutorialCoachView["mode"] = "preview";
  private rate: 1 | 0.5 = 1;
  private cursor = 0;
  private from = 0;
  private to = 0;
  private visible = false;
  private diagnosis = "No attempt yet.";
  private current: Attempt | undefined;
  private best: Attempt | undefined;
  private previous: TutorialGoldFrame | undefined;
  private origin = 0;
  private completed = false;
  private commands: readonly GameAction[] = [];
  /** A state restored before the corpus arrived; applied when it does, if it belongs to the lesson's reference. */
  private pending: TutorialCoachCheckpoint | undefined;
  private readonly failures: TutorialFailureCoach;
  constructor(
    private readonly corpus: () => TutorialGoldCorpus | undefined = shippingTutorialGold,
    private readonly minimumHitSpeed = Number.POSITIVE_INFINITY,
    /** Cheap per-tick check of whether the shipped corpus has arrived; `corpus` itself may be costly. */
    private readonly corpusArrived: () => boolean = () => shippingTutorialGold() !== undefined,
  ) {
    this.failures = new TutorialFailureCoach(minimumHitSpeed);
  }
  select(lesson: string, version: 1 | 2, eligible = true, encounter: "charger" | "breath" | "mixed" = "charger"): void {
    this.failures.select(version === 2 && eligible ? `${lesson}:${encounter === "mixed" ? "mixed" : "charger"}` : "");
    // The corpus can arrive mid-lesson, so its arrival is part of the selection: the coach looks again then.
    const selection = `${lesson}:${String(version)}:${String(eligible)}:${String(eligible && this.corpusArrived())}`;
    if (selection === this.selection) return;
    const corpus = eligible ? this.corpus() : undefined;
    const next = corpus ? tutorialGoldReference(corpus, lesson as TutorialGoldLessonId, version) : undefined;
    if (next?.contentHash === this.reference?.contentHash) {
      this.selection = selection;
      return;
    }
    const pending = this.pending;
    this.clear(true);
    this.selection = selection;
    this.reference = next;
    if (next) {
      [this.from, this.to] = this.segment();
      this.cursor = this.from;
      if (pending?.reference === next.contentHash && pending.to <= next.durationTicks) {
        this.failures.restore(pending.failures);
        this.apply(pending);
      }
    }
  }
  clear(preserveFailures = false): void {
    this.mode = "preview";
    this.selection = "";
    this.reference = undefined;
    this.visible = false;
    this.current = undefined;
    this.best = undefined;
    this.previous = undefined;
    this.completed = false;
    this.commands = [];
    this.cursor = 0;
    this.from = 0;
    this.to = 0;
    this.diagnosis = "No attempt yet.";
    this.pending = undefined;
    if (preserveFailures) this.failures.abort();
    else this.failures.restore();
  }
  restart(): void {
    this.failures.abort();
    this.current = undefined;
    this.previous = undefined;
    this.completed = false;
    this.visible = false;
    this.commands = [];
  }
  abortFailures(): void {
    this.failures.abort();
  }
  observeFact(fact: TutorialAttemptFact): void {
    this.failures.fact(fact);
  }
  captureCommands(commands: readonly GameAction[]): void {
    this.commands = commands;
  }
  private segment(): readonly [number, number] {
    const ref = this.reference;
    if (!ref) return [0, 0];
    if (["field-test", "move", "jump", "dash", "cut", "read-the-charge"].includes(ref.lessonId))
      return [0, ref.durationTicks];
    const objective = lastWhere(ref.landmarks, (entry) => entry.kind === "objective")?.tick ?? ref.durationTicks;
    const contacts = ref.landmarks.filter((entry) => entry.kind === "contact" && entry.tick <= objective);
    const event =
      contacts.at(-1)?.tick ??
      lastWhere(ref.landmarks, (entry) => ["dash", "takeoff"].includes(entry.kind))?.tick ??
      objective;
    const takeoff = lastWhere(ref.landmarks, (entry) => entry.kind === "takeoff" && entry.tick <= event);
    const input = lastWhere(
      ref.inputs,
      (entry) => entry.tick < (takeoff?.tick ?? event) && entry.commands.some((action) => action.type !== "aim"),
    );
    const deflection = lastWhere(
      ref.facts,
      (entry) => entry.tick <= objective && entry.fact.kind === "projectile" && entry.fact.event === "deflected",
    );
    const spawn =
      deflection &&
      lastWhere(
        ref.facts,
        (entry) =>
          entry.tick <= deflection.tick &&
          entry.fact.kind === "projectile" &&
          entry.fact.event === "spawned" &&
          entry.fact.projectileId === deflection.fact.projectileId,
      );
    const launch = lastWhere(
      ref.facts,
      (entry) =>
        entry.tick <= event &&
        entry.fact.kind === "effect" &&
        ["launch", "updraft"].includes(String(entry.fact.effect)),
    );
    const thrown = lastWhere(
      ref.inputs,
      (entry) =>
        entry.tick <= event && entry.commands.some((action) => action.type === "weapon" && action.phase === "pressed"),
    );
    const context =
      ref.lessonId === "parry"
        ? spawn?.tick
        : ref.lessonId === "juggle"
          ? launch?.tick
          : ref.lessonId === "throw"
            ? thrown?.tick
            : takeoff?.tick;
    const from = Math.max(0, (context ?? input?.tick ?? event) - 30);
    const landing = ref.landmarks.find((entry) => entry.kind === "landing" && entry.tick > event)?.tick;
    return [Math.min(from, event), Math.min(ref.durationTicks, Math.max(objective, landing ?? event + 60))];
  }
  play(mode: TutorialCoachView["mode"]): boolean {
    if (!this.reference || (mode === "comparison" && !this.best)) return false;
    this.mode = mode;
    [this.from, this.to] = this.segment();
    this.cursor = this.from;
    this.visible = true;
    return true;
  }
  setRate(rate: 1 | 0.5): void {
    this.rate = rate;
  }
  observe(
    frame: TutorialGoldFrame,
    input: AuthoritativeInputSnapshot,
    valid: boolean,
    recording = true,
    progress = 0,
    adaptive = false,
  ): void {
    if (!this.reference) {
      this.commands = [];
      return;
    }
    this.failures.select(
      adaptive ? `${this.reference.lessonId}:${frame.encounter === "mixed" ? "mixed" : "charger"}` : "",
    );
    const demonstrate = this.failures.observe(frame, this.commands, progress, adaptive && recording, valid);
    const before = this.previous;
    const explicit =
      input.moveX !== 0 ||
      input.moveY !== 0 ||
      this.commands.some(
        (action) =>
          action.type === "dash" ||
          (action.type === "jump" && action.phase === "pressed") ||
          (action.type === "weapon" && action.phase === "pressed"),
      );
    const swing =
      (before ? frame.blade.swingId !== before.blade.swingId : frame.blade.tipSpeed >= this.minimumHitSpeed) &&
      this.commands.some((action) => action.type === "aim");
    const meaningful = explicit || swing;
    if (meaningful) this.visible = false;
    else if (this.visible) {
      this.cursor = Math.min(this.to, this.cursor + this.rate);
      if (this.cursor >= this.to) this.visible = false;
    }
    if (recording && !this.current && !this.completed && meaningful) {
      this.current = { duration: 0, poses: [], contact: false, groundedContact: false };
      this.origin = frame.tick;
    }
    if (this.current && !this.completed) {
      const attempt = this.current,
        tick = frame.tick - this.origin;
      if (tick > 20000) {
        this.current = undefined;
        this.completed = true;
        this.diagnosis = "That attempt was too long to compare.";
      } else {
        attempt.duration = tick;
        const contact = before !== undefined && tutorialGoldContactEdges(before, frame).length > 0;
        attempt.contact ||= contact;
        attempt.groundedContact ||= contact && frame.body.grounded;
        const marker = contact
          ? "contact"
          : before?.body.grounded && !frame.body.grounded
            ? "takeoff"
            : before && !before.body.grounded && frame.body.grounded
              ? "landing"
              : frame.body.dashing && !before?.body.dashing
                ? "dash"
                : before && !frame.body.grounded && before.body.vy < 0 && frame.body.vy >= 0
                  ? "apex"
                  : "pose";
        if (tick % 4 === 0 || marker !== "pose" || valid) {
          if (attempt.poses.at(-1)?.[0] !== tick)
            attempt.poses.push([tick, frame.body.x, frame.body.y, frame.blade.tipX, frame.blade.tipY, marker]);
          if (attempt.poses.length > MAX_POSES)
            attempt.poses = attempt.poses.filter((pose, index) => pose[5] !== "pose" || index % 2 === 0);
          if (attempt.poses.length > MAX_POSES) {
            this.current = undefined;
            this.completed = true;
          }
        }
        if (valid && this.current) {
          if (!this.best || tick <= this.best.duration) this.best = structuredClone(attempt);
          this.current = undefined;
          this.completed = true;
          this.diagnosis = "Done. Try it again any time.";
        } else if (contact)
          this.diagnosis =
            attempt.groundedContact && ["updraft", "slam", "power-slam"].includes(this.reference.lessonId)
              ? "That hit was on the ground. Try it in the air."
              : "Hit, but not the move this lesson needs.";
        else
          this.diagnosis = ["move", "jump", "dash"].includes(this.reference.lessonId)
            ? "Not done yet."
            : frame.blade.state !== "held"
              ? "Your blade is away. Recall it first."
              : "Missed. Get closer and swing through the target.";
      }
    }
    if (demonstrate) this.play("diagnostic");
    this.previous = frame;
    this.commands = [];
  }
  /** Whether a demonstration is on screen (`view().visible`). */
  get showing(): boolean {
    return this.visible;
  }
  view(practice: boolean, reducedMotion: boolean): TutorialCoachView {
    return {
      available: !!this.reference,
      visible: this.visible,
      mode: this.mode,
      rate: this.rate,
      diagnosis: this.diagnosis,
      adaptive: this.failures.view(),
      canCompare: practice && !!this.best,
      reducedMotion,
      tick: Math.floor(this.cursor),
      fromTick: this.from,
      toTick: this.to,
    };
  }
  display(practice: boolean, reducedMotion: boolean): TutorialGoldDisplay | undefined {
    const ref = this.reference;
    if (!ref || !this.visible) return undefined;
    const { frame, tick } = sampleTutorialGold(ref, this.cursor / 120);
    const held = {
      moveX: ref.initialInput.moveX,
      moveY: ref.initialInput.moveY,
      primary: ref.initialInput.primaryHeld,
    };
    const glyphs = new Set<string>();
    for (const entry of ref.inputs) {
      if (entry.tick > tick) break;
      for (const action of entry.commands) {
        if (action.type === "move") {
          held.moveX = action.x;
          held.moveY = action.y;
        }
        if (action.type === "weapon" && action.intent === "primary") held.primary = action.phase === "pressed";
        // Tick-anchored 100ms display pulses survive a 60Hz render without inventing input duration.
        const pulse = entry.tick <= tick && tick < entry.tick + 12;
        if (pulse && action.type === "jump" && action.phase === "pressed") glyphs.add("jump");
        if (pulse && action.type === "dash") glyphs.add("dash");
        if (pulse && action.type === "weapon" && action.intent !== "primary" && action.phase === "pressed")
          glyphs.add("throw");
        if (pulse && action.type === "aim") glyphs.add("aim");
      }
    }
    if (held.moveX) glyphs.add(held.moveX < 0 ? "left" : "right");
    if (held.moveY) glyphs.add(held.moveY < 0 ? "up" : "down");
    if (held.primary) glyphs.add("primary");
    const stage = lastWhere(ref.stages, (entry) => entry.tick <= tick);
    const path = ref.frames.filter((pose) => pose.tick >= this.from && pose.tick <= this.to);
    const markers: { kind: string; frame: TutorialGoldFrame }[] = [];
    for (const kind of ["takeoff", "dash", "contact", "landing"] as const) {
      const event =
        kind === "contact"
          ? lastWhere(ref.landmarks, (entry) => entry.kind === kind && entry.tick >= this.from && entry.tick <= this.to)
          : ref.landmarks.find((entry) => entry.kind === kind && entry.tick >= this.from && entry.tick <= this.to);
      const pose = event && path.find((entry) => entry.tick >= event.tick);
      if (pose) markers.push({ kind, frame: pose });
    }
    const apex = path.find((pose, index) => {
      const previous = path[index - 1];
      return previous && !pose.body.grounded && previous.body.vy < 0 && pose.body.vy >= 0;
    });
    if (apex) markers.push({ kind: "apex", frame: apex });
    return {
      ...this.view(practice, reducedMotion),
      frame,
      platforms: stage?.platforms ?? ref.platforms,
      glyphs: [...glyphs],
      contacts: ref.frames.flatMap((after, index) => {
        const before = ref.frames[index - 1];
        return before && after.tick <= tick && tick < after.tick + 12 ? tutorialGoldContactEdges(before, after) : [];
      }),
      landmarks: ref.landmarks.filter((entry) => entry.tick >= this.from && entry.tick <= this.to),
      personal: this.mode === "comparison" ? (this.best?.poses ?? []) : [],
      path: path.filter((_, index) => index % Math.max(1, Math.ceil(path.length / 128)) === 0),
      markers,
      trail: ref.frames.filter((pose) => pose.tick <= tick && pose.tick >= tick - 16).slice(-12),
    };
  }
  capture(): TutorialCoachCheckpoint | undefined {
    if (!this.reference) return this.pending && structuredClone(this.pending);
    return {
      version: 2,
      failures: this.failures.capture(),
      reference: this.reference.contentHash,
      mode: this.mode,
      rate: this.rate,
      cursor: this.cursor,
      from: this.from,
      to: this.to,
      visible: this.visible,
      diagnosis: this.diagnosis,
      ...(this.best ? { best: structuredClone(this.best) } : {}),
    };
  }
  restore(value: unknown): void {
    const saved = parseTutorialCoachCheckpoint(value);
    this.restart();
    this.best = undefined;
    this.completed = true; // A partially restored objective is not a new full attempt; explicit reset starts recording again.
    this.pending = undefined;
    this.failures.restore(saved?.failures);
    if (!saved) return;
    // A world restored before the corpus arrives (State Setup, a staged replay) keeps its coach state
    // until it does; capture() returns it unchanged meanwhile.
    if (this.reference === undefined && !this.corpusArrived()) {
      this.pending = structuredClone(saved);
      return;
    }
    if (saved.reference !== this.reference?.contentHash || saved.to > this.reference.durationTicks)
      throw new RangeError("Gold coach reference incompatible");
    this.apply(saved);
  }
  private apply(saved: TutorialCoachCheckpoint): void {
    this.mode = saved.mode;
    this.rate = saved.rate;
    this.cursor = saved.cursor;
    this.from = saved.from;
    this.to = saved.to;
    this.visible = saved.visible;
    this.diagnosis = saved.diagnosis;
    // A restored world is a new recording boundary; never resume an unfinished capture against a different absolute clock.
    this.current = undefined;
    this.best = saved.best;
  }
}
