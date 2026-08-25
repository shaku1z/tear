import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { createLiveContentRuntime } from "../../src/gameplay/run/live-content-runtime";
import { BOSS_DEFINITIONS, bossPhaseMarks } from "../../src/gameplay/run/boss-definitions";
import { createEnemyHarness, type BehaviorActor } from "./enemy-test-harness";

function liveBossRuntime() {
  const harness = createEnemyHarness([0.25, 0.75, 0.4]);
  const constructors = {
    warden: harness.types.Warden,
    colossus: harness.types.Colossus,
    aldric: harness.types.Aldric,
    echo: harness.types.Echo,
    source: harness.types.Source,
  } as const;
  const installed: BehaviorActor[] = [];
  const createBoss = (id = "warden") => {
    const Boss = constructors[id as keyof typeof constructors];
    return new Boss(0, CONFIG.world.groundY - 180) as BehaviorActor;
  };
  const random = { next: () => 0.5 };
  const run = { mode: "campaign" as const, wave: 1 };
  const noop = () => undefined;
  const runtime = createLiveContentRuntime({
    width: CONFIG.view.w, random, run: () => run, modes: () => [], stages: [{ boss: "warden" }],
    platforms: () => harness.platforms, groundY: () => CONFIG.world.groundY, createBoss,
    construction: {
      sideSpawn: () => 0,
      createGround: () => createBoss("warden"), createAir: () => createBoss("warden"),
      createSupport: () => createBoss("warden"), createBoss,
      beginBossPresentation: noop,
    },
    spawning: {
      random, run: () => run, campaignStage: () => 0, contentWave: () => 1,
      groundSpawn: () => ({ x: CONFIG.view.w / 2, y: CONFIG.world.groundY - 180 }),
      applyPreset: noop, rollVariant: () => null, applyVariant: noop, rollAffixes: noop,
      arrivalEffect: noop, recordSpawn: noop, install: (enemy) => { installed.push(enemy); },
    },
  });
  return { runtime, installed };
}

describe("current boss observation authority", () => {
  it("preserves the authored mini-boss ID through the production spawn path", () => {
    const { runtime, installed } = liveBossRuntime();
    runtime.spawn({ type: "miniboss", bossId: "aldric" });
    expect(installed).toHaveLength(1);
    expect(installed[0]?.bossId).toBe("aldric");
    for (const boss of BOSS_DEFINITIONS) expect(runtime.bossById(boss.id).bossId, boss.id).toBe(boss.id);
  });

  it("exposes Aldric's authored ordinal phases across fire, kneel, and frenzy", () => {
    const harness = createEnemyHarness([0.25, 0.75, 0.4]);
    const boss = new harness.types.Aldric(CONFIG.view.w / 2, CONFIG.world.groundY - 180) as BehaviorActor & {
      phase: number; mode: string; revive(witnessed: boolean): void;
    };
    const [fireTier, fakeTier] = bossPhaseMarks("aldric");
    expect(boss.phase).toBe(1);
    boss.hp = boss.maxHp * (fireTier - 0.01);
    expect(boss.phase).toBe(2);
    boss.update(1 / 60, harness.platforms, harness.player, []);
    expect(boss.mode).toBe("fire");
    boss.hp = boss.maxHp * (fakeTier - 0.01);
    expect(boss.phase).toBe(3);
    boss.update(1 / 60, harness.platforms, harness.player, []);
    expect(boss.mode).toBe("downed");
    boss.revive(false);
    expect(boss.phase).toBe(3);
  });
});
