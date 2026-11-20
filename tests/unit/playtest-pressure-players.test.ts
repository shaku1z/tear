import { describe, expect, it } from "vitest";

import type { GameAction } from "../../src/input/game-action";
import { bossFightScenario, playBossFight, type BossFightRequest } from "../../src/playtest/boss-fight";
import {
  BOSS_PLAYER_IDS,
  createBossPlayer,
  createStillBossPlayer,
  PRESSURE_PHASE_TICKS,
  WALKER,
  type BossPlayer,
} from "../../src/playtest/boss-player";
import { formatBossReport } from "../../src/playtest/boss-report";
import { readBoss, readPlayerBox } from "../../src/playtest/boss-view";
import { createProductionHeadlessEnvironment } from "../../src/playtest/headless/production-headless-environment";

const FIGHT = {
  boss: "rootbound",
  difficulty: "normal",
  weapon: "sword",
  seed: "1",
  maxTicks: 3600,
} as const satisfies Omit<BossFightRequest, "player">;

/** Every action the player gives over the first seconds of a real fight. */
function actionsOf(player: BossPlayer, ticks: number): readonly GameAction[] {
  const environment = createProductionHeadlessEnvironment();
  try {
    environment.reset(bossFightScenario({ ...FIGHT, player: player.id }));
    const given: GameAction[] = [];
    for (let tick = 0; tick < ticks; tick += 1) {
      const observation = { state: environment.policyObservation(), ui: environment.policyUiObservation() };
      const actions = player.decide(observation, readBoss(environment.world()), readPlayerBox(environment.world()));
      if (observation.ui.screen === "playing") given.push(...actions);
      environment.step(actions);
    }
    return given;
  } finally {
    environment.dispose();
  }
}

describe("the players that measure what a boss does to them", () => {
  it("has a player for every id the command accepts", () => {
    for (const id of BOSS_PLAYER_IDS) expect(createBossPlayer(id).id).toBe(id);
  });

  it("no-dodge attacks and walks, and never dashes or jumps", () => {
    const types = new Set(actionsOf(createBossPlayer("no-dodge"), 300).map((action) => action.type));
    expect(types).toContain("weapon");
    expect(types).toContain("move");
    expect(types).not.toContain("dash");
    expect(types).not.toContain("jump");
    // The scripted player it is made from does both in the same fight, so the difference is this player's.
    const scripted = new Set(actionsOf(createBossPlayer("scripted"), 300).map((action) => action.type));
    expect(scripted).toContain("jump");
  });

  it("still gives no input during play and is beaten by a boss that reaches it", () => {
    expect(actionsOf(createBossPlayer("still"), 300)).toEqual([]);
    const fight = playBossFight({ ...FIGHT, player: "still" });
    expect(fight.end).toBe("player defeated");
    expect(fight.phases[0]?.hitsTaken).toBeGreaterThan(0);
  });

  it("walker keeps walking, turns round at a wall, jumps every four seconds and never attacks", () => {
    const environment = createProductionHeadlessEnvironment();
    try {
      environment.reset(bossFightScenario({ ...FIGHT, player: "walker" }));
      const walker = createBossPlayer("walker");
      const types = new Set<string>();
      const jumps: number[] = [];
      const sides: number[] = [];
      for (let tick = 0; tick < 1000; tick += 1) {
        const observation = { state: environment.policyObservation(), ui: environment.policyUiObservation() };
        if (observation.state.player.hp <= 0) break;
        const actions = walker.decide(observation, readBoss(environment.world()), readPlayerBox(environment.world()));
        for (const action of actions) {
          types.add(action.type);
          if (action.type === "jump") jumps.push(tick);
          if (action.type === "move" && sides.at(-1) !== Math.sign(action.x)) sides.push(Math.sign(action.x));
        }
        environment.step(actions);
      }
      expect([...types].sort()).toEqual(["jump", "move"]);
      expect(jumps.length).toBeGreaterThanOrEqual(2);
      for (let index = 1; index < jumps.length; index += 1)
        expect((jumps[index] ?? 0) - (jumps[index - 1] ?? 0)).toBeGreaterThanOrEqual(WALKER.jumpEveryTicks);
      // It set off to the right and has turned round at least once.
      expect(sides.slice(0, 2)).toEqual([1, -1]);
    } finally {
      environment.dispose();
    }
  });

  it("measures how far the boss moves in a phase and prints it per second", () => {
    const fight = playBossFight({ ...FIGHT, player: "walker", maxTicks: 1200 });
    const phase = fight.phases[0];
    expect(phase?.bossTravel).toBeGreaterThan(0);
    const perSecond = ((phase?.bossTravel ?? 0) / ((phase?.ticks ?? 1) / 120)).toFixed(0);
    const report = formatBossReport([fight]);
    expect(report).toContain("boss px/s");
    expect(report).toContain(`  ${perSecond}  `);
  });

  it("stops a pressure player after its share of a phase, as a time limit with the reason", () => {
    expect(createBossPlayer("still").phaseTicks).toBe(PRESSURE_PHASE_TICKS);
    expect(createBossPlayer("no-dodge").phaseTicks).toBe(PRESSURE_PHASE_TICKS);
    expect(createBossPlayer("walker").phaseTicks).toBe(PRESSURE_PHASE_TICKS);
    expect(createBossPlayer("scripted").phaseTicks).toBeUndefined();
    const fight = playBossFight({ ...FIGHT, player: "still" }, { ...createStillBossPlayer(), phaseTicks: 120 });
    expect(fight).toMatchObject({ end: "time limit", reason: "the still player plays 1 s of a phase" });
    expect(fight.phases[0]?.ticks).toBe(120);
    expect(formatBossReport([fight])).toContain("(the still player plays 1 s of a phase)");
  });
});
