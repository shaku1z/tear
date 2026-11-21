import { describe, expect, it } from "vitest";
import {
  BLOOM_WELL_LIFT,
  BLOOM_WELL_TIMING,
  advanceBloomWell,
  applyBloomWellForce,
  cleanupBloomWell,
  createBloomWellDefinition,
  createBloomWellState,
  createRootboundBloomPattern,
  installRootboundBloomPattern,
  ROOTBOUND_BLOOM_PATTERN_IDS,
  BLOOM_WELL_VALIDATION,
  type BloomWellActor,
} from "../../src/gameplay/environment/bloom-well";
import { CONFIG } from "../../src/config/game-config";
import { createEnvironmentRuntime } from "../../src/gameplay/environment/environment-runtime";
import { ENVIRONMENT_FADE_TICKS } from "../../src/gameplay/environment/environment-contracts";
import { bindVerdantEnvironmentActors } from "./environment-feature-fixture";
import { projectBloomWellPresentation } from "../../src/presentation/environment/bloom-well-presentation";
import {
  captureProductionReplayCheckpoint,
  createProductionGhostReplayComposition,
} from "../../src/app/world/detached/replay-composition";
import { compileResolvedTearSdlSnapshot } from "../../src/tearbench/state-setup-live-compiler";
import { buildBloomWellCycleState } from "../../src/tearbench/state-setup-factories";
import { resolveTearSdl, type TearSdlDocumentV1 } from "../../src/tearbench/tearsdl";
import { environmentHash } from "../../src/gameplay/snapshot/environment-codec";
import { validateAuthoredEnvironmentCodecPayload as validateEnvironmentCodecPayload } from "../../src/gameplay/snapshot/authored-environment-validation";
import { TearGameplayEventBus, type TearGameplayEvent } from "../../src/gameplay/runtime/gameplay-events";
import { scenarioRunSeed } from "../../src/gameplay/run/run-start-choices";

const definition = {
  id: "stage-well",
  ownerId: "stage-owner",
  variant: "stage" as const,
  geometry: { x: 100, y: 200, radius: 80 },
  patternId: "stage-a",
};

function actor(overrides: Partial<BloomWellActor> = {}): BloomWellActor {
  return { id: "player", kind: "player", x: 100, y: 200, vx: 120, vy: 0, ...overrides };
}

