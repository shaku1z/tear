import { describe, expect, it, vi } from "vitest";
import {
  RewardSelectionController,
  eligibleTierChoices,
  initialRewardSelectionSnapshot,
  transitionRewardSelection,
  type DraftRollRequest,
  type RewardChoice,
} from "../../src/gameplay/run/reward-selection";

interface Choice extends RewardChoice { readonly label: string }

const normal = (id: string, cat = "utility"): Choice => ({ id, label: id.toUpperCase(), cat });
const special = (id: string, cat = "offense", tierCount = 2): Choice => ({
  id, label: id.toUpperCase(), cat, tiers: Array.from({ length: tierCount }, () => Object.freeze({})),
});

function queuedRoller(rolls: readonly (readonly Choice[])[]) {
  const requests: DraftRollRequest[] = [];
  let cursor = 0;
  const roll = vi.fn((request: DraftRollRequest): readonly Choice[] => {
    requests.push(request);
    return rolls[cursor++] ?? [];
  });
  return { roll, requests };
}

function intentTypes(result: { readonly intents: readonly { readonly type: string }[] }): string[] {
  return result.intents.map((intent) => intent.type);
}

describe("reward selection draft construction", () => {
  it("creates immutable strict initial state and rejects invalid counters", () => {
    const snapshot = initialRewardSelectionSnapshot<Choice>({ mode: "endless", rerolls: 2 });
    expect(snapshot).toMatchObject({ phase: "idle", wave: 0, rerolls: 2, specialBlock: -1, specialsOffered: 0, revision: 0 });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.choices)).toBe(true);
    expect(() => initialRewardSelectionSnapshot<Choice>({ mode: "endless", rerolls: -1 })).toThrow(RangeError);
    expect(() => initialRewardSelectionSnapshot<Choice>({ mode: "endless", specialsOffered: 1.5 })).toThrow(RangeError);
  });

  it("requests three or four choices and forces specials only at the stage deadline", () => {
    const standard = queuedRoller([[normal("a"), normal("b"), normal("c")]]);
    const standardController = new RewardSelectionController<Choice>({ mode: "endless" });
    standardController.openDraft(1, standard.roll);
    expect(standard.requests[0]).toEqual({ count: 3, forceSpecial: false, excludeIds: [] });

    const expanded = queuedRoller([[normal("a"), special("s"), normal("b"), normal("c")]]);
    const expandedController = new RewardSelectionController<Choice>({ mode: "endless", expandedDraft: true });
    const result = expandedController.openDraft(8, expanded.roll);
    expect(expanded.requests[0]).toEqual({ count: 4, forceSpecial: true, excludeIds: [] });
    expect(result.snapshot.specialsOffered).toBe(1);
    expect(intentTypes(result)).toEqual(["set-screen"]);
  });

  it("keeps the current stage ledger and resets it on a new ten-wave block", () => {
    const sameBlock = new RewardSelectionController<Choice>({ mode: "endless", specialBlock: 0, specialsOffered: 1 });
    const sameRoll = queuedRoller([[normal("a")]]);
    expect(sameBlock.openDraft(7, sameRoll.roll).snapshot).toMatchObject({ specialBlock: 0, specialsOffered: 1 });
    expect(sameRoll.requests[0]?.forceSpecial).toBe(false);

    const nextBlock = new RewardSelectionController<Choice>({ mode: "endless", specialBlock: 0, specialsOffered: 8 });
    const nextRoll = queuedRoller([[normal("b")]]);
    expect(nextBlock.openDraft(18, nextRoll.roll).snapshot).toMatchObject({ specialBlock: 1, specialsOffered: 0 });
    expect(nextRoll.requests[0]?.forceSpecial).toBe(true);
  });

  it("consumes a reserved choice and replaces the last non-special choice", () => {
    const reserved = normal("reserved");
    const roller = queuedRoller([[special("s1"), normal("ordinary"), special("s2")]]);
    const controller = new RewardSelectionController<Choice>({ mode: "endless", reservedChoice: reserved });
    const result = controller.openDraft(1, roller.roll);
    expect(result.snapshot.choices.map((choice) => choice.id)).toEqual(["s1", "reserved", "s2"]);
    expect(result.snapshot.reservedChoice).toBeNull();
    expect(result.snapshot.specialsOffered).toBe(2);
  });

  it("falls back to replacing the final card when every rolled choice is special", () => {
    const roller = queuedRoller([[special("s1"), special("s2"), special("s3")]]);
    const controller = new RewardSelectionController<Choice>({ mode: "endless", reservedChoice: normal("reserved") });
    const result = controller.openDraft(1, roller.roll).snapshot;
    expect(result.choices.map((choice) => choice.id)).toEqual(["s1", "s2", "reserved"]);
    expect(result.specialsOffered).toBe(2);
  });

  it("does not duplicate an already-rolled reserve and safely consumes an empty reserve", () => {
    const reserved = normal("reserved");
    const duplicateRoll = queuedRoller([[normal("a"), reserved, normal("b")]]);
    const duplicate = new RewardSelectionController<Choice>({ mode: "endless", reservedChoice: reserved });
    expect(duplicate.openDraft(1, duplicateRoll.roll).snapshot.choices.map((choice) => choice.id)).toEqual(["a", "reserved", "b"]);

    const emptyRoll = queuedRoller([[]]);
    const empty = new RewardSelectionController<Choice>({ mode: "endless", reservedChoice: reserved });
    const emptyResult = empty.openDraft(1, emptyRoll.roll).snapshot;
    expect(emptyResult.choices).toEqual([]);
    expect(emptyResult.reservedChoice).toBeNull();
  });

  it("is deterministic for an identical snapshot and roll port without mutating the input", () => {
    const original = initialRewardSelectionSnapshot<Choice>({ mode: "endless", expandedDraft: true });
    const event = { type: "open-draft" as const, wave: 8, roll: () => [normal("a"), special("s")] };
    const left = transitionRewardSelection(original, event);
    const right = transitionRewardSelection(original, event);
    expect(left).toEqual(right);
    expect(original).toMatchObject({ phase: "idle", wave: 0, revision: 0 });
    expect(() => transitionRewardSelection(original, { type: "open-draft", wave: 0, roll: event.roll })).toThrow(RangeError);
    expect(() => transitionRewardSelection(original, { type: "open-draft", wave: 1, roll: () => [normal("1"), normal("2"), normal("3"), normal("4"), normal("5")] })).toThrow(RangeError);
  });
});

