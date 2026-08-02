import { applyWeapon } from "../gameplay/weapons";
import { projectCanonicalGameplayState, type CanonicalGameplayState } from "../gameplay/runtime/canonical-state";
import type { AuthoritativeInputSnapshot, AuthoritativeInputState } from "../gameplay/runtime/authoritative-input";
import type { TearSnapshotV1 } from "./contracts";
import { applyTearCodecConfiguration, hydrateTearCodecWorld } from "./detached-world-hydrator";
import { createProductionCombatSimulation } from "./production-combat-simulation";
import { createProductionReplayWorld, type ProductionReplayWorld } from "./production-world-factory";

export interface ProductionGhostReplayCompositionOptions {
  readonly seed: string;
  readonly mode?: string;
  readonly inputSnapshots?: ReadonlyMap<number, AuthoritativeInputSnapshot>;
}

function canonicalProjection(replay: ProductionReplayWorld, tick: number, input: AuthoritativeInputState) {
  return projectCanonicalGameplayState(
    tick,
    input.snapshot(),
    replay.world.state.run(),
    replay.world.state.player() as never,
    replay.world.state.blade() as never,
    replay.world.state.enemies().map((entity) => {
      const enemy = entity as never as { _gid?: number; kind: string; bossId?: string;
        x: number; y: number; vx: number; vy: number; hp: number; dead: boolean };
      return {
        ...(typeof enemy._gid === "number" ? { _gid: enemy._gid } : {}), kind: enemy.kind,
        ...(typeof enemy.bossId === "string" ? { bossId: enemy.bossId } : {}),
        x: enemy.x, y: enemy.y, vx: enemy.vx, vy: enemy.vy, hp: enemy.hp, dead: enemy.dead,
      };
    }),
  );
}

/** Applies a saved State Forge world to a newly composed production replay world. */
function hydrateProductionReplayWorld(replay: ProductionReplayWorld, snapshot: TearSnapshotV1) {
  const codecWorld = {
    components: new Map(Object.entries(snapshot.state)),
    references: new Map<string, string>(),
    entityIds: new Set<string>(),
  } as never;
  const staged = hydrateTearCodecWorld(
    { ...replay.world.entities, hydrateReward: () => null },
    codecWorld,
    { requireIdentity: (id: string) => id },
  );
  if (staged.tick !== snapshot.tick) throw new TypeError("recorded snapshot tick does not match its run component");
  replay.world.state.setRun(staged.run);
  replay.world.state.setPlayer(staged.player);
  replay.world.state.setBlade(staged.blade);
  replay.world.state.setEnemies(staged.enemies);
  replay.world.state.setProjectiles(staged.projectiles);
  replay.world.state.setFloaters(staged.floaters as never);
  replay.world.state.setSlowZones(staged.slowZones as never);
  replay.world.state.setTemporaryWalls(staged.walls as never);
  replay.configuration.resetToBase();
  const weapon = applyWeapon(replay.configuration.value, staged.weaponId);
  const restoredConfiguration = replay.configuration.snapshot();
  applyTearCodecConfiguration(restoredConfiguration, staged.configuration);
  replay.configuration.restore(restoredConfiguration);
  const blade = staged.blade as { weapon: unknown; model: unknown };
  blade.weapon = weapon; blade.model = weapon.model;
  replay.world.context.services.random.restore(staged.rng as never);
  replay.stage.index = staged.stageIndex;
  replay.stage.platforms = [...staged.platforms] as unknown[];
  replay.world.lifecycle.restore(staged.runtime.lifecycle as never);
  // An inactive cinematic is restored directly. An active script has an
  // authored binding that must be rebuilt from its data-only chapter contract;
  // reject it here rather than falsely treating an unbound script as replayed.
  replay.world.context.cinema.restoreState(staged.runtime.cinema);
  const transient = replay.world.context.transient;
  transient.assignImpact({ hitStop: Number(staged.runtime.hitStop), slowMotion: Number(staged.runtime.slowmo), shake: Number(staged.runtime.shake) });
  transient.assignOpening({ throwCooldown: Number(staged.runtime.throwCd), dashGhostTime: Number(staged.runtime.dashGhostT),
    landingVelocity: Number(staged.runtime.landingV), wasDashing: Boolean(staged.runtime.wasDashing),
    wasSwinging: Boolean(staged.runtime.wasSwinging), wasOnGround: Boolean(staged.runtime.wasOnGround) });
  Object.assign(transient.feel, { timeScale: Number(staged.runtime.timeScale), zoom: Number(staged.runtime.zoom), flash: Number(staged.runtime.flash),
    bannerSeconds: Number(staged.runtime.bannerT), worldZoom: Number(staged.runtime.worldZoom), worldZoomTarget: Number(staged.runtime.worldZoomTarget),
    rankPopupSeconds: Number(staged.runtime.rankPopT), rankPopupText: String(staged.runtime.rankPopText) });
  const protection = staged.runtime.cinemaProtection as Readonly<{ active?: unknown; lastMode?: unknown }> | undefined;
  transient.assignProtection({ active: Boolean(protection?.active), lastMode: typeof protection?.lastMode === "string" ? protection.lastMode : null });
  return staged;
}

/**
 * Rebuilds a V3 keyframe through the same source-owned world and combat graph
 * used by the C29 replay path. It owns no Vault access and never mutates the
 * source snapshot; Vault/admission adapters remain responsible for custody.
 */
export function createProductionGhostReplayComposition(
  options: ProductionGhostReplayCompositionOptions,
) {
  return Object.freeze({
    create(snapshot: TearSnapshotV1 | undefined) {
      const replay = createProductionReplayWorld({ seed: snapshot?.seed ?? options.seed,
        ...(options.mode === undefined ? {} : { mode: options.mode }) });
      const staged = snapshot === undefined ? undefined : hydrateProductionReplayWorld(replay, snapshot);
      const core = createProductionCombatSimulation<CanonicalGameplayState>(replay, {
        ...(staged === undefined || staged.platforms.length === 0 ? {} : { platforms: staged.platforms }),
        snapshot: (tick, input) => canonicalProjection(replay, tick, input),
      });
      if (staged !== undefined) {
        core.combatEntityRuntime.restoreIdentityState(staged.identityState as never);
        for (const binding of staged.identityBindings) core.combatEntityRuntime.bindId(binding.entity, binding.id);
      }
      core.simulationRuntime.reset(snapshot?.tick ?? 0);
      if (snapshot !== undefined) {
        const input = options.inputSnapshots?.get(snapshot.tick);
        if (input !== undefined) core.simulationRuntime.input.restore(input);
      }
      return Object.freeze({
        simulation: core.simulationRuntime,
        semanticProjection: () => core.simulationRuntime.lastResult?.state
          ?? canonicalProjection(replay, core.simulationRuntime.scheduler.tick, core.simulationRuntime.input),
      });
    },
  });
}
