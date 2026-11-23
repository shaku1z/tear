/**
 * A desktop REPLAYS row's actions (REPLAY_ROW_ACTIONS in src/presentation/screens/profile-achievements.ts):
 * every action a row can offer sits on the row's card, inside the action column, and no two overlap.
 * DOWNLOAD once hung below the card.
 */
import { describe, expect, it } from "vitest";

import { REPLAY_ROW_ACTIONS } from "../../src/presentation/screens/profile-achievements";
import { replayRowActions } from "../../src/presentation/screens/profile-replay-list";

describe("a REPLAYS row's actions", () => {
  it("all fit on the row's card, in the action column, without overlapping", () => {
    const offered = replayRowActions({ id: "r", canDownload: true, canShare: true } as never).map((row) => row.id);
    expect(offered).toEqual(["watch", "pin", "share", "download", "delete"]);
    const slots = offered.map((id) => REPLAY_ROW_ACTIONS.slots[id]);
    for (const slot of slots) {
      expect(slot.y).toBeGreaterThanOrEqual(0);
      expect(slot.y + slot.h).toBeLessThanOrEqual(REPLAY_ROW_ACTIONS.cardHeight);
      expect(slot.x).toBeGreaterThanOrEqual(0);
      expect(slot.x + slot.w).toBeLessThanOrEqual(REPLAY_ROW_ACTIONS.width);
    }
    const ordered = [...slots].sort((a, b) => a.x - b.x);
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1],
        current = ordered[index];
      if (previous === undefined || current === undefined) throw new Error("slot missing");
      expect(current.x).toBeGreaterThanOrEqual(previous.x + previous.w);
    }
  });
});
