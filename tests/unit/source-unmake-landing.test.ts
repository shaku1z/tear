/**
 * The Source Unmake landing test (plans/active/CINEMATICS_OVERHAUL.md, PR 4).
 *
 * On 2026-11-20 a playtest fight (Riftlock, seed 1, the tell-avoiding player) never ended: after the void
 * descent the player fell below the arena forever. The descent is now the Unmake, a move in the fight. This
 * test replays a Riftlock fight with that player on the production headless game and requires two things of it:
 * - after the floor goes, the player lands on a void platform before the void run starts;
 * - from then on the player is never below the void stream: a fall is always caught by the stream's rescue,
 *   which lifts a player who drops past the bottom of the screen back onto a platform.
 *
 * The fight is pinned to seed 3. Seed 1 was the 2026-11-20 fight; from ruleset v24 (the full-speed arrival,
 * plans/active/CINEMATICS_OVERHAUL.md, PR 6) its player dies in Phase I and never sees the Unmake. Of seeds
 * 1-12 on v24, 3, 4, 6, 9 and 10 meet every check here. 2 and 11 go 32 and 41 px below the rescue line,
 * past the bound below, before the rescue lifts them, and 7, 8 and 11 land after the void run starts; that
 * gap is open (PR 6's description). In none does the player fall forever.
 */
import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { agentView, bossFightScenario } from "../../src/playtest/boss-fight";
import { createBossPlayer } from "../../src/playtest/boss-player";
import { readBoss, readPlayerBox } from "../../src/playtest/boss-view";
import { createProductionHeadlessEnvironment } from "../../src/playtest/headless/production-headless-environment";
import { TEAR_SIMULATION_TICKS_PER_SECOND } from "../../src/tearbench/simulation-profile";

const TICKS = TEAR_SIMULATION_TICKS_PER_SECOND;
const FIGHT_LIMIT_TICKS = 120 * TICKS;
/** The floor goes this many ticks after the Unmake's first tick, and the void run starts this many after it. */
const DISSOLVE_TICKS = Math.round(CONFIG.source.unmakeDissolve * TICKS);
const CHANNEL_TICKS = Math.round(CONFIG.source.unmakeChannel * TICKS);
/**
 * The lowest the player's centre may be: the stream's rescue line (the bottom of the screen plus 70 px, in
 * arena-rules.ts `updateHazards`) and one tick of the fastest fall past it, before the rescue applies.
 */
const LOWEST_PLAYER_Y = CONFIG.view.h + 70 + CONFIG.player.maxFall / TICKS + 1;

interface RawPlayer {
  x: number;
  y: number;
  hh: number;
  hp: number;
  onGround: boolean;
  supportPlatform?: { void?: boolean } | null;
}
interface RawBoss {
  isBoss?: boolean;
  mode?: string;
}

interface UnmakeRecord {
  /** The first tick the Source is in its Unmake, the first with a void stream, and the first of the void run. */
  unmakeTick: number | null;
  dissolveTick: number | null;
  voidRunTick: number | null;
  /** The first tick the player stands on a void platform. */
  landedTick: number | null;
  lowestY: number;
  lowestTick: number;
  streamMissingTicks: number;
  watchedTicks: number;
  end: string;
}

function replayRiftlockFight(): UnmakeRecord {
  const environment = createProductionHeadlessEnvironment();
  const request = {
    boss: "source",
    difficulty: "normal",
    weapon: "riftlock",
    seed: "3",
    player: "avoids-tells",
    maxTicks: FIGHT_LIMIT_TICKS,
  } as const;
  const player = createBossPlayer(request.player);
  const record: UnmakeRecord = {
    unmakeTick: null,
    dissolveTick: null,
    voidRunTick: null,
    landedTick: null,
    lowestY: -Infinity,
    lowestTick: -1,
    streamMissingTicks: 0,
    watchedTicks: 0,
    end: "time limit",
  };
  let seen = false;
  try {
    environment.reset(bossFightScenario(request));
    for (let tick = 0; tick < FIGHT_LIMIT_TICKS; tick += 1) {
      const { state, ui } = agentView(environment, request.weapon);
      environment.step(player.decide({ state, ui }, readBoss(environment.world()), readPlayerBox(environment.world())));
      const world = environment.world();
      const body = world.player() as RawPlayer | undefined;
      const boss = (world.enemies() as readonly RawBoss[]).find((enemy) => enemy.isBoss === true);
      const view = readBoss(world);
      if (body === undefined || body.hp <= 0) {
        record.end = "player defeated";
        break;
      }
      if (boss === undefined || view === null) {
        if (!seen) continue;
        record.end = "boss gone";
        break;
      }
      seen = true;
      if (view.dead || view.phase >= 3) {
        record.end = view.dead ? "boss defeated" : "phase III";
        break;
      }
      const run = world.run() as { voidScroll?: unknown } | undefined;
      if (record.unmakeTick === null && boss.mode === "collapse") record.unmakeTick = tick;
      if (record.unmakeTick === null) continue;
      if (record.dissolveTick === null && run?.voidScroll != null) record.dissolveTick = tick;
      if (record.dissolveTick === null) continue;
      if (record.voidRunTick === null && boss.mode === "void") record.voidRunTick = tick;
      record.watchedTicks += 1;
      if (record.landedTick === null && body.onGround && body.supportPlatform?.void === true) record.landedTick = tick;
      if (run?.voidScroll == null) record.streamMissingTicks += 1;
      if (body.y > record.lowestY) {
        record.lowestY = body.y;
        record.lowestTick = tick;
      }
    }
    return record;
  } finally {
    environment.dispose();
  }
}

describe(
  "the Source's Unmake: the player lands on the void stream and never falls below it",
  { timeout: 120_000 },
  () => {
    const record = replayRiftlockFight();
    const detail = JSON.stringify(record);

    it("plays the Unmake on its clock in the fight, and Phase II on past the void run's start", () => {
      const unmake = record.unmakeTick ?? Number.NaN;
      // The Unmake's first step comes one tick after the phase change, so each mark lands one tick later.
      expect((record.dissolveTick ?? Number.NaN) - unmake, detail).toBe(DISSOLVE_TICKS + 1);
      expect((record.voidRunTick ?? Number.NaN) - unmake, detail).toBe(CHANNEL_TICKS + 1);
      expect(record.watchedTicks, detail).toBeGreaterThan(CHANNEL_TICKS);
    });

    it("lands the player on a void platform after the floor goes, before the void run starts", () => {
      expect(record.landedTick, detail).not.toBeNull();
      expect(record.landedTick ?? Infinity, detail).toBeLessThanOrEqual(record.voidRunTick ?? Number.NaN);
    });

    it("keeps the stream under the player from the floor's release on, and never lets the player below it", () => {
      expect(record.streamMissingTicks, detail).toBe(0);
      expect(record.lowestY, detail).toBeLessThanOrEqual(LOWEST_PLAYER_Y);
    });
  },
);
