import type { EnemyDamageContext, EnemyDependencies, EnemyPlatform, EnemyPlayerPort, EnemyProjectile } from "../enemy-contracts";
import type { EnemyBaseConstructor } from "./enemy-base";

export const RIMEHOUND_TUNING = Object.freeze({
  body: Object.freeze({ w: 68, h: 34, hp: 72, speed: 285, contactDmg: 11, knockbackTaken: 15, weight: 0.82 }),
  flankDistance: 190,
  engageRange: 500,
  windupSeconds: 0.34,
  pounceSeconds: 0.62,
  pounceSpeed: 920,
  pounceLift: 520,
  recoverySeconds: 0.7,
  packLockSeconds: 1.25,
  predictionSeconds: 0.18,
  pounceDamageMultiplier: 1.45,
} as const);

export interface RimehoundPackMember {
  readonly kind?: string;
  readonly dead: boolean;
  readonly dying?: boolean;
  readonly x: number;
  readonly atk?: string;
  readonly atkCd?: number;
  readonly spawnT?: number;
  packFlank?: -1 | 1;
  packRole?: "line" | "flank";
  packLockT?: number;
  packAttackAuthorized?: boolean;
  lockPackAssignment?(role: "line" | "flank", flank: -1 | 1, duration: number): void;
}

/** Assigns stable alternating flanks through the existing enemy collection. */
export function coordinateRimehoundPack(enemies: readonly RimehoundPackMember[]): void {
  const pack = enemies.filter((enemy) => enemy.kind === "rimehound" && !enemy.dead && enemy.dying !== true);
  // The owning world's enemy array is canonical spawn order and is restored in
  // that order. Do not derive group identity from position or a process global.
  pack.forEach((enemy, index) => {
    if ((enemy.packLockT ?? 0) <= 0) enemy.lockPackAssignment?.(index === 0 ? "line" : "flank",
      index === 0 ? -1 : index % 2 === 1 ? 1 : -1, RIMEHOUND_TUNING.packLockSeconds);
    enemy.packAttackAuthorized = false;
  });
  const committed = pack.find((enemy) => enemy.atk === "windup" || enemy.atk === "pounce");
  const selected = committed ?? pack.find((enemy) => (enemy.spawnT ?? 0) <= 0
    && enemy.atk === "flank" && (enemy.atkCd ?? 0) <= 0);
  if (selected !== undefined) selected.packAttackAuthorized = true;
}

