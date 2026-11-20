import { requireRecord } from "../../domain/records";
import { parseTutorialCoachCheckpoint, type TutorialCoachCheckpoint } from "../training/tutorial-ghost-coach";
/** Portable presentation-only data. Never part of gameplay semantic projection. */
export type UiHudPresentationCheckpoint = Readonly<{
  version: 1;
  clockSeconds: number;
  lagHp: number;
  multiplier: number;
  multiplierPop: number;
}>;

export type UiTutorialPresentationCheckpoint = Readonly<{
  version: 1;
  ghostTime: number;
  anchorX: number;
  evidencePulse: boolean;
  coachIdle: number;
  coachDemoTime: number;
  helpVisible: boolean;
  annexSelector?: boolean;
  catalogSelector?: boolean;
  bossSelector?: boolean;
  goldCoach?: TutorialCoachCheckpoint;
}>;

export function parseUiTutorialPresentationCheckpoint(value: unknown): UiTutorialPresentationCheckpoint | undefined {
  if (value === undefined) return undefined;
  const data = requireRecord(value, "Tutorial presentation must be an object");
  const numbers = ["ghostTime", "anchorX", "coachIdle", "coachDemoTime"];
  const flags = ["evidencePulse", "helpVisible"];
  const goldCoach = parseTutorialCoachCheckpoint(data.goldCoach);
  if (
    data.version !== 1 ||
    Object.keys(data).some(
      (key) =>
        !["version", "goldCoach", "annexSelector", "catalogSelector", "bossSelector", ...numbers, ...flags].includes(
          key,
        ),
    ) ||
    (data.annexSelector !== undefined && typeof data.annexSelector !== "boolean") ||
    (data.bossSelector !== undefined && typeof data.bossSelector !== "boolean") ||
    (data.catalogSelector !== undefined && typeof data.catalogSelector !== "boolean") ||
    numbers.some(
      (key) => typeof data[key] !== "number" || !Number.isFinite(data[key]) || (key !== "anchorX" && data[key] < 0),
    ) ||
    flags.some((key) => typeof data[key] !== "boolean")
  )
    throw new TypeError("Invalid tutorial presentation");
  return Object.freeze({
    version: 1,
    ghostTime: data.ghostTime as number,
    anchorX: data.anchorX as number,
    evidencePulse: data.evidencePulse as boolean,
    coachIdle: data.coachIdle as number,
    coachDemoTime: data.coachDemoTime as number,
    helpVisible: data.helpVisible as boolean,
    ...(goldCoach === undefined ? {} : { goldCoach }),
    ...(data.annexSelector === undefined ? {} : { annexSelector: data.annexSelector }),
    ...(data.bossSelector === undefined ? {} : { bossSelector: data.bossSelector }),
    ...(data.catalogSelector === undefined ? {} : { catalogSelector: data.catalogSelector }),
  });
}

export function parseUiHudPresentationCheckpoint(value: unknown): UiHudPresentationCheckpoint | undefined {
  if (value === undefined) return undefined;
  const data = requireRecord(value, "HUD presentation must be a versioned object");
  if (!("version" in data) || data.version !== 1) throw new RangeError("unsupported HUD presentation version");
  const keys = ["version", "clockSeconds", "lagHp", "multiplier", "multiplierPop"];
  if (Object.keys(data).some((key) => !keys.includes(key))) throw new RangeError("unsupported HUD presentation field");
  const number = (key: string, maximum = Infinity): number => {
    const entry = data[key];
    if (typeof entry !== "number" || !Number.isFinite(entry) || entry < 0 || entry > maximum)
      throw new TypeError(`HUD presentation ${key} must be finite and within bounds`);
    return entry;
  };
  return Object.freeze({
    version: 1,
    clockSeconds: number("clockSeconds"),
    lagHp: number("lagHp", 1),
    multiplier: number("multiplier"),
    multiplierPop: number("multiplierPop", 1),
  });
}
