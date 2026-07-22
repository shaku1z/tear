// ------- enemies: shared base + Charger, Ranged, Flyer, Bomber, Armored, Boss -------
import { createAirEnemyTypes } from "./enemy-types/air-enemies";
import { createAldricType } from "./enemy-types/aldric";
import { createBossRuntime } from "./enemy-types/boss-runtime";
import { createColossusType } from "./enemy-types/colossus";
import { createEchoEnemyTypes } from "./enemy-types/echo-enemies";
import { createEnemyBase } from "./enemy-types/enemy-base";
import { createGroundEnemyTypes } from "./enemy-types/ground-enemies";
import { createSourceType } from "./enemy-types/source";
import { createSpecialEnemyTypes } from "./enemy-types/special-enemies";
import { createThroneFireRuntime } from "./enemy-types/throne-fire";
import { createWardenType } from "./enemy-types/warden";
import type { EnemyDependencies } from "./enemy-contracts";

function createEnemyTypes(dependencies: EnemyDependencies) {
  const drawBossTransformationWorld = dependencies.presentation?.drawBossTransformationWorld ?? (() => undefined);
  const bossRuntime = createBossRuntime(dependencies);
  const throneFireRuntime = createThroneFireRuntime(dependencies);
  const Enemy = createEnemyBase(dependencies, bossRuntime);
  const { Charger, Ranged } = createGroundEnemyTypes(dependencies, Enemy);
  const { Flyer, Bomber, Armored } = createAirEnemyTypes(dependencies, Enemy);
  const { Boss, Support, Wraith, Chimera } = createSpecialEnemyTypes(dependencies, Enemy);
  const { BOSSFX, weaponCapsuleIntersectsSegment } = bossRuntime;
  const Warden = createWardenType(dependencies, Enemy, bossRuntime);
  const Colossus = createColossusType(dependencies, Enemy, bossRuntime);
  const Aldric = createAldricType(dependencies, Enemy, bossRuntime, throneFireRuntime);
  const { Echo, VoidWisp } = createEchoEnemyTypes(dependencies, Enemy, bossRuntime);
  const Source = createSourceType(dependencies, Enemy, bossRuntime, throneFireRuntime);

  return Object.freeze({
    Aldric, Armored, BOSSFX, Bomber, Boss, Charger, Chimera, Colossus, Echo, Enemy,
    Flyer, Ranged, Source, Support, VoidWisp, Warden, Wraith,
    drawBossTransformationWorld, weaponCapsuleIntersectsSegment,
  });
}

export { createEnemyTypes };
export type EnemyTypes = ReturnType<typeof createEnemyTypes>;
