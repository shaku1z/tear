import type { AuthoritativeInputSnapshot } from "../runtime/authoritative-input";
import type { GameAction } from "../../input/game-action";
import { stableVerificationHash } from "../../domain/hash";
import { freezeDeep } from "./tutorial-gold-frame";

export const TUTORIAL_GOLD_LESSONS = [
  "move",
  "jump",
  "dash",
  "cut",
  "launch",
  "juggle",
  "slam",
  "power-slam",
  "updraft",
  "throw",
  "parry",
  "read-the-charge",
  "field-test",
] as const;
export type TutorialGoldLessonId = (typeof TUTORIAL_GOLD_LESSONS)[number];
export interface TutorialGoldCompatibility {
  readonly curriculumVersion: 2;
  readonly simulationHz: 120;
  readonly weaponId: "sword";
  readonly difficulty: "normal";
  readonly configurationHash: string;
  readonly definitionHash: string;
}
export const TUTORIAL_GOLD_BINDING_FORMAT = "tear-tutorial-gold-binding.v2";
/**
 * Names the corpus the code ships with, by its content hash. It records only the gold output, never a
 * source fingerprint, so it changes only when the gold output does; whether the output still matches
 * the code is proven by regenerating it (tests/unit/tutorial-production-ghost.test.ts, and every build).
 */