describe("Bloom Well V1", () => {
  it("uses the locked warning -> active -> cooldown lifecycle; a boss Well then ends", () => {
    const well = createBloomWellState(definition, 0);
    expect(well.state).toBe("warning");
    expect(BLOOM_WELL_TIMING.warningTicks / BLOOM_WELL_TIMING.ticksPerSecond).toBe(0.7);
    expect(BLOOM_WELL_TIMING.activeTicks / BLOOM_WELL_TIMING.ticksPerSecond).toBe(1.5);
    expect(BLOOM_WELL_TIMING.cooldownTicks / BLOOM_WELL_TIMING.ticksPerSecond).toBe(4);
    expect(well.transitionTick).toBe(BLOOM_WELL_TIMING.warningTicks);
    expect(advanceBloomWell(well, BLOOM_WELL_TIMING.warningTicks - 1).state).toBe("warning");
    const active = advanceBloomWell(well, BLOOM_WELL_TIMING.warningTicks);
    expect(active.state).toBe("active");
    expect(advanceBloomWell(active, BLOOM_WELL_TIMING.warningTicks + 1).stateTick).toBe(BLOOM_WELL_TIMING.warningTicks);
    expect(active.transitionTick).toBe(BLOOM_WELL_TIMING.warningTicks + BLOOM_WELL_TIMING.activeTicks);
    expect(advanceBloomWell(active, BLOOM_WELL_TIMING.warningTicks + BLOOM_WELL_TIMING.activeTicks).state).toBe(
      "cooldown",
    );
    expect(advanceBloomWell(active, BLOOM_WELL_TIMING.totalTicks - 1).state).toBe("cooldown");
    // Boss Wells run one authored cycle and end; stage Wells re-arm for as long as the stage lasts.
    const bossWell = createBloomWellState({ ...definition, id: "boss-well", variant: "boss", bossOwnerId: "boss" }, 0);
    const finished = advanceBloomWell(bossWell, BLOOM_WELL_TIMING.totalTicks);
    expect(finished).toMatchObject({ state: "expired", cleanupReason: "natural-expiry" });
    expect(advanceBloomWell(finished, BLOOM_WELL_TIMING.totalTicks * 3)).toBe(finished);
  });

  it("re-arms stage Wells every cycle for the whole stage", () => {
    const well = createBloomWellState(definition, 0);
    const cycle = BLOOM_WELL_TIMING.totalTicks;
    for (const n of [1, 2, 7]) {
      expect(advanceBloomWell(well, cycle * n).state).toBe("warning");
      expect(advanceBloomWell(well, cycle * n + BLOOM_WELL_TIMING.warningTicks)).toMatchObject({
        state: "active",
        stateTick: cycle * n + BLOOM_WELL_TIMING.warningTicks,
      });
      expect(advanceBloomWell(well, cycle * (n + 1) - 1).state).toBe("cooldown");
    }
  });

  it("lifts faster than gravity pulls, up to a capped rise speed", () => {
    const well = advanceBloomWell(createBloomWellState(definition, 0), BLOOM_WELL_TIMING.warningTicks);
    const player = actor({ vx: 0, vy: 0 });
    const dt = 1 / 120;
    for (let tick = 0; tick < 120; tick += 1) {
      player.vy += CONFIG.world.gravity * dt;
      applyBloomWellForce(well, player, dt);
    }
    expect(player.vy).toBeLessThan(-300);
    expect(player.vy).toBeGreaterThanOrEqual(-BLOOM_WELL_LIFT.maxRiseSpeed);
  });

  it("exposes warning geometry, lifts eligible actors, and preserves horizontal agency", () => {
    const well = advanceBloomWell(createBloomWellState(definition, 0), BLOOM_WELL_TIMING.warningTicks);
    expect(well.geometry).toEqual(definition.geometry);
    const player = actor();
    applyBloomWellForce(well, player);
    expect(player.vy).toBeLessThan(0);
    expect(player.vx).toBe(120);
    const heavy = actor({ id: "heavy", kind: "enemy", mass: 4 });
    applyBloomWellForce(well, heavy);
    expect(heavy.vy).toBeLessThan(0);
    expect(Math.abs(heavy.vy)).toBeLessThan(Math.abs(player.vy));
  });

  it("rejects a force vector that exceeds its declared bounded magnitude", () => {
    expect(() => createBloomWellDefinition({ ...definition, force: { x: 0, y: -1e300, magnitude: 1 } })).toThrow(
      /force vector/u,
    );
    const runtime = createEnvironmentRuntime({
      stageId: "stage",
      worldId: "force-restore",
      validators: [BLOOM_WELL_VALIDATION],
    });
    runtime.addField(createBloomWellState(definition));
    const before = runtime.snapshot();
    const malformed = {
      ...before,
      fields: before.fields.map((field) => ({ ...field, force: { x: 0, y: -1e300, magnitude: 1 } })),
    };
    expect(validateEnvironmentCodecPayload(malformed).some((entry) => entry.path.endsWith(".force"))).toBe(true);
    expect(() => {
      runtime.replace(malformed);
    }).toThrow(/force vector/u);
    expect(runtime.snapshot()).toEqual(before);
  });

  it("excludes bosses, flyers, anchored enemies, and weapon transport", () => {
    const well = advanceBloomWell(createBloomWellState(definition, 0), BLOOM_WELL_TIMING.warningTicks);
    for (const excluded of [
      actor({ id: "boss", kind: "enemy", isBoss: true }),
      actor({ id: "flyer", kind: "enemy", isFlyer: true }),
      actor({ id: "anchor", kind: "enemy", anchored: true }),
      actor({ id: "weapon", kind: "weapon", vy: 30 }),
    ]) {
      const before = { vx: excluded.vx, vy: excluded.vy };
      applyBloomWellForce(well, excluded);
      expect({ vx: excluded.vx, vy: excluded.vy }).toEqual(before);
    }
  });

  it("is render-rate independent and bounded", () => {
    const well = createBloomWellState(definition, 0);
    const one = advanceBloomWell(well, BLOOM_WELL_TIMING.warningTicks + 1);
    let many = well;
    for (let tick = 1; tick <= BLOOM_WELL_TIMING.warningTicks + 1; tick += 1) many = advanceBloomWell(many, tick);
    expect(many).toEqual(one);
    expect(
      BLOOM_WELL_TIMING.warningTicks + BLOOM_WELL_TIMING.activeTicks + BLOOM_WELL_TIMING.cooldownTicks,
    ).toBeLessThan(1_000);
  });

  it("applies lift from the authoritative environment active-field phase", () => {
    const runtime = createEnvironmentRuntime({ stageId: "stage", worldId: "world" });
    const well = createBloomWellState(definition, 0);
    runtime.addField(well);
    const player = actor();
    bindVerdantEnvironmentActors(runtime, "bloom-well", () => [player]);
    runtime.step(BLOOM_WELL_TIMING.warningTicks, 1 / BLOOM_WELL_TIMING.ticksPerSecond, () => undefined);
    expect(runtime.fields()[0]?.state).toBe("active");
    expect(player.vy).toBeLessThan(0);
    expect(runtime.phaseLog).toEqual(["pre-step", "active-fields", "collision-resolution", "post-commit"]);
  });

  it("keeps warning geometry readable without audio or motion effects", () => {
    const well = createBloomWellState(definition, 0);
    expect(
      projectBloomWellPresentation(well, {
        highContrast: true,
        reducedMotion: true,
        lowGraphics: true,
        audioEnabled: false,
      }),
    ).toMatchObject({
      state: "warning",
      geometry: definition.geometry,
      boundaryVisible: true,
      audioIndependent: true,
      motionScale: 0,
    });
  });

  it("uses one definition class for stage and boss-owned variants and records cleanup", () => {
    const bossDefinition = createBloomWellDefinition({
      ...definition,
      id: "boss-well",
      variant: "boss",
      bossOwnerId: "boss-1",
    });
    const bossWell = createBloomWellState(bossDefinition, 120);
    expect(bossWell.variant).toBe("boss");
    expect(bossWell.bossOwnerId).toBe("boss-1");
    expect(cleanupBloomWell(bossWell, "boss-terminal")).toMatchObject({
      state: "expired",
      cleanupReason: "boss-terminal",
    });
  });

  it("cleans a boss-owned well when its production actor reference disappears", () => {
    const events = new TearGameplayEventBus(() => 0);
    const native: TearGameplayEvent[] = [];
    events.subscribe((event) => {
      native.push(event);
    });
    const runtime = createEnvironmentRuntime({
      stageId: "stage",
      worldId: "boss-cleanup",
      availableActorIds: () => new Set(["player"]),
      events,
    });
    runtime.addField(createBloomWellState({ ...definition, id: "boss-well", variant: "boss", bossOwnerId: "boss-1" }));
    runtime.step(1, 1 / BLOOM_WELL_TIMING.ticksPerSecond, () => undefined);
    expect(runtime.fields()[0]).toMatchObject({
      state: "expired",
      cleanupReason: "boss-terminal",
      bossOwnerId: "boss-1",
    });
    expect(native.filter((event) => event.kind === "environment")).toEqual([
      expect.objectContaining({ event: "object-cleaned", reason: "boss-terminal", objectId: "boss-well" }),
    ]);
    runtime.step(1 + ENVIRONMENT_FADE_TICKS, 1 / BLOOM_WELL_TIMING.ticksPerSecond, () => undefined);
    expect(runtime.fields()).toEqual([]);
  });

  it("hashes stage and boss behavior metadata distinctly", () => {
    const stage = createEnvironmentRuntime({ stageId: "stage", worldId: "hash-world" });
    const boss = createEnvironmentRuntime({ stageId: "stage", worldId: "hash-world" });
    stage.addField(createBloomWellState(definition));
    boss.addField(createBloomWellState({ ...definition, variant: "boss", bossOwnerId: "boss-1" }));
    expect(environmentHash(stage.snapshot())).not.toBe(environmentHash(boss.snapshot()));
  });

  it("runs the same non-stage-inserted lifecycle on the supported detached production world", () => {
    const source = createProductionGhostReplayComposition({
      runSeed: scenarioRunSeed("bloom-well-detached"),
      mode: "campaign",
    }).create(undefined);
    const checkpoint = captureProductionReplayCheckpoint(
      source.replay,
      source.combat,
      source.waveReward,
      "bloom-well-state-forge",
    );
    const base: TearSdlDocumentV1 = {
      format: "tearsdl",
      schemaVersion: 1,
      id: "bloom-well-detached",
      stateClass: "surgical-valid",
      seed: "bloom-well-detached",
      start: { mode: "campaign", difficulty: "normal", weapon: "sword" },
    };
    const built = resolveTearSdl(
      buildBloomWellCycleState(base, createBloomWellState({ ...definition, ownerId: "player" }, 0)),
    );
    const snapshot = compileResolvedTearSdlSnapshot(checkpoint.snapshot, built);
    const detached = createProductionGhostReplayComposition({
      runSeed: scenarioRunSeed("bloom-well-detached"),
      mode: "campaign",
    }).create(snapshot);
    const environment = detached.replay.world.context.environment;
    const states: string[] = [environment.fields()[0]?.state ?? "missing"];
    for (const tick of [
      BLOOM_WELL_TIMING.warningTicks,
      BLOOM_WELL_TIMING.warningTicks + BLOOM_WELL_TIMING.activeTicks,
      BLOOM_WELL_TIMING.totalTicks,
    ]) {
      environment.step(tick, 1 / 120, () => undefined);
      states.push(environment.fields()[0]?.state ?? "missing");
    }
    expect(states).toEqual(["warning", "active", "cooldown", "warning"]);
  });

  it("cleans authored wells transactionally for stage, boss, retry, and restore boundaries", () => {
    for (const reason of ["stage-transition", "boss-terminal", "retry", "restore"] as const) {
      const runtime = createEnvironmentRuntime({ stageId: "stage", worldId: `world-${reason}` });
      runtime.addField(createBloomWellState(definition, 0));
      runtime.clear(reason);
      expect(runtime.fields()).toHaveLength(0);
      expect(runtime.lastClearReason).toBe(reason);
    }
  });

  it("authors all three bounded Rootbound arrangements through shared Bloom Well states", () => {
    const counts = [2, 1, 3];
    ROOTBOUND_BLOOM_PATTERN_IDS.forEach((patternId, index) => {
      const fields = createRootboundBloomPattern({
        patternId,
        bossOwnerId: "enemy:rootbound",
        stageOwnerId: "verdant-sanctum",
        startTick: 240,
        arenaWidth: 1600,
        groundY: 800,
      });
      expect(fields).toHaveLength(counts[index] ?? 0);
      for (const field of fields)
        expect(field).toMatchObject({
          kind: "bloom-well",
          variant: "boss",
          factoryId: "environment-field",
          bossOwnerId: "enemy:rootbound",
        });
      expect(fields.every((field) => field.geometry.x >= 0 && field.geometry.x + (field.geometry.w ?? 0) <= 1600)).toBe(
        true,
      );
      expect([...fields].sort((left, right) => left.startTick - right.startTick)).toEqual(fields);
    });
  });

  it("installs a Rootbound pattern idempotently and advances it in the existing field runtime", () => {
    const runtime = createEnvironmentRuntime({ stageId: "verdant-sanctum", worldId: "rootbound-bloom" });
    bindVerdantEnvironmentActors(runtime, "bloom-well", () => []);
    const input = {
      patternId: "alternating-rise" as const,
      bossOwnerId: "enemy:rootbound",
      startTick: 240,
      arenaWidth: 1600,
      groundY: 800,
    };
    const first = installRootboundBloomPattern(runtime, input);
    const repeated = installRootboundBloomPattern(runtime, { ...input, startTick: 241 });
    expect(runtime.fields()).toHaveLength(2);
    expect(repeated.map((field) => field.id)).toEqual(first.map((field) => field.id));
    runtime.step(first[0]?.transitionTick ?? 0, 1 / 120, () => undefined, new Set(["enemy:rootbound"]));
    expect(runtime.fields()[0]).toMatchObject({ state: "active", bossOwnerId: "enemy:rootbound" });
    expect(runtime.fields()[1]).toMatchObject({ state: "dormant", bossOwnerId: "enemy:rootbound" });
  });
});
