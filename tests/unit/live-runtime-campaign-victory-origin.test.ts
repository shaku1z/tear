import { describe, expect, it } from "vitest";

import { INACTIVE_CINEMATIC_DIRECTOR_STATE_V1 } from "../../src/gameplay/runtime/cinematic-director";
import { createLiveTearRuntimeEnvironment } from "../../src/tearbench/live-runtime-environment";
import type { LiveTearRuntimeEnvironmentContext } from "../../src/tearbench/live-runtime-contracts";
import type { TearProgressionLedger } from "../../src/tearbench/progression-ledger";
import type { TearCodecId } from "../../src/tearbench/registries";
import type { TearCodecValue, TearCodecWorld } from "../../src/tearbench/state-codecs";

function sourceWorld(): TearCodecWorld {
  const components = new Map<TearCodecId, TearCodecValue>();
  components.set("tear.player.v1", {
    id: "player", x: 400, y: 700, vx: 0, vy: 0, hp: 100, maxHp: 100,
    facing: 1, onGround: true, dashCharges: 1,
  });
  components.set("tear.blade.v1", {
    id: "blade", ownerId: "player", weaponId: "sword", x: 420, y: 700,
    tipX: 450, tipY: 700, vx: 0, vy: 0, tipSpeed: 0, state: "held",
  });
  components.set("tear.run.v1", {
    mode: "campaign", difficulty: "normal", diff: "normal", weaponId: "sword",
    stage: 0, _biomeIdx: 0, wave: 1, tick: 0, score: 0, runSeed: 1,
    spawnQueue: [], mods: { owned: {}, tier: {} },
  });
  components.set("tear.world.v1", {
    clock: 0, floaters: [], ghost: { recording: null },
    identityState: { nextEntityId: 1, claimedIds: [] },
    runtime: {
      lifecycle: {
        phase: "wave-active", sessionId: "campaign-victory-unit", wave: 1,
        bossWave: false, horde: false, reward: null, outcome: null,
      },
      chapterBinding: null,
    },
  });
  components.set("tear.enemy.v1", []);
  components.set("tear.boss.v1", []);
  components.set("tear.projectile.v1", []);
  components.set("tear.platform.v1", []);
  components.set("tear.hazard.v1", { slowZones: [], walls: [] });
  components.set("tear.ui.v1", { screen: "paused", focusId: "-1" });
  components.set("tear.reward.v1", { selection: null });
  components.set("tear.configuration.v1", { rulesetVersion: "campaign-victory-unit", values: {} });
  components.set("tear.rng.v1", { combat: { algorithm: "mulberry32", seed: 1, state: 1, cursor: 0 } });
  components.set("tear.cinematic.v1", INACTIVE_CINEMATIC_DIRECTOR_STATE_V1 as never);
  return { components, references: new Map(), entityIds: new Set(["player", "blade"]) };
}

function runWithoutProgressionRuntime(value: TearCodecValue | undefined): Record<string, unknown> {
  const run = value as Record<string, unknown>;
  return structuredClone(Object.fromEntries(Object.entries(run).filter(([key]) => key !== "mods")));
}

