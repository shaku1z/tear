import type { EnemyDependencies, EnemyPlatform, EnemyPlayerPort, EnemyProjectile } from "../enemy-contracts";
import type { EnemyBaseConstructor } from "./enemy-base";
import { WHITE_HART_PROVISIONAL_DEFINITION } from "../../run/boss-definitions";
import type { BossEncounterCleanupReason } from "../../run/boss-encounter";

export const WHITE_HART_FOUNDATION_CADENCE = Object.freeze({ openingDelay: 0.9, recovery: 0.55 } as const);
export const WHITE_HART_PHASE_TAGS = Object.freeze([
  "KEEPER OF THE PASS",
  "THE ROAD REMEMBERS",
  "DAWN WILL NOT COME",
] as const);

/**
 * Factory-safe White Hart foundation. PT3-C7 owns every named attack and
 * route/field commitment; this shell intentionally exposes none of them.
 */
export function createWhiteHartType(dependencies: EnemyDependencies, Enemy: EnemyBaseConstructor) {
  const { CONFIG } = dependencies;
  class WhiteHart extends Enemy {
    declare cfg: typeof CONFIG.whiteHart;
    introT = 0;
    phaseMarker = 1;
    override phaseTag: typeof WHITE_HART_PHASE_TAGS[number] = WHITE_HART_PHASE_TAGS[0];
    state: "intro" | "idle" | "recover" = "idle";
    stateT: number = WHITE_HART_FOUNDATION_CADENCE.openingDelay;
    override facing = -1;
    override readonly phaseMarks: [number, number] = [
      WHITE_HART_PROVISIONAL_DEFINITION.phaseMarks[0],
      WHITE_HART_PROVISIONAL_DEFINITION.phaseMarks[1],
    ];
    readonly availableAttacks: readonly string[] = Object.freeze([]);
    cleanupReason: BossEncounterCleanupReason | null = null;

    constructor(x: number, y: number) {
      super(x, y, CONFIG.whiteHart);
      this.kind = "white-hart";
      this.bossId = WHITE_HART_PROVISIONAL_DEFINITION.id;
      this.bossName = "THE WHITE HART";
      this.epithet = "KEEPER OF THE LAST ROAD";
      this.openingLine = "TAKE THEM HOME.";
      this.presentationId = WHITE_HART_PROVISIONAL_DEFINITION.id;
      this.isBoss = true;
      this.color = "#dceff1";
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
      return this.cleanupReason === null && this.introT <= 0 && this.cinematicT <= 0
        && this.cinematicRequest === null && this.state === "idle" && !this.dead && !this.dying;
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
        this.phaseTag = WHITE_HART_PHASE_TAGS[nextPhase - 1] ?? WHITE_HART_PHASE_TAGS[0];
        this.state = "recover";
        this.stateT = WHITE_HART_FOUNDATION_CADENCE.recovery;
        this.atk = "unavailable";
      }
      this.facing = Math.sign(player.x - this.x) || this.facing;
      this.vx = 0;
      if (this.introT > 0) {
        this.state = "intro";
        this.stateT = this.introT;
      } else if (this.cinematicT > 0 || this.cinematicRequest !== null) {
        this.atk = "unavailable";
      } else if (this.state === "intro") {
        this.state = "recover";
        this.stateT = WHITE_HART_FOUNDATION_CADENCE.recovery;
      } else if (this.stun <= 0) {
        this.stateT = Math.max(0, this.stateT - dt);
        if (this.stateT <= 0 && this.state === "recover") {
          this.state = "idle";
          this.stateT = WHITE_HART_FOUNDATION_CADENCE.openingDelay;
        }
      }
      this.integrate(dt, platforms);
    }
  }
  return WhiteHart;
}
