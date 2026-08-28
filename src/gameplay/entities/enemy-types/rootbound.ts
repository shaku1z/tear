import type { EnemyDependencies, EnemyPlatform, EnemyPlayerPort, EnemyProjectile } from "../enemy-contracts";
import type { EnemyBaseConstructor } from "./enemy-base";
import { ROOTBOUND_PROVISIONAL_DEFINITION } from "../../run/boss-definitions";

/** Factory-safe Rootbound shell. C11-C13 own the authored attack phases. */
export function createRootboundType(dependencies: EnemyDependencies, Enemy: EnemyBaseConstructor) {
  const { CONFIG } = dependencies;
  class Rootbound extends Enemy {
    declare cfg: typeof CONFIG.boss;
    override readonly phaseMarks: [number, number] = [
      ROOTBOUND_PROVISIONAL_DEFINITION.phaseMarks[0],
      ROOTBOUND_PROVISIONAL_DEFINITION.phaseMarks[1],
    ];
    readonly availableAttacks: readonly string[] = Object.freeze([]);

    constructor(x: number, y: number) {
      super(x, y, CONFIG.boss);
      this.kind = "rootbound";
      this.bossId = ROOTBOUND_PROVISIONAL_DEFINITION.id;
      this.bossName = ROOTBOUND_PROVISIONAL_DEFINITION.name;
      this.presentationId = ROOTBOUND_PROVISIONAL_DEFINITION.id;
      this.isBoss = true;
      this.color = CONFIG.colors.boss;
      this.atk = "unavailable";
    }

    get phase(): number {
      const fraction = this.maxHp > 0 ? this.hp / this.maxHp : 0;
      return fraction > this.phaseMarks[0] ? 1 : fraction > this.phaseMarks[1] ? 2 : 3;
    }

    update(dt: number, platforms: readonly EnemyPlatform[], player: EnemyPlayerPort, projectiles: EnemyProjectile[]): void {
      void player;
      void projectiles;
      this.tickTimers(dt);
      this.vx = 0;
      this.integrate(dt, platforms);
    }
  }
  return Rootbound;
}
