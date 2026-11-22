/**
 * The new Rootbound's lingering bramble is fair in the one way no headless player can miss (plans/active/
 * VERDANT_PALE_REBUILD.md 2.4): no patch becomes live under the player without its whole tell. Over the twelve
 * seeds of the pace tables, from each phase, the test watches the boss's declared tells. At the tick a patch
 * first appears, the player's position is recorded with how long the patch has left to grow. A patch that
 * started on the player with less than the shared tell minimum to leave would be unfair; there must be none.
 */
import { describe, expect, it } from "vitest";

import { BOSS_TELL_MIN_LEAD_SECONDS, type BossTell } from "../../src/gameplay/entities/boss-tells";
import { playBossFight } from "../../src/playtest/boss-fight";
import type { BossPlayer } from "../../src/playtest/boss-player";
import { createSeededPlayer } from "../../src/playtest/player-variation";

const SEEDS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const TICKS_PER_SECOND = 120;
const MIN_LEAD_TICKS = Math.ceil(BOSS_TELL_MIN_LEAD_SECONDS.normal * TICKS_PER_SECOND);
/** Each fight is played this long from the phase it starts in: long enough for every patch source to fire. */
const FIGHT_TICKS = 30 * TICKS_PER_SECOND;

interface PatchStart {
  readonly onPlayer: boolean;
  /** Ticks it had left to grow when it first appeared; a patch is seen at most one tick after it starts. */
  readonly leadTicks: number;
}

const isPatch = (tell: BossTell) => tell.id.startsWith("bramble-patch");

/** The tell-avoiding player, recording each patch the tick it first appears. */
function watching(seed: string, starts: PatchStart[]): BossPlayer {
  const player = createSeededPlayer("avoids-tells", seed);
  let standing = new Set<number>();
  return {
    ...player,
    decide(observation, boss, box) {
      const patches = boss?.tells.filter(isPatch) ?? [];
      for (const tell of patches) {
        // A renewed patch keeps its place, so only a new place is a new patch.
        if (standing.has(tell.x) || box === null) continue;
        starts.push({
          onPlayer: Math.abs(box.x - tell.x) < tell.hw + box.hw,
          leadTicks: tell.stage === "warning" ? Math.round(tell.remainingSeconds * TICKS_PER_SECOND) + 1 : 0,
        });
      }
      standing = new Set(patches.map((tell) => tell.x));
      return player.decide(observation, boss, box);
    },
  };
}

describe("lingering bramble never goes live under the player without its whole tell", () => {
  it.each([1, 2, 3])(
    "from Phase %i, on twelve seeds",
    (phase) => {
      const starts: PatchStart[] = [];
      for (const seed of SEEDS) {
        const fight = playBossFight(
          {
            boss: "rootbound-rebuild",
            difficulty: "normal",
            weapon: "sword",
            seed,
            player: "avoids-tells",
            phase,
            maxTicks: FIGHT_TICKS,
          },
          watching(seed, starts),
        );
        expect(fight.end, fight.reason).not.toBe("broken");
      }
      // Patches grew, some of them on the player (the Surface Strike comes up under it), and each with its tell.
      expect(starts.length).toBeGreaterThan(SEEDS.length);
      expect(starts.filter((start) => start.onPlayer).length).toBeGreaterThan(0);
      const unfair = starts.filter((start) => start.onPlayer && start.leadTicks < MIN_LEAD_TICKS);
      expect(unfair).toEqual([]);
    },
    120_000,
  );
});
