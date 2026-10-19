/** Portable presentation-only data. Never part of gameplay semantic projection. */
export type UiHudPresentationCheckpoint = Readonly<{
  version: 1;
  clockSeconds: number;
  lagHp: number;
  multiplier: number;
  multiplierPop: number;
}>;

export type UiTutorialPresentationCheckpoint = Readonly<{
  version: 1; ghostTime: number; anchorX: number; evidencePulse: boolean;
  coachIdle: number; coachDemoTime: number; helpVisible: boolean;
}>;

export function parseUiTutorialPresentationCheckpoint(value: unknown): UiTutorialPresentationCheckpoint | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("Tutorial presentation must be an object");
  const data = value as Record<string, unknown>;
  const numbers = ["ghostTime", "anchorX", "coachIdle", "coachDemoTime"];
  const flags = ["evidencePulse", "helpVisible"];
  if (data.version !== 1 || Object.keys(data).some((key) => !["version", ...numbers, ...flags].includes(key)) ||
    numbers.some((key) => typeof data[key] !== "number" || !Number.isFinite(data[key]) || (key !== "anchorX" && data[key] < 0)) ||
    flags.some((key) => typeof data[key] !== "boolean")) throw new TypeError("Invalid tutorial presentation");
  return Object.freeze({ version: 1, ghostTime: data.ghostTime as number, anchorX: data.anchorX as number,
    evidencePulse: data.evidencePulse as boolean, coachIdle: data.coachIdle as number,
    coachDemoTime: data.coachDemoTime as number, helpVisible: data.helpVisible as boolean });
}

export function parseUiHudPresentationCheckpoint(value: unknown): UiHudPresentationCheckpoint | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("HUD presentation must be a versioned object");
  if (!("version" in value) || value.version !== 1) throw new RangeError("unsupported HUD presentation version");
  const data = value as Record<string, unknown>;
  const keys = ["version", "clockSeconds", "lagHp", "multiplier", "multiplierPop"];
  if (Object.keys(data).some((key) => !keys.includes(key))) throw new RangeError("unsupported HUD presentation field");
  const number = (key: string, maximum = Infinity): number => {
    const entry = data[key];
    if (typeof entry !== "number" || !Number.isFinite(entry) || entry < 0 || entry > maximum) throw new TypeError(`HUD presentation ${key} must be finite and within bounds`);
    return entry;
  };
  return Object.freeze({ version: 1, clockSeconds: number("clockSeconds"), lagHp: number("lagHp", 1),
    multiplier: number("multiplier"), multiplierPop: number("multiplierPop", 1) });
}