export function createRimehoundType(dependencies: EnemyDependencies, Enemy: EnemyBaseConstructor) {
  const { CONFIG, FX, clamp, lerp } = dependencies;

  class Rimehound extends Enemy {
    packFlank: -1 | 1 = -1;
    packRole: "line" | "flank" = "line";
    packLockT = 0;
    packAttackAuthorized = false;
    pounceTargetX = 0;
    pounceAirborne = false;
    auroraDirection: -1 | 0 | 1 = 0;
    auroraResponseT = 0;
    auroraPounceExtended = false;
    declare cfg: typeof RIMEHOUND_TUNING.body;

    constructor(x: number, y: number) {
      super(x, y, RIMEHOUND_TUNING.body);
      this.kind = "rimehound";
      this.behavior = "pack-pounce";
      this.color = "#a8d8e8";
      this.atk = "flank";
      this.canClimb = false;
      this.climber = false;
    }

    lockPackAssignment(role: "line" | "flank", flank: -1 | 1, duration: number): void {
      if (!(duration > 0) || !Number.isFinite(duration)) throw new RangeError("Rimehound pack lock duration must be finite and positive");
      this.packRole = role;
      this.packFlank = flank;
      this.packLockT = duration;
    }

    onAuroraTrackInfluence(direction: -1 | 1, onTrack: boolean): void {
      this.auroraDirection = direction;
      this.auroraResponseT = onTrack ? 0.2 : 0.08;
      if (this.atk === "pounce" && direction === this.atkDir && !this.auroraPounceExtended) {
        this.atkT += 0.16;
        this.auroraPounceExtended = true;
      }
    }

    override contactDamageEnabled(): boolean { return this.atk === "pounce"; }
    override contactDamageAmount(): number {
      return this.contactDmg * (this.atk === "pounce" ? RIMEHOUND_TUNING.pounceDamageMultiplier : 1);
    }

    override hit(damage: number, knockX: number, knockY: number, context?: EnemyDamageContext): number {
      const dealt = super.hit(damage, knockX, knockY, context);
      if (dealt > 0 && !this.dead && this.atk === "pounce") this.beginSkid();
      return dealt;
    }

    private beginWindup(player: EnemyPlayerPort): void {
      this.atk = "windup";
      this.atkT = RIMEHOUND_TUNING.windupSeconds;
      this.atkMax = this.atkT;
      this.atkDir = Math.sign(player.x - this.x) || this.packFlank;
      this.pounceTargetX = clamp(player.x + player.vx * RIMEHOUND_TUNING.predictionSeconds,
        this.hw, CONFIG.view.w - this.hw);
      this.pounceAirborne = false;
    }

    private beginPounce(): void {
      this.atk = "pounce";
      this.atkT = RIMEHOUND_TUNING.pounceSeconds;
      this.atkDir = Math.sign(this.pounceTargetX - this.x) || this.atkDir;
      this.vx = this.atkDir * RIMEHOUND_TUNING.pounceSpeed;
      this.vy = -RIMEHOUND_TUNING.pounceLift;
      this.onGround = false;
      this.pounceAirborne = true;
      this.auroraPounceExtended = false;
      FX.burst(this.x, this.y + this.hh, -this.atkDir, -0.25, 4, this.color);
    }

    private beginRecovery(): void {
      this.atk = "recover";
      this.atkT = RIMEHOUND_TUNING.recoverySeconds;
      this.atkCd = RIMEHOUND_TUNING.recoverySeconds;
      this.pounceAirborne = false;
    }

    private beginSkid(): void {
      this.atk = "skid";
      this.atkT = 0.22;
      this.pounceAirborne = false;
    }

    update(dt: number, platforms: readonly EnemyPlatform[], player: EnemyPlayerPort, projectiles: EnemyProjectile[]): void {
      void projectiles;
      this.tickTimers(dt);
      this.packLockT = Math.max(0, this.packLockT - dt);
      this.auroraResponseT = Math.max(0, this.auroraResponseT - dt);
      if (this.auroraResponseT <= 0) this.auroraDirection = 0;
      if (this.atkCd > 0) this.atkCd = Math.max(0, this.atkCd - dt);
      const routeTarget = this.auroraDirection === 0 ? player.x : this.auroraDirection > 0 ? CONFIG.view.w : 0;
      const targetX = clamp(routeTarget + (this.packRole === "line" ? 0 : this.packFlank * RIMEHOUND_TUNING.flankDistance),
        this.hw, CONFIG.view.w - this.hw);
      const playerDistance = Math.abs(player.x - this.x);
      if (this.atk === "flank") {
        const direction = Math.sign(targetX - this.x);
        this.vx = lerp(this.vx, direction * this.speed, clamp(9 * dt, 0, 1));
        if (this.packAttackAuthorized && this.onGround && this.atkCd <= 0 && playerDistance <= RIMEHOUND_TUNING.engageRange
          && Math.abs(player.y - this.y) < 130) this.beginWindup(player);
      } else if (this.atk === "windup") {
        this.vx = lerp(this.vx, 0, clamp(14 * dt, 0, 1));
        this.atkT = Math.max(0, this.atkT - dt);
        if (this.atkT <= 0) this.beginPounce();
      } else if (this.atk === "pounce") {
        this.atkT = Math.max(0, this.atkT - dt);
        const steeringScale = clamp(this.atkT / RIMEHOUND_TUNING.pounceSeconds, 0, 1);
        const desiredDirection = Math.sign(this.pounceTargetX - this.x) || this.atkDir;
        const desiredVelocity = desiredDirection * Math.max(Math.abs(this.vx), RIMEHOUND_TUNING.pounceSpeed);
        this.vx += clamp(desiredVelocity - this.vx, -RIMEHOUND_TUNING.pounceSpeed * 4 * steeringScale * dt,
          RIMEHOUND_TUNING.pounceSpeed * 4 * steeringScale * dt);
      } else if (this.atk === "skid") {
        this.vx = lerp(this.vx, 0, clamp(7 * dt, 0, 1));
        this.atkT = Math.max(0, this.atkT - dt);
        if (this.atkT <= 0) this.beginRecovery();
      } else {
        this.vx = lerp(this.vx, 0, clamp(10 * dt, 0, 1));
        this.atkT = Math.max(0, this.atkT - dt);
        if (this.atkT <= 0) this.atk = "flank";
      }
      const beforeX = this.x;
      this.integrate(dt, platforms);
      if (this.atk === "pounce") {
        const wallStopped = Math.abs(this.x - beforeX) < 0.01 && Math.abs(this.vx) < 0.01;
        const atEdge = this.x <= this.hw + 0.01 || this.x >= CONFIG.view.w - this.hw - 0.01;
        if (this.atkT <= 0 || wallStopped || atEdge || (this.pounceAirborne && this.onGround)) this.beginSkid();
      }
    }
  }

  return Rimehound;
}
