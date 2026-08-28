import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { EnvelopeSequencer, type CommandEnvelope } from "../../src/domain/envelopes";
import type { GameAction } from "../../src/input/game-action";
import { projectCanonicalGameplayState } from "../../src/gameplay/runtime/canonical-state";
import { TearGameplayEventBus, type TearGameplayEvent } from "../../src/gameplay/runtime/gameplay-events";
import { projectGameplayEventForParity, type TearSemanticEngineEventV1 } from
  "../../src/tearbench/gameplay-causal-events";
import { applyTearCodecConfiguration, hydrateTearCodecWorld, type TearCodecValue } from "../../src/tearbench";
import { applyWeapon } from "../../src/gameplay/weapons";
import { createDetachedCombatSimulation, createDetachedWaveRewardRuntime, createDetachedWorld,
  createDetachedRunOutcomeController, restoreDetachedChapterBinding } from "./detached-world-harness";

const ARTIFACT_DIR = resolve("artifacts/tearbench/checkpoints/core/C27A/live-parity");

interface LiveTrace {
  readonly scenario: { readonly id: string; readonly seed: string; readonly maxTicks: number;
    readonly start: { readonly mode: string; readonly difficulty: string; readonly weapon: string;
      readonly boss?: string } };
  readonly schedule: Record<string, readonly { readonly tick: number; readonly id: number; readonly command: GameAction }[]>;
  readonly origin: { readonly tick: number; readonly state: Record<string, TearCodecValue> };
  readonly terminated?: boolean;
  readonly hashes: readonly { readonly tick: number; readonly canonical: string;
    readonly state: Record<string, unknown> }[];
  readonly checkpoints: readonly { readonly tick: number; readonly state: Record<string, TearCodecValue>;
    readonly canonical: Record<string, unknown> }[];
  readonly engineEventProjection: Readonly<{
    format: "tear-semantic-engine-events";
    schemaVersion: 1;
    boundary: Readonly<{ kind: "post-origin-snapshot"; originTick: number }>;
    events: readonly TearSemanticEngineEventV1[];
  }>;
  readonly segments?: readonly (
    | Readonly<{ kind: "fixed"; fromTick: number; toTick: number;
      actions: readonly { readonly command: GameAction }[] }>
    | Readonly<{ kind: "route"; atTick: number;
      actions: readonly { readonly command: GameAction }[] }>
  )[];
  readonly routeBoundaries?: readonly unknown[];
}

/** Every captured scenario, so the matrix is compared rather than one case. */
function readTraces(): readonly LiveTrace[] {
  if (!existsSync(ARTIFACT_DIR)) return [];
  return readdirSync(ARTIFACT_DIR)
    .filter((name) => name.startsWith("c27a.live-parity-trace") && name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(readFileSync(resolve(ARTIFACT_DIR, name), "utf8")) as LiveTrace);
}

/**
 * Hydrates the live origin snapshot into a detached world built by the
 * production composition, then replays the live action schedule through the
 * production opening phase and records the same canonical projection the live
 * authoritative step hashes.
 */
