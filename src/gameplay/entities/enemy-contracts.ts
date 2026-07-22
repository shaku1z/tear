import type { CONFIG as GAME_CONFIG } from "../../config/game-config";
import type { ProjectileOwnerPort } from "./projectile";

export type GameConfig = typeof GAME_CONFIG;

export interface EnemyPlatform {
  id?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  floor?: boolean;
  oneway?: boolean;
  materializationState?: string;
  arenaState?: string;
  arenaPlatId?: string;
  stress?: number;
  stressDelay?: number;
  arenaFractureRequest?: { reason: string; color: string };
  platformId?: string;
  void?: boolean;
  crackT?: number;
  crackMax?: number;
  crackColor?: string;
}

export interface EnemyPlayerPort {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hw: number;
  hh: number;
  onGround: boolean;
  facing: number;
  hp: number;
  maxHp: number;
  invulnerable?: boolean;
  dashTimer: number;
  dashX: number;
  voidSlowT: number;
  voidMajorWindow: boolean;
  voidLane?: string | null;
  voidTransferT: number;
  lastTrickKind: string;
  lastTrickT: number;
  cinematicProtected?: boolean;
  supportPlatform?: EnemyPlatform | null;
  takeDamage(damage: number, sourceX: number, source: ProjectileOwnerPort): void;
}

export interface EnemyProjectile extends ProjectileOwnerPort {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  dead: boolean;
  deflected: boolean;
  perfect: boolean;
  deflectDmg: number;
  pierce: boolean;
  bounces: number;
  life: number;
  dmg: number | null;
  charged: boolean;
  gravity: number;
  bomb: boolean;
  mine: boolean;
  armed: boolean;
  armT: number;
  shock: boolean;
  curve: boolean;
  curveT: number;
  root: number;
  mud: boolean;
  tint: string | null;
  kind: string;
  family: string;
  counterplay: string;
  unparryable: boolean;
  sweeper: boolean;
  crownfire: boolean;
  owner: ProjectileOwnerPort | null;
  sourceEnemy: ProjectileOwnerPort | null;
  landingX: number | null;
  landingY: number | null;
  landingT: number | null;
  surfacePlatformId: string | null;
  surfaceLeft: number | null;
  surfaceRight: number | null;
  surfaceY: number | null;
  maxCrossings: number;
  crossings: number;
  sweeperState: string | null;
  state: string | null;
  passesRemaining: number;
  integrity: number;
  maxIntegrity: number;
  maxLife: number;
  hitLatch: boolean;
  hitLatchT: number;
  spinDir: number;
  embeddedLife: number;
  groundImpact: boolean;
  whistleStage: number;
  embedded: boolean;
  harmless: boolean;
  sweeperStyle?: string;
  bossAttack?: string;
  crescent?: boolean;
  quake?: boolean;
  shatterReason?: string;
  sourceStolen: unknown;
  depthManifestation?: boolean;
  onCountered: ((projectile: never) => void) | null;
  configureSweeper(options?: { passes?: number; integrity?: number; maxLife?: number; embeddedLife?: number }): this;
  setFamily(family?: string): this;
  shatterSweeper(reason?: string): void;
}

export type EnemyProjectileConstructor = new (x: number, y: number, vx: number, vy: number) => EnemyProjectile;

export interface EnemyFxPort {
  burst(x: number, y: number, dx: number, dy: number, count: number, color: string): void;
  ember(x: number, y: number, color: string): void;
  explode(x: number, y: number, color: string, scale?: number): void;
  ghost(x: number, y: number, hw: number, hh: number, color: string): void;
  ring(x: number, y: number, radius: number, color?: string): void;
  shockwave(x: number, y: number, radius: number, color: string, speed: number, width: number): void;
}

export interface EnemySoundPort {
  slam?(): void;
  rankup(): void;
  crescent(): void;
  wardenLockClang?(): void;
  wardenGuardBreak?(): void;
  wardenStaffWhoosh?(): void;
  wardenStaffScrape?(): void;
  aldricFireWarn?(step: number): void;
  aldricIgnite?(): void;
  aldricCleaverBury?(): void;
  aldricCleaverWhoosh?(): void;
  sourceDepthPrepare(kind: string): void;
  sourceDepthSnap(kind: string): void;
}

