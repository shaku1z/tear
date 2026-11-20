import { describe, expect, it } from "vitest";

import type { GameAction } from "../../src/input/game-action";
import {
  bossFightScenario,
  playBossFight,
  type BossFightRequest,
  type BossFightResult,
} from "../../src/playtest/boss-fight";
import { createBossPlayer, type BossPlayer } from "../../src/playtest/boss-player";
import { createProductionHeadlessEnvironment } from "../../src/playtest/headless/production-headless-environment";

/** What the test reads of the boss, straight from the game's own actor and not through the tool. */
interface RawBoss {
  readonly isBoss?: boolean;
  readonly hp: number;
  readonly x: number;
}

/** One simulation tick as the game showed it: health and the boss's place before and after the step. */
interface TickEvent {
  readonly counted: boolean;
  readonly playerBefore: number;
  readonly playerAfter: number;
  readonly bossBefore: number;
  readonly bossAfter: number;
  readonly xBefore: number;
  readonly xAfter: number;
}

const SITUATIONS = [
  { boss: "rootbound", player: "still", seed: "1" },
  { boss: "warden", player: "walker", seed: "2" },
  { boss: "colossus", player: "no-dodge", seed: "1" },
] as const;

function requestOf(situation: (typeof SITUATIONS)[number]): BossFightRequest {
  return { ...situation, difficulty: "normal", weapon: "sword", maxTicks: 1200 };
}

/** Plays the fight with the tool and keeps the actions its player gave, tick by tick. */
function playAndRecord(request: BossFightRequest): { result: BossFightResult; actions: readonly GameAction[][] } {
  const inner = createBossPlayer(request.player);
  const actions: GameAction[][] = [];
  const recording: BossPlayer = {
    id: inner.id,
    ...(inner.phaseTicks === undefined ? {} : { phaseTicks: inner.phaseTicks }),
    decide(observation, boss, player) {
      const given = [...inner.decide(observation, boss, player)];
      actions.push(given);
      return given;
    },
  };
  return { result: playBossFight(request, recording), actions };
}

/** Gives the game the same actions again and writes down every tick, reading the game's actors directly. */
function eventList(request: BossFightRequest, actions: readonly GameAction[][]): readonly TickEvent[] {
  const environment = createProductionHeadlessEnvironment();
  try {
    environment.reset(bossFightScenario(request));
    // The game moves and hurts the same actor object, so its numbers are copied out before the step.
    const boss = (): Readonly<{ hp: number; x: number }> | undefined => {
      const actor = (environment.world().enemies() as readonly RawBoss[]).find((enemy) => enemy.isBoss === true);
      return actor === undefined ? undefined : { hp: actor.hp, x: actor.x };
    };
    return actions.map((given) => {
      const before = boss();
      const playerBefore = environment.policyObservation().player.hp;
      environment.step(given);
      const after = boss();
      return {
        counted: before !== undefined && !environment.cinematicActive(),
        playerBefore,
        playerAfter: environment.policyObservation().player.hp,
        bossBefore: before?.hp ?? 0,
        bossAfter: after?.hp ?? 0,
        xBefore: before?.x ?? 0,
        xAfter: (after ?? before)?.x ?? 0,
      };
    });
  } finally {
    environment.dispose();
  }
}

describe("the fight table's numbers against a count from the tick list", () => {
  it.each(SITUATIONS)("$boss with the $player player", (situation) => {
    const request = requestOf(situation);
    const { result, actions } = playAndRecord(request);
    const events = eventList(request, actions).filter((event) => event.counted);
    const total = (pick: (phase: BossFightResult["phases"][number]) => number): number =>
      result.phases.reduce((sum, phase) => sum + pick(phase), 0);
    const count = (pick: (event: TickEvent) => number): number => events.reduce((sum, event) => sum + pick(event), 0);
    const lost = (event: TickEvent): number => Math.max(0, event.playerBefore - event.playerAfter);
    const dealt = (event: TickEvent): number => Math.max(0, event.bossBefore - event.bossAfter);

    expect(result.end).not.toBe("broken");
    expect(result.ticks).toBe(actions.length);
    expect(total((phase) => phase.ticks)).toBe(events.length);
    expect(total((phase) => phase.damageTaken)).toBeCloseTo(count(lost), 6);
    expect(total((phase) => phase.hitsTaken)).toBe(count((event) => (lost(event) > 0 ? 1 : 0)));
    expect(total((phase) => phase.damageDealt)).toBeCloseTo(count(dealt), 6);
    expect(total((phase) => phase.hitsLanded)).toBe(count((event) => (dealt(event) > 0 ? 1 : 0)));
    expect(total((phase) => phase.bossTravel)).toBeCloseTo(
      count((event) => Math.abs(event.xAfter - event.xBefore)),
      6,
    );
    // The damage a table attributes, source by source, is the damage taken.
    expect(total((phase) => Object.values(phase.hitsBy).reduce((sum, entry) => sum + entry.damage, 0))).toBeCloseTo(
      count(lost),
      6,
    );
    // A fight in which nothing happened would pass every line above.
    expect(count(lost) + count(dealt)).toBeGreaterThan(0);
    expect(count((event) => Math.abs(event.xAfter - event.xBefore))).toBeGreaterThan(0);
  });
});
