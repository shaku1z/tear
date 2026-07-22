import type { BladeActionResult, BladePoint } from "./blade";
import type { PlayerInputPort, PlayerPlatformPort } from "./player";
import type { CONFIG as GAME_CONFIG } from "../../config/game-config";
import type { EnemyConfig } from "./enemy-contracts";

export type GameConfig = typeof GAME_CONFIG;

export interface MirrorPlayerPort {
  x: number; y: number; vx: number; vy: number; hw: number; hh: number;
  hp: number; maxHp: number; facing: number; onGround: boolean;
  maxDashCharges: number; dashCharges: number; dashTimer: number; iframe: number; guardT: number;
  readonly invulnerable: boolean;
  lastTrickT: number; lastTrickKind: string;
  aiInput?: PlayerInputPort;
  update(dt: number, platforms: readonly PlayerPlatformPort[]): void;
  draw(surface: unknown): void;
  takeHit(damage: number, knockbackX: number, knockbackY: number, source?: unknown): string;
}

export interface MirrorBladePort {
  x: number; y: number; vx: number; vy: number; tipX: number; tipY: number; tipVX: number; tipVY: number; tipSpeed: number;
  state: string; model: string; lmbOverride?: boolean;
  trailColor?: string; glowColor?: string; freeRecall: boolean; hideThrowUI?: boolean;
  lengthBonus?: number; mirroredWeaponId?: string; throwDmg: number;
  update(dt: number, player: MirrorPlayerPort, platforms: readonly PlayerPlatformPort[]): void;
  draw(surface: unknown, player: MirrorPlayerPort): void;
  aimOverridePoint(): BladePoint;
  throwBlade(): boolean;
  tryRecall(player: MirrorPlayerPort): BladeActionResult;
  damageAt(): number;
}

export interface MirrorProjectilePort {
  x: number; y: number; vx: number; vy: number; r: number; dmg: number | null;
  dead: boolean; deflectDmg: number; life: number; kind: string; tint: string | null;
  crescent?: boolean;
}

export interface EnemyBasePort {
  x: number; y: number; vx: number; vy: number; hw: number; hh: number;
  hp: number; maxHp: number; hpDisplay: number; facing: number; onGround: boolean; dead: boolean;
  dying?: boolean; hitCd: number; spawnClone?: boolean;
  flash: number; color: string; kind: string; isBoss?: boolean; bossName: string | null;
  shield: number; maxShield: number; bleedStacks: number; burnT: number; markT: number;
  seamT: number; severT: number; breakPressure: number; _noBar?: boolean;
  tickTimers(dt: number): void;
  hit(damage: number, knockbackX: number, knockbackY: number): number;
}

export interface MirrorMods {
  weaponId?: string;
  airBonus?: number; aerialRave?: number; parryGuard?: boolean;
  backlash?: number; backlashSurge?: boolean; parryStun?: boolean;
}

export interface MirrorAiState { left: boolean; right: boolean; up: boolean; down: boolean; _dash: boolean; _jump: boolean }
export interface MirrorReadState { dist: number; airborne: number; aggression: number; dashHeat: number; closing: number; pBladeSpeed: number }
export interface MirrorMoveState { id: string; ph: string; t: number; hitDone: boolean; k: number }
export interface MirrorLockState { t: number; x: number; y: number; press: number; sparkT: number }
export interface MirrorAirState {
  st: string; t: number; side: number | null; tx: number; ty: number; dvx: number; dvy: number;
  raise: number; cx: number; _rt: number;
}
export interface MirrorEchoFrame { adv: number; dash: number; jump: number; swing: number }
export interface MirrorWave { x: number; y: number; vx: number; life: number; big?: boolean; hit?: boolean }
export interface MirrorImage { x: number; y: number; f: number; t: number }
export interface MirrorJuice { shake?: number; flash?: number; txt?: string; x?: number; y?: number; big?: boolean; color?: string; hitstop?: number; zoom?: number; slowmo?: number; quiet?: boolean }

