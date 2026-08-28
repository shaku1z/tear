import type { EnemyDependencies, EnemyPlatform, EnemyPlayerPort, EnemyProjectile } from "../enemy-contracts";
import type { EnemyBaseConstructor } from "./enemy-base";
import { ROOTBOUND_PROVISIONAL_DEFINITION } from "../../run/boss-definitions";

/** Factory-safe Rootbound shell. C11-C13 own the authored attack phases. */
export function createRootboundType(dependencies: EnemyDependencies, Enemy: EnemyBaseConstructor) {
  const { CONFIG } = dependencies;
  class Rootbound extends Enemy {
    declare cfg: typeof CONFIG.boss;
    introT = 0;
    phaseMarker = 1;
    override phaseTag = "KEEPER OF SPRING";
    state: "intro" | "idle" | "recover" = "idle";
    stateT = 0.9;
    override facing = 1;
    override readonly phaseMarks: [number, number] = [
      ROOTBOUND_PROVISIONAL_DEFINITION.phaseMarks[0],
      ROOTBOUND_PROVISIONAL_DEFINITION.phaseMarks[1],
    ];
    readonly availableAttacks: readonly string[] = Object.freeze([]);

    constructor(x: number, y: number) {
      super(x, y, CONFIG.boss);
      this.kind = "rootbound";
      this.bossId = ROOTBOUND_PROVISIONAL_DEFINITION.id;
      this.bossName = "THE ROOTBOUND";
      this.epithet = "KEEPER OF THE LAST MERCY";
      this.openingLine = "YOU DO NOT HAVE TO DIE HERE.";
      this.presentationId = ROOTBOUND_PROVISIONAL_DEFINITION.id;
      this.isBoss = true;
      this.color = CONFIG.colors.boss;
      this.atk = "unavailable";
    }

    get phase(): number {
      const fraction = this.maxHp > 0 ? this.hp / this.maxHp : 0;
      const fromHp = fraction > this.phaseMarks[0] ? 1 : fraction > this.phaseMarks[1] ? 2 : 3;
      return Math.max(this.phaseMarker, fromHp);
    }

    override blocks(): boolean {
      return this.introT > 0;
    }

    override blocksDamage(): boolean {
      return this.introT > 0;
    }

    override limitIncomingDamage(damage: number): number {
      return this.introT > 0 ? 0 : damage;
    }

    override contactDamageEnabled(): boolean {
      return this.introT <= 0 && this.state === "idle";
    }

    update(dt: number, platforms: readonly EnemyPlatform[], player: EnemyPlayerPort, projectiles: EnemyProjectile[]): void {
      void projectiles;
      this.tickTimers(dt);
      const nextPhase = this.maxHp > 0 && this.hp / this.maxHp > this.phaseMarks[0]
        ? 1
        : this.maxHp > 0 && this.hp / this.maxHp > this.phaseMarks[1] ? 2 : 3;
      if (nextPhase > this.phaseMarker) {
        this.phaseMarker = nextPhase;
        this.phaseTag = nextPhase === 2 ? "THE GARDEN REMEMBERS" : "NOTHING HERE DIES";
      }
      this.facing = Math.sign(player.x - this.x) || this.facing;
      this.vx = 0;
      if (this.introT > 0) {
        this.state = "intro";
        this.stateT = this.introT;
        this.integrate(dt, platforms);
        return;
      }
      if (this.state === "intro") {
        this.state = "recover";
        this.stateT = 0.35;
      } else if (this.stun <= 0) {
        this.stateT = Math.max(0, this.stateT - dt);
        if (this.stateT <= 0) {
          this.state = this.state === "idle" ? "recover" : "idle";
          this.stateT = this.state === "idle" ? 0.9 : 0.35;
        }
      }
      this.integrate(dt, platforms);
    }
  }
  return Rootbound;
}