function fixture(options: Readonly<{
  rejectFrontier?: boolean;
  mutateDuringLoadStage?: boolean;
  bossFinisherMismatch?: boolean;
}> = {}) {
  let active = sourceWorld();
  const sentinelHook = () => "sentinel-upgrade-hook";
  const sentinelMods = { owned: { damage: 3 }, tier: { orbit: 2 }, onHeldHit: sentinelHook };
  (active.components.get("tear.run.v1") as Record<string, unknown>).mods = sentinelMods;
  let screen = options.bossFinisherMismatch === true ? "playing" : "paused";
  let stageIndex = options.bossFinisherMismatch === true ? 4 : 0;
  if (options.bossFinisherMismatch === true) {
    Object.assign(active.components.get("tear.run.v1") as Record<string, unknown>, {
      wave: 60, stage: 5, _biomeIdx: 5, chapterState: "WAVE_LIVE", spawnQueue: [],
    });
    const world = active.components.get("tear.world.v1") as {
      runtime: { lifecycle: Record<string, unknown> };
    };
    Object.assign(world.runtime.lifecycle, {
      phase: "wave-active", wave: 60, bossWave: true, reward: null,
    });
    active.components.set("tear.boss.v1", [{
      id: "enemy:source", factoryId: "source", x: 800, y: 360,
      hp: 900, hpDisplay: 880, maxHp: 1_200, dead: false, dying: false, phase: 3,
    }]);
    (active.components.get("tear.ui.v1") as Record<string, unknown>).screen = "playing";
  }
  const calls: string[] = [];
  const replayed: TearProgressionLedger[] = [];
  let productionBoundary: Readonly<Record<string, unknown>> | null = null;
  let restoredProgressionRuntime: unknown;
  const component = (id: TearCodecId): TearCodecValue => {
    const value = active.components.get(id);
    if (value === undefined) throw new Error(`missing ${id}`);
    return value;
  };
  const context = {
    width: 1600,
    height: 900,
    state: {
      run: () => component("tear.run.v1") as Record<string, unknown>,
      player: () => component("tear.player.v1") as Record<string, unknown>,
      blade: () => component("tear.blade.v1") as Record<string, unknown>,
      enemies: () => [],
      projectiles: () => [],
    },
    platforms: () => component("tear.platform.v1") as readonly Record<string, unknown>[],
    platformsForStage: () => [],
    actorId: () => "unused",
    stage: () => ({ name: `stage-${String(stageIndex)}`, index: stageIndex }),
    lifecycle: () => {
      const world = component("tear.world.v1") as { runtime: { lifecycle: Record<string, unknown> } };
      return world.runtime.lifecycle;
    },
    bossIntroActive: () => false,
    choiceIds: () => [],
    progression: () => ({ wallet: 0, lifetimeEarned: 0, levels: {}, shop: [] }),
    outcome: () => null,
    screen: () => screen,
    setScreen: (next: "playing" | "paused") => { calls.push(`screen:${next}`); screen = next; },
    terminateRun: () => undefined,
    selectWeapon: () => undefined,
    selectBoss: () => undefined,
    setRunSeed: () => undefined,
    startRun: () => undefined,
    stopFrameLoop: () => undefined,
    startFrameLoop: () => undefined,
    setSemanticInputAuthority: () => undefined,
    pushAction: () => undefined,
    routeAction: () => false,
    activateControl: () => false,
    skipCinematic: () => undefined,
    resetSemanticInput: () => undefined,
    advanceFixedTick: () => 1,
    advanceApplicationFrame: () => undefined,
    advanceRenderFrame: () => 0,
    authoritative: () => {
      const run = component("tear.run.v1") as { tick?: number };
      return { tick: run.tick ?? 0, stateHash: `hash-${String(run.tick ?? 0)}`, state: {} };
    },
    random: () => ({ combat: { algorithm: "mulberry32", state: 1 } }),
    render: () => undefined,
    screenshot: () => "data:image/png;base64,",
    subscribeEngineEvent: () => () => undefined,
    drainConsumedActions: () => [],
    emitPhysicalInput: () => undefined,
    setTimeEffectsForTest: () => undefined,
    stateForge: {
      capture: () => {
        const components = new Map<TearCodecId, TearCodecValue>();
        for (const [id, value] of active.components) {
          if (id !== "tear.run.v1") {
            components.set(id, structuredClone(value));
            continue;
          }
          const run = value as Record<string, unknown>;
          const mods = run.mods as { owned: Record<string, number>; tier: Record<string, number> };
          components.set(id, structuredClone({ ...run, mods: { owned: mods.owned, tier: mods.tier } }));
        }
        return { components, references: new Map(active.references), entityIds: new Set(active.entityIds) };
      },
      stage: (world: TearCodecWorld) => world,
      validate: (world: TearCodecWorld) => {
        const run = world.components.get("tear.run.v1") as { wave?: number } | undefined;
        return options.rejectFrontier === true && run?.wave === 59 ? ["forced frontier rejection"] : [];
      },
      commit: (world: TearCodecWorld) => {
        const run = world.components.get("tear.run.v1") as { wave?: number } | undefined;
        calls.push(`restore:${String(run?.wave)}`);
        active = world;
        stageIndex = (run as { stage?: number } | undefined)?.stage ?? stageIndex;
        screen = (world.components.get("tear.ui.v1") as { screen: string }).screen;
      },
    },
    replayProgression: (ledger: TearProgressionLedger) => {
      calls.push("replay");
      replayed.push(ledger);
      return { appliedMutationCount: 0, earnedPickCount: 0, finalBuild: {}, configurationHash: "unit" };
    },
    loadStage: (index: number) => {
      calls.push(`loadStage:${String(index)}`);
      stageIndex = index;
      if (options.mutateDuringLoadStage === true) {
        Object.assign(component("tear.player.v1") as Record<string, unknown>, { hp: 7, x: 1_337 });
        Object.assign(component("tear.blade.v1") as Record<string, unknown>, { state: "thrown", x: 1_444 });
        Object.assign(component("tear.run.v1") as Record<string, unknown>, { score: 99_999, stage: index });
        (component("tear.configuration.v1") as { values: Record<string, unknown> }).values = {
          plantedStageSideEffect: true,
        };
        screen = "draft";
        (component("tear.ui.v1") as Record<string, unknown>).screen = screen;
      }
    },
    applyBossFinisher: (_boss: string, remainingHp: number) => {
      const bosses = component("tear.boss.v1") as Record<string, unknown>[];
      if (bosses[0] === undefined) throw new Error("missing planted boss");
      bosses[0].hp = remainingHp;
      bosses[0].hpDisplay = remainingHp;
      if (options.bossFinisherMismatch === true) {
        (component("tear.configuration.v1") as { values: Record<string, unknown> }).values = {
          plantedSurgicalSideEffect: true,
        };
      }
    },
    captureProgressionRuntime: () => {
      calls.push("captureProgressionRuntime");
      return (component("tear.run.v1") as Record<string, unknown>).mods;
    },
    restoreProgressionRuntime: (runtime: unknown) => {
      calls.push("restoreProgressionRuntime");
      restoredProgressionRuntime = runtime;
      (component("tear.run.v1") as Record<string, unknown>).mods = runtime;
    },
    startNextWave: () => {
      calls.push("startNextWave");
      const run = component("tear.run.v1") as Record<string, unknown>;
      const reward = component("tear.reward.v1") as Record<string, unknown>;
      const world = component("tear.world.v1") as { runtime: { lifecycle: Record<string, unknown> } };
      productionBoundary = Object.freeze({
        wave: run.wave, stage: run.stage, screen,
        reward: structuredClone(reward.selection),
        lifecycle: structuredClone(world.runtime.lifecycle),
        evidence: structuredClone(run.stateForgeEvidence),
        sameMods: run.mods === sentinelMods,
        sameHook: (run.mods as { onHeldHit?: unknown }).onHeldHit === sentinelHook,
      });
      run.wave = 60;
    },
    finaleIntents: () => [],
    finaleOutwardCalls: () => [],
  } as unknown as LiveTearRuntimeEnvironmentContext;
  return {
    context, calls, replayed, sentinelMods,
    restoredRuntime: () => restoredProgressionRuntime, stageIndex: () => stageIndex,
    active: () => active, boundary: () => productionBoundary, screen: () => screen,
  };
}

