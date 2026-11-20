import { TEAR_CONTRACT_FORMAT, TEAR_CONTRACT_VERSION, type TearObservationV1 } from "./contracts";
import { environmentSnapshotToObservation } from "./environment-codec";
import {
  projectLiveActorMechanics,
  projectLiveBladeMechanics,
  projectLivePlayerMechanics,
} from "./live-observation-actors";
import { projectLiveProjectiles } from "./live-observation-projectiles";
import {
  canonicalObservationActions,
  canonicalObservationEnemyKind,
  canonicalObservationStage,
} from "./observation-identity";
import type { ProductionReplayWorld } from "./production-world-factory";

/** What a scripted player is given each tick: the player, blade, enemies, projectiles and run of this exact world. */
export function projectProductionPolicyObservation(
  replay: ProductionReplayWorld,
  tick: number,
  screen: string,
): TearObservationV1 {
  const run = replay.world.state.run() as unknown as {
    mode: TearObservationV1["run"]["mode"];
    diff: TearObservationV1["run"]["difficulty"];
    weaponId: TearObservationV1["run"]["weapon"];
    wave: number;
    score: number;
  } | null;
  const sourcePlayer = replay.world.state.player();
  const player = sourcePlayer as unknown as
    | {
        x: number;
        y: number;
        vx: number;
        vy: number;
        hp: number;
        maxHp: number;
        facing?: number;
        onGround?: boolean;
        dashCharges?: number;
      }
    | undefined;
  const blade = replay.world.state.blade() as unknown as
    | {
        x: number;
        y: number;
        tipX: number;
        tipY: number;
        vx: number;
        vy: number;
        tipSpeed: number;
        state: string;
        riftChambers?: number;
        riftChamberCooldown?: number;
        wheelSpin?: number;
        reversals?: readonly unknown[];
      }
    | undefined;
  if (run === null || player === undefined || sourcePlayer === undefined || blade === undefined) {
    throw new Error("production policy observation requires an active source world");
  }
  return Object.freeze({
    format: TEAR_CONTRACT_FORMAT,
    kind: "observation",
    schemaVersion: TEAR_CONTRACT_VERSION,
    tick,
    observationClass: "structured-state",
    player: Object.freeze({
      x: player.x,
      y: player.y,
      vx: player.vx,
      vy: player.vy,
      hp: player.hp,
      maxHp: player.maxHp,
      facing: player.facing === undefined || player.facing >= 0 ? 1 : -1,
      grounded: player.onGround ?? false,
      dashCharges: player.dashCharges ?? 0,
      ...projectLivePlayerMechanics(sourcePlayer, "B"),
    }),
    blade: Object.freeze({
      handX: blade.x,
      handY: blade.y,
      tipX: blade.tipX,
      tipY: blade.tipY,
      vx: blade.vx,
      vy: blade.vy,
      tipSpeed: blade.tipSpeed,
      state: blade.state,
      ...projectLiveBladeMechanics(blade, "B"),
    }),
    entities: Object.freeze([
      ...replay.world.state
        .enemies()
        .filter((enemy: { dead?: boolean }) => !enemy.dead)
        .map((enemy, index) => {
          const value = enemy as unknown as {
            _gid?: number;
            kind?: string;
            bossId?: string;
            supportType?: string;
            isVoidWisp?: boolean;
            x: number;
            y: number;
            vx: number;
            vy: number;
            hp: number;
            maxHp?: number;
            state?: string;
          };
          return Object.freeze({
            id: `production:${String(value._gid ?? index + 1)}`,
            kind: canonicalObservationEnemyKind(value),
            x: value.x,
            y: value.y,
            vx: value.vx,
            vy: value.vy,
            hpRatio: value.maxHp === undefined || value.maxHp <= 0 ? 1 : value.hp / value.maxHp,
            state: value.state ?? "active",
            ...projectLiveActorMechanics(enemy, "B"),
          });
        }),
      ...projectLiveProjectiles(replay.world.state.projectiles(), sourcePlayer, "B"),
    ]),
    run: Object.freeze({
      mode: run.mode,
      difficulty: run.diff,
      weapon: run.weaponId,
      stage: canonicalObservationStage(replay.stage.index),
      wave: run.wave,
      score: run.score,
      elapsedTicks: tick,
    }),
    // What the stage holds (fields, things a weapon can cut, routes), as the live observation gives it.
    environment: environmentSnapshotToObservation(replay.world.context.environment.snapshot()),
    availableActions: canonicalObservationActions(screen, run.mode, false),
  });
}
