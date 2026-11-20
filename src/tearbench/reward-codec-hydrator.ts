import { isRecord } from "../domain/records";
import { readBeatRunBinding } from "../gameplay/run/beat-run";
import type { RewardSelectionSnapshot } from "../gameplay/run/reward-selection";
import type { UpgradeDefinition } from "../gameplay/upgrades";
import { MODE_IDS } from "../gameplay/run/mode-catalog";
import { decodeTearCodecValue } from "./detached-world-hydrator";
import type { TearCodecValue } from "./state-codecs";
import { readSeedLockedDraft, rollSeedLockedDraft } from "../gameplay/run/seed-locked-draft";

/** Rebinds portable upgrade data to the executable production definition. */
export function hydrateRewardUpgrade(catalog: readonly UpgradeDefinition[], value: unknown): UpgradeDefinition | null {
  if (value === null) return null;
  if (!isRecord(value) || typeof value.id !== "string")
    throw new TypeError("reward choice requires a production upgrade id");
  const upgrade = catalog.find((entry) => entry.id === value.id);
  if (upgrade === undefined) throw new TypeError(`reward choice references unknown production upgrade ${value.id}`);
  return upgrade;
}

/** Shared live and detached decoding; saved data never supplies upgrade functions. */
export function hydrateRewardCodecPayload(
  catalog: readonly UpgradeDefinition[],
  payload: TearCodecValue,
  incomingRun?: unknown,
): RewardSelectionSnapshot<UpgradeDefinition> | null {
  if (!isRecord(payload) || !("selection" in payload)) throw new TypeError("reward codec requires selection");
  if (payload.selection === null) return null;
  const decoded = decodeTearCodecValue(payload.selection, new Map());
  if (!isRecord(decoded) || !Array.isArray(decoded.choices) || !Array.isArray(decoded.reserveChoices)) {
    throw new TypeError("reward selection payload is malformed");
  }
  if (
    typeof decoded.phase !== "string" ||
    !["idle", "draft", "reserve", "tierup", "complete"].includes(decoded.phase) ||
    typeof decoded.mode !== "string" ||
    !MODE_IDS.some((mode) => mode === decoded.mode) ||
    !Number.isSafeInteger(decoded.wave) ||
    Number(decoded.wave) < 0 ||
    typeof decoded.expandedDraft !== "boolean" ||
    typeof decoded.reservePick !== "boolean" ||
    !Number.isSafeInteger(decoded.rerolls) ||
    Number(decoded.rerolls) < 0 ||
    !Number.isSafeInteger(decoded.specialBlock) ||
    !Number.isSafeInteger(decoded.specialsOffered) ||
    Number(decoded.specialsOffered) < 0 ||
    !Number.isSafeInteger(decoded.revision) ||
    Number(decoded.revision) < 0
  ) {
    throw new TypeError("reward selection payload has invalid state fields");
  }
  const choices = (values: readonly unknown[]) =>
    Object.freeze(
      values.map((value) => {
        const upgrade = hydrateRewardUpgrade(catalog, value);
        if (upgrade === null) throw new TypeError("reward choices cannot contain null");
        return upgrade;
      }),
    );
  const seedLocked = readSeedLockedDraft(decoded.seedLocked);
  const beat = isRecord(incomingRun) ? readBeatRunBinding(incomingRun.beatThisRun) : undefined;
  if (beat !== undefined && seedLocked !== undefined)
    throw new TypeError("Beat private rewards cannot declare shared draft offers");
  if (seedLocked !== undefined) {
    if (!Number.isSafeInteger(decoded.decisionSequence) || Number(decoded.decisionSequence) < 0)
      throw new TypeError("Invalid race decision frontier");
    if (
      !Number.isSafeInteger(decoded.rerollOrdinal) ||
      Number(decoded.rerollOrdinal) < 0 ||
      Number(decoded.rerollOrdinal) > 64
    )
      throw new TypeError("Invalid shared draft reroll ordinal");
    if (decoded.phase === "draft" || decoded.phase === "reserve") {
      const expected = rollSeedLockedDraft(
        seedLocked,
        Number(decoded.wave),
        Number(decoded.rerollOrdinal),
        decoded.expandedDraft ? 4 : 3,
      );
      if (
        decoded.choices.length !== expected.choices.length ||
        choices(decoded.choices).some((choice, index) => choice.id !== expected.choices[index]?.id) ||
        decoded.specialBlock !== expected.specialBlock ||
        decoded.specialsOffered !== expected.specialsOffered
      )
        throw new TypeError("Shared offers differ from their declared coordinate");
      if (decoded.phase === "reserve") {
        if (
          !Number.isSafeInteger(decoded.selectedDraftIndex) ||
          Number(decoded.selectedDraftIndex) < 0 ||
          Number(decoded.selectedDraftIndex) > expected.choices.length
        )
          throw new TypeError("Invalid reserved common slot");
        const expectedReserve = expected.choices
          .filter((_, index) => index !== decoded.selectedDraftIndex)
          .map((choice) => choice.id);
        if (
          choices(decoded.reserveChoices)
            .map((choice) => choice.id)
            .join() !== expectedReserve.join()
        )
          throw new TypeError("Reserve cards differ from the common coordinate");
      }
    }
  } else {
    if (decoded.rerollOrdinal !== undefined)
      throw new TypeError("A reroll coordinate requires a shared draft declaration");
    if (beat !== undefined) {
      if (!Number.isSafeInteger(decoded.decisionSequence) || Number(decoded.decisionSequence) < 0)
        throw new TypeError("Invalid Beat private decision frontier");
    } else if (decoded.decisionSequence !== undefined)
      throw new TypeError("A decision frontier requires a declared recording category");
  }
  return Object.freeze({
    ...decoded,
    choices: choices(decoded.choices),
    reserveChoices: choices(decoded.reserveChoices),
    reservedChoice: hydrateRewardUpgrade(catalog, decoded.reservedChoice),
  }) as RewardSelectionSnapshot<UpgradeDefinition>;
}