describe("live runtime campaign victory State Forge origin", () => {
  it("crosses the six-stage wave-59 reward frontier in the required production order", () => {
    const unit = fixture();
    const environment = createLiveTearRuntimeEnvironment(unit.context, "A");

    const result = environment.forgeCampaignFinalWave();

    expect(result.ok).toBe(true);
    expect(unit.replayed).toHaveLength(1);
    expect(unit.replayed[0]).toMatchObject({ targetWave: 59 });
    expect(unit.replayed[0]?.events.some((event) => event.type === "run.completed")).toBe(false);
    expect(unit.replayed[0]?.events.at(-1)).toMatchObject({ type: "reward.granted", wave: 59 });
    expect(unit.calls.filter((call) => [
      "replay", "loadStage:5", "captureProgressionRuntime", "restore:59",
      "restoreProgressionRuntime", "startNextWave", "screen:playing",
    ].includes(call))).toEqual([
      "captureProgressionRuntime", "replay", "loadStage:5", "captureProgressionRuntime", "restore:59",
      "restoreProgressionRuntime", "startNextWave", "screen:playing",
    ]);
    expect(unit.boundary()).toMatchObject({
      wave: 59,
      stage: 5,
      screen: "draft",
      reward: { phase: "complete", mode: "campaign", wave: 59 },
      lifecycle: { phase: "reward-pending", wave: 59 },
      evidence: { certificateId: "campaign-wave-59-victory-origin", terminal: false },
      sameMods: true,
      sameHook: true,
    });
    expect(unit.restoredRuntime()).toBe(unit.sentinelMods);
    expect(unit.screen()).toBe("playing");
    expect(unit.active().components.get("tear.run.v1")).toMatchObject({ wave: 60, stage: 5 });
  });

  it("keeps the forge out of Class B and propagates restoration failure before wave start", () => {
    expect("forgeCampaignFinalWave" in createLiveTearRuntimeEnvironment(fixture().context, "B")).toBe(false);

    const unit = fixture({ rejectFrontier: true, mutateDuringLoadStage: true });
    const originalPlayer = structuredClone(unit.active().components.get("tear.player.v1"));
    const originalBlade = structuredClone(unit.active().components.get("tear.blade.v1"));
    const originalRun = runWithoutProgressionRuntime(unit.active().components.get("tear.run.v1"));
    const originalConfiguration = structuredClone(unit.active().components.get("tear.configuration.v1"));
    const result = createLiveTearRuntimeEnvironment(unit.context, "A").forgeCampaignFinalWave();

    expect(result).toMatchObject({ ok: false, phase: "validate", rolledBack: true });
    expect(unit.calls).toEqual([
      "captureProgressionRuntime", "replay", "loadStage:5", "captureProgressionRuntime",
      "restoreProgressionRuntime", "restore:1", "restoreProgressionRuntime",
    ]);
    expect(unit.restoredRuntime()).toBe(unit.sentinelMods);
    expect((unit.active().components.get("tear.run.v1") as { mods: unknown }).mods).toBe(unit.sentinelMods);
    expect(unit.boundary()).toBeNull();
    expect(unit.screen()).toBe("paused");
    expect(unit.stageIndex()).toBe(0);
    expect(unit.active().components.get("tear.player.v1")).toEqual(originalPlayer);
    expect(unit.active().components.get("tear.blade.v1")).toEqual(originalBlade);
    expect(runWithoutProgressionRuntime(unit.active().components.get("tear.run.v1"))).toEqual(originalRun);
    expect(unit.active().components.get("tear.configuration.v1")).toEqual(originalConfiguration);
  });

  it("rolls back a boss-finisher surgical mismatch and restores progression runtime", () => {
    const unit = fixture({ bossFinisherMismatch: true });
    const originalBosses = structuredClone(unit.active().components.get("tear.boss.v1"));
    const originalConfiguration = structuredClone(unit.active().components.get("tear.configuration.v1"));

    expect(() => createLiveTearRuntimeEnvironment(unit.context, "A").forgeExitLaunch({
      id: "source-finisher-mismatch", kind: "boss-finisher", boss: "source", remainingHp: 1,
    })).toThrow(/changed fields outside its declared health pair/u);

    expect(unit.calls).toEqual([
      "captureProgressionRuntime", "restore:60", "restoreProgressionRuntime",
    ]);
    expect(unit.active().components.get("tear.boss.v1")).toEqual(originalBosses);
    expect(unit.active().components.get("tear.configuration.v1")).toEqual(originalConfiguration);
    expect(unit.active().components.get("tear.boss.v1")).toMatchObject([{
      hp: 900, hpDisplay: 880,
    }]);
    expect(unit.restoredRuntime()).toBe(unit.sentinelMods);
    expect((unit.active().components.get("tear.run.v1") as { mods: unknown }).mods).toBe(unit.sentinelMods);
  });
});