describe("reward selection rerolls", () => {
  it("consumes one charge, excludes discarded IDs, and replaces their special ledger contribution", () => {
    const controller = new RewardSelectionController<Choice>({ mode: "endless", rerolls: 2, specialBlock: 0, specialsOffered: 1 });
    controller.openDraft(8, queuedRoller([[special("old-special"), normal("old-a"), normal("old-b")]]).roll);
    const rerolled = queuedRoller([[special("new-special"), normal("new-a"), normal("new-b")]]);
    const result = controller.reroll(rerolled.roll);
    expect(rerolled.requests[0]).toEqual({ count: 3, forceSpecial: false, excludeIds: ["old-special", "old-a", "old-b"] });
    expect(result.snapshot).toMatchObject({ phase: "draft", rerolls: 1, specialsOffered: 2 });
    expect(result.snapshot.choices.map((choice) => choice.id)).toEqual(["new-special", "new-a", "new-b"]);
    expect(result.intents).toEqual([{ type: "reset-ui", enter: true, focus: true, scroll: false }]);
  });

  it("clamps ledger subtraction and makes insufficient/wrong-phase rerolls idempotent", () => {
    const controller = new RewardSelectionController<Choice>({ mode: "endless", rerolls: 1, specialBlock: 0 });
    controller.openDraft(8, queuedRoller([[special("s"), special("t")]]).roll);
    const reroll = queuedRoller([[normal("a")]]);
    expect(controller.reroll(reroll.roll).snapshot.specialsOffered).toBe(0);
    const exhausted = controller.snapshot();
    const unused = vi.fn(() => [normal("never")]);
    const noCharge = controller.reroll(unused);
    expect(noCharge.snapshot).toBe(exhausted);
    expect(noCharge.intents).toEqual([]);
    expect(unused).not.toHaveBeenCalled();

    const idle = new RewardSelectionController<Choice>({ mode: "endless", rerolls: 3 });
    const idleSnapshot = idle.snapshot();
    expect(idle.reroll(unused).snapshot).toBe(idleSnapshot);
    expect(unused).not.toHaveBeenCalled();
  });
});

