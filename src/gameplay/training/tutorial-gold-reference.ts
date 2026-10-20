import type { AuthoritativeInputSnapshot } from "../runtime/authoritative-input";
import type { GameAction } from "../../input/game-action";
import { stableVerificationHash } from "../../replay/hash";

export const TUTORIAL_GOLD_LESSONS = ["move", "jump", "dash", "cut", "launch", "juggle", "slam", "power-slam", "updraft", "throw", "parry", "read-the-charge", "field-test"] as const;
export type TutorialGoldLessonId = typeof TUTORIAL_GOLD_LESSONS[number];
export interface TutorialGoldCompatibility {
  readonly sourceHash: string; readonly curriculumVersion: 2; readonly simulationHz: 120;
  readonly weaponId: "sword"; readonly difficulty: "normal";
  readonly configurationHash: string; readonly definitionHash: string;
}
export interface TutorialGoldBody { readonly x: number; readonly y: number; readonly vx: number; readonly vy: number; readonly facing: number; readonly grounded: boolean; readonly dashing: boolean }
export interface TutorialGoldBlade { readonly x: number; readonly y: number; readonly tipX: number; readonly tipY: number;
  readonly tipVX: number; readonly tipVY: number; readonly tipSpeed: number; readonly angle: number; readonly state: string; readonly swingId: number; readonly throwId: number }
export interface TutorialGoldActor { readonly id: string; readonly kind: string; readonly x: number; readonly y: number;
  readonly vx: number; readonly vy: number; readonly hp: number; readonly dead: boolean; readonly state: string }
export interface TutorialGoldShot { readonly id: string; readonly x: number; readonly y: number; readonly vx: number; readonly vy: number;
  readonly radius: number; readonly deflected: boolean; readonly dead: boolean; readonly family: string }
export interface TutorialGoldFrame {
  readonly tick: number; readonly stage: number; readonly body: TutorialGoldBody; readonly blade: TutorialGoldBlade;
  readonly actors: readonly TutorialGoldActor[]; readonly projectiles: readonly TutorialGoldShot[];
  readonly encounter: "charger" | "breath" | "mixed";
}
export interface TutorialGoldFact { readonly tick: number; readonly fact: Readonly<Record<string, string | number | boolean | null>> }
export interface TutorialGoldReference {
  readonly lessonId: TutorialGoldLessonId; readonly encounterVersion: 1 | 2; readonly curriculumVersion: 1 | 2;
  readonly arenaId: string; readonly arenaHash: string; readonly platforms: readonly Readonly<{ x: number; y: number; w: number; h: number; floor: boolean; oneway: boolean }>[];
  readonly stages: readonly Readonly<{ tick: number; platforms: TutorialGoldReference["platforms"] }>[];
  readonly originTick: number; readonly durationTicks: number; readonly initialInput: AuthoritativeInputSnapshot;
  readonly frames: readonly TutorialGoldFrame[];
  readonly inputs: readonly Readonly<{ tick: number; commands: readonly GameAction[] }>[];
  readonly facts: readonly TutorialGoldFact[];
  readonly landmarks: readonly Readonly<{ tick: number; kind: "takeoff" | "landing" | "dash" | "contact" | "objective" | "encounter" }>[];
  readonly finalCounters: Readonly<Record<string, number>>;
  readonly proofHash: string; readonly contentHash: string;
}
export interface TutorialGoldCorpus {
  readonly format: "tear-tutorial-gold.v1"; readonly schemaVersion: 1;
  readonly compatibility: TutorialGoldCompatibility;
  readonly references: readonly TutorialGoldReference[]; readonly contentHash: string;
}
export const TUTORIAL_GOLD_MAX_TICKS = 20000;
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
/** Shipping data is detached, finite JSON; physics execution remains in the production generator/verifier. */
export function loadTutorialGoldCorpus(value: unknown, expectedSourceHash: string):
  Readonly<{ status: "ready"; corpus: TutorialGoldCorpus }> | Readonly<{ status: "unavailable"; reason: "incompatible" | "invalid" }> {
  try {
    const header = value as Partial<Record<"format" | "schemaVersion" | "references" | "compatibility", unknown>> | null;
    const compatibility = header?.compatibility as Partial<Record<keyof TutorialGoldCompatibility, unknown>> | undefined;
    if (header?.format !== "tear-tutorial-gold.v1" || header.schemaVersion !== 1 || !Array.isArray(header.references)
      || header.references.length !== 14 || compatibility?.simulationHz !== 120 || compatibility.curriculumVersion !== 2
      || compatibility.weaponId !== "sword" || compatibility.difficulty !== "normal") throw new Error("Invalid gold corpus");
    const corpus = value as TutorialGoldCorpus;
    if (!/^[a-f0-9]{64}$/.test(expectedSourceHash) || corpus.compatibility.sourceHash !== expectedSourceHash) return { status: "unavailable", reason: "incompatible" };
    const ids = new Set<string>();
    for (const reference of corpus.references) {
      const encounterVersion: unknown = Reflect.get(reference, "encounterVersion");
      const key = `${reference.lessonId}:${String(reference.encounterVersion)}`;
      if (ids.has(key) || !TUTORIAL_GOLD_LESSONS.includes(reference.lessonId) || (encounterVersion !== 2 && !(reference.lessonId === "field-test" && encounterVersion === 1))
        || !Number.isSafeInteger(reference.durationTicks) || reference.durationTicks < 1 || reference.durationTicks > TUTORIAL_GOLD_MAX_TICKS
        || reference.frames.length < 2 || reference.frames.length > TUTORIAL_GOLD_MAX_TICKS + 1 || reference.inputs.length > TUTORIAL_GOLD_MAX_TICKS
        || reference.facts.length > TUTORIAL_GOLD_MAX_TICKS * 20 || reference.platforms.length > 128) throw new Error("Invalid gold reference bounds");
      ids.add(key);
      let previous = -1;
      for (const frame of reference.frames) {
        if (!Number.isSafeInteger(frame.tick) || frame.tick <= previous || frame.tick > reference.durationTicks || frame.actors.length > 64 || frame.projectiles.length > 512) throw new Error("Invalid gold frame");
        previous = frame.tick;
      }
      const { contentHash, ...content } = reference;
      if (stableVerificationHash(content) !== contentHash) throw new Error("Gold reference hash mismatch");
    }
    if (TUTORIAL_GOLD_LESSONS.some((id) => !ids.has(`${id}:2`)) || !ids.has("field-test:1")) throw new Error("Missing required gold reference");
    const { contentHash, ...content } = corpus;
    if (stableVerificationHash(content) !== contentHash) throw new Error("Gold corpus hash mismatch");
    return { status: "ready", corpus: freeze(JSON.parse(JSON.stringify(corpus)) as TutorialGoldCorpus) };
  } catch { return { status: "unavailable", reason: "invalid" }; }
}
export function tutorialGoldReference(corpus: TutorialGoldCorpus, lessonId: TutorialGoldLessonId, encounterVersion: 1 | 2): TutorialGoldReference | undefined {
  return corpus.references.find((reference) => reference.lessonId === lessonId && reference.encounterVersion === (lessonId === "field-test" ? encounterVersion : 2));
}
/** Discrete recorded poses only. 0.5x changes the display cursor, never authoritative time. */
export function sampleTutorialGold(reference: TutorialGoldReference, displaySeconds: number, rate: 1 | .5 = 1) {
  if (!Number.isFinite(displaySeconds) || displaySeconds < 0 || ![1, .5].includes(rate)) throw new RangeError("Invalid gold display cursor");
  const tick = Math.min(reference.durationTicks, Math.floor(displaySeconds * 120 * rate));
  let frame = reference.frames[0];
  if (frame === undefined) throw new Error("Gold reference has no initial pose");
  for (const candidate of reference.frames) { if (candidate.tick > tick) break; frame = candidate; }
  return Object.freeze({ frame, tick, finished: tick >= reference.durationTicks });
}
/** Restrict a diagnostic to genuine recorded ticks; no synthesized contact or body path. */
export function tutorialGoldSegment(reference: TutorialGoldReference, fromTick: number, toTick: number): readonly TutorialGoldFrame[] {
  if (!Number.isSafeInteger(fromTick) || !Number.isSafeInteger(toTick) || fromTick < 0 || toTick < fromTick || toTick > reference.durationTicks) throw new RangeError("Invalid gold segment");
  return Object.freeze(reference.frames.filter((frame) => frame.tick >= fromTick && frame.tick <= toTick));
}

