import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { createLiveContentRuntime } from "../../src/gameplay/run/live-content-runtime";
import { BOSS_DEFINITIONS, bossPhaseMarks } from "../../src/gameplay/run/boss-definitions";
import { CANONICAL_CONTENT_AUTHORITY, materializeCanonicalScenario } from "../../src/tearbench/canonical-scenarios";
import scenarioCatalog from "../../src/tearbench/canonical-scenarios.json";
import { createEnemyHarness, type BehaviorActor } from "./enemy-test-harness";
import { projectLiveBossObservation } from "../../src/tearbench/live-observation-actors";
import { STAGE_PUBLICATION_STATE, stageDefinition } from "../../src/gameplay/stages";

function liveBossRuntime() {
  const harness = createEnemyHarness([0.25, 0.75, 0.4]);
  const constructors = {
    warden: harness.types.Warden,
    colossus: harness.types.Colossus,
    aldric: harness.types.Aldric,
    rootbound: harness.types.Rootbound,
    "white-hart": harness.types.WhiteHart,
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
    bossBiomeStages: [{ boss: "warden" }, { boss: "white-hart" }],
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

  it("keeps preview boss biome lookup separate from the published campaign stages", () => {
    const { runtime } = liveBossRuntime();
    expect(runtime.bossBiome("warden")).toBe(0);
    expect(runtime.bossBiome("white-hart")).toBe(1);
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

  it("projects Rootbound's valid ordinals and Verdant home stage from production authorities", () => {
    const harness = createEnemyHarness();
    const boss = new harness.types.Rootbound(CONFIG.view.w / 2, CONFIG.world.groundY - CONFIG.boss.h / 2);
    expect(projectLiveBossObservation(boss)).toEqual({
      id: "rootbound", phase: "1", validPhases: ["1", "2", "3"], homeStage: "verdant-sanctum",
    });
    boss.hp = boss.maxHp * 0.5;
    expect(projectLiveBossObservation(boss)?.phase).toBe("2");
    boss.hp = boss.maxHp * 0.2;
    expect(projectLiveBossObservation(boss)?.phase).toBe("3");
  });

  it("rejects canonical scenario subject or specialized mechanic drift", () => {
    const rootbound = scenarioCatalog.find((entry) => entry.id === "rootbound-graft-anchor-destruction");
    const bloom = scenarioCatalog.find((entry) => entry.id === "verdant-bloom-well-cycle");
    if (rootbound === undefined || bloom === undefined) throw new Error("canonical environment scenarios are incomplete");
    expect(CANONICAL_CONTENT_AUTHORITY.scenarios.find(({ id }) => id === rootbound.id)?.subject).toEqual(rootbound.subject);
    expect(() => {
      const altered = { ...rootbound, subject: { kind: "environment-combat-object", id: "invented-mechanic" } } as typeof rootbound;
      // The canonical materializer is the source-derived boundary for subjects.
      materializeCanonicalScenario(altered);
    }).toThrow(/unknown environment combat-object scenario subject|source-owned subject tag/u);
    expect(() => {
      const altered = { ...bloom, tags: bloom.tags.filter((tag) => tag !== "bloom-well") };
      materializeCanonicalScenario(altered);
    }).toThrow(/source-owned field mechanic/u);
  });

  it("projects current product names, homes, and publication state from production owners", () => {
    expect(stageDefinition("tear").name).toBe("The Tear");
    expect(stageDefinition("tear").boss).toBe("source");
    expect(CANONICAL_CONTENT_AUTHORITY.stageDisplayNames.tear).toBe("The Tear");
    expect(CANONICAL_CONTENT_AUTHORITY.bosses.find(({ id }) => id === "source")).toMatchObject({
      displayName: "The Source", homeStage: "tear",
    });
    expect(CANONICAL_CONTENT_AUTHORITY.bosses.find(({ id }) => id === "rootbound")).toMatchObject({
      displayName: "The Rootbound", homeStage: "verdant-sanctum",
    });
    expect(CANONICAL_CONTENT_AUTHORITY.bosses.find(({ id }) => id === "white-hart")).toMatchObject({
      displayName: "The White Hart", homeStage: "pale-traverse",
    });
    expect(STAGE_PUBLICATION_STATE["verdant-sanctum"]).toBe("published");
    expect(STAGE_PUBLICATION_STATE["pale-traverse"]).toBe("preview");
    expect(CANONICAL_CONTENT_AUTHORITY.environmentMechanics).toEqual(["bloom-well", "root-link", "graft-anchor"]);
  });
});