describe("draft and reserve selection transitions", () => {
  it("applies a draft choice, opens reserve with every unselected card, and ignores duplicate selection", () => {
    const cards = [normal("a"), special("b"), normal("c")];
    const controller = new RewardSelectionController<Choice>({ mode: "endless", reservePick: true });
    controller.openDraft(1, queuedRoller([cards]).roll);
    const result = controller.selectDraft(1);
    expect(result.snapshot.phase).toBe("reserve");
    expect(result.snapshot.reserveChoices.map((choice) => choice.id)).toEqual(["a", "c"]);
    expect(intentTypes(result)).toEqual(["apply-upgrade", "ghost-loadout", "ghost-event", "consume-input", "set-screen", "reset-ui"]);
    const unchanged = controller.selectDraft(1);
    expect(unchanged.snapshot).toBe(result.snapshot);
    expect(unchanged.intents).toEqual([]);
  });

  it("finishes normal runs with the next-wave intent when reserve is disabled", () => {
    const controller = new RewardSelectionController<Choice>({ mode: "endless" });
    controller.openDraft(1, queuedRoller([[normal("a")]]).roll);
    const result = controller.selectDraft(0);
    expect(result.snapshot.phase).toBe("complete");
    expect(intentTypes(result)).toEqual([
      "apply-upgrade", "ghost-loadout", "ghost-event", "consume-input", "start-next-wave", "set-screen", "request-pointer",
    ]);
  });

  it("finishes when reserve is enabled but no unselected card remains", () => {
    const controller = new RewardSelectionController<Choice>({ mode: "endless", reservePick: true });
    controller.openDraft(1, queuedRoller([[normal("only")]]).roll);
    const result = controller.selectDraft(0);
    expect(result.snapshot.phase).toBe("complete");
    expect(result.snapshot.reserveChoices).toEqual([]);
    expect(intentTypes(result)).toContain("start-next-wave");
  });

  it.each(["tutorial", "playground"] as const)("never starts a wave or opens reserve in %s", (mode) => {
    const controller = new RewardSelectionController<Choice>({ mode, reservePick: true });
    controller.openDraft(1, queuedRoller([[normal("a"), normal("b")]]).roll);
    const result = controller.selectDraft(0);
    expect(result.snapshot.phase).toBe("complete");
    expect(intentTypes(result)).not.toContain("start-next-wave");
    expect(intentTypes(result)).not.toContain("set-screen-reserve");
    expect(result.intents.at(-2)).toEqual({ type: "set-screen", screen: "playing" });
  });

  it("preserves legacy invalid-choice behavior: consume input and return to the run without applying", () => {
    const controller = new RewardSelectionController<Choice>({ mode: "endless", reservePick: true });
    controller.openDraft(1, queuedRoller([[normal("a"), normal("b")]]).roll);
    const result = controller.selectDraft(99);
    expect(result.snapshot.phase).toBe("complete");
    expect(intentTypes(result)).toEqual(["consume-input", "start-next-wave", "set-screen", "request-pointer"]);
  });

  it("selects, skips, and rejects reserve cards with exact next-draft replacement semantics", () => {
    const selected = new RewardSelectionController<Choice>({ mode: "endless", reservePick: true });
    selected.openDraft(1, queuedRoller([[normal("a"), normal("b"), normal("c")]]).roll);
    selected.selectDraft(0);
    const reserveResult = selected.selectReserve(1);
    expect(reserveResult.snapshot.reservedChoice?.id).toBe("c");
    expect(reserveResult.snapshot.reserveChoices).toEqual([]);
    expect(intentTypes(reserveResult)).toEqual(["consume-input", "start-next-wave", "set-screen", "request-pointer"]);
    const nextRoll = queuedRoller([[normal("x"), special("s"), normal("y")]]);
    expect(selected.openDraft(2, nextRoll.roll).snapshot.choices.map((choice) => choice.id)).toEqual(["x", "s", "c"]);

    for (const index of [-1, 999]) {
      const skipped = new RewardSelectionController<Choice>({ mode: "endless", reservePick: true });
      skipped.openDraft(1, queuedRoller([[normal("a"), normal("b")]]).roll);
      skipped.selectDraft(0);
      expect(skipped.selectReserve(index).snapshot.reservedChoice).toBeNull();
    }
  });

  it("makes repeated reserve actions idempotent", () => {
    const controller = new RewardSelectionController<Choice>({ mode: "endless", reservePick: true });
    controller.openDraft(1, queuedRoller([[normal("a"), normal("b")]]).roll);
    controller.selectDraft(0);
    const complete = controller.selectReserve(0);
    const duplicate = controller.selectReserve(0);
    expect(duplicate.snapshot).toBe(complete.snapshot);
    expect(duplicate.intents).toEqual([]);
  });
});

