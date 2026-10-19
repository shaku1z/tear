import { describe, expect, it } from "vitest";
import { createProductionGhostReplayComposition, captureProductionReplayCheckpoint,
  restoreProductionReplaySnapshot } from "../../src/tearbench/production-replay-composition";
import { createProductionReplayWorld, type ProductionReplayWorld } from "../../src/tearbench/production-world-factory";
import { UPGRADES, applyUpgrade } from "../../src/gameplay/upgrades";
import { upgradeHookIdentity } from "../../src/gameplay/upgrade-hooks";

function upgradeContext(replay: ProductionReplayWorld) {
  const player = replay.world.state.player(), blade = replay.world.state.blade(), run = replay.world.state.run();
  if (player === undefined || blade === undefined || run === null) throw new Error("production fixture actors are missing");
  return { config: replay.configuration.value, player, blade, mods: run.mods };
}

describe("runtime recovery reward checkpoints", () => {
  it("restores production draft choices and resumes the same reward without rerolling", () => {
    const composition = createProductionGhostReplayComposition({ seed: "runtime-recovery-draft", mode: "endless" });
    const source = composition.create(undefined);
    const run = source.replay.world.state.run() as never as { spawnQueue: unknown[] };
    run.spawnQueue = [];
    source.replay.world.state.setEnemies([]);
    source.waveReward.update(1.5);
    expect(source.waveReward.screen()).toBe("draft");
    const reward = source.waveReward.reward.snapshot();
    expect(reward).not.toBeNull();
    const checkpoint = captureProductionReplayCheckpoint(source.replay, source.combat, source.waveReward, "runtime-recovery-draft");
    const restored = composition.create(checkpoint.snapshot);
    expect(restored.waveReward.screen()).toBe("draft");
    expect((restored.replay.world.state.blade() as never as { config: unknown }).config).toBe(restored.replay.configuration.value);
    expect(restored.waveReward.reward.snapshot()?.choices.map((choice) => choice.id))
      .toEqual(reward?.choices.map((choice) => choice.id));
    for (const choice of restored.waveReward.reward.snapshot()?.choices ?? []) {
      expect(choice).toBe(UPGRADES.find((upgrade) => upgrade.id === choice.id));
    }
    expect(restored.replay.world.context.services.random.snapshot()).toEqual(source.replay.world.context.services.random.snapshot());
    const choiceId = reward?.choices[0]?.id;
    if (choiceId === undefined) throw new Error("production draft fixture requires a choice");
    expect(restored.routeAction({ type: "draft-choice", choiceId })).toBe(true);
    expect(source.routeAction({ type: "draft-choice", choiceId })).toBe(true);
    expect(restored.replay.configuration.snapshot()).toEqual(source.replay.configuration.snapshot());
    expect(restored.replay.world.context.services.random.snapshot()).toEqual(source.replay.world.context.services.random.snapshot());
  });

  it("rejects incompatible configuration before replacing any destination world state", () => {
    const composition = createProductionGhostReplayComposition({ seed: "runtime-recovery-atomicity", mode: "endless" });
    const source = composition.create(undefined);
    source.replay.world.state.setEnemies([source.replay.world.entities.createEnemy("reflection", 700, 500,
      source.replay.world.state.run() as never)]);
    const captured = captureProductionReplayCheckpoint(source.replay, source.combat, source.waveReward, "runtime-recovery-atomicity");
    const config = captured.snapshot.state["tear.configuration.v1"] as Readonly<Record<string, unknown>>;
    const invalid = { ...captured.snapshot, state: { ...captured.snapshot.state,
      "tear.configuration.v1": { ...config, values: { incompatible: true } } } };
    const target = createProductionReplayWorld({ seed: "runtime-recovery-atomicity-target", mode: "endless" });
    const before = target.world.state.run();
    const beforeConfig = target.configuration.snapshot();
    const beforePlayer = target.world.state.player();
    const beforeEnemies = target.world.state.enemies();
    const transientData = () => Object.fromEntries(Object.entries(target.world.context.transient)
      .filter(([, value]) => typeof value !== "function"));
    const beforeRuntime = structuredClone(transientData());
    const beforeLifecycle = target.world.lifecycle.snapshot();
    const beforeEnvironment = target.world.context.environment.snapshot();
    const beforeRng = target.world.context.services.random.snapshot();
    expect(() => restoreProductionReplaySnapshot(target, invalid)).toThrow();
    expect(target.world.state.run()).toBe(before);
    expect(target.configuration.snapshot()).toEqual(beforeConfig);
    expect(target.world.state.player()).toBe(beforePlayer);
    expect(target.world.state.enemies()).toBe(beforeEnemies);
    expect(transientData()).toEqual(beforeRuntime);
    expect(target.world.lifecycle.snapshot()).toEqual(beforeLifecycle);
    expect(target.world.context.environment.snapshot()).toEqual(beforeEnvironment);
    expect(target.world.context.services.random.snapshot()).toEqual(beforeRng);
  });

  it("resumes reserve selection and rebinds a reserved upgrade in the following draft", () => {
    const composition = createProductionGhostReplayComposition({ seed: "runtime-recovery-reserve", mode: "endless" });
    const source = composition.create(undefined);
    const run = source.replay.world.state.run() as never as { spawnQueue: unknown[]; mods: { reservePick: boolean } };
    run.mods.reservePick = true; run.spawnQueue = []; source.replay.world.state.setEnemies([]);
    source.waveReward.update(1.5);
    source.waveReward.reward.selectDraft(0);
    expect(source.waveReward.screen()).toBe("reserve");
    const checkpoint = captureProductionReplayCheckpoint(source.replay, source.combat, source.waveReward, "reserve");
    const restored = composition.create(checkpoint.snapshot);
    expect(restored.waveReward.screen()).toBe("reserve");
    const choice = restored.waveReward.reward.snapshot()?.reserveChoices[0];
    if (choice === undefined) throw new Error("reserve fixture needs a remaining choice");
    expect(choice).toBe(UPGRADES.find((upgrade) => upgrade.id === choice.id));
    for (const world of [source, restored]) {
      expect(world.routeAction({ type: "reserve-choice", choiceId: choice.id })).toBe(true);
    }
    expect(restored.replay.configuration.snapshot()).toEqual(source.replay.configuration.snapshot());
    expect(restored.replay.world.context.services.random.snapshot()).toEqual(source.replay.world.context.services.random.snapshot());
    const reserved = captureProductionReplayCheckpoint(restored.replay, restored.combat, restored.waveReward, "reserved");
    const next = composition.create(reserved.snapshot);
    expect((next.replay.world.state.run() as never as { reservedUpgrade: unknown }).reservedUpgrade).toBe(choice);
    (next.replay.world.state.run() as never as { spawnQueue: unknown[] }).spawnQueue = [];
    next.replay.world.state.setEnemies([]); next.waveReward.update(1.5);
    expect(next.waveReward.reward.snapshot()?.choices).toContain(choice);
    expect(next.routeAction({ type: "draft-choice", choiceId: choice.id })).toBe(true);
  });

  it("resumes a tier-up with production upgrade functions and the same resulting state", () => {
    const composition = createProductionGhostReplayComposition({ seed: "runtime-recovery-tierup", mode: "endless" });
    const source = composition.create(undefined);
    const upgrade = UPGRADES.find((choice) => choice.id === "bloodrite");
    if (upgrade === undefined) throw new Error("tier-up fixture needs an authored tiered upgrade");
    const run = source.replay.world.state.run() as never as {
      spawnQueue: unknown[]; mods: Parameters<typeof applyUpgrade>[1]["mods"];
    };
    applyUpgrade(upgrade, upgradeContext(source.replay));
    run.spawnQueue = []; source.replay.world.state.setEnemies([]); source.waveReward.update(1.5);
    source.waveReward.reward.openTier([upgrade]);
    const checkpoint = captureProductionReplayCheckpoint(source.replay, source.combat, source.waveReward, "tierup");
    const restored = composition.create(checkpoint.snapshot);
    expect(restored.waveReward.screen()).toBe("tierup");
    expect(restored.waveReward.reward.snapshot()?.choices[0]).toBe(upgrade);
    for (const world of [source, restored]) expect(world.routeAction({ type: "tier-up-choice", choiceId: upgrade.id })).toBe(true);
    expect(restored.replay.configuration.snapshot()).toEqual(source.replay.configuration.snapshot());
    const restoredRun = restored.replay.world.state.run() as never as typeof run;
    expect(restoredRun.mods.onKill.map(upgradeHookIdentity)).toEqual(["bloodrite"]);
    expect(restoredRun.mods.tier[upgrade.id]).toBe(2);
    const healed: number[] = [];
    const invokeKill = () => restoredRun.mods.onKill[0]?.({ cause: "skill", player: { heal: (amount: number) => healed.push(amount),
      guardT: 0 } } as never);
    invokeKill();
    expect(healed).toEqual([16]);
    restored.replay.configuration.value.resilience.bloodriteHeal = 23;
    invokeKill();
    expect(healed).toEqual([16, 23]);
    expect(source.replay.configuration.value.resilience.bloodriteHeal).toBe(16);
    expect(restored.replay.world.context.services.random.snapshot()).toEqual(source.replay.world.context.services.random.snapshot());
  });

  it.each(["bloodrite", "seismic_slam", "detonate", "adrenaline", "rupture", "sunder", "stormbank", "overrun", "sever", "tempo", "backlash"])(
    "preserves canonical callback identities for owned %s without applying its effects twice", (id) => {
      const composition = createProductionGhostReplayComposition({ seed: `runtime-recovery-hook-${id}`, mode: "endless" });
      const source = composition.create(undefined);
      const choice = UPGRADES.find((upgrade) => upgrade.id === id);
      if (choice === undefined) throw new Error(`missing authored upgrade ${id}`);
      const mods = upgradeContext(source.replay).mods;
      applyUpgrade(choice, upgradeContext(source.replay));
      const checkpoint = captureProductionReplayCheckpoint(source.replay, source.combat, source.waveReward, id);
      const restored = composition.create(checkpoint.snapshot);
      expect(restored.replay.configuration.snapshot()).toEqual(source.replay.configuration.snapshot());
      const hooks = (value: typeof mods) => Object.fromEntries(Object.entries(value)
        .filter(([key]) => key.startsWith("on"))
        .map(([key, handlers]) => [key, (handlers as typeof mods.onKill).map(upgradeHookIdentity)]));
      expect(hooks(upgradeContext(restored.replay).mods)).toEqual(hooks(mods));
      expect(upgradeContext(restored.replay).mods.owned).toEqual(mods.owned);
    });

  it.each([
    { label: "unknown callback binding", callback: { $upgradeHook: "unknown-upgrade" }, error: /canonical binding identifier/ },
    { label: "legacy null callback payload", callback: null, error: /Legacy upgrade callback payload.*unsupported.*discarded its binding identity/ },
  ])("rejects $label before mutating the destination", ({ callback, error }) => {
    const composition = createProductionGhostReplayComposition({ seed: "runtime-recovery-hostile-hook", mode: "endless" });
    const source = composition.create(undefined);
    const { snapshot } = captureProductionReplayCheckpoint(source.replay, source.combat, source.waveReward, "hostile-hook");
    const run = snapshot.state["tear.run.v1"] as Readonly<Record<string, unknown>>;
    const invalid = { ...snapshot, state: { ...snapshot.state, "tear.run.v1": { ...run,
      mods: { ...(run.mods as object), onKill: [callback] } } } };
    const target = createProductionReplayWorld({ seed: "runtime-recovery-hook-target" });
    const before = target.world.state.run();
    const rng = target.world.context.services.random.snapshot();
    expect(() => restoreProductionReplaySnapshot(target, invalid)).toThrow(error);
    expect(target.world.state.run()).toBe(before);
    expect(target.world.context.services.random.snapshot()).toEqual(rng);
  });
});