export interface TutorialGoldBinding {
  readonly format: typeof TUTORIAL_GOLD_BINDING_FORMAT;
  readonly corpusContentHash: string;
}
export interface TutorialGoldBody {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly facing: number;
  readonly grounded: boolean;
  readonly dashing: boolean;
}
export interface TutorialGoldBlade {
  readonly x: number;
  readonly y: number;
  readonly tipX: number;
  readonly tipY: number;
  readonly tipVX: number;
  readonly tipVY: number;
  readonly tipSpeed: number;
  readonly angle: number;
  readonly state: string;
  readonly swingId: number;
  readonly throwId: number;
}
export interface TutorialGoldActor {
  readonly id: string;
  readonly kind: string;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly hp: number;
  readonly dead: boolean;
  readonly state: string;
}
export interface TutorialGoldShot {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly radius: number;
  readonly deflected: boolean;
  readonly dead: boolean;
  readonly family: string;
}
export interface TutorialGoldFrame {
  readonly tick: number;
  readonly stage: number;
  readonly body: TutorialGoldBody;
  readonly blade: TutorialGoldBlade;
  readonly actors: readonly TutorialGoldActor[];
  readonly projectiles: readonly TutorialGoldShot[];
  readonly encounter: "charger" | "breath" | "mixed";
}
export interface TutorialGoldFact {
  readonly tick: number;
  readonly fact: Readonly<Record<string, string | number | boolean | null>>;
}
export interface TutorialGoldReference {
  readonly lessonId: TutorialGoldLessonId;
  readonly encounterVersion: 1 | 2;
  readonly curriculumVersion: 1 | 2;
  readonly arenaId: string;
  readonly arenaHash: string;
  readonly platforms: readonly Readonly<{
    x: number;
    y: number;
    w: number;
    h: number;
    floor: boolean;
    oneway: boolean;
  }>[];
  readonly stages: readonly Readonly<{ tick: number; platforms: TutorialGoldReference["platforms"] }>[];
  readonly originTick: number;
  readonly durationTicks: number;
  readonly initialInput: AuthoritativeInputSnapshot;
  readonly frames: readonly TutorialGoldFrame[];
  readonly inputs: readonly Readonly<{ tick: number; commands: readonly GameAction[] }>[];
  readonly facts: readonly TutorialGoldFact[];
  readonly landmarks: readonly Readonly<{
    tick: number;
    kind: "takeoff" | "landing" | "dash" | "contact" | "objective" | "encounter";
  }>[];
  readonly finalCounters: Readonly<Record<string, number>>;
  readonly proofHash: string;
  readonly contentHash: string;
}
export interface TutorialGoldCorpus {
  readonly format: "tear-tutorial-gold.v1";
  readonly schemaVersion: 1;
  readonly compatibility: TutorialGoldCompatibility;
  readonly references: readonly TutorialGoldReference[];
  readonly contentHash: string;
}
export const TUTORIAL_GOLD_MAX_TICKS = 20000;
const POSE_ENCODING = "pose-tuples.v1";
const BODY_FIELDS = ["x", "y", "vx", "vy", "facing", "grounded", "dashing"] as const;
const BLADE_FIELDS = [
  "x",
  "y",
  "tipX",
  "tipY",
  "tipVX",
  "tipVY",
  "tipSpeed",
  "angle",
  "state",
  "swingId",
  "throwId",
] as const;
const ACTOR_FIELDS = ["id", "kind", "x", "y", "vx", "vy", "hp", "dead", "state"] as const;
const SHOT_FIELDS = ["id", "x", "y", "vx", "vy", "radius", "deflected", "dead", "family"] as const;
function poseTuple<T extends object>(value: T, keys: readonly (keyof T)[]): readonly unknown[] {
  return keys.map((key) => value[key]);
}
/** Lossless shipping layout only. Decoded public data and its existing checksums do not change. */
export function packTutorialGoldCorpus(corpus: TutorialGoldCorpus) {
  return {
    ...corpus,
    encoding: POSE_ENCODING,
    references: corpus.references.map((reference) => ({
      ...reference,
      frames: reference.frames.map((frame) => [
        frame.tick,
        frame.stage,
        poseTuple(frame.body, BODY_FIELDS),
        poseTuple(frame.blade, BLADE_FIELDS),
        frame.actors.map((actor) => poseTuple(actor, ACTOR_FIELDS)),
        frame.projectiles.map((shot) => poseTuple(shot, SHOT_FIELDS)),
        frame.encounter,
      ]),
    })),
  };
}
function tupleList(value: unknown, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length > maximum) throw new Error("Invalid gold tuple list");
  return value as readonly unknown[];
}
function readPose<T extends object>(value: unknown, keys: readonly (keyof T & string)[], types: string): T {
  const tuple = tupleList(value, keys.length);
  if (tuple.length !== keys.length) throw new Error("Invalid gold pose width");
  const pose: Record<string, unknown> = {};
  keys.forEach((key, index) => {
    const item = tuple[index],
      type = types[index];
    if (
      type === "n"
        ? typeof item !== "number" || !Number.isFinite(item)
        : type === "s"
          ? typeof item !== "string"
          : type !== "b" || typeof item !== "boolean"
    )
      throw new Error("Invalid gold pose value");
    pose[key] = item;
  });
  return pose as T;
}
function readFrame(value: unknown): TutorialGoldFrame {
  const tuple = tupleList(value, 7);
  if (tuple.length !== 7) throw new Error("Invalid gold frame width");
  const tick = tuple[0],
    stage = tuple[1],
    encounter = tuple[6];
  if (
    typeof tick !== "number" ||
    !Number.isSafeInteger(tick) ||
    tick < 0 ||
    typeof stage !== "number" ||
    !Number.isSafeInteger(stage) ||
    stage < 0 ||
    (encounter !== "charger" && encounter !== "breath" && encounter !== "mixed")
  )
    throw new Error("Invalid gold frame header");
  return {
    tick,
    stage,
    encounter,
    body: readPose<TutorialGoldBody>(tuple[2], BODY_FIELDS, "nnnnnbb"),
    blade: readPose<TutorialGoldBlade>(tuple[3], BLADE_FIELDS, "nnnnnnnnsnn"),
    actors: tupleList(tuple[4], 64).map((actor) => readPose<TutorialGoldActor>(actor, ACTOR_FIELDS, "ssnnnnnbs")),
    projectiles: tupleList(tuple[5], 512).map((shot) => readPose<TutorialGoldShot>(shot, SHOT_FIELDS, "snnnnnbbs")),
  };
}
function decodedCorpus(value: object): TutorialGoldCorpus {
  const encoding: unknown = Reflect.get(value, "encoding");
  if (encoding === undefined) return value as TutorialGoldCorpus;
  if (encoding !== POSE_ENCODING) throw new Error("Unknown gold pose encoding");
  const packed = value as ReturnType<typeof packTutorialGoldCorpus>;
  const { encoding: marker, ...content } = packed;
  void marker;
  return {
    ...content,
    references: content.references.map((reference) => ({
      ...reference,
      frames: tupleList(reference.frames, TUTORIAL_GOLD_MAX_TICKS + 1).map(readFrame),
    })),
  };
}
export function bindTutorialGoldCorpus(corpus: TutorialGoldCorpus): TutorialGoldBinding {
  return { format: TUTORIAL_GOLD_BINDING_FORMAT, corpusContentHash: corpus.contentHash };
}
function readBinding(value: unknown): TutorialGoldBinding | undefined {
  const binding = value as Partial<TutorialGoldBinding> | null;
  if (binding?.format !== TUTORIAL_GOLD_BINDING_FORMAT) return undefined;
  if (typeof binding.corpusContentHash !== "string" || !/^[a-f0-9]{16}$/.test(binding.corpusContentHash))
    return undefined;
  return { format: binding.format, corpusContentHash: binding.corpusContentHash };
}
/** Shipping data is detached, finite JSON; physics execution remains in the production generator/verifier. */
export function loadTutorialGoldCorpus(
  value: unknown,
  binding: unknown,
):
  | Readonly<{ status: "ready"; corpus: TutorialGoldCorpus }>
  | Readonly<{ status: "unavailable"; reason: "incompatible" | "invalid" }> {
  try {
    const bound = readBinding(binding);
    const header = value as Partial<
      Record<"format" | "schemaVersion" | "references" | "compatibility", unknown>
    > | null;
    const compatibility = header?.compatibility as
      Partial<Record<keyof TutorialGoldCompatibility, unknown>> | undefined;
    if (
      header?.format !== "tear-tutorial-gold.v1" ||
      header.schemaVersion !== 1 ||
      !Array.isArray(header.references) ||
      header.references.length !== 14 ||
      compatibility?.simulationHz !== 120 ||
      compatibility.curriculumVersion !== 2 ||
      compatibility.weaponId !== "sword" ||
      compatibility.difficulty !== "normal"
    )
      throw new Error("Invalid gold corpus");
    if (bound === undefined) return { status: "unavailable", reason: "incompatible" };
    const corpus = decodedCorpus(value as object);
    const ids = new Set<string>();
    for (const reference of corpus.references) {
      const encounterVersion: unknown = Reflect.get(reference, "encounterVersion");
      const key = `${reference.lessonId}:${String(reference.encounterVersion)}`;
      if (
        ids.has(key) ||
        !TUTORIAL_GOLD_LESSONS.includes(reference.lessonId) ||
        (encounterVersion !== 2 && !(reference.lessonId === "field-test" && encounterVersion === 1)) ||
        !Number.isSafeInteger(reference.durationTicks) ||
        reference.durationTicks < 1 ||
        reference.durationTicks > TUTORIAL_GOLD_MAX_TICKS ||
        reference.frames.length < 2 ||
        reference.frames.length > TUTORIAL_GOLD_MAX_TICKS + 1 ||
        reference.inputs.length > TUTORIAL_GOLD_MAX_TICKS ||
        reference.facts.length > TUTORIAL_GOLD_MAX_TICKS * 20 ||
        reference.platforms.length > 128
      )
        throw new Error("Invalid gold reference bounds");
      ids.add(key);
      let previous = -1;
      for (const frame of reference.frames) {
        if (
          !Number.isSafeInteger(frame.tick) ||
          frame.tick <= previous ||
          frame.tick > reference.durationTicks ||
          frame.actors.length > 64 ||
          frame.projectiles.length > 512
        )
          throw new Error("Invalid gold frame");
        previous = frame.tick;
      }
      const { contentHash, ...content } = reference;
      if (stableVerificationHash(content) !== contentHash) throw new Error("Gold reference hash mismatch");
    }
    if (TUTORIAL_GOLD_LESSONS.some((id) => !ids.has(`${id}:2`)) || !ids.has("field-test:1"))
      throw new Error("Missing required gold reference");
    const { contentHash, ...content } = corpus;
    if (stableVerificationHash(content) !== contentHash) throw new Error("Gold corpus hash mismatch");
    if (bound.corpusContentHash !== contentHash) return { status: "unavailable", reason: "incompatible" };
    return { status: "ready", corpus: freezeDeep(JSON.parse(JSON.stringify(corpus)) as TutorialGoldCorpus) };
  } catch {
    return { status: "unavailable", reason: "invalid" };
  }
}
export function tutorialGoldReference(
  corpus: TutorialGoldCorpus,
  lessonId: TutorialGoldLessonId,
  encounterVersion: 1 | 2,
): TutorialGoldReference | undefined {
  return corpus.references.find(
    (reference) =>
      reference.lessonId === lessonId &&
      reference.encounterVersion === (lessonId === "field-test" ? encounterVersion : 2),
  );
}
/** Discrete recorded poses only. 0.5x changes the display cursor, never authoritative time. */
export function sampleTutorialGold(reference: TutorialGoldReference, displaySeconds: number, rate: 1 | 0.5 = 1) {
  if (!Number.isFinite(displaySeconds) || displaySeconds < 0 || ![1, 0.5].includes(rate))
    throw new RangeError("Invalid gold display cursor");
  const tick = Math.min(reference.durationTicks, Math.floor(displaySeconds * 120 * rate));
  let frame = reference.frames[0];
  if (frame === undefined) throw new Error("Gold reference has no initial pose");
  for (const candidate of reference.frames) {
    if (candidate.tick > tick) break;
    frame = candidate;
  }
  return Object.freeze({ frame, tick, finished: tick >= reference.durationTicks });
}
/** Restrict a diagnostic to genuine recorded ticks; no synthesized contact or body path. */
export function tutorialGoldSegment(
  reference: TutorialGoldReference,
  fromTick: number,
  toTick: number,
): readonly TutorialGoldFrame[] {
  if (
    !Number.isSafeInteger(fromTick) ||
    !Number.isSafeInteger(toTick) ||
    fromTick < 0 ||
    toTick < fromTick ||
    toTick > reference.durationTicks
  )
    throw new RangeError("Invalid gold segment");
  return Object.freeze(reference.frames.filter((frame) => frame.tick >= fromTick && frame.tick <= toTick));
}

/** Accepted target damage only: IDs must persist across the actual committed collision step. */
export function tutorialGoldContactEdges(before: TutorialGoldFrame, after: TutorialGoldFrame): readonly string[] {
  return Object.freeze(
    after.actors
      .filter((actor) => {
        const previous = before.actors.find((candidate) => candidate.id === actor.id);
        return previous !== undefined && actor.hp < previous.hp;
      })
      .map((actor) => actor.id),
  );
}
