import { SeededRandom } from "../domain/random";
import { INPUT_AXIS_SCALE, type GameAction } from "../input/game-action";
import { createBossPlayer, type BossPlayer, type BossPlayerId } from "./boss-player";

/**
 * How a run's seed varies the headless player itself.
 *
 * The seed used to vary only the game's own random draws. A boss that draws none (Aldric, the Colossus, the new
 * Rootbound) then played every seed tick for tick the same, and a sweep over six seeds was one sample. So the
 * seed also varies two things about the player, for every kind of player, through its inputs only: nothing here
 * moves the player or edits the world.
 */
export const PLAYER_VARIATION = Object.freeze({
  /**
   * The player opens by stepping up to this far (px) to one side of where the game put it. 80 px is under a
   * quarter of the smallest gap a boss keeps from the player when it arrives (360 px), so no fight starts inside
   * the boss's reach, and it is wider than a boss's body moves in its opening second.
   */
  startOffsetPixels: 80,
  /** The opening step ends after this many ticks (0.5 s) wherever the player is: the game may be holding it. */
  startStepLimitTicks: 60,
  /**
   * After each decision the player holds it for 0 to this many ticks before it decides again. 6 ticks is 50 ms,
   * three frames of the browser player, and a third of the window in which the tell-avoiding player still spends
   * its dash (18 ticks): a player this late still avoids what it avoided on time, so it is the same player.
   */
  reactionDelayTicks: 6,
});

/**
 * The same player with its opening step and its reaction delay drawn from the seed. The draws come from their own
 * named stream, so they take nothing from the game's streams, and a seed gives the same player every time.
 * Outside play (a draft, a menu) the player decides at once: a choice held over would be made twice.
 */
export function withSeedVariation(player: BossPlayer, seed: string): BossPlayer {
  const random = new SeededRandom(`${seed}::playtest-player`);
  const offset = Math.round((random.next() * 2 - 1) * PLAYER_VARIATION.startOffsetPixels);
  const side = Math.sign(offset) * INPUT_AXIS_SCALE;
  let startX: number | undefined;
  let stepTicks = 0;
  let stepping = offset !== 0;
  let held: readonly GameAction[] = [];
  let holdTicks = 0;
  return {
    ...player,
    decide(observation, boss, box) {
      if (observation.ui?.screen !== "playing") {
        holdTicks = 0;
        return player.decide(observation, boss, box);
      }
      if (holdTicks > 0) holdTicks -= 1;
      else {
        held = player.decide(observation, boss, box);
        holdTicks = Math.floor(random.next() * (PLAYER_VARIATION.reactionDelayTicks + 1));
      }
      if (!stepping) return held;
      const x = observation.state.player.x;
      startX ??= x;
      stepTicks += 1;
      stepping = Math.abs(x - startX) < Math.abs(offset) && stepTicks <= PLAYER_VARIATION.startStepLimitTicks;
      // The step replaces only where the player walks: it still attacks, jumps and dashes as it decided.
      return stepping ? [{ type: "move", x: side, y: 0 }, ...held.filter((action) => action.type !== "move")] : held;
    },
  };
}

/** The player a report plays with: the named kind, varied by the run's seed. */
export function createSeededPlayer(id: BossPlayerId, seed: string): BossPlayer {
  return withSeedVariation(createBossPlayer(id), seed);
}
