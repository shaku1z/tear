import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { EnvelopeSequencer, type CommandEnvelope } from "../../src/domain/envelopes";
import type { GameAction } from "../../src/input/game-action";
import { CONFIG } from "../../src/config/game-config";
import { aabbOverlap, len } from "../../src/domain/geometry";
import { runLiveOpeningPhase, type LiveOpeningPhaseHost } from "../../src/gameplay/combat/live-opening-phase";
import { projectCanonicalGameplayState } from "../../src/gameplay/runtime/canonical-state";
import { TearSimulationRuntime } from "../../src/gameplay/runtime/tear-simulation-runtime";
import { hydrateTearCodecWorld, type TearCodecValue } from "../../src/tearbench";
import { createDetachedWorld, DETACHED_PLATFORMS } from "./detached-world-harness";

const ARTIFACT = resolve("artifacts/tearbench/c27a/live-parity-trace.json");

interface LiveTrace {
  readonly scenario: { readonly seed: string; readonly maxTicks: number;
    readonly start: { readonly mode: string; readonly difficulty: string; readonly weapon: string } };
  readonly schedule: Record<string, readonly { readonly tick: number; readonly id: number; readonly command: GameAction }[]>;
  readonly origin: { readonly tick: number; readonly state: Record<string, TearCodecValue> };
  readonly hashes: readonly { readonly tick: number; readonly canonical: string }[];
  readonly checkpoints: readonly { readonly tick: number; readonly state: Record<string, TearCodecValue> }[];
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
  const { world, clock, effects, transient, input } = detached;
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
  const rng = trace.origin.state["tear.rng.v1"];
  if (rng !== undefined) world.context.services.random.restore(rng as never);

  const outward: string[] = [];
  const note = (name: string) => () => { outward.push(name); };
  const platforms = (staged.platforms.length > 0 ? staged.platforms : DETACHED_PLATFORMS) as unknown as LiveOpeningPhaseHost["platforms"];
  const opening = {
    get player() { return world.state.player() as never; },
    get blade() { return world.state.blade() as never; },
    get run() { return world.state.run() as never; },
    get enemies() { return world.state.enemies() as never; },
    get projectiles() { return world.state.projectiles(); },
    platforms, state: transient.opening, width: CONFIG.view.w,
    blocking: false, playerMode: "play", protection: transient.protection,
    lowGraphics: false, transformationBlocked: false,
    overrunMovementMultiplier: () => 1, runDamageMultiplier: () => 1,
    stepCinematic: () => undefined, flushClosingInput: note("flushClosingInput"),
    updateWeaponAbilities: () => undefined, updateWorldHazards: () => undefined,
    syncVoidSupport: () => undefined, activateThrowSecondary: note("activateThrowSecondary"),
    linkBroken: (reason: string) => { outward.push(`linkBroken:${reason}`); },
    distance: (ax: number, ay: number, bx: number, by: number) => len(ax - bx, ay - by),
    areaDamage: note("areaDamage"), ring: note("ring"), burst: note("burst"), floater: note("floater"),
    shake: note("shake"), sound: (name: string) => { outward.push(`sound:${name}`); },
    ghost: note("ghost"), ember: note("ember"), smoke: note("smoke"), drip: note("drip"),
    overlap: (a: { x: number; y: number; hw: number; hh: number }, b: { x: number; y: number; hw: number; hh: number }) =>
      aabbOverlap(a.x, a.y, a.hw, a.hh, b.x, b.y, b.hw, b.hh),
    styleHit: note("styleHit"),
    onKill: (enemy: { dead?: boolean }) => { enemy.dead = true; outward.push("onKill"); },
    fireDashStart: note("fireDashStart"), fireDashContact: note("fireDashContact"),
    fireWeaponCatch: note("fireWeaponCatch"), fireThrowLaunch: note("fireThrowLaunch"),
    logThrowLaunch: note("logThrowLaunch"), weaponWorldImpact: () => null,
    lobExplode: note("lobExplode"), emitThrowResolve: note("emitThrowResolve"),
    nearestEnemy: () => (world.state.enemies()[0] ?? null) as never,
    updateFeedback: () => undefined, consumeThrow: () => input.consumeThrow(() => false),
    updateWave: () => undefined, startTransformation: () => false, updateSupports: () => undefined,
    armorBypass: note("armorBypass"), resolveBossZones: () => undefined,
    updateBossArenaPlatforms: () => undefined, updateVoidScroll: () => undefined,
    unlockWitness: note("unlockWitness"), startVoidDescent: () => false,
    spawnBossAdds: () => [], spawnBossClone: () => undefined, removeBossClone: () => undefined,
    dramaticBeat: note("dramaticBeat"), onBladeStolen: note("onBladeStolen"),
    updateEffects: (dt: number) => { effects.update(dt); },
    random: () => world.context.services.random.stream("enemy-ai").next(),
  } as unknown as LiveOpeningPhaseHost;

  const runtime = new TearSimulationRuntime({
    actionPort: input.actionPort,
    step: (seconds) => { clock.sim += seconds; runLiveOpeningPhase(opening, seconds); },
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
  for (let tick = 1; tick <= trace.scenario.maxTicks; tick += 1) {
    const scheduled = trace.schedule[String(tick)] ?? [];
    const actions: CommandEnvelope<GameAction>[] = scheduled.map((entry) => sequencer.command(tick, entry.command));
    const result = runtime.advanceOne(actions);
    hashes.push({ tick: result.tick, canonical: result.stateHash });
  }
  return { detached, hashes, outward, staged };
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
    // Whatever the live run had spawned by the origin tick must be rebuilt.
    expect(detached.world.state.enemies().length).toBe(staged.enemies.length);
  });

  it("replays the live action schedule deterministically after hydration", () => {
    const live = requireTrace();
    const first = replayDetached(live);
    const second = replayDetached(live);

    expect(second.hashes).toEqual(first.hashes);
    expect(second.outward).toEqual(first.outward);
    expect(first.hashes).toHaveLength(live.scenario.maxTicks);
  });

  it("records the measured agreement and the known divergences", () => {
    const live = requireTrace();
    const { hashes, detached } = replayDetached(live);
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

    // Recorded divergence 1: the run clock advances in the live host and not
    // in the detached world, because run-time accumulation lives outside the
    // two combat phases. The canonical projection includes run.time, so this
    // alone breaks every hash from the first tick. When it is fixed, this
    // assertion fails and the finding must be re-recorded, not deleted.
    expect(liveRun?.runTime).toBeGreaterThan(0);
    expect(detachedRunState.runTime).toBe(0);

    // Recorded divergence 2: after the same 180 ticks and the same actions the
    // detached player has travelled a different distance, so at least one
    // movement-affecting update is still live-host-owned.
    const livePlayer = finalCheckpoint?.state["tear.player.v1"] as { x: number } | undefined;
    const detachedPlayer = detached.world.state.player() as never as { x: number };
    expect(livePlayer?.x).toBeTypeOf("number");
    expect(detachedPlayer.x).not.toBe(livePlayer?.x);

    // The measurement itself is reported rather than asserted upward, so the
    // checkpoint can state the real figure instead of an aspiration.
    console.log(`detached/live canonical hash agreement: ${String(matched)}/${String(live.hashes.length)} ticks`);
  });
});
