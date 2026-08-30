import type {
  EnemyDependencies, EnemyPlatform, EnemyPlayerPort, EnemyProjectile, WeaponSegment,
} from "../enemy-contracts";
import type { EnemyBaseConstructor } from "./enemy-base";
import { WHITE_HART_PROVISIONAL_DEFINITION } from "../../run/boss-definitions";
import type { BossEncounterCleanupReason } from "../../run/boss-encounter";
import type { EnvironmentPoint, EnvironmentTrackDirection } from "../../environment/environment-contracts";
import type { WhiteHartEnvironmentRequest } from "../../environment/white-hart-route-runtime";

export const WHITE_HART_FOUNDATION_CADENCE = Object.freeze({ openingDelay: 0.9, recovery: 0.55 } as const);
export const WHITE_HART_PHASE_TAGS = Object.freeze([
  "KEEPER OF THE PASS", "THE ROAD REMEMBERS", "DAWN WILL NOT COME",
] as const);
export const WHITE_HART_ATTACK_IDS = Object.freeze([
  "antler-run", "snowbound-leap", "aurora-volley", "backtrail-kick",
  "ghost-tracks", "waystone-turn", "frozen-wake", "hushed-crossing",
  "fracture-step", "crossing-storm", "endless-return", "last-crossing",
] as const);
export type WhiteHartAttackId = typeof WHITE_HART_ATTACK_IDS[number];
export const WHITE_HART_PHASE_ATTACKS = Object.freeze({
  1: Object.freeze(["antler-run", "snowbound-leap", "aurora-volley", "backtrail-kick"] as const),
  2: Object.freeze(["ghost-tracks", "waystone-turn", "frozen-wake", "hushed-crossing"] as const),
  3: Object.freeze(["fracture-step", "crossing-storm", "endless-return", "last-crossing"] as const),
} as const satisfies Readonly<Record<1 | 2 | 3, readonly WhiteHartAttackId[]>>);
export const WHITE_HART_COMBAT_TUNING = Object.freeze({
  cadence: Object.freeze({ 1: 0.72, 2: 0.62, 3: 0.5 }),
  recovery: Object.freeze({ normal: 0.48, parried: 0.92, exhausted: 1.4 }),
  antlerRun: Object.freeze({ warning: 0.64, duration: 0.78, damage: 24 }),
  snowboundLeap: Object.freeze({ warning: 0.68, duration: 1.1, waveDamage: 14, waveSpeed: 470 }),
  auroraVolley: Object.freeze({ warning: 0.58, damage: 13, speed: 420 }),
  backtrailKick: Object.freeze({ warning: 0.42, damage: 17, reach: 132 }),
  ghostTrack: Object.freeze({ warning: 0.6, damage: 16, width: 54 }),
  waystoneTurn: Object.freeze({ warning: 0.72, duration: 1.05, damage: 21 }),
  frozenWake: Object.freeze({ warning: 0.58, duration: 0.9, damage: 20, width: 72 }),
  hushedCrossing: Object.freeze({ warning: 0.82, duration: 0.92, damage: 22 }),
  fractureStep: Object.freeze({ warning: 0.68, duration: 1.12, damage: 18 }),
  crossingStorm: Object.freeze({ warning: 0.78, duration: 2.15, damage: 22 }),
  endlessReturn: Object.freeze({ warning: 0.9, duration: 2.55, damage: 18 }),
  lastCrossing: Object.freeze({ warning: 1, duration: 2.35, damage: 18 }),
} as const);
type WhiteHartState = "intro" | "idle" | "windup" | "commit" | "recover" | "exhausted";
function freezePoints(points: readonly EnvironmentPoint[]): readonly EnvironmentPoint[] {
  return Object.freeze(points.map((point) => Object.freeze({ ...point })));
}