export interface MirrorController {
  active: boolean; host: EnemyBasePort | null; actor: MirrorPlayerPort; blade: MirrorBladePort;
  facing: number; color: string; ai: MirrorAiState; fxq: MirrorJuice[];
  sync: number; read: MirrorReadState; _state: string; _stateT: number; _decideT: number;
  _swingT: number; _swingDir: number; _swingBase: number; _aimAng: number;
  _dashCd: number; _jumpCd: number; _clashCd: number; _syncBump: number;
  lock: MirrorLockState | null; _air: MirrorAirState | null;
  _pDashPrev: number; _pPrevX: number; _pDashPrev2: number; _pGroundPrev: boolean; _prevDist: number;
  echoBuf: MirrorEchoFrame[]; _echoClip: MirrorEchoFrame[]; _echoPtr: number; _echoCd: number;
  mv: MirrorMoveState | null; _moveCd: number; waves: MirrorWave[]; imgs: MirrorImage[];
  _recallT: number; _fsPending: boolean; _threwHit: boolean; seenTrickT: number;
  _answer: string; _answerT: number; _lastAnswered: string; _phaseMark: number;
  white: number; _wtT: number; _sparkT: number; _stagger: number; mods: MirrorMods;
  airBias: number; parryWary: number; _proj: MirrorProjectilePort[]; pb?: { tipSpeed: number };
  _swingFrom: number; _swingTo: number; _swingKind: string;
  readonly phase: number;
  segNear(ax: number, ay: number, bx: number, by: number, px: number, py: number, r: number): boolean;
  _dirAng(angle: number): number; juice(event: MirrorJuice): void;
  attach(host: EnemyBasePort, mods?: MirrorMods | null): this;
  hostStep(dt: number, platforms: readonly PlayerPlatformPort[], player: MirrorPlayerPort, projectiles: MirrorProjectilePort[]): void;
  _updatePhase(): void; _whiteout(dt: number): void;
  _updateRead(dt: number, player: MirrorPlayerPort, playerBlade: { tipSpeed: number }): void;
  _recordEcho(dt: number, player: MirrorPlayerPort): void; _watchTricks(player: MirrorPlayerPort): void;
  _hasMove(): boolean;
  _pickMove(player: MirrorPlayerPort): string | null; _startMove(id: string, player: MirrorPlayerPort): void;
  _runMove(dt: number, player: MirrorPlayerPort): void;
  _crescent(x: number, y: number, angle: number, speed: number, damage: number, radius: number): void;
  _fireCrescents(player: MirrorPlayerPort): void; _flashStep(player: MirrorPlayerPort): void;
  _decide(dt: number, player: MirrorPlayerPort): void; _act(dt: number, player: MirrorPlayerPort): void;
  _startStrike(facing: number): void; _aim(dt: number, player: MirrorPlayerPort, wantSwing: boolean): void;
  _updateWaves(dt: number): void; _enterLock(x: number, y: number, player: MirrorPlayerPort): void;
  _tickLock(dt: number, player: MirrorPlayerPort, playerBlade: MirrorBladePort): void;
  _breakLock(player: MirrorPlayerPort): void;
  _pointBladeAt(point: BladePoint, amount: number): void; _aerialBrain(dt: number, player: MirrorPlayerPort): void;
  _bigSlash(x: number): void; updateCombat(dt: number, player: MirrorPlayerPort, playerBlade: MirrorBladePort): void;
  draw(surface: unknown): void;
}

export interface MirrorRenderSnapshot {
  readonly active: boolean; readonly host: EnemyBasePort | null;
  readonly actor: MirrorPlayerPort; readonly blade: MirrorBladePort;
  readonly facing: number; readonly color: string; readonly sync: number; readonly white: number;
  readonly imgs: readonly MirrorImage[]; readonly waves: readonly MirrorWave[];
  readonly lock: MirrorLockState | null; readonly mv: MirrorMoveState | null;
  readonly phase: number;
}

export interface MirrorHostRenderSnapshot {
  readonly x: number; readonly y: number; readonly hw: number; readonly hh: number; readonly facing: number;
}

export interface ReflectionRenderSnapshot {
  readonly x: number; readonly y: number; readonly hw: number; readonly hh: number;
  readonly facing: number; readonly flash: number; readonly color: string; readonly pattern: string | null;
  readonly hp: number; readonly maxHp: number; readonly hpDisplay: number;
  readonly maxShield: number; readonly shield: number;
  readonly bleedStacks: number; readonly burnT: number; readonly markT: number;
  readonly seamT: number; readonly severT: number; readonly breakPressure: number;
  readonly noBar?: boolean;
}

export interface MirrorPresentationPort {
  drawMirror(surface: unknown, mirror: MirrorRenderSnapshot): void;
  drawHostFallback(surface: unknown, host: MirrorHostRenderSnapshot): void;
  drawReflection(surface: unknown, reflection: ReflectionRenderSnapshot): void;
  saberLockSparks(x: number, y: number, color: string): void;
}

export interface MirrorDependencies {
  Blade: new () => MirrorBladePort;
  CLOCK: { sim: number };
  CONFIG: GameConfig;
  Enemy: new (x: number, y: number, config: EnemyConfig) => EnemyBasePort;
  FX: {
    burst(...args: unknown[]): void; death(...args: unknown[]): void; explode(...args: unknown[]): void;
    flash(...args: unknown[]): void; ghost(...args: unknown[]): void; ring(...args: unknown[]): void;
  };
  GAME_RANDOM: { next(): number };
  presentation: MirrorPresentationPort;
  Player: new (x: number, y: number) => MirrorPlayerPort;
  Projectile: new (x: number, y: number, vx: number, vy: number) => MirrorProjectilePort;
  SFX: {
    boom(...args: unknown[]): void; crescent(...args: unknown[]): void; hurt(...args: unknown[]): void;
    recall(...args: unknown[]): void; saberBreak(...args: unknown[]): void; saberLock(...args: unknown[]): void;
    saberSizzle(...args: unknown[]): void; slam(...args: unknown[]): void; swing(...args: unknown[]): void;
    throwBlade(...args: unknown[]): void; updraft(...args: unknown[]): void;
  };
  clamp: (value: number, min: number, max: number) => number;
  getWeapon: (id: string) => { id: string; model: string };
  lerp: (from: number, to: number, amount: number) => number;
  lerpAngle: (from: number, to: number, amount: number) => number;
}
