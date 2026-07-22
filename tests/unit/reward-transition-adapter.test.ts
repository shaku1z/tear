import { describe, expect, it, vi } from "vitest";

import { executeRewardTransition } from "../../src/app/reward-transition-adapter";
import type { RewardSelectionTransition } from "../../src/gameplay/run/reward-selection";

describe("legacy reward transition adapter", () => {
  it("synchronizes the run ledger before dispatching ordered semantic intents", () => {
    const choice = { id: "power" };
    const transition = {
      snapshot: {
        phase: "complete", mode: "endless", wave: 4, choices: [choice], reserveChoices: [], reservedChoice: choice,
        expandedDraft: false, reservePick: true, rerolls: 2, specialBlock: 1, specialsOffered: 3, revision: 1,
      },
      intents: [
        { type: "apply-upgrade", choice },
        { type: "ghost-loadout", choiceId: "power", event: "pickup" },
        { type: "set-screen", screen: "playing" },
        { type: "request-pointer" },
      ],
    } satisfies RewardSelectionTransition<typeof choice>;
    const run = { wave: 4, specialBlock: -1, specialsOffered: 0, reservedUpgrade: null,
      mods: { draftRerolls: 0, tier: { power: 2 } } };
    const order: string[] = [];
    executeRewardTransition(transition, run, {
      applyUpgrade: () => order.push("apply"), tierUp: vi.fn(),
      ghostLoadout: (_id, tier, wave) => order.push(`loadout:${String(tier)}:${String(wave)}`),
      ghostEvent: vi.fn(), consumeInput: vi.fn(), resetUi: vi.fn(),
      setScreen: (screen) => order.push(`screen:${screen}`), startNextWave: vi.fn(),
      requestPointer: () => order.push("pointer"),
    });
    expect(run).toMatchObject({ specialBlock: 1, specialsOffered: 3, reservedUpgrade: choice, mods: { draftRerolls: 2 } });
    expect(order).toEqual(["apply", "loadout:2:4", "screen:playing", "pointer"]);
  });
});