export interface TutorialGoldFrameSource {
  readonly tick: number; readonly stage: number; readonly encounter: TutorialGoldFrame["encounter"];
  readonly player: Readonly<{ x: number; y: number; vx: number; vy: number; facing: number; onGround: boolean; dashTimer: number }>;
  readonly blade: TutorialGoldBlade;
  readonly actors: readonly Readonly<{ x: number; y: number; vx: number; vy: number; hp: number; dead: boolean; kind: string; state?: string; atk?: string }>[];
  readonly projectiles: readonly Readonly<{ x: number; y: number; vx: number; vy: number; r: number; dead: boolean; deflected: boolean; family?: string }>[];
  id(entity: object, role: "enemy" | "projectile"): string;
}
/** One real-world projector for gold and personal attempts; it never simulates or infers hits. */
export function projectTutorialGoldFrame(source: TutorialGoldFrameSource): TutorialGoldFrame {
  return freeze({ tick: source.tick, stage: source.stage, encounter: source.encounter,
    body: { x: source.player.x, y: source.player.y, vx: source.player.vx, vy: source.player.vy,
      facing: source.player.facing, grounded: source.player.onGround, dashing: source.player.dashTimer > 0 },
    blade: { x: source.blade.x, y: source.blade.y, tipX: source.blade.tipX, tipY: source.blade.tipY,
      tipVX: source.blade.tipVX, tipVY: source.blade.tipVY, tipSpeed: source.blade.tipSpeed, angle: source.blade.angle,
      state: source.blade.state, swingId: source.blade.swingId, throwId: source.blade.throwId },
    actors: source.actors.map((actor) => ({ id: source.id(actor, "enemy"), kind: actor.kind,
      x: actor.x, y: actor.y, vx: actor.vx, vy: actor.vy, hp: actor.hp, dead: actor.dead, state: actor.state ?? actor.atk ?? "active" })),
    projectiles: source.projectiles.map((shot) => ({ id: source.id(shot, "projectile"), x: shot.x, y: shot.y,
      vx: shot.vx, vy: shot.vy, radius: shot.r, dead: shot.dead, deflected: shot.deflected, family: shot.family ?? "ordinaryProjectile" })),
  });
}

/** Accepted target damage only: IDs must persist across the actual committed collision step. */
export function tutorialGoldContactEdges(before: TutorialGoldFrame, after: TutorialGoldFrame): readonly string[] {
  return Object.freeze(after.actors.filter((actor) => {
    const previous = before.actors.find((candidate) => candidate.id === actor.id);
    return previous !== undefined && actor.hp < previous.hp;
  }).map((actor) => actor.id));
}
