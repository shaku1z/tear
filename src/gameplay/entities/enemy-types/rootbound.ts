import type { EnemyDependencies, EnemyPlatform, EnemyPlayerPort, EnemyProjectile } from "../enemy-contracts";
import type { EnemyBaseConstructor } from "./enemy-base";
import { ROOTBOUND_PROVISIONAL_DEFINITION } from "../../run/boss-definitions";
import type { BossEncounterCleanupReason } from "../../run/boss-encounter";

export const ROOTBOUND_PHASE_ONE_ATTACK_ORDER = Object.freeze([
  "vine-sweep", "seed-arc", "rootline", "canopy-step",
] as const);
export type RootboundPhaseOneAttack = typeof ROOTBOUND_PHASE_ONE_ATTACK_ORDER[number];
export const ROOTBOUND_PHASE_ONE_CADENCE = Object.freeze({ openingDelay: 0.9, recovery: 0.55 });

/** Factory-safe Rootbound shell. C11-C13 own the authored attack phases. */
export function createRootboundType(dependencies: EnemyDependencies, Enemy: EnemyBaseConstructor) {
  const { CONFIG } = dependencies;
  class Rootbound extends Enemy {
    declare cfg: typeof CONFIG.boss;
    introT = 0;
    phaseMarker = 1;
    override phaseTag = "KEEPER OF SPRING";
    state: "intro" | "idle" | "recover" = "idle";
    stateT: number = ROOTBOUND_PHASE_ONE_CADENCE.openingDelay;
    override facing = 1;
    override readonly phaseMarks: [number, number] = [
      ROOTBOUND_PROVISIONAL_DEFINITION.phaseMarks[0],
      ROOTBOUND_PROVISIONAL_DEFINITION.phaseMarks[1],
    ];
    readonly availableAttacks: readonly string[] = Object.freeze([]);
    readonly phaseOneAttackOrder = ROOTBOUND_PHASE_ONE_ATTACK_ORDER;
    pendingAttack: RootboundPhaseOneAttack | null = null;
    attackIndex = 0;
    cleanupReason: BossEncounterCleanupReason | null = null;

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
      return this.introT <= 0 && this.state === "idle" && this.pendingAttack === null;
    }

    selectNextPhaseOneAttack(): RootboundPhaseOneAttack | null {
      if (this.phase !== 1 || this.introT > 0 || this.state !== "idle" || this.pendingAttack !== null) return null;
      const selected = this.phaseOneAttackOrder[this.attackIndex % this.phaseOneAttackOrder.length];
      if (selected === undefined) throw new RangeError("Rootbound Phase I attack order is empty");
      this.attackIndex += 1;
      this.pendingAttack = selected;
      this.stateT = 0;
      return selected;
    }

    completePhaseOneAttack(): void {
      if (this.pendingAttack === null) return;
      this.pendingAttack = null;
      this.state = "recover";
      this.stateT = ROOTBOUND_PHASE_ONE_CADENCE.recovery;
      this.atk = "unavailable";
    }

    cleanupEncounter(reason: BossEncounterCleanupReason): void {
      if (this.cleanupReason !== null) return;
      this.cleanupReason = reason;
      this.introT = 0;
      this.state = "recover";
      this.stateT = 0;
      this.vx = 0;
      this.vy = 0;
      this.atk = "unavailable";
      this.pendingAttack = null;
      this.cinematicRequest = null;
      this.cinematicPose = "";
      this.cinematicT = 0;
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
      } else if (this.stun <= 0 && this.pendingAttack === null) {
        this.stateT = Math.max(0, this.stateT - dt);
        if (this.stateT <= 0) {
          if (this.state === "idle") this.selectNextPhaseOneAttack();
          else {
            this.state = "idle";
            this.stateT = ROOTBOUND_PHASE_ONE_CADENCE.openingDelay;
          }
        }
      }
      this.integrate(dt, platforms);
    }
  }
  return Rootbound;
}
