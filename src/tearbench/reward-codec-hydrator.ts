import type { RewardSelectionSnapshot } from "../gameplay/run/reward-selection";
import type { UpgradeDefinition } from "../gameplay/upgrades";
import { MODE_IDS } from "../gameplay/run/mode-catalog";
import { decodeTearCodecValue } from "./detached-world-hydrator";
import type { TearCodecValue } from "./state-codecs";

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Rebinds portable upgrade data to the executable production definition. */
export function hydrateRewardUpgrade(catalog: readonly UpgradeDefinition[], value: unknown): UpgradeDefinition | null {
  if (value === null) return null;
  if (!record(value) || typeof value.id !== "string") throw new TypeError("reward choice requires a production upgrade id");
  const upgrade = catalog.find((entry) => entry.id === value.id);
  if (upgrade === undefined) throw new TypeError(`reward choice references unknown production upgrade ${value.id}`);
  return upgrade;
}

/** Shared live and detached decoding; saved data never supplies upgrade functions. */
export function hydrateRewardCodecPayload(
  catalog: readonly UpgradeDefinition[], payload: TearCodecValue,
): RewardSelectionSnapshot<UpgradeDefinition> | null {
  if (!record(payload) || !("selection" in payload)) throw new TypeError("reward codec requires selection");
  if (payload.selection === null) return null;
  const decoded = decodeTearCodecValue(payload.selection, new Map());
  if (!record(decoded) || !Array.isArray(decoded.choices) || !Array.isArray(decoded.reserveChoices)) {
    throw new TypeError("reward selection payload is malformed");
  }
  if (typeof decoded.phase !== "string" || !["idle", "draft", "reserve", "tierup", "complete"].includes(decoded.phase)
    || typeof decoded.mode !== "string" || !MODE_IDS.some((mode) => mode === decoded.mode)
    || !Number.isSafeInteger(decoded.wave) || Number(decoded.wave) < 0
    || typeof decoded.expandedDraft !== "boolean" || typeof decoded.reservePick !== "boolean"
    || !Number.isSafeInteger(decoded.rerolls) || Number(decoded.rerolls) < 0
    || !Number.isSafeInteger(decoded.specialBlock) || !Number.isSafeInteger(decoded.specialsOffered) || Number(decoded.specialsOffered) < 0
    || !Number.isSafeInteger(decoded.revision) || Number(decoded.revision) < 0) {
    throw new TypeError("reward selection payload has invalid state fields");
  }
  const choices = (values: readonly unknown[]) => Object.freeze(values.map((value) => {
    const upgrade = hydrateRewardUpgrade(catalog, value);
    if (upgrade === null) throw new TypeError("reward choices cannot contain null");
    return upgrade;
  }));
  return Object.freeze({ ...decoded, choices: choices(decoded.choices), reserveChoices: choices(decoded.reserveChoices),
    reservedChoice: hydrateRewardUpgrade(catalog, decoded.reservedChoice) }) as RewardSelectionSnapshot<UpgradeDefinition>;
}
