import { TutorialFailureCoach, parseTutorialFailures, type TutorialAttemptFact, type TutorialFailureCheckpoint, type TutorialFailureView } from "./tutorial-failure-coach";
import shipping from "./tutorial-gold-reference-data.json";
import { loadTutorialGoldCorpus, sampleTutorialGold, tutorialGoldContactEdges, tutorialGoldReference, type TutorialGoldCorpus, type TutorialGoldFrame, type TutorialGoldLessonId, type TutorialGoldReference } from "./tutorial-gold-reference";
import type { GameAction } from "../../input/game-action";
import type { AuthoritativeInputSnapshot } from "../runtime/authoritative-input";

declare const __TEAR_TUTORIAL_GOLD_COMPATIBILITY__: string;
let cached: TutorialGoldCorpus | null | undefined;
export function shippingTutorialGold(): TutorialGoldCorpus | undefined {
  if (cached === undefined) {
    const expected = typeof __TEAR_TUTORIAL_GOLD_COMPATIBILITY__ === "undefined" ? shipping.compatibility.sourceHash : __TEAR_TUTORIAL_GOLD_COMPATIBILITY__;
    const loaded = loadTutorialGoldCorpus(shipping, expected); cached = loaded.status === "ready" ? loaded.corpus : null;
  }
  return cached ?? undefined;
}
export interface TutorialCoachView {
  readonly available: boolean; readonly visible: boolean; readonly mode: "preview" | "diagnostic" | "comparison";
  readonly rate: 1 | .5; readonly diagnosis: string; readonly canCompare: boolean; readonly reducedMotion: boolean;
  readonly adaptive?: TutorialFailureView;
  readonly tick: number; readonly fromTick: number; readonly toTick: number;
}
type Pose = readonly [tick: number, x: number, y: number, tipX: number, tipY: number, marker: string];
type Attempt = Pick<{ duration: number; poses: Pose[]; contact: boolean; groundedContact: boolean }, "duration" | "poses" | "contact" | "groundedContact">;
export type TutorialCoachCheckpoint = Readonly<{
  readonly version: 1 | 2; readonly failures?: TutorialFailureCheckpoint; readonly reference: string; readonly mode: TutorialCoachView["mode"]; readonly rate: 1 | .5;
  readonly cursor: number; readonly from: number; readonly to: number; readonly visible: boolean; readonly diagnosis: string;
  readonly current?: Attempt; readonly best?: Attempt;
}>;
export interface TutorialGoldDisplay extends TutorialCoachView {
  readonly frame: TutorialGoldFrame; readonly platforms: TutorialGoldReference["platforms"];
  readonly glyphs: readonly string[]; readonly contacts: readonly string[]; readonly landmarks: TutorialGoldReference["landmarks"];
  readonly personal: readonly Pose[];
  readonly path: readonly TutorialGoldFrame[]; readonly markers: readonly Readonly<{ kind: string; frame: TutorialGoldFrame }>[];
  readonly trail: readonly TutorialGoldFrame[];
}
const MAX_POSES = 128, MAX_PRESENTATION_BYTES = 24000;
function lastWhere<T>(items: readonly T[], predicate: (item: T) => boolean): T | undefined { for (let index = items.length - 1; index >= 0; index--) { const item = items[index]; if (item !== undefined && predicate(item)) return item; } return undefined; }
const fields = ["version", "reference", "mode", "rate", "cursor", "from", "to", "visible", "diagnosis", "current", "best", "failures"];
export function parseTutorialCoachCheckpoint(value: unknown): TutorialCoachCheckpoint | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid gold coach presentation");
  const data = value as TutorialCoachCheckpoint;
  const version: unknown = Reflect.get(value, "version");
  if (Object.keys(data).some((key) => !fields.includes(key)) || (version !== 1 && version !== 2) || !/^[a-f0-9]{16}$/.test(data.reference)
    || !["preview", "diagnostic", "comparison"].includes(data.mode) || ![1, .5].includes(data.rate)
    || ![data.cursor, data.from, data.to].every((n) => Number.isFinite(n) && n >= 0 && n <= 20000)
    || data.from > data.to || data.cursor < data.from || data.cursor > data.to || typeof data.visible !== "boolean"
    || typeof data.diagnosis !== "string" || data.diagnosis.length > 120 || JSON.stringify(data).length > MAX_PRESENTATION_BYTES) throw new TypeError("Invalid gold coach cursor");
  if (version === 2) parseTutorialFailures(data.failures); else if (data.failures !== undefined) throw new TypeError("Historical coach cannot contain adaptive failures");
  if (data.mode === "comparison" && data.best === undefined || !shippingTutorialGold()?.references.some((reference) => reference.contentHash === data.reference && data.to <= reference.durationTicks)) throw new RangeError("Gold coach reference incompatible");
  for (const raw of [data.current, data.best] as readonly unknown[]) if (raw !== undefined) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new TypeError("Invalid personal attempt");
    const attempt = raw as Attempt;
    if (Object.keys(attempt).some((key) => !["duration", "poses", "contact", "groundedContact"].includes(key))
      || !Number.isSafeInteger(attempt.duration) || attempt.duration < 0 || attempt.duration > 20000 || !Array.isArray(attempt.poses)
      || attempt.poses.length > MAX_POSES || typeof attempt.contact !== "boolean" || typeof attempt.groundedContact !== "boolean") throw new TypeError("Invalid personal attempt");
    let previous = -1;
    for (const rawPose of attempt.poses as readonly unknown[]) {
      if (!Array.isArray(rawPose) || rawPose.length !== 6) throw new TypeError("Invalid personal pose");
      const pose = rawPose as unknown as Pose;
      if (!pose.slice(0, 5).every((n) => typeof n === "number" && Number.isFinite(n))
        || !Number.isSafeInteger(pose[0]) || pose[0] <= previous || pose[0] > attempt.duration || !["pose", "takeoff", "landing", "dash", "contact", "apex"].includes(pose[5])) throw new TypeError("Invalid personal pose");
      previous = pose[0];
    }
  }
  return structuredClone(data);
}

