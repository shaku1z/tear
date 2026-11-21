/**
 * The run's seed varies the headless player.
 * A boss that draws no random numbers played every seed the same, so six seeds were one sample (found measuring
 * the new Rootbound against Aldric and the Colossus, 2026-11-21). The seed now also draws the player's opening
 * step and its reaction delay, one definition for every kind of player.
 */
import { describe, expect, it } from "vitest";

import type { TearAgentObservation } from "../../src/agents/contracts";
import type { GameAction } from "../../src/input/game-action";
import { playBossFight, type BossFightRequest } from "../../src/playtest/boss-fight";
import { BOSS_PLAYER_IDS, createBossPlayer, type BossPlayer } from "../../src/playtest/boss-player";
import { createSeededPlayer, PLAYER_VARIATION, withSeedVariation } from "../../src/playtest/player-variation";

const SEEDS = ["1", "2", "3", "4", "5", "6"];

/** What a player sees at a tick: standing at `x`, on the playing screen unless told otherwise. */
function seen(tick: number, x: number, screen = "playing"): TearAgentObservation {
  return { state: { tick, player: { x } }, ui: { screen } } as unknown as TearAgentObservation;
}

/** A player that decides something new every tick it is asked, so a held decision shows. */
function counting(): BossPlayer & { asked: number } {
  const player = {
    id: "scripted" as const,
    asked: 0,
    decide(): readonly GameAction[] {
      player.asked += 1;
      return [
        { type: "move", x: 1000, y: 0 },
        { type: "aim", turn: player.asked },
      ];
    },
  };
  return player;
}

/** The aim of each tick's actions: the number of the decision being played. */
function decisions(seed: string, ticks: number, x = (tick: number) => tick * 1000): number[] {
  const player = withSeedVariation(counting(), seed);
  return Array.from({ length: ticks }, (_, tick) => {
    const aim = player.decide(seen(tick, x(tick)), null, null).find((action) => action.type === "aim");
    return aim?.type === "aim" ? aim.turn : -1;
  });
}

describe("the seed's variation of a headless player", () => {
  it("is the same for a seed every time, and differs between seeds", () => {
    for (const seed of SEEDS) expect(decisions(seed, 600)).toEqual(decisions(seed, 600));
    expect(new Set(SEEDS.map((seed) => decisions(seed, 600).join(","))).size).toBe(SEEDS.length);
  });

  it.each(SEEDS)("seed %s holds a decision for no more than the stated delay", (seed) => {
    const played = decisions(seed, 2000);
    let longest = 0;
    let run = 0;
    played.forEach((decision, index) => {
      run = decision === played[index - 1] ? run + 1 : 0;
      longest = Math.max(longest, run);
    });
    expect(longest).toBeLessThanOrEqual(PLAYER_VARIATION.reactionDelayTicks);
    // It does hold some: the delay is not always nothing.
    expect(longest).toBeGreaterThan(0);
  });

  it.each(SEEDS)(
    "seed %s steps aside at the start, no further and no longer than stated, and keeps its other inputs",
    (seed) => {
      // The player never moves (the game is holding it): the step gives up at its time limit.
      const held = withSeedVariation(counting(), seed);
      const sides = Array.from({ length: 200 }, (_, tick) => {
        const actions = held.decide(seen(tick, 500), null, null);
        expect(actions.filter((action) => action.type === "move")).toHaveLength(1);
        expect(actions.some((action) => action.type === "aim")).toBe(true);
        const move = actions.find((action) => action.type === "move");
        return move?.type === "move" ? move.x : 0;
      });
      // The counting player always walks right (+1000); while stepping, the walk is to the drawn side.
      const side = sides[0];
      const stepped = sides.findIndex((x, tick) => tick > 0 && x === 1000 && side !== 1000);
      if (side !== 1000) expect(stepped).toBeLessThanOrEqual(PLAYER_VARIATION.startStepLimitTicks + 1);
      // A player that does move stops stepping once it is the drawn distance from where it stood.
      const moving = withSeedVariation(counting(), seed);
      let x = 500;
      for (let tick = 0; tick < 200; tick += 1) {
        const move = moving.decide(seen(tick, x), null, null).find((action) => action.type === "move");
        if (side !== 1000 && move?.type === "move" && move.x === side) x += Math.sign(side) * 3;
      }
      expect(Math.abs(x - 500)).toBeLessThanOrEqual(PLAYER_VARIATION.startOffsetPixels + 3);
    },
  );

  it("decides at once outside play: a draft choice is never held over", () => {
    const inner = counting();
    const player = withSeedVariation(inner, "1");
    for (let tick = 0; tick < 50; tick += 1) player.decide(seen(tick, 500, "draft"), null, null);
    expect(inner.asked).toBe(50);
  });

  it("is one definition over every kind of player", () => {
    for (const id of BOSS_PLAYER_IDS) {
      const plain = createBossPlayer(id);
      const seeded = createSeededPlayer(id, "1");
      expect(seeded.id).toBe(id);
      expect(seeded.phaseTicks).toBe(plain.phaseTicks);
    }
  });
});

describe("six seeds against a boss that draws no random numbers", () => {
  const fight = (seed: string): BossFightRequest => ({
    boss: "aldric",
    difficulty: "normal",
    weapon: "sword",
    seed,
    player: "scripted",
    // Ten seconds of the fight: enough for six players to part ways.
    maxTicks: 1200,
  });
  const measured = (request: BossFightRequest, player?: BossPlayer): string =>
    JSON.stringify(playBossFight(request, player).phases);

  it(
    "were one fight six times with the plain player, and are six fights with the seeded one",
    () => {
      const plain = new Set(SEEDS.map((seed) => measured(fight(seed), createBossPlayer("scripted"))));
      expect(plain.size).toBe(1);
      const seeded = SEEDS.map((seed) => measured(fight(seed)));
      expect(new Set(seeded).size).toBe(SEEDS.length);
      // The same seed is the same fight again.
      expect(measured(fight("3"))).toBe(seeded[2]);
    },
    // The verdict is in ticks (thirteen fights of 1,200). This only stops a hang.
    120_000,
  );
});
