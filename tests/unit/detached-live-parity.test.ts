import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { EnvelopeSequencer, type CommandEnvelope } from "../../src/domain/envelopes";
import type { GameAction } from "../../src/input/game-action";
import { projectCanonicalGameplayState } from "../../src/gameplay/runtime/canonical-state";
import { TearSimulationRuntime } from "../../src/gameplay/runtime/tear-simulation-runtime";
import { applyTearCodecConfiguration, hydrateTearCodecWorld, type TearCodecValue } from "../../src/tearbench";
import { CONFIG } from "../../src/config/game-config";
import { createDetachedCombatPhases, createDetachedWaveRuntime, createDetachedWorld } from "./detached-world-harness";

const ARTIFACT = resolve("artifacts/tearbench/c27a/live-parity-trace.json");

interface LiveTrace {
  readonly scenario: { readonly seed: string; readonly maxTicks: number;
    readonly start: { readonly mode: string; readonly difficulty: string; readonly weapon: string } };
  readonly schedule: Record<string, readonly { readonly tick: number; readonly id: number; readonly command: GameAction }[]>;
  readonly origin: { readonly tick: number; readonly state: Record<string, TearCodecValue> };
  readonly hashes: readonly { readonly tick: number; readonly canonical: string;
    readonly state: Record<string, unknown> }[];
  readonly checkpoints: readonly { readonly tick: number; readonly state: Record<string, TearCodecValue>;
    readonly canonical: Record<string, unknown> }[];
}

function readTrace(): LiveTrace | null {
  if (!existsSync(ARTIFACT)) return null;
  return JSON.parse(readFileSync(ARTIFACT, "utf8")) as LiveTrace;
}

/**
 * Hydrates the live origin snapshot into a detached world built by the
 * production composition, then replays the live action schedule through the
 * production opening phase and records the same canonical projection the live
 * authoritative step hashes.
 */
function replayDetached(trace: LiveTrace) {
  const detached = createDetachedWorld({ seed: trace.scenario.seed, mode: trace.scenario.start.mode });
  const { world, clock, input } = detached;
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
  // Entity tuning reads configuration, so a world restored without the
  // captured values would simulate differently from the world it came from.
  applyTearCodecConfiguration(CONFIG, staged.configuration);
  const rng = trace.origin.state["tear.rng.v1"];
  if (rng !== undefined) world.context.services.random.restore(rng as never);

  const platforms = staged.platforms.length > 0 ? staged.platforms : undefined;
  const waves = createDetachedWaveRuntime(detached, platforms);
  const phases = createDetachedCombatPhases(detached, {
    ...(platforms === undefined ? {} : { platforms }),
    updateWave: waves.update,
  });
  const outward = phases.outward;

  const runtime = new TearSimulationRuntime({
    actionPort: input.actionPort,
    step: (seconds) => { clock.sim += seconds; phases.step(seconds); },
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
  runtime.reset(trace.origin.tick);

  const sequencer = new EnvelopeSequencer();
  const hashes: { tick: number; canonical: string }[] = [];
  const states: unknown[] = [];
  for (let tick = 1; tick <= trace.scenario.maxTicks; tick += 1) {
    const scheduled = trace.schedule[String(tick)] ?? [];
    const actions: CommandEnvelope<GameAction>[] = scheduled.map((entry) => sequencer.command(tick, entry.command));
    const result = runtime.advanceOne(actions);
    hashes.push({ tick: result.tick, canonical: result.stateHash });
    states.push(result.state);
  }
  return { detached, hashes, states, outward, staged };
}

const trace = readTrace();

function requireTrace(): LiveTrace {
  if (trace === null) throw new Error("live parity trace artifact is missing");
  return trace;
}

describe.skipIf(trace === null)("detached world against the live trace", () => {
  it("hydrates the live origin snapshot into a production-composed world", () => {
    const live = requireTrace();
    const { staged, detached } = replayDetached(live);

    expect(staged.player).toBeTruthy();
    expect(staged.blade).toBeTruthy();
    expect(detached.world.state.run()).not.toBeNull();
    // Whatever the live run had spawned by the origin tick must be rebuilt,
    // and the replay may then spawn more through the production wave runtime.
    expect(detached.world.state.enemies().length).toBeGreaterThanOrEqual(staged.enemies.length);
  });

  it("replays the live action schedule deterministically after hydration", () => {
    const live = requireTrace();
    const first = replayDetached(live);
    const second = replayDetached(live);

    expect(second.hashes).toEqual(first.hashes);
    expect(second.outward).toEqual(first.outward);
    expect(first.hashes).toHaveLength(live.scenario.maxTicks);
  });

  it("matches the live authoritative hash on every tick of the scenario", () => {
    const live = requireTrace();
    const { hashes, states, detached } = replayDetached(live);
    let matched = 0;
    for (const [index, entry] of hashes.entries()) {
      const expected = live.hashes[index];
      if (expected?.canonical !== entry.canonical) break;
      matched += 1;
    }
    const finalCheckpoint = live.checkpoints.at(-1);
    const liveRun = finalCheckpoint?.state["tear.run.v1"] as { runTime: number } | undefined;
    const detachedRunState = detached.world.state.run() as never as { runTime: number };

    expect(hashes).toHaveLength(live.hashes.length);
    expect(hashes[0]?.tick).toBe(live.hashes[0]?.tick);
    // The whole sequence, not a prefix: live and detached must agree on every
    // authoritative state hash for this scenario.
    expect(hashes.map((entry) => entry.canonical)).toEqual(live.hashes.map((entry) => entry.canonical));
    expect(matched).toBe(live.hashes.length);

    // Closed divergence: the run clock is accumulated by finalizeCombatTick
    // inside the collision phase, so once the detached world runs BOTH phases
    // its run time matches the live host exactly, to the last float bit.
    expect(liveRun?.runTime).toBeGreaterThan(0);
    expect(detachedRunState.runTime).toBe(liveRun?.runTime);

    // Closed divergence: with the captured configuration restored and the
    // production wave runtime spawning content, the detached player ends the
    // scenario on exactly the live x, to the last float bit.
    const livePlayer = finalCheckpoint?.state["tear.player.v1"] as { x: number } | undefined;
    const detachedPlayer = detached.world.state.player() as never as { x: number };
    expect(livePlayer?.x).toBeTypeOf("number");
    expect(detachedPlayer.x).toBe(livePlayer?.x);

    console.log(`detached/live canonical hash agreement: ${String(matched)}/${String(live.hashes.length)} ticks`);
    const firstDivergent = live.hashes[matched];
    const detachedState = states[matched] as Record<string, unknown> | undefined;
    if (firstDivergent !== undefined && detachedState !== undefined) {
      for (const key of Object.keys(firstDivergent.state)) {
        const liveValue = JSON.stringify(firstDivergent.state[key]);
        const detachedValue = JSON.stringify(detachedState[key]);
        if (liveValue !== detachedValue) {
          console.log(`t${String(firstDivergent.tick)} DIVERGES ${key}:
  live     ${liveValue}
  detached ${detachedValue}`);
        }
      }
    }
  });
});