function replayDetached(trace: LiveTrace) {
  const detached = createDetachedWorld({ seed: trace.scenario.seed, mode: trace.scenario.start.mode });
  const { world } = detached;
  const codecWorld = {
    components: new Map(Object.entries(trace.origin.state)),
    references: new Map<string, string>(),
    entityIds: new Set<string>(),
  } as never;
  const staged = hydrateTearCodecWorld(
    { ...world.entities, hydrateReward: () => null },
    codecWorld,
    { requireIdentity: (id: string) => id },
  );
  world.state.setRun(staged.run);
  world.state.setPlayer(staged.player);
  world.state.setBlade(staged.blade);
  world.state.setEnemies(staged.enemies);
  world.state.setProjectiles(staged.projectiles);
  world.state.setFloaters(staged.floaters as never);
  world.state.setSlowZones(staged.slowZones as never);
  world.state.setTemporaryWalls(staged.walls as never);
  // Entity tuning reads configuration, so a world restored without the
  // captured values would simulate differently from the world it came from.
  // Exactly the live State Forge commit order: reset configuration to base,
  // apply the weapon (which mutates tuning), then restore the captured
  // configuration over it, then install the weapon on the blade. Any other
  // order leaves the world tuned differently from the one it came from.
  detached.configuration.resetToBase();
  const weapon = applyWeapon(detached.configuration.value, staged.weaponId);
  const restoredConfiguration = detached.configuration.snapshot();
  applyTearCodecConfiguration(restoredConfiguration, staged.configuration);
  detached.configuration.restore(restoredConfiguration);
  const stagedBlade = staged.blade as { weapon: unknown; model: unknown };
  stagedBlade.weapon = weapon;
  stagedBlade.model = weapon.model;
  const rng = trace.origin.state["tear.rng.v1"];
  if (rng !== undefined) world.context.services.random.restore(rng as never);
  detached.stage.index = staged.stageIndex;
  const platforms = staged.platforms.length > 0 ? staged.platforms : undefined;
  const gameplayEvents = new TearGameplayEventBus(() => trace.origin.tick);
  const nativeEvents: TearGameplayEvent[] = [];
  gameplayEvents.subscribe((event) => nativeEvents.push(event));
  const outcome = createDetachedRunOutcomeController(detached, gameplayEvents);
  let updateWave: (seconds: number) => void = () => undefined;
  const core = createDetachedCombatSimulation(detached, {
    ...(platforms === undefined ? {} : { platforms }),
    updateWave: (seconds) => { updateWave(seconds); },
    endRun: () => { outcome.controller.defeat(); },
    gameplayEvents,
    // Exactly the live authoritative projection, so the hashes are comparable.
    snapshot: (tick, authoritativeInput) => projectCanonicalGameplayState(
      tick, authoritativeInput.snapshot(),
      world.state.run(), world.state.player() as never, world.state.blade() as never,
      world.state.enemies().map((entity) => {
        const enemy = entity as never as { _gid?: number; kind: string; bossId?: string;
          x: number; y: number; vx: number; vy: number; hp: number; dead: boolean };
        return {
          ...(typeof enemy._gid === "number" ? { _gid: enemy._gid } : {}), kind: enemy.kind,
          ...(typeof enemy.bossId === "string" ? { bossId: enemy.bossId } : {}),
          x: enemy.x, y: enemy.y, vx: enemy.vx, vy: enemy.vy, hp: enemy.hp, dead: enemy.dead,
        };
      }),
    ),
  });
  const waves = createDetachedWaveRewardRuntime(
    detached, gameplayEvents, (enemy) => core.combatEntityRuntime.id(enemy, "enemy"), platforms,
  );
  updateWave = waves.update;
  const runtime = core.simulationRuntime;
  gameplayEvents.setTickSource(() => runtime.scheduler.tick);
  core.combatEntityRuntime.restoreIdentityState(staged.identityState as never);
  for (const binding of staged.identityBindings) core.combatEntityRuntime.bindId(binding.entity, binding.id);
  const originIdentity = core.combatEntityRuntime.captureIdentityState();
  runtime.reset(trace.origin.tick);
  restoreDetachedChapterBinding(detached, staged.runtime);
  const outward = core.outward;

  const sequencer = new EnvelopeSequencer();
  const hashes: { tick: number; canonical: string }[] = [];
  const states: unknown[] = [];
  const routeBoundaries: unknown[] = [];
  const routeProjection = () => {
    const active = world.state.run() as never as { wave: number; mods: { owned: Record<string, number> } };
    const selection = waves.reward.snapshot();
    return {
      tick: runtime.scheduler.tick, screen: waves.screen(), wave: active.wave,
      lifecycle: world.lifecycle.snapshot(),
      reward: selection === null ? null : {
        phase: selection.phase, choiceIds: selection.choices.map((choice) => choice.id),
        reserveChoiceIds: selection.reserveChoices.map((choice) => choice.id),
      },
      focusableIds: waves.screen() === "draft" ? selection?.choices.map((choice) => choice.id) ?? [] : [],
      owned: { ...active.mods.owned },
    };
  };
  const segments = trace.segments ?? trace.hashes.map((_, index) => {
    const tick = index + 1;
    return { kind: "fixed" as const, fromTick: tick - 1, toTick: tick,
      actions: trace.schedule[String(tick)] ?? [] };
  });
  for (const segment of segments) {
    if (segment.kind === "route") {
      const before = routeProjection();
      for (const entry of segment.actions) {
        sequencer.command(segment.atTick + 1, entry.command);
        if (!waves.routeAction(entry.command)) throw new Error(`detached route rejected ${entry.command.type}`);
      }
      routeBoundaries.push({ before, after: routeProjection() });
    } else {
      const actions: CommandEnvelope<GameAction>[] = segment.actions.map((entry) =>
        sequencer.command(segment.toTick, entry.command));
      const result = runtime.advanceOne(actions);
      hashes.push({ tick: result.tick, canonical: result.stateHash });
      states.push(result.state);
    }
  }
  return { detached, hashes, states, outward, staged,
    originIdentity, finalIdentity: core.combatEntityRuntime.captureIdentityState(), gameplayEvents,
    engineEvents: nativeEvents.map(projectGameplayEventForParity), routeBoundaries };
}

const traces = readTraces();

