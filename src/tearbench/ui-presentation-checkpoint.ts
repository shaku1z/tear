/** Portable presentation-only data. Never part of gameplay semantic projection. */
export type UiHudPresentationCheckpoint = Readonly<{
  version: 1;
  clockSeconds: number;
  lagHp: number;
  multiplier: number;
  multiplierPop: number;
}>;

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