export interface EnemyDependencies {
  CLOCK: { sim: number };
  CONFIG: GameConfig;
  Clipper?: { stop(): void };
  FX: EnemyFxPort;
  GAME_RANDOM: { next(): number };
  Projectile: EnemyProjectileConstructor;
  SFX: EnemySoundPort;
  presentation?: EnemyPresentationPort;
  aabbOverlap: (ax: number, ay: number, ahw: number, ahh: number, bx: number, by: number, bhw: number, bhh: number) => boolean;
  clamp: (value: number, min: number, max: number) => number;
  cosmeticRandom: () => number;
  len: (x: number, y: number) => number;
  lerp: (from: number, to: number, amount: number) => number;
  segPointDist: (ax: number, ay: number, bx: number, by: number, px: number, py: number) => { dist: number; px: number; py: number };
  segSegmentDist: (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number) => number;
}

export interface EnemyPresentationPort {
  drawBossTransformationWorld: (context: unknown, boss: BossPresentationActor) => void;
}

export interface EnemyConfig {
  w: number;
  h: number;
  hp: number;
  speed: number;
  contactDmg: number;
  knockbackTaken: number;
  weight?: number;
  breakSpeed?: number;
}

export interface EnemyDamageContext {
  type?: string;
  aerial?: boolean;
  playerOwned?: boolean;
}

export interface Point {
  x: number;
  y: number;
}

export interface ArenaZone {
  kind: string;
  x: number;
  y?: number;
  w: number;
  h?: number;
  phase?: number;
  life?: number;
  maxLife?: number;
  fullHeight?: boolean;
  arming?: boolean;
  patternIndex?: number;
  on: boolean;
  nextOn?: boolean;
  warn?: boolean;
  warnK?: number;
  dir?: number;
  dmg: number;
  tickCd: number;
}

export interface BossFxEvent {
  bossId?: string | undefined;
  event?: string | undefined;
  priority?: number | undefined;
  quiet?: boolean | undefined;
  shake?: number | undefined;
  flash?: number | undefined;
  hitstop?: number | undefined;
  slowmo?: number | undefined;
  zoom?: number | undefined;
  cue?: string | undefined;
  banner?: string | undefined;
  txt?: string | undefined;
  x?: number | undefined;
  y?: number | undefined;
  big?: boolean | undefined;
  color?: string | undefined;
}

export interface BossTransformationSpec {
  id: string;
  title: string;
  pose: string;
  line: string;
  color: string;
  sfx: string;
  brief?: boolean | undefined;
  speaker?: string | undefined;
  after?: string | undefined;
  crownFall?: boolean | undefined;
  firstVertical?: boolean | undefined;
}

export interface BossPresentationActor extends ProjectileOwnerPort {
  x: number;
  y: number;
  hw: number;
  hh: number;
  facing: number;
  color: string;
  bossName: string;
  presentationId: string;
  bossId?: string | undefined;
  isMiniBoss?: boolean | undefined;
  _perilUntil?: number | undefined;
  _phaseFlashT?: number | undefined;
  cinematicRequest?: (BossTransformationSpec & { speaker: string; duration: number; anchor: string }) | null | undefined;
  cinematicPose?: string | undefined;
  cinematicColor?: string | undefined;
  cinematicT?: number | undefined;
}

export interface WeaponActor {
  x: number;
  y: number;
  hw: number;
  facing: number;
  phase?: number;
  color: string;
  batonA: number;
  batonAV: number;
  weaponA: number;
  weaponAV: number;
  mode?: string;
  anger?: boolean;
  witnessEarned?: boolean;
}

export interface WeaponSegment {
  a: Point;
  b: Point;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  radius?: number;
}

export interface WeaponPose {
  gripA: Point;
  gripB: Point;
  shaftA: Point;
  shaftB: Point;
  headPolygon: Point[];
  cuttingEdge: WeaponSegment;
  tip: Point;
  counterweight?: Point;
  guardRing: Point;
  sweptAttackHull: { segments: WeaponSegment[]; radius: number };
  parryCapsule: WeaponSegment & { radius: number };
}