describe.skipIf(traces.length === 0)("detached world against the live trace", () => {
  it("compares every captured scenario", () => {
    // A missing matrix would silently reduce this gate to one case.
    expect(traces.length).toBeGreaterThanOrEqual(4);
    // A terminal run is the only scenario that exercises death resolution.
    expect(traces.some((entry) => entry.terminated === true)).toBe(true);
    expect(new Set(traces.map((entry) => entry.scenario.seed)).size).toBe(traces.length);
    for (const entry of traces) {
      expect(entry.engineEventProjection).toBeDefined();
      expect(entry.engineEventProjection.format).toBe("tear-semantic-engine-events");
      expect(entry.engineEventProjection.schemaVersion).toBe(1);
      expect(entry.engineEventProjection.boundary.kind).toBe("post-origin-snapshot");
      expect(entry.engineEventProjection.boundary.originTick).toBe(entry.origin.tick);
    }
  });

  for (const live of traces) {
    const label = `${live.scenario.start.mode}/${live.scenario.start.boss ?? live.scenario.start.difficulty}/${live.scenario.start.weapon}` +
      ` x${String(live.hashes.length)}${live.terminated === true ? " terminal" : ""}`;

    it(`hydrates the live origin snapshot into a production-composed world (${label})`, () => {
      const { staged, detached, originIdentity } = replayDetached(live);

      expect(staged.player).toBeTruthy();
      expect(staged.blade).toBeTruthy();
      expect(detached.world.state.run()).not.toBeNull();
      expect(originIdentity).toEqual(staged.identityState);
      expect(detached.world.context.cinema.captureState()).toEqual(staged.runtime.cinema);
      if (live.scenario.start.mode === "campaign") {
        expect(detached.world.context.cinema).toMatchObject({ active: true, id: "chapter-0", blocksCombat: true });
      }
      // Whatever the live run had spawned by the origin tick must be rebuilt,
      // and the replay may then spawn more through the production wave runtime.
      expect(detached.world.state.enemies().length).toBeGreaterThanOrEqual(staged.enemies.length);
    });

    it(`replays the live action schedule deterministically after hydration (${label})`, () => {
      const first = replayDetached(live);
      const second = replayDetached(live);

      expect(second.hashes).toEqual(first.hashes);
      expect(second.outward).toEqual(first.outward);
      expect(first.hashes).toHaveLength(live.hashes.length);
    });

    it(`matches the live authoritative hash on every tick (${label})`, () => {
      const { hashes, states, detached, engineEvents, routeBoundaries } = replayDetached(live);
      let matched = 0;
      for (const [index, entry] of hashes.entries()) {
        const expected = live.hashes[index];
        if (expected?.canonical !== entry.canonical) break;
        matched += 1;
      }
      const finalCheckpoint = live.checkpoints.at(-1);
      const liveRun = finalCheckpoint?.state["tear.run.v1"] as { runTime: number } | undefined;
      const detachedRunState = detached.world.state.run() as never as { runTime: number };

      if (matched !== live.hashes.length) {
        const firstDivergent = live.hashes[matched];
        const detachedState = states[matched] as Record<string, unknown> | undefined;
        if (firstDivergent !== undefined && detachedState !== undefined) {
          for (const key of Object.keys(firstDivergent.state)) {
            const liveValue = JSON.stringify(firstDivergent.state[key]);
            const detachedValue = JSON.stringify(detachedState[key]);
            if (liveValue !== detachedValue) {
              console.log(`${label} t${String(firstDivergent.tick)} DIVERGES ${key}:
  live     ${liveValue}
  detached ${detachedValue}`);
            }
          }
        }
      }

      expect(hashes).toHaveLength(live.hashes.length);
      expect(hashes[0]?.tick).toBe(live.hashes[0]?.tick);

      // The whole sequence, not a prefix: live and detached must agree on every
      // authoritative state hash for this scenario.
      expect(hashes.map((entry) => entry.canonical)).toEqual(live.hashes.map((entry) => entry.canonical));
      expect(matched).toBe(live.hashes.length);

      // The run clock is accumulated by finalizeCombatTick inside the collision
      // phase. A blocking chapter correctly leaves it at zero; every other
      // trace advances it. In both cases the exact live value is authoritative.
      expect(liveRun?.runTime).toBeTypeOf("number");
      expect(detachedRunState.runTime).toBe(liveRun?.runTime);

      // Closed divergence: with the captured configuration restored and the
      // production wave runtime spawning content, the detached player ends the
      // scenario on exactly the live x, to the last float bit.
      const livePlayer = finalCheckpoint?.state["tear.player.v1"] as { x: number } | undefined;
      const detachedPlayer = detached.world.state.player() as never as { x: number };
      expect(livePlayer?.x).toBeTypeOf("number");
      expect(detachedPlayer.x).toBe(livePlayer?.x);

      expect(engineEvents).toEqual(live.engineEventProjection.events);
      expect(routeBoundaries).toEqual(live.routeBoundaries ?? []);
    });
  }
});