/** Presentation and observed-attempt evidence only. Never emits gameplay input or objective marks. */
export class TutorialGhostCoach {
  private reference: TutorialGoldReference | undefined;
  private selection = "";
  private mode: TutorialCoachView["mode"] = "preview";
  private rate: 1 | .5 = 1;
  private cursor = 0; private from = 0; private to = 0; private visible = false;
  private diagnosis = "No recorded attempt yet. Cause unknown.";
  private current: Attempt | undefined; private best: Attempt | undefined;
  private previous: TutorialGoldFrame | undefined; private origin = 0; private completed = false;
  private commands: readonly GameAction[] = [];
  private readonly failures: TutorialFailureCoach;
  constructor(private readonly corpus: () => TutorialGoldCorpus | undefined = shippingTutorialGold, private readonly minimumHitSpeed = Number.POSITIVE_INFINITY) { this.failures = new TutorialFailureCoach(minimumHitSpeed); }
  select(lesson: string, version: 1 | 2, eligible = true, encounter: "charger" | "breath" | "mixed" = "charger"): void {
    this.failures.select(version === 2 && eligible ? `${lesson}:${encounter === "mixed" ? "mixed" : "charger"}` : "");
    const selection = `${lesson}:${String(version)}:${String(eligible)}`;
    if (selection === this.selection) return;
    const corpus = eligible ? this.corpus() : undefined;
    const next = corpus ? tutorialGoldReference(corpus, lesson as TutorialGoldLessonId, version) : undefined;
    if (next?.contentHash === this.reference?.contentHash) { this.selection = selection; return; }
    this.clear(true); this.selection = selection; this.reference = next; if (next) { [this.from, this.to] = this.segment(); this.cursor = this.from; }
  }
  clear(preserveFailures = false): void { this.selection = ""; this.reference = undefined; this.visible = false; this.current = undefined; this.best = undefined; this.previous = undefined; this.completed = false; this.commands = []; this.cursor = 0; this.from = 0; this.to = 0; this.diagnosis = "No recorded attempt yet. Cause unknown."; if (preserveFailures) this.failures.abort(); else this.failures.restore(); }
  restart(): void { this.failures.abort(); this.current = undefined; this.previous = undefined; this.completed = false; this.visible = false; this.commands = []; }
  abortFailures(): void { this.failures.abort(); }
  observeFact(fact: TutorialAttemptFact): void { this.failures.fact(fact); }
  captureCommands(commands: readonly GameAction[]): void { this.commands = commands; }
  private segment(): readonly [number, number] {
    const ref = this.reference; if (!ref) return [0, 0];
    if (["field-test", "move", "jump", "dash", "cut", "read-the-charge"].includes(ref.lessonId)) return [0, ref.durationTicks];
    const objective = lastWhere(ref.landmarks, (entry) => entry.kind === "objective")?.tick ?? ref.durationTicks;
    const contacts = ref.landmarks.filter((entry) => entry.kind === "contact" && entry.tick <= objective);
    const event = contacts.at(-1)?.tick ?? lastWhere(ref.landmarks, (entry) => ["dash", "takeoff"].includes(entry.kind))?.tick ?? objective;
    const takeoff = lastWhere(ref.landmarks, (entry) => entry.kind === "takeoff" && entry.tick <= event);
    const input = lastWhere(ref.inputs, (entry) => entry.tick < (takeoff?.tick ?? event) && entry.commands.some((action) => action.type !== "aim"));
    const deflection = lastWhere(ref.facts, (entry) => entry.tick <= objective && entry.fact.kind === "projectile" && entry.fact.event === "deflected");
    const spawn = deflection && lastWhere(ref.facts, (entry) => entry.tick <= deflection.tick && entry.fact.kind === "projectile" && entry.fact.event === "spawned" && entry.fact.projectileId === deflection.fact.projectileId);
    const launch = lastWhere(ref.facts, (entry) => entry.tick <= event && entry.fact.kind === "effect" && ["launch", "updraft"].includes(String(entry.fact.effect)));
    const thrown = lastWhere(ref.inputs, (entry) => entry.tick <= event && entry.commands.some((action) => action.type === "weapon" && action.phase === "pressed"));
    const context = ref.lessonId === "parry" ? spawn?.tick : ref.lessonId === "juggle" ? launch?.tick : ref.lessonId === "throw" ? thrown?.tick : takeoff?.tick;
    const from = Math.max(0, (context ?? input?.tick ?? event) - 30);
    const landing = ref.landmarks.find((entry) => entry.kind === "landing" && entry.tick > event)?.tick;
    return [Math.min(from, event), Math.min(ref.durationTicks, Math.max(objective, landing ?? event + 60))];
  }
  play(mode: TutorialCoachView["mode"]): boolean {
    if (!this.reference || mode === "comparison" && !this.best) return false;
    this.mode = mode; [this.from, this.to] = this.segment(); this.cursor = this.from; this.visible = true; return true;
  }
  setRate(rate: 1 | .5): void { this.rate = rate; }
  observe(frame: TutorialGoldFrame, input: AuthoritativeInputSnapshot, valid: boolean, recording = true, progress = 0, adaptive = false): void {
    if (!this.reference) { this.commands = []; return; }
    this.failures.select(adaptive ? `${this.reference.lessonId}:${frame.encounter === "mixed" ? "mixed" : "charger"}` : "");
    const demonstrate = this.failures.observe(frame, this.commands, progress, adaptive && recording, valid);
    const before = this.previous;
    const explicit = input.moveX !== 0 || input.moveY !== 0 || this.commands.some((action) =>
      action.type === "dash" || action.type === "jump" && action.phase === "pressed" || action.type === "weapon" && action.phase === "pressed");
    const swing = (before ? frame.blade.swingId !== before.blade.swingId : frame.blade.tipSpeed >= this.minimumHitSpeed) && this.commands.some((action) => action.type === "aim");
    const meaningful = explicit || swing;
    if (meaningful) this.visible = false;
    else if (this.visible) { this.cursor = Math.min(this.to, this.cursor + this.rate); if (this.cursor >= this.to) this.visible = false; }
    if (recording && !this.current && !this.completed && meaningful) { this.current = { duration: 0, poses: [], contact: false, groundedContact: false }; this.origin = frame.tick; }
    if (this.current && !this.completed) {
      const attempt = this.current, tick = frame.tick - this.origin;
      if (tick > 20000) { this.current = undefined; this.completed = true; this.diagnosis = "Attempt exceeds local comparison retention. Cause unknown."; }
      else {
        attempt.duration = tick;
        const contact = before !== undefined && tutorialGoldContactEdges(before, frame).length > 0;
        attempt.contact ||= contact; attempt.groundedContact ||= contact && frame.body.grounded;
        const marker = contact ? "contact" : before?.body.grounded && !frame.body.grounded ? "takeoff" : before && !before.body.grounded && frame.body.grounded ? "landing" : frame.body.dashing && !before?.body.dashing ? "dash" : before && !frame.body.grounded && before.body.vy < 0 && frame.body.vy >= 0 ? "apex" : "pose";
        if (tick % 4 === 0 || marker !== "pose" || valid) {
          if (attempt.poses.at(-1)?.[0] !== tick) attempt.poses.push([tick, frame.body.x, frame.body.y, frame.blade.tipX, frame.blade.tipY, marker]);
          if (attempt.poses.length > MAX_POSES) attempt.poses = attempt.poses.filter((pose, index) => pose[5] !== "pose" || index % 2 === 0);
          if (attempt.poses.length > MAX_POSES) { this.current = undefined; this.completed = true; }
        }
        if (valid && this.current) { if (!this.best || tick <= this.best.duration) this.best = structuredClone(attempt); this.current = undefined; this.completed = true; this.diagnosis = "Valid objective recorded. Personal timing is not a mastery grade."; }
        else if (contact) this.diagnosis = attempt.groundedContact && ["updraft", "slam", "power-slam"].includes(this.reference.lessonId) ? "Grounded contact recorded. Cause of incomplete objective unknown." : "Contact recorded; objective incomplete. Cause unknown.";
        else this.diagnosis = frame.blade.state !== "held" ? "Blade is away. Cause of incomplete objective unknown." : "No accepted contact recorded. Cause unknown.";
      }
    }
    if (demonstrate) this.play("diagnostic");
    this.previous = frame; this.commands = [];
  }
  view(lab: boolean, reducedMotion: boolean): TutorialCoachView {
    return { available: !!this.reference, visible: this.visible, mode: this.mode, rate: this.rate, diagnosis: this.diagnosis,
      adaptive: this.failures.view(), canCompare: lab && !!this.best, reducedMotion, tick: Math.floor(this.cursor), fromTick: this.from, toTick: this.to };
  }
  display(lab: boolean, reducedMotion: boolean): TutorialGoldDisplay | undefined {
    const ref = this.reference; if (!ref || !this.visible) return undefined;
    const { frame, tick } = sampleTutorialGold(ref, this.cursor / 120);
    const held = { moveX: ref.initialInput.moveX, moveY: ref.initialInput.moveY, primary: ref.initialInput.primaryHeld };
    const glyphs = new Set<string>();
    for (const entry of ref.inputs) {
      if (entry.tick > tick) break;
      for (const action of entry.commands) {
        if (action.type === "move") { held.moveX = action.x; held.moveY = action.y; }
        if (action.type === "weapon" && action.intent === "primary") held.primary = action.phase === "pressed";
        // Tick-anchored 100ms display pulses survive a 60Hz render without inventing input duration.
        const pulse = entry.tick <= tick && tick < entry.tick + 12;
        if (pulse && action.type === "jump" && action.phase === "pressed") glyphs.add("jump");
        if (pulse && action.type === "dash") glyphs.add("dash");
        if (pulse && action.type === "weapon" && action.intent !== "primary" && action.phase === "pressed") glyphs.add("throw");
        if (pulse && action.type === "aim") glyphs.add("aim");
      }
    }
    if (held.moveX) glyphs.add(held.moveX < 0 ? "left" : "right"); if (held.moveY) glyphs.add(held.moveY < 0 ? "up" : "down"); if (held.primary) glyphs.add("primary");
    const stage = lastWhere(ref.stages, (entry) => entry.tick <= tick);
    const path = ref.frames.filter((pose) => pose.tick >= this.from && pose.tick <= this.to);
    const markers: { kind: string; frame: TutorialGoldFrame }[] = [];
    for (const kind of ["takeoff", "dash", "contact", "landing"] as const) {
      const event = kind === "contact" ? lastWhere(ref.landmarks, (entry) => entry.kind === kind && entry.tick >= this.from && entry.tick <= this.to) : ref.landmarks.find((entry) => entry.kind === kind && entry.tick >= this.from && entry.tick <= this.to);
      const pose = event && path.find((entry) => entry.tick >= event.tick); if (pose) markers.push({ kind, frame: pose });
    }
    const apex = path.find((pose, index) => { const previous = path[index - 1]; return previous && !pose.body.grounded && previous.body.vy < 0 && pose.body.vy >= 0; });
    if (apex) markers.push({ kind: "apex", frame: apex });
    return { ...this.view(lab, reducedMotion), frame, platforms: stage?.platforms ?? ref.platforms, glyphs: [...glyphs],
      contacts: ref.frames.flatMap((after, index) => { const before = ref.frames[index - 1]; return before && after.tick <= tick && tick < after.tick + 12 ? tutorialGoldContactEdges(before, after) : []; }),
      landmarks: ref.landmarks.filter((entry) => entry.tick >= this.from && entry.tick <= this.to), personal: this.mode === "comparison" ? this.best?.poses ?? [] : [],
      path: path.filter((_, index) => index % Math.max(1, Math.ceil(path.length / 128)) === 0), markers,
      trail: ref.frames.filter((pose) => pose.tick <= tick && pose.tick >= tick - 16).slice(-12) };
  }
  capture(): TutorialCoachCheckpoint | undefined { return this.reference ? { version: 2, failures: this.failures.capture(), reference: this.reference.contentHash, mode: this.mode, rate: this.rate,
    cursor: this.cursor, from: this.from, to: this.to, visible: this.visible, diagnosis: this.diagnosis,
    ...(this.best ? { best: structuredClone(this.best) } : {}) } : undefined; }
  restore(value: unknown): void {
    const saved = parseTutorialCoachCheckpoint(value); this.restart(); this.best = undefined;
    this.completed = true; // A partially restored objective is not a new full attempt; explicit reset starts recording again.
    this.failures.restore(saved?.failures);
    if (!saved) return;
    if (saved.reference !== this.reference?.contentHash || saved.to > this.reference.durationTicks) throw new RangeError("Gold coach reference incompatible");
    this.mode = saved.mode; this.rate = saved.rate; this.cursor = saved.cursor; this.from = saved.from; this.to = saved.to; this.visible = saved.visible; this.diagnosis = saved.diagnosis;
    // A restored world is a new recording boundary; never resume an unfinished capture against a different absolute clock.
    this.current = undefined; this.best = saved.best;
  }
}
