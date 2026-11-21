import type {
  EnemyDamageContext,
  EnemyDependencies,
  EnemyPlatform,
  EnemyPlayerPort,
  EnemyProjectile,
} from "../../enemy-contracts";
import type { EnemyBaseConstructor } from "../enemy-base";
import { ROOTBINDER_BODY, ROOTBINDER_MOVES } from "./rootbinder-moves";

/** The states it is planted in: open, harmless to touch, and uprooted by a heavy hit or a player too close. */
const PLANTED_STATES: ReadonlySet<string> = new Set(["planted", "rootwind", "rootrecover"]);
/** What it does at rest: walking to keep its distance. `idle` is where an ended move leaves it. */
const REST_STATES: ReadonlySet<string> = new Set(["idle", "walk"]);
const TICKS_PER_SECOND = 120;

/**
 * The new Rootbinder (plans/active/VERDANT_PALE_REBUILD.md, 2.2), on the engineering channel only until the switch
 * slice: it keeps its distance, plants, sends Root Runs along the floor and hops away when it is uprooted. Every
 * move is a `state`; lengths are ticks, counted one per update, as the new Rootbound's are.
 */
export function createRootbinderRebuildType(dependencies: EnemyDependencies, Enemy: EnemyBaseConstructor) {
  const { CONFIG, FX, Projectile, clamp, lerp } = dependencies;
  const M = ROOTBINDER_MOVES;

  class RootbinderRebuild extends Enemy {
    state = "walk";
    /** Ticks left in the state, and its whole length, for the poses. */
    stateT = 0;
    stateLen = 1;
    /** Ticks it has stood in its band, toward a Plant. */
    settleT = 0;
    /** Ticks the player has stood within reach of its planting, toward an Uproot. */
    nearT = 0;
    /** Ticks of the planting left, and until its next Root Run starts. */
    plantLeft = 0;
    runCd = 0;
    /** Where the hop leaves from and lands. */
    hopFromX = 0;
    hopFromY = 0;
    hopToX = 0;
    /** Ticks in which no move may start: a hold on its attacks (`attackHold`), in ticks. */
    holdT = 0;
    declare cfg: typeof ROOTBINDER_BODY;

    constructor(x: number, y: number) {
      super(x, y, ROOTBINDER_BODY);
      this.kind = "rootbinder-rebuild";
      this.color = CONFIG.colors.rootbinder;
      this.atkDir = 1;
    }

    get planted(): boolean {
      return PLANTED_STATES.has(this.state);
    }

    go(state: string, ticks: number): void {
      this.state = state;
      this.stateT = ticks;
      this.stateLen = Math.max(1, ticks);
      this.settleT = 0;
    }

    override holdAttacks(seconds: number): void {
      super.holdAttacks(seconds);
      this.holdT = Math.max(this.holdT, Math.ceil(seconds * TICKS_PER_SECOND));
    }

    /** Its body hurts only while it walks. */
    override contactDamageEnabled(): boolean {
      return REST_STATES.has(this.state);
    }

    /** Planted it is open; a hit of `hitShare` of its health is the cut, and uproots it. */
    override hit(dmg: number, knockX: number, knockY: number, context?: EnemyDamageContext): number {
      const planted = this.planted;
      const dealt = super.hit(planted ? dmg * M.plant.damageTaken : dmg, knockX, knockY, context);
      if (planted && !this.dying && !this.dead && dealt >= this.maxHp * M.uproot.hitShare) this.startUproot();
      return dealt;
    }

    update(dt: number, platforms: readonly EnemyPlatform[], player: EnemyPlayerPort, projectiles: EnemyProjectile[]) {
      this.tickTimers(dt);
      this.holdT = Math.max(0, this.holdT - 1);
      const dx = player.x - this.x,
        hopping = this.state === "hop";
      if (REST_STATES.has(this.state)) this.walk(dt, dx);
      else this.move(dt, Math.abs(dx), player, projectiles);
      // The hop places it itself, its last tick included; every other state moves through the world's physics.
      if (!hopping) this.integrate(dt, platforms);
      this.x = clamp(this.x, this.hw, CONFIG.view.w - this.hw);
    }

    /** Walk: back away inside its band, close outside it, and plant after standing in it for `settle` ticks. */
    walk(dt: number, dx: number): void {
      const dist = Math.abs(dx),
        away = -Math.sign(dx) || 1;
      const goal = dist < M.walk.near ? away : dist > M.walk.far ? -away : 0;
      this.vx = lerp(this.vx, goal * this.speed, clamp(3 * dt, 0, 1));
      const settle = goal === 0 && this.onGround ? this.settleT + 1 : 0;
      if (settle >= M.plant.settle && this.holdT <= 0) {
        this.atkDir = Math.sign(dx) || this.atkDir;
        this.go("plantwind", M.plant.windup);
        return;
      }
      this.state = "walk";
      this.settleT = settle;
    }

    /** One tick of the move in progress. */
    move(dt: number, dist: number, player: EnemyPlayerPort, projectiles: EnemyProjectile[]): void {
      this.stateT -= 1;
      const done = this.stateT <= 0;
      if (this.planted) {
        this.vx = 0;
        this.plantLeft -= 1;
        this.runCd -= 1;
        this.nearT = dist < M.uproot.near ? this.nearT + 1 : 0;
        if (this.nearT >= M.uproot.nearTicks) {
          this.startUproot();
          return;
        }
      }
      switch (this.state) {
        case "plantwind":
          this.vx = lerp(this.vx, 0, clamp(12 * dt, 0, 1));
          if (done) this.plant();
          return;
        case "planted":
          if (this.plantLeft <= 0) this.go("walk", 0);
          else if (this.runCd <= 0 && this.holdT <= 0) this.startRootRun(player);
          return;
        case "rootwind":
          if (done) this.rootRun(projectiles);
          return;
        case "rootrecover":
          if (done) this.go(this.plantLeft <= 0 ? "walk" : "planted", 0);
          return;
        case "uprootwind":
          this.vx = 0;
          if (done) this.hop(player);
          return;
        case "hop":
          this.hopFlight();
          if (done) this.go("hoprecover", M.uproot.recover);
          return;
        default:
          // hoprecover
          this.vx = lerp(this.vx, 0, clamp(10 * dt, 0, 1));
          if (done) this.go("walk", 0);
      }
    }

    plant(): void {
      this.plantLeft = M.plant.hold;
      this.runCd = M.rootRun.every;
      this.nearT = 0;
      this.go("planted", 0);
    }

    startRootRun(player: EnemyPlayerPort): void {
      this.atkDir = Math.sign(player.x - this.x) || this.atkDir;
      this.runCd = M.rootRun.every;
      this.go("rootwind", M.rootRun.windup);
    }

    /** The root leaves its feet toward where it faced at the windup, along the floor. */
    rootRun(projectiles: EnemyProjectile[]): void {
      const R = M.rootRun,
        foot = this.y + this.hh;
      const root = new Projectile(this.x + this.atkDir * this.hw, foot - R.radius, this.atkDir * R.speed, 0);
      root.setFamily("groundShock");
      root.r = R.radius;
      root.dmg = R.damage * this.auraDmg;
      root.life = R.life / TICKS_PER_SECOND;
      root.tint = this.color;
      projectiles.push(this.ownProjectile(root));
      FX.burst(root.x, foot, this.atkDir, -0.3, 5, this.color);
      this.go("rootrecover", R.recover);
    }

    startUproot(): void {
      this.nearT = 0;
      this.plantLeft = 0;
      this.go("uprootwind", M.uproot.windup);
    }

    hop(player: EnemyPlayerPort): void {
      const away = -Math.sign(player.x - this.x) || -this.atkDir;
      this.hopFromX = this.x;
      this.hopFromY = this.y;
      this.hopToX = clamp(this.x + away * M.uproot.hop, this.hw, CONFIG.view.w - this.hw);
      this.onGround = false;
      FX.burst(this.x, this.y + this.hh, 0, -1, 6, this.color);
      this.go("hop", M.uproot.hopTicks);
    }

    /** The hop: out of the ground and away, set down where it left from in height on its last tick. */
    hopFlight(): void {
      const k = 1 - clamp(this.stateT / this.stateLen, 0, 1);
      this.x = this.hopFromX + (this.hopToX - this.hopFromX) * k;
      this.y = this.hopFromY - Math.sin(k * Math.PI) * M.uproot.hopRise;
      this.vx = 0;
      this.vy = 0;
    }
  }

  return RootbinderRebuild;
}