describe("tier eligibility and selection", () => {
  const catalogue = [
    normal("stack", "utility"), special("maxed", "throw", 2), special("open", "offense", 2), special("zero-owned", "parry", 1),
  ];

  it("matches legacy owned/tier eligibility and category ordering", () => {
    const eligible = eligibleTierChoices(catalogue, { stack: 2, maxed: 1, open: 1, "zero-owned": 0, missing: 1 }, {
      maxed: 3, open: 2,
    });
    expect(eligible.map((choice) => choice.id)).toEqual(["open", "zero-owned"]);
    expect(Object.isFrozen(eligible)).toBe(true);
  });

  it("opens the tier screen and applies an eligible choice before returning to a normal run", () => {
    const controller = new RewardSelectionController<Choice>({ mode: "campaign" });
    const choices = eligibleTierChoices(catalogue, { open: 1 }, { open: 1 });
    const opened = controller.openTierUp(choices);
    expect(opened.snapshot.phase).toBe("tierup");
    expect(intentTypes(opened)).toEqual(["set-screen", "reset-ui"]);
    const selected = controller.selectTierUp(0);
    expect(intentTypes(selected)).toEqual([
      "tier-up", "ghost-loadout", "ghost-event", "consume-input", "start-next-wave", "set-screen", "request-pointer",
    ]);
    const duplicate = controller.selectTierUp(0);
    expect(duplicate.snapshot).toBe(selected.snapshot);
    expect(duplicate.intents).toEqual([]);
  });

  it("finishes invalid and training tier selections without mutation or a new wave", () => {
    const invalid = new RewardSelectionController<Choice>({ mode: "endless" });
    invalid.openTierUp([special("a")]);
    expect(intentTypes(invalid.selectTierUp(9))).toEqual(["consume-input", "start-next-wave", "set-screen", "request-pointer"]);

    const training = new RewardSelectionController<Choice>({ mode: "playground" });
    training.openTierUp([special("a")]);
    const result = training.selectTierUp(0);
    expect(intentTypes(result)).toEqual(["tier-up", "ghost-loadout", "ghost-event", "consume-input", "set-screen", "request-pointer"]);
  });
});
