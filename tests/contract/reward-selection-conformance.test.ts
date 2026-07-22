import { describe, expect, it } from "vitest";
import { SeededRandom } from "../../src/domain/random";
import { RewardSelectionController, type DraftRollRequest } from "../../src/gameplay/run/reward-selection";
import { UPGRADES, newMods, rollUpgrades, type UpgradeDefinition, type UpgradeMods } from "../../src/gameplay/upgrades";

interface LegacyDraftState {
  specialBlock: number;
  specialsOffered: number;
  reservedUpgrade: UpgradeDefinition | null;
}

function legacyBuildDraft(
  state: LegacyDraftState,
  wave: number,
  mods: UpgradeMods,
  random: SeededRandom,
  options: { readonly expanded: boolean; readonly excludeIds?: readonly string[] },
): UpgradeDefinition[] {
  const block = Math.floor((wave - 1) / 10);
  if (state.specialBlock !== block) { state.specialBlock = block; state.specialsOffered = 0; }
  const localWave = ((wave - 1) % 10) + 1;
  const draftsLeft = Math.max(1, 10 - localWave);
  const needed = 2 - state.specialsOffered;
  const choices = rollUpgrades(options.expanded ? 4 : 3, mods, {
    random, forceSpecial: needed > 0 && draftsLeft <= needed, excludeIds: options.excludeIds ?? [],
  });
  if (state.reservedUpgrade) {
    const reserved = state.reservedUpgrade;
    state.reservedUpgrade = null;
    if (!choices.some((choice) => choice.id === reserved.id)) {
      let replacement = choices.length - 1;
      const nonSpecial = choices.map((choice, index) => ({ choice, index })).filter((entry) => !entry.choice.tiers);
      const lastNonSpecial = nonSpecial.at(-1);
      if (lastNonSpecial) replacement = lastNonSpecial.index;
      if (replacement >= 0) choices[replacement] = reserved;
    }
  }
  state.specialsOffered += choices.filter((choice) => choice.tiers).length;
  return choices;
}

function ids(choices: readonly UpgradeDefinition[]): string[] { return choices.map((choice) => choice.id); }

describe("legacy reward-selection conformance", () => {
  it("matches deterministic expanded draft, reserved replacement, special ledger, and reroll semantics", () => {
    const reserved = UPGRADES.find((choice) => !choice.tiers && !choice.unique);
    expect(reserved).toBeDefined();
    if (!reserved) throw new Error("upgrade catalogue requires a stackable reward");
    const legacyState: LegacyDraftState = { specialBlock: -1, specialsOffered: 0, reservedUpgrade: reserved };
    const legacyMods = newMods();
    const controllerMods = newMods();
    const legacyRandom = new SeededRandom("reward-conformance");
    const controllerRandom = new SeededRandom("reward-conformance");
    const controller = new RewardSelectionController<UpgradeDefinition>({
      mode: "endless", expandedDraft: true, reservePick: true, rerolls: 2,
      specialBlock: -1, specialsOffered: 0, reservedChoice: reserved,
    });
    const roll = (request: DraftRollRequest) => rollUpgrades(request.count, controllerMods, {
      random: controllerRandom, forceSpecial: request.forceSpecial, excludeIds: request.excludeIds,
    });

    const legacyFirst = legacyBuildDraft(legacyState, 8, legacyMods, legacyRandom, { expanded: true });
    const first = controller.openDraft(8, roll).snapshot;
    expect(ids(first.choices)).toEqual(ids(legacyFirst));
    expect(first).toMatchObject({
      specialBlock: legacyState.specialBlock, specialsOffered: legacyState.specialsOffered, reservedChoice: legacyState.reservedUpgrade,
    });

    legacyState.specialsOffered = Math.max(0, legacyState.specialsOffered - legacyFirst.filter((choice) => choice.tiers).length);
    const legacySecond = legacyBuildDraft(legacyState, 8, legacyMods, legacyRandom, { expanded: true, excludeIds: ids(legacyFirst) });
    const second = controller.reroll(roll).snapshot;
    expect(ids(second.choices)).toEqual(ids(legacySecond));
    expect(second).toMatchObject({ rerolls: 1, specialBlock: legacyState.specialBlock, specialsOffered: legacyState.specialsOffered });
  });

  it("returns existing upgrade definitions by identity for the legacy mutation adapter", () => {
    const selected = UPGRADES[0];
    if (!selected) throw new Error("upgrade catalogue must not be empty");
    const controller = new RewardSelectionController<UpgradeDefinition>({ mode: "endless" });
    controller.openDraft(1, () => [selected]);
    const apply = controller.selectDraft(0).intents.find((intent) => intent.type === "apply-upgrade");
    expect(apply?.choice).toBe(selected);

    const tiered = UPGRADES.find((choice) => choice.tiers);
    expect(tiered).toBeDefined();
    if (!tiered) throw new Error("upgrade catalogue requires a tiered reward");
    controller.openTierUp([tiered]);
    const evolve = controller.selectTierUp(0).intents.find((intent) => intent.type === "tier-up");
    expect(evolve?.choice).toBe(tiered);
  });
});
