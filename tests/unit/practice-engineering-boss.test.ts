/**
 * A boss that is still being rebuilt (engineering only) and the game's boss phase practice.
 * A headless world opens one at a chosen phase, through the practice a published boss uses. Nothing a player
 * reaches lists one or opens one: not the Practice list, not the Codex, not a saved selection edited by hand.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { ENGINEERING_ONLY_BOSS_IDS } from "../../src/gameplay/run/boss-definitions";
import { BOSS_ROSTER } from "../../src/gameplay/run/content-director";
import {
  createBossPhasePracticeRuntime,
  isPracticeBossId,
  validateBossPhasePracticeState,
} from "../../src/gameplay/training/boss-phase-practice-runtime";
import { practiceBossCatalog, validatePracticeBoss } from "../../src/gameplay/training/practice-boss-catalog";
import { bossPhaseCount, playBossFight } from "../../src/playtest/boss-fight";
import { opensHeadlessPractice } from "../../src/playtest/headless/production-boss-practice-start";
import { publishedBestiaryEntries } from "../../src/presentation/bestiary-catalog";

/** A practice selection as a save would hold it, for a boss the player has met in this phase. */
function savedSelection(bossId: string, phase: 2 | 3) {
  return {
    bossId,
    phase,
    knowledge: "encountered-phase",
    defeated: false,
    runtime: {
      version: 1,
      bossId,
      phase,
      seed: "1",
      generation: 1,
      encounterId: `boss-practice:1:${bossId}:${String(phase)}:1`,
      lifecycle: "preparing",
      setupStage: "opening",
      enteredPhase: 1,
      entryStage: "opening",
      pendingPhase: null,
    },
  };
}

describe("an engineering-only boss and boss phase practice", () => {
  it("has at least one boss to speak of, and none of them is published", () => {
    expect(ENGINEERING_ONLY_BOSS_IDS.length).toBeGreaterThan(0);
    for (const boss of ENGINEERING_ONLY_BOSS_IDS) expect(BOSS_ROSTER.map(({ id }): string => id)).not.toContain(boss);
  });

  describe.each(ENGINEERING_ONLY_BOSS_IDS)("%s, where a player can reach", (boss) => {
    it("is not in the Practice list, whatever the profile has met or defeated", () => {
      const everything = practiceBossCatalog(() => 1);
      expect(everything.length).toBeGreaterThan(0);
      expect(everything.map((entry): string => entry.bossId)).not.toContain(boss);
      expect(everything.some((entry) => entry.id.startsWith(`${boss}:`))).toBe(false);
    });

    it("is not in the Codex", () => {
      expect(JSON.stringify(publishedBestiaryEntries())).not.toContain(`"${boss}"`);
    });

    it("is refused by the practice a released world builds, and creates no encounter", () => {
      let created = 0;
      const released = createBossPhasePracticeRuntime({
        createEncounter: () => {
          created += 1;
        },
        observe: () => null,
        cleanup: () => undefined,
      });
      expect(released.begin({ bossId: boss as never, phase: 2, seed: "1" })).toEqual({
        status: "refused",
        reason: "invalid-request",
      });
      expect(created).toBe(0);
    });

    it("is refused as a saved selection, also as a copy of a state a headless world accepted", () => {
      expect(isPracticeBossId(boss)).toBe(false);
      const saved = savedSelection(boss, 2);
      expect(() => validatePracticeBoss(saved)).toThrow();
      // A headless world's own state stays valid as that object. What a save holds is a copy, and is refused.
      const accepted = validateBossPhasePracticeState(saved.runtime, undefined, opensHeadlessPractice);
      expect(() => validateBossPhasePracticeState(structuredClone(accepted))).toThrow();
      expect(() => validatePracticeBoss({ ...saved, runtime: structuredClone(accepted) })).toThrow();
    });
  });

  it("is opened only by the headless tool: no other source gives a world a wider practice", () => {
    // The released game builds its practice in the shell; it names no admission, so it has the published roster.
    expect(readFileSync("src/app/shell/game-runtime.ts", "utf8")).not.toContain("practiceBosses");
    expect(readFileSync("src/app/training/training-host.ts", "utf8")).not.toContain("practiceBosses");
  });

  // Every engineering-only boss at every later phase its definition has: a new rebuild is covered with no edit.
  const entries = ENGINEERING_ONLY_BOSS_IDS.flatMap((boss) =>
    Array.from({ length: bossPhaseCount(boss) - 1 }, (_, index) => [boss, index + 2] as const),
  );
  it.each(entries)(
    "headless, %s starts a measured fight in phase %i",
    (boss, phase) => {
      const fight = playBossFight({
        boss,
        difficulty: "normal",
        weapon: "sword",
        seed: "5",
        player: "scripted",
        phase,
        maxTicks: 600,
      });
      expect(fight.reason).toBeUndefined();
      expect(fight.end).not.toBe("broken");
      expect(fight.setupTicks).toBeGreaterThan(0);
      expect(fight.phases[0]?.phase).toBe(phase);
    },
    // The verdict is in ticks (600 of fight after the game's own setup). This only stops a hang.
    120_000,
  );
});
