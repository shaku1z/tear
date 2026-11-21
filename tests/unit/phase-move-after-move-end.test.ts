/**
 * A phase change ends the live move (`endMove("phase")`, plans/active/VERDANT_PALE_REBUILD.md 5.1) without
 * ending the phase's own move. The step runs `noticePhase()` before the update, so the old move ends first
 * and the update's phase entry then starts the phase move: the Colossus's saw throw and the Warden's
 * slam (plans/active/CINEMATICS_OVERHAUL.md, PR 2).
 *
 * Each boss is stepped through the production step (tests/unit/move-visual-harness.ts) until a move of
 * its own is live, then its health is set under its first phase mark. The phase move must be the live
 * move on that tick and must land. A planted fault, ending the move after the update instead, makes it
 * fail.
 */
import { describe, expect, it } from "vitest";

import { DT, createBossSubject } from "./move-visual-harness";

const PHASE_MOVES = [
  { boss: "colossus", pendingAtk: "saw", lands: "_throwShield" },
  { boss: "warden", pendingAtk: "phaseSlam", lands: "_phaseSlam" },
] as const;

/** How long a boss may take to start a move of its own, and then to land its phase move. */
const WAIT_SECONDS = 20;
const LAND_SECONDS = 3;

interface PhaseEntry {
  readonly before: Readonly<{ move: string | null; pendingAtk: unknown }>;
  readonly onPhaseTick: Readonly<{ phase: number; move: string | null; pendingAtk: unknown }>;
  readonly landed: number;
}

function enterPhaseTwoMidMove(entry: (typeof PHASE_MOVES)[number], endAfterUpdate = false): PhaseEntry {
  const subject = createBossSubject(entry.boss);
  const boss = subject.entity as typeof subject.entity &
    Record<string, unknown> & { pendingAtk?: unknown; practicePhaseEntry(): { phase: number } };
  let landed = 0;
  const land = boss[entry.lands];
  if (typeof land !== "function") throw new Error(`${entry.boss} has no ${entry.lands}`);
  boss[entry.lands] = function (this: unknown, ...args: unknown[]) {
    landed += 1;
    return (land as (...values: unknown[]) => unknown).apply(this, args);
  };
  let tick = 0;
  while ((boss.liveMove() === null || boss.stun > 0) && tick < WAIT_SECONDS / DT) subject.step(tick++);
  const before = { move: boss.liveMove(), pendingAtk: boss.pendingAtk };
  boss.hp = boss.maxHp * ((subject.phaseMarks[0] ?? 0) - 0.02);
  subject.step(tick++);
  if (endAfterUpdate) boss.endMove("phase");
  const onPhaseTick = { phase: boss.practicePhaseEntry().phase, move: boss.liveMove(), pendingAtk: boss.pendingAtk };
  for (let i = 0; i < LAND_SECONDS / DT && landed === 0; i += 1) subject.step(tick++);
  return { before, onPhaseTick, landed };
}

describe("a phase change ends the old move, not the phase's own", () => {
  describe.each(PHASE_MOVES)("$boss", (entry) => {
    it(`starts ${entry.pendingAtk} on the phase tick, over the move it was in, and lands it`, () => {
      const { before, onPhaseTick, landed } = enterPhaseTwoMidMove(entry);
      expect(before.move, "the boss was in a move of its own when the mark was crossed").not.toBeNull();
      expect(before.pendingAtk).not.toBe(entry.pendingAtk);
      expect(onPhaseTick).toEqual({ phase: 2, move: "windup", pendingAtk: entry.pendingAtk });
      expect(landed).toBe(1);
    });

    it("fails on a planted fault: the move is ended after the update has started the phase move", () => {
      const { onPhaseTick, landed } = enterPhaseTwoMidMove(entry, true);
      expect(onPhaseTick.move).toBeNull();
      expect(landed).toBe(0);
    });
  });
});
