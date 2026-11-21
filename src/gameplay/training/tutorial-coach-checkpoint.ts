import { isRecord, requireRecord } from "../../domain/records";
import { shippingTutorialGold } from "./tutorial-gold-shipping";

/**
 * The saved state of the gold coach and of its failure ledger, and the readers that accept them. They are
 * here, and not beside the coaches, so state restore can read a saved coach without loading the coach code.
 */

export type Cause =
  "slow" | "grounded" | "recall-range" | "no-contact" | "wrong-strike" | "shot-missed" | "transfer" | "unknown";
export interface FailureVariant {
  key: string;
  failures: number;
  cause: Cause;
  demoShown: boolean;
}
type FailureVariantData = { readonly [Key in keyof FailureVariant]: FailureVariant[Key] };
export type TutorialFailureCheckpoint = Readonly<{ version: 1; variants: readonly FailureVariantData[] }>;
const causes: readonly Cause[] = [
  "slow",
  "grounded",
  "recall-range",
  "no-contact",
  "wrong-strike",
  "shot-missed",
  "transfer",
  "unknown",
];
export function parseTutorialFailures(value: unknown): TutorialFailureCheckpoint {
  const data = requireRecord(value, "Invalid tutorial failures");
  if (
    data.version !== 1 ||
    Object.keys(data).some((key) => !["version", "variants"].includes(key)) ||
    !Array.isArray(data.variants) ||
    data.variants.length > 28
  )
    throw new TypeError("Invalid tutorial failure ledger");
  const keys = new Set<string>();
  for (const raw of data.variants as readonly unknown[]) {
    const entry = requireRecord(raw, "Invalid tutorial failure variant");
    if (
      Object.keys(entry).some((key) => !["key", "failures", "cause", "demoShown"].includes(key)) ||
      typeof entry.key !== "string" ||
      !/^(move|jump|dash|cut|launch|juggle|slam|power-slam|updraft|throw|parry|read-the-charge|field-test):(charger|mixed)$/.test(
        entry.key,
      ) ||
      keys.has(entry.key) ||
      typeof entry.failures !== "number" ||
      !Number.isSafeInteger(entry.failures) ||
      entry.failures < 0 ||
      entry.failures > 100 ||
      !causes.includes(entry.cause as Cause) ||
      typeof entry.demoShown !== "boolean"
    )
      throw new TypeError("Invalid tutorial failure variant");
    keys.add(entry.key);
  }
  return structuredClone(value) as TutorialFailureCheckpoint;
}

export type Pose = readonly [tick: number, x: number, y: number, tipX: number, tipY: number, marker: string];
export type Attempt = Pick<
  { duration: number; poses: Pose[]; contact: boolean; groundedContact: boolean },
  "duration" | "poses" | "contact" | "groundedContact"
>;
export type TutorialCoachCheckpoint = Readonly<{
  readonly version: 1 | 2;
  readonly failures?: TutorialFailureCheckpoint;
  readonly reference: string;
  readonly mode: "preview" | "diagnostic" | "comparison";
  readonly rate: 1 | 0.5;
  readonly cursor: number;
  readonly from: number;
  readonly to: number;
  readonly visible: boolean;
  readonly diagnosis: string;
  readonly current?: Attempt;
  readonly best?: Attempt;
}>;
export const MAX_POSES = 128,
  MAX_PRESENTATION_BYTES = 24000;
const fields = [
  "version",
  "reference",
  "mode",
  "rate",
  "cursor",
  "from",
  "to",
  "visible",
  "diagnosis",
  "current",
  "best",
  "failures",
];
export function parseTutorialCoachCheckpoint(value: unknown): TutorialCoachCheckpoint | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new TypeError("Invalid gold coach presentation");
  const data = value as TutorialCoachCheckpoint;
  const version: unknown = Reflect.get(value, "version");
  if (
    Object.keys(data).some((key) => !fields.includes(key)) ||
    (version !== 1 && version !== 2) ||
    !/^[a-f0-9]{16}$/.test(data.reference) ||
    !["preview", "diagnostic", "comparison"].includes(data.mode) ||
    ![1, 0.5].includes(data.rate) ||
    ![data.cursor, data.from, data.to].every((n) => Number.isFinite(n) && n >= 0 && n <= 20000) ||
    data.from > data.to ||
    data.cursor < data.from ||
    data.cursor > data.to ||
    typeof data.visible !== "boolean" ||
    typeof data.diagnosis !== "string" ||
    data.diagnosis.length > 120 ||
    JSON.stringify(data).length > MAX_PRESENTATION_BYTES
  )
    throw new TypeError("Invalid gold coach cursor");
  if (version === 2) parseTutorialFailures(data.failures);
  else if (data.failures !== undefined) throw new TypeError("Historical coach cannot contain adaptive failures");
  if (data.mode === "comparison" && data.best === undefined) throw new RangeError("Gold coach reference incompatible");
  // The corpus arrives after a lesson starts. Until it has, the reference is checked when it does
  // (TutorialGhostCoach.select); once it has, a state for a reference it lacks is refused here.
  const gold = shippingTutorialGold();
  if (
    gold !== undefined &&
    !gold.references.some((reference) => reference.contentHash === data.reference && data.to <= reference.durationTicks)
  )
    throw new RangeError("Gold coach reference incompatible");
  for (const raw of [data.current, data.best] as readonly unknown[])
    if (raw !== undefined) {
      if (!isRecord(raw)) throw new TypeError("Invalid personal attempt");
      const attempt = raw as Attempt;
      if (
        Object.keys(attempt).some((key) => !["duration", "poses", "contact", "groundedContact"].includes(key)) ||
        !Number.isSafeInteger(attempt.duration) ||
        attempt.duration < 0 ||
        attempt.duration > 20000 ||
        !Array.isArray(attempt.poses) ||
        attempt.poses.length > MAX_POSES ||
        typeof attempt.contact !== "boolean" ||
        typeof attempt.groundedContact !== "boolean"
      )
        throw new TypeError("Invalid personal attempt");
      let previous = -1;
      for (const rawPose of attempt.poses as readonly unknown[]) {
        if (!Array.isArray(rawPose) || rawPose.length !== 6) throw new TypeError("Invalid personal pose");
        const pose = rawPose as unknown as Pose;
        if (
          !pose.slice(0, 5).every((n) => typeof n === "number" && Number.isFinite(n)) ||
          !Number.isSafeInteger(pose[0]) ||
          pose[0] <= previous ||
          pose[0] > attempt.duration ||
          !["pose", "takeoff", "landing", "dash", "contact", "apex"].includes(pose[5])
        )
          throw new TypeError("Invalid personal pose");
        previous = pose[0];
      }
    }
  return structuredClone(data);
}