/** Full route-first White Hart combat actor. Environment objects remain world-owned. */
export function createWhiteHartType(dependencies: EnemyDependencies, Enemy: EnemyBaseConstructor) {
  const { CONFIG, FX, Projectile, clamp, len, lerp } = dependencies;
  class WhiteHart extends Enemy {
    declare cfg: typeof CONFIG.whiteHart;
    introT = 0;
    phaseMarker: 1 | 2 | 3 = 1;
    override phaseTag: typeof WHITE_HART_PHASE_TAGS[number] = WHITE_HART_PHASE_TAGS[0];
    state: WhiteHartState = "idle";
    stateT: number = WHITE_HART_FOUNDATION_CADENCE.openingDelay;
    stateMax: number = WHITE_HART_FOUNDATION_CADENCE.openingDelay;
    override facing = -1;
    override readonly phaseMarks: [number, number] = [
      WHITE_HART_PROVISIONAL_DEFINITION.phaseMarks[0], WHITE_HART_PROVISIONAL_DEFINITION.phaseMarks[1],
    ];
    readonly availableAttacks: readonly WhiteHartAttackId[] = WHITE_HART_ATTACK_IDS;
    cleanupReason: BossEncounterCleanupReason | null = null;
    attackCursor = 0; attackStep = 0; attackSequence = 0; environmentSequence = 0;
    pendingEnvironmentRequests: WhiteHartEnvironmentRequest[] = [];
    ownedAttackProjectiles: EnemyProjectile[] = [];
    routeTelegraph: readonly EnvironmentPoint[] = Object.freeze([]);
    candidateRoutes: readonly (readonly EnvironmentPoint[])[] = Object.freeze([]);
    trueRouteIndex = -1; routeProgress = 0; attackHitKey = -1;
    fracturePlatformId: string | null = null; fractureWindow = false;
    batonStrike = 0; auroraBossChargeActive = false;
    parryOutcome: "none" | "deflect" | "perfect" = "none";

    constructor(x: number, y: number) {
      super(x, y, CONFIG.whiteHart);
      this.kind = "white-hart"; this.bossId = WHITE_HART_PROVISIONAL_DEFINITION.id;
      this.bossName = "THE WHITE HART"; this.epithet = "KEEPER OF THE LAST ROAD";
      this.openingLine = "TAKE THEM HOME."; this.presentationId = WHITE_HART_PROVISIONAL_DEFINITION.id;
      this.isBoss = true; this.color = "#dceff1"; this.atk = "idle";
    }
    get phase(): 1 | 2 | 3 {
      const fraction = this.maxHp > 0 ? this.hp / this.maxHp : 0;
      const fromHp = fraction > this.phaseMarks[0] ? 1 : fraction > this.phaseMarks[1] ? 2 : 3;
      return Math.max(this.phaseMarker, fromHp) as 1 | 2 | 3;
    }
    override blocks(): boolean { return this.introT > 0; }
    override blocksDamage(): boolean { return this.introT > 0; }
    override limitIncomingDamage(damage: number): number { return this.introT > 0 ? 0 : damage; }
    /** Body overlap never substitutes for an authored warned attack. */
    override contactDamageEnabled(): boolean { return false; }

    batonSegment(): WeaponSegment & { radius: number } {
      const rootX = this.x + this.facing * this.hw * 0.48, tipX = this.x + this.facing * this.hw * 1.42;
      const y = this.y - this.hh * 0.72;
      return { a: { x: rootX, y }, b: { x: tipX, y }, x1: rootX, y1: y, x2: tipX, y2: y, radius: 22 };
    }
    parryBaton(strong: boolean): boolean {
      if (this.state !== "commit" || this.batonStrike <= 0 || this.dying || this.dead) return false;
      this.parryOutcome = strong ? "perfect" : "deflect"; this.batonStrike = 0;
      if (this.atk === "last-crossing" && !strong) { this.vx *= 0.55; return true; }
      this.vx = -this.facing * (strong ? 260 : 150); this.stun = Math.max(this.stun, strong ? 1.05 : 0.5);
      this.enterRecovery(strong ? WHITE_HART_COMBAT_TUNING.recovery.parried : 0.64, strong ? "perfect" : "deflect");
      FX.ring(this.x + this.facing * this.hw, this.y - this.hh, strong ? 18 : 12,
        strong ? CONFIG.colors.perfect : "#e0a326");
      return true;
    }
    onBladeImpulse(input: Readonly<{ isSlam: boolean; empSlam: boolean; tipVY: number }>): boolean {
      if (this.atk !== "fracture-step" || this.state !== "commit" || !this.fractureWindow
        || (!input.isSlam && !input.empSlam) || input.tipVY <= 0) return false;
      this.vy = -720; this.onGround = false; this.stun = Math.max(this.stun, 0.9);
      this.enterRecovery(WHITE_HART_COMBAT_TUNING.recovery.parried, "perfect"); return true;
    }
    acknowledgeEnvironmentRequests(throughSequence: number): void {
      this.pendingEnvironmentRequests = this.pendingEnvironmentRequests.filter((request) => request.sequence > throughSequence);
    }
    cleanupEncounter(reason: BossEncounterCleanupReason): void {
      if (this.cleanupReason !== null) return;
      this.cleanupReason = reason; this.introT = 0; this.state = "recover"; this.stateT = 0; this.stateMax = 0;
      this.vx = 0; this.vy = 0; this.atk = "idle"; this.batonStrike = 0; this.auroraBossChargeActive = false;
      this.pendingEnvironmentRequests = []; this.routeTelegraph = Object.freeze([]); this.candidateRoutes = Object.freeze([]);
      this.clearOwnedAttackProjectiles("encounter-cleanup");
      this.cinematicRequest = null; this.cinematicPose = ""; this.cinematicT = 0;
    }

    private registerAttackProjectile(projectile: EnemyProjectile): EnemyProjectile {
      this.ownProjectile(projectile); this.ownedAttackProjectiles.push(projectile); return projectile;
    }
    private clearOwnedAttackProjectiles(reason: string): void {
      for (const projectile of this.ownedAttackProjectiles) {
        if (!projectile.dead) { projectile.dead = true; projectile.harmless = true; projectile.shatterReason = reason; }
      }
      this.ownedAttackProjectiles = [];
    }

    private queueGhost(points: readonly EnvironmentPoint[], direction: EnvironmentTrackDirection,
      threatening = true, damage: number = WHITE_HART_COMBAT_TUNING.ghostTrack.damage): void {
      this.environmentSequence += 1;
      this.pendingEnvironmentRequests.push(Object.freeze({ sequence: this.environmentSequence, phase: this.phase,
        kind: "ghost-track", points: freezePoints(points), direction, width: WHITE_HART_COMBAT_TUNING.ghostTrack.width,
        damage, threatening }));
    }
    private queueWake(points: readonly EnvironmentPoint[], direction: EnvironmentTrackDirection): void {
      const xs = points.map(({ x }) => x), minX = Math.min(...xs), maxX = Math.max(...xs);
      this.environmentSequence += 1;
      this.pendingEnvironmentRequests.push(Object.freeze({ sequence: this.environmentSequence, phase: this.phase,
        kind: "boss-wake", direction, geometry: Object.freeze({ x: minX, y: CONFIG.world.groundY - 84,
          w: Math.max(96, maxX - minX), h: WHITE_HART_COMBAT_TUNING.frozenWake.width }),
        patternId: "white-hart-frozen-wake" }));
    }
    private horizontalRoute(direction = this.facing): readonly EnvironmentPoint[] {
      const margin = this.hw + 24;
      return freezePoints([{ x: this.x, y: this.y }, { x: direction > 0 ? CONFIG.view.w - margin : margin, y: this.y }]);
    }
    private setWindup(seconds: number): void {
      this.state = "windup"; this.stateT = seconds; this.stateMax = seconds; this.routeProgress = 0;
      this.attackStep = 0; this.attackHitKey = -1; this.parryOutcome = "none"; this.batonStrike = 0;
      this.auroraBossChargeActive = false;
    }

    private beginAttack(player: EnemyPlayerPort, platforms: readonly EnemyPlatform[]): void {
      const attacks = WHITE_HART_PHASE_ATTACKS[this.phase], attack = attacks[this.attackCursor % attacks.length] ?? attacks[0];
      this.attackCursor = (this.attackCursor + 1) % attacks.length; this.attackSequence += 1; this.atk = attack;
      this.facing = Math.sign(player.x - this.x) || this.facing; this.trueRouteIndex = -1;
      this.candidateRoutes = Object.freeze([]); this.fracturePlatformId = null; this.fractureWindow = false;
      const margin = this.hw + 24, left = margin, right = CONFIG.view.w - margin;
      if (attack === "antler-run") {
        this.routeTelegraph = freezePoints([{ x: this.x, y: this.y }, { x: this.facing > 0 ? right : left, y: this.y }]);
        this.setWindup(WHITE_HART_COMBAT_TUNING.antlerRun.warning);
      } else if (attack === "snowbound-leap") {
        const landingX = clamp(player.x, left, right);
        this.routeTelegraph = freezePoints([{ x: this.x, y: this.y }, { x: (this.x + landingX) / 2, y: this.y - 260 },
          { x: landingX, y: CONFIG.world.groundY - this.hh }]); this.setWindup(WHITE_HART_COMBAT_TUNING.snowboundLeap.warning);
      } else if (attack === "aurora-volley") {
        this.routeTelegraph = freezePoints([{ x: this.x, y: this.y - this.hh }, { x: player.x, y: player.y }]);
        this.setWindup(WHITE_HART_COMBAT_TUNING.auroraVolley.warning);
      } else if (attack === "backtrail-kick") {
        const rear = this.x - this.facing * WHITE_HART_COMBAT_TUNING.backtrailKick.reach;
        this.routeTelegraph = freezePoints([{ x: this.x, y: this.y }, { x: clamp(rear, left, right), y: this.y }]);
        this.setWindup(WHITE_HART_COMBAT_TUNING.backtrailKick.warning);
      } else if (attack === "ghost-tracks") {
        const routes = [-150, 0, 150].map((offset) => freezePoints([{ x: left, y: this.y + offset * 0.18 },
          { x: right, y: this.y + offset * 0.18 }]));
        this.candidateRoutes = Object.freeze(routes); this.trueRouteIndex = this.attackSequence % routes.length;
        routes.forEach((route, index) => {
          const direction: EnvironmentTrackDirection = index % 2 === 0 ? 1 : -1;
          this.queueGhost(route, direction, index === this.trueRouteIndex);
        });
        const chosen = routes[this.trueRouteIndex] ?? routes[0] ?? Object.freeze([]);
        const chosenEnd = chosen.at(-1) ?? { x: right, y: this.y };
        this.routeTelegraph = freezePoints([{ x: this.x, y: this.y }, chosenEnd]);
        this.setWindup(WHITE_HART_COMBAT_TUNING.ghostTrack.warning);
      } else if (attack === "waystone-turn") {
        const direction: EnvironmentTrackDirection = this.facing < 0 ? -1 : 1;
        this.routeTelegraph = freezePoints([{ x: this.x, y: this.y },
          { x: direction > 0 ? CONFIG.view.w * 0.68 : CONFIG.view.w * 0.32, y: this.y },
          { x: direction > 0 ? left : right, y: this.y - 96 }]);
        this.queueGhost(this.routeTelegraph, direction, true, WHITE_HART_COMBAT_TUNING.waystoneTurn.damage * 0.72);
        this.setWindup(WHITE_HART_COMBAT_TUNING.waystoneTurn.warning);
      } else if (attack === "frozen-wake") {
        const direction: EnvironmentTrackDirection = this.facing < 0 ? -1 : 1;
        this.routeTelegraph = this.horizontalRoute(direction); this.queueWake(this.routeTelegraph, direction);
        this.setWindup(WHITE_HART_COMBAT_TUNING.frozenWake.warning);
      } else if (attack === "hushed-crossing") {
        const routes = [this.y - 84, this.y, this.y + 84].map((y) => freezePoints([{ x: left, y }, { x: right, y }]));
        this.trueRouteIndex = this.attackSequence % 3; this.candidateRoutes = Object.freeze(routes);
        routes.forEach((route, index) => {
          this.queueGhost(route, 1, index === this.trueRouteIndex,
            WHITE_HART_COMBAT_TUNING.hushedCrossing.damage * 0.7);
        });
        const chosen = routes[this.trueRouteIndex] ?? routes[0] ?? Object.freeze([]);
        this.routeTelegraph = freezePoints([{ x: this.x, y: this.y }, chosen.at(-1) ?? { x: right, y: this.y }]);
        this.setWindup(WHITE_HART_COMBAT_TUNING.hushedCrossing.warning);
      } else if (attack === "fracture-step") {
        const target = platforms.find((platform) => platform.arenaPlatId !== undefined && !platform.floor
          && platform.arenaState !== "warning" && platform.arenaState !== "broken");
        this.fracturePlatformId = target?.arenaPlatId ?? null;
        const landingX = target === undefined ? clamp(player.x, left, right) : target.x + target.w / 2;
        const landingY = target === undefined ? CONFIG.world.groundY - this.hh : target.y - this.hh;
        this.routeTelegraph = freezePoints([{ x: this.x, y: this.y },
          { x: (this.x + landingX) / 2, y: Math.min(this.y, landingY) - 220 }, { x: landingX, y: landingY }]);
        this.setWindup(WHITE_HART_COMBAT_TUNING.fractureStep.warning);
      } else if (attack === "crossing-storm") {
        const end = this.facing > 0 ? right : left;
        this.routeTelegraph = freezePoints([{ x: this.x, y: this.y }, { x: end, y: this.y },
          { x: CONFIG.view.w / 2, y: this.y - 240 }, { x: this.facing > 0 ? left : right, y: this.y }]);
        this.setWindup(WHITE_HART_COMBAT_TUNING.crossingStorm.warning);
      } else if (attack === "endless-return") {
        const top = CONFIG.world.groundY - 250;
        this.routeTelegraph = freezePoints([{ x: this.x, y: this.y }, { x: this.facing > 0 ? right : left, y: this.y },
          { x: this.facing > 0 ? right : left, y: top }, { x: this.facing > 0 ? left : right, y: top },
          { x: this.facing > 0 ? left : right, y: this.y }, { x: this.facing > 0 ? right : left, y: this.y },
          { x: this.facing > 0 ? right : left, y: top }, { x: this.facing > 0 ? left : right, y: top },
          { x: this.facing > 0 ? left : right, y: this.y }]); this.setWindup(WHITE_HART_COMBAT_TUNING.endlessReturn.warning);
      } else {
        const far = this.facing > 0 ? right : left, returnEdge = this.facing > 0 ? left : right;
        this.routeTelegraph = freezePoints([{ x: this.x, y: this.y }, { x: far, y: this.y },
          { x: returnEdge, y: this.y }, { x: far, y: this.y }]); this.setWindup(WHITE_HART_COMBAT_TUNING.lastCrossing.warning);
      }
    }

    private beginCommit(player: EnemyPlayerPort, projectiles: EnemyProjectile[]): void {
      this.state = "commit"; this.routeProgress = 0; this.attackHitKey = -1;
      if (this.atk === "antler-run") {
        this.stateT = WHITE_HART_COMBAT_TUNING.antlerRun.duration; this.batonStrike = 0.08;
      }
      else if (this.atk === "snowbound-leap") {
        this.stateT = WHITE_HART_COMBAT_TUNING.snowboundLeap.duration;
        const landing = this.routeTelegraph.at(-1) ?? { x: player.x, y: CONFIG.world.groundY - this.hh };
        this.vx = (landing.x - this.x) / 0.72; this.vy = -860; this.onGround = false;
      } else if (this.atk === "aurora-volley") { this.fireAuroraVolley(player, projectiles); this.stateT = 0.14; }
      else if (this.atk === "backtrail-kick") this.stateT = 0.24;
      else if (this.atk === "ghost-tracks") this.stateT = 0.18;
      else if (this.atk === "waystone-turn") this.stateT = WHITE_HART_COMBAT_TUNING.waystoneTurn.duration;
      else if (this.atk === "frozen-wake") this.stateT = WHITE_HART_COMBAT_TUNING.frozenWake.duration;
      else if (this.atk === "hushed-crossing") this.stateT = WHITE_HART_COMBAT_TUNING.hushedCrossing.duration;
      else if (this.atk === "fracture-step") {
        this.stateT = WHITE_HART_COMBAT_TUNING.fractureStep.duration;
        const landing = this.routeTelegraph.at(-1) ?? { x: player.x, y: CONFIG.world.groundY - this.hh };
        this.vx = (landing.x - this.x) / 0.76; this.vy = -900; this.onGround = false; this.fractureWindow = true;
      } else if (this.atk === "crossing-storm") this.stateT = WHITE_HART_COMBAT_TUNING.crossingStorm.duration;
      else if (this.atk === "endless-return") this.stateT = WHITE_HART_COMBAT_TUNING.endlessReturn.duration;
      else this.stateT = WHITE_HART_COMBAT_TUNING.lastCrossing.duration;
      this.stateMax = this.stateT;
    }
    private fireAuroraVolley(player: EnemyPlayerPort, projectiles: EnemyProjectile[]): void {
      const dx = player.x - this.x, dy = player.y - this.y, base = Math.atan2(dy, dx);
      for (const offset of [-0.19, 0, 0.19]) {
        const shot = new Projectile(this.x + this.facing * this.hw * 0.72, this.y - this.hh,
          Math.cos(base + offset) * WHITE_HART_COMBAT_TUNING.auroraVolley.speed,
          Math.sin(base + offset) * WHITE_HART_COMBAT_TUNING.auroraVolley.speed);
        this.registerAttackProjectile(shot); shot.dmg = WHITE_HART_COMBAT_TUNING.auroraVolley.damage; shot.r = 9;
        shot.tint = "#78e6d0"; shot.kind = "aurora-shard"; shot.counterplay = "deflect/return";
        shot.gravity = 85; shot.bossAttack = "aurora-volley"; projectiles.push(shot);
      }
    }
    private fireLandingWaves(projectiles: EnemyProjectile[]): void {
      for (const direction of [-1, 1]) {
        const wave = new Projectile(this.x, CONFIG.world.groundY - 14,
          direction * WHITE_HART_COMBAT_TUNING.snowboundLeap.waveSpeed, 0);
        this.registerAttackProjectile(wave); wave.dmg = WHITE_HART_COMBAT_TUNING.snowboundLeap.waveDamage;
        wave.r = 13; wave.tint = "#b9f4ff"; wave.kind = "snowbound-wave";
        wave.counterplay = "jump/deflect"; wave.bossAttack = "snowbound-leap"; projectiles.push(wave);
      }
    }
    private moveRoute(dt: number, duration: number, player: EnemyPlayerPort, damage: number): boolean {
      const route = this.routeTelegraph; if (route.length < 2) return true;
      this.routeProgress = Math.min(1, this.routeProgress + dt / Math.max(duration, 0.001));
      const scaled = this.routeProgress * (route.length - 1), segment = Math.min(route.length - 2, Math.floor(scaled));
      const amount = scaled - segment, start = route[segment], end = route[segment + 1];
      if (start === undefined || end === undefined) return true;
      const priorX = this.x, priorY = this.y; this.x = lerp(start.x, end.x, amount); this.y = lerp(start.y, end.y, amount);
      this.vx = (this.x - priorX) / Math.max(dt, 0.001); this.vy = (this.y - priorY) / Math.max(dt, 0.001);
      this.facing = Math.sign(end.x - start.x) || this.facing; this.hitPlayerOnPass(player, damage, segment);
      return this.routeProgress >= 1;
    }
    private hitPlayerOnPass(player: EnemyPlayerPort, damage: number, key: number): void {
      if (this.attackHitKey === key || player.invulnerable) return;
      if (Math.abs(player.x - this.x) > player.hw + this.hw * 0.82
        || Math.abs(player.y - this.y) > player.hh + this.hh * 0.9) return;
      this.attackHitKey = key; player.takeDamage(damage, this.x, this);
    }

    private updateCommit(dt: number, platforms: readonly EnemyPlatform[], player: EnemyPlayerPort,
      projectiles: EnemyProjectile[]): void {
      this.stateT = Math.max(0, this.stateT - dt);
      if (this.atk === "antler-run") {
        this.auroraBossChargeActive = true; this.batonStrike = Math.max(this.batonStrike, 0.08);
        if (this.moveRoute(dt, WHITE_HART_COMBAT_TUNING.antlerRun.duration, player,
          WHITE_HART_COMBAT_TUNING.antlerRun.damage)) this.enterRecovery(0.72, "none");
      } else if (this.atk === "snowbound-leap" || this.atk === "fracture-step") {
        const wasGrounded = this.onGround; this.integrate(dt, platforms);
        if (!wasGrounded && this.onGround) {
          if (this.atk === "snowbound-leap") this.fireLandingWaves(projectiles);
          else {
            const platform = platforms.find((candidate) => candidate.arenaPlatId === this.fracturePlatformId);
            if (platform !== undefined) platform.arenaFractureRequest = {
              reason: "white-hart-fracture-step", color: "#78e6d0",
            };
          }
          this.hitPlayerOnPass(player, this.atk === "snowbound-leap" ? WHITE_HART_COMBAT_TUNING.snowboundLeap.waveDamage
            : WHITE_HART_COMBAT_TUNING.fractureStep.damage, 0);
          this.fractureWindow = false; this.enterRecovery(WHITE_HART_COMBAT_TUNING.recovery.normal, "none");
        }
      } else if (this.atk === "backtrail-kick") {
        if (this.attackHitKey < 0) {
          const rear = -this.facing * (player.x - this.x);
          if (rear > 0 && rear < WHITE_HART_COMBAT_TUNING.backtrailKick.reach + player.hw
            && Math.abs(player.y - this.y) < this.hh + player.hh) {
            player.takeDamage(WHITE_HART_COMBAT_TUNING.backtrailKick.damage, this.x, this);
            player.vx = -this.facing * 520; player.vy = -260;
          }
          this.attackHitKey = 0;
        }
      } else if (this.atk === "waystone-turn") {
        this.auroraBossChargeActive = true;
        if (this.moveRoute(dt, WHITE_HART_COMBAT_TUNING.waystoneTurn.duration, player,
          WHITE_HART_COMBAT_TUNING.waystoneTurn.damage)) this.enterRecovery(0.62, "none");
      } else if (this.atk === "frozen-wake") {
        this.auroraBossChargeActive = true;
        if (this.moveRoute(dt, WHITE_HART_COMBAT_TUNING.frozenWake.duration, player,
          WHITE_HART_COMBAT_TUNING.frozenWake.damage)) this.enterRecovery(0.55, "none");
      } else if (this.atk === "hushed-crossing") {
        this.auroraBossChargeActive = true;
        if (this.moveRoute(dt, WHITE_HART_COMBAT_TUNING.hushedCrossing.duration, player,
          WHITE_HART_COMBAT_TUNING.hushedCrossing.damage)) this.enterRecovery(0.58, "none");
      } else if (this.atk === "crossing-storm") {
        const progress = 1 - this.stateT / WHITE_HART_COMBAT_TUNING.crossingStorm.duration;
        if (progress >= 0.34 && this.attackStep === 0) {
          this.attackStep = 1;
          this.queueGhost(freezePoints([{ x: CONFIG.view.w - this.x, y: this.y }, { x: this.x, y: this.y }]),
            -this.facing as EnvironmentTrackDirection, true, WHITE_HART_COMBAT_TUNING.ghostTrack.damage);
        }
        this.auroraBossChargeActive = progress < 0.68;
        if (this.moveRoute(dt, WHITE_HART_COMBAT_TUNING.crossingStorm.duration, player,
          WHITE_HART_COMBAT_TUNING.crossingStorm.damage)) this.enterRecovery(0.72, "none");
      } else if (this.atk === "endless-return") {
        this.auroraBossChargeActive = true;
        const local = (this.routeProgress * Math.max(1, this.routeTelegraph.length - 1)) % 2;
        this.batonStrike = local > 0.82 && local < 1.18 ? 0.08 : 0;
        if (this.moveRoute(dt, WHITE_HART_COMBAT_TUNING.endlessReturn.duration, player,
          WHITE_HART_COMBAT_TUNING.endlessReturn.damage)) this.enterRecovery(0.8, "none");
      } else if (this.atk === "last-crossing") {
        this.auroraBossChargeActive = true; this.batonStrike = this.routeProgress > 0.66 ? 0.08 : 0;
        if (this.moveRoute(dt, WHITE_HART_COMBAT_TUNING.lastCrossing.duration, player,
          WHITE_HART_COMBAT_TUNING.lastCrossing.damage)) {
          this.state = "exhausted"; this.stateT = WHITE_HART_COMBAT_TUNING.recovery.exhausted;
          this.stateMax = this.stateT; this.vx = 0; this.vy = 0; this.batonStrike = 0; this.auroraBossChargeActive = false;
        }
      }
      if (this.state === "commit" && this.stateT <= 0) this.enterRecovery(WHITE_HART_COMBAT_TUNING.recovery.normal, "none");
    }
    private enterRecovery(seconds: number, outcome: "none" | "deflect" | "perfect"): void {
      this.state = "recover"; this.stateT = seconds; this.stateMax = seconds; this.parryOutcome = outcome;
      this.batonStrike = 0; this.auroraBossChargeActive = false; this.fractureWindow = false; this.routeProgress = 0;
    }
    update(dt: number, platforms: readonly EnemyPlatform[], player: EnemyPlayerPort,
      projectiles: EnemyProjectile[]): void {
      this.tickTimers(dt);
      const nextPhase: 1 | 2 | 3 = this.maxHp > 0 && this.hp / this.maxHp > this.phaseMarks[0] ? 1
        : this.maxHp > 0 && this.hp / this.maxHp > this.phaseMarks[1] ? 2 : 3;
      if (nextPhase > this.phaseMarker) {
        this.clearOwnedAttackProjectiles("phase-transition");
        this.phaseMarker = nextPhase; this.phaseTag = WHITE_HART_PHASE_TAGS[nextPhase - 1] ?? WHITE_HART_PHASE_TAGS[0];
        this.attackCursor = 0; this.atk = "idle"; this.pendingEnvironmentRequests = [];
        this.routeTelegraph = Object.freeze([]); this.candidateRoutes = Object.freeze([]);
        this.enterRecovery(WHITE_HART_FOUNDATION_CADENCE.recovery, "none");
      }
      this.facing = this.state === "commit" ? this.facing : Math.sign(player.x - this.x) || this.facing;
      if (this.introT > 0) {
        this.state = "intro"; this.stateT = this.introT; this.stateMax = Math.max(this.stateMax, this.introT);
        this.vx = lerp(this.vx, 0, clamp(8 * dt, 0, 1)); this.integrate(dt, platforms); return;
      }
      if (this.cinematicT > 0 || this.cinematicRequest !== null || this.cleanupReason !== null) {
        this.vx = 0; this.batonStrike = 0; this.auroraBossChargeActive = false; return;
      }
      if (this.state === "intro") this.enterRecovery(WHITE_HART_FOUNDATION_CADENCE.recovery, "none");
      if (this.stun > 0) { this.vx = lerp(this.vx, 0, clamp(7 * dt, 0, 1)); this.integrate(dt, platforms); return; }
      if (this.state === "idle") {
        this.stateT = Math.max(0, this.stateT - dt);
        const distance = player.x - this.x;
        this.vx = lerp(this.vx, Math.sign(distance) * Math.min(this.speed, Math.abs(distance) * 0.7), clamp(3 * dt, 0, 1));
        this.integrate(dt, platforms); if (this.stateT <= 0) this.beginAttack(player, platforms);
      } else if (this.state === "windup") {
        this.vx = lerp(this.vx, 0, clamp(10 * dt, 0, 1)); this.stateT = Math.max(0, this.stateT - dt);
        this.integrate(dt, platforms); if (this.stateT <= 0) this.beginCommit(player, projectiles);
      } else if (this.state === "commit") this.updateCommit(dt, platforms, player, projectiles);
      else {
        this.vx = lerp(this.vx, 0, clamp(5 * dt, 0, 1)); this.stateT = Math.max(0, this.stateT - dt);
        this.integrate(dt, platforms);
        if (this.stateT <= 0) {
          this.state = "idle"; this.atk = "idle"; this.routeTelegraph = Object.freeze([]);
          this.candidateRoutes = Object.freeze([]); this.trueRouteIndex = -1;
          this.stateT = WHITE_HART_COMBAT_TUNING.cadence[this.phase]; this.stateMax = this.stateT;
        }
      }
      if (!Number.isFinite(this.x) || !Number.isFinite(this.y) || len(this.vx, this.vy) > 10_000) {
        throw new RangeError("White Hart route state became non-finite");
      }
    }
  }
  return WhiteHart;
}
