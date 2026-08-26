/**
 * Structural read/write capabilities exposed by a Tear simulation composition.
 * These contracts intentionally contain no app constructors, DOM, Canvas,
 * presentation, persistence, platform, or replay types.
 */
export interface TearSimulationPlayerView {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  facing: number;
  onGround: boolean;
  dashCharges: number;
  hw?: number;
  hh?: number;
  dashTimer?: number;
  dashCd?: number;
  iframe?: number;
  maxDashCharges?: number;
}

export interface TearSimulationBladeView {
  x: number;
  y: number;
  tipX: number;
  tipY: number;
  vx: number;
  vy: number;
  tipSpeed: number;
  state: string;
  hostile: boolean;
  stolenBy?: unknown;
  tetherFactor: number;
  riftChambers?: number;
  riftChamberCooldown?: number;
  /** Retained as optional historical projection fields for old observers. */
  orbit?: number;
  circuitEnergy?: number;
}

export interface TearSimulationEnemyView {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  dead: boolean;
  kind: string;
  bossId?: string;
  isBoss?: boolean;
  isVoidWisp?: boolean;
  supportType?: string;
  state?: string;
  atk?: string;
  behavior?: string;
  mode?: string;
  phase?: string | number;
  phaseMarks: readonly (string | number)[];
  contactDmg: number;
  hw?: number;
  hh?: number;
  contactReach?: number;
  chargeMult?: number;
  auraDmg?: number;
  contactEnabled?: boolean;
}

export interface TearSimulationProjectileView {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dead: boolean;
  deflected?: boolean;
  harmless?: boolean;
  family?: string;
  counterplay?: string;
  r?: number;
  dmg?: number | null;
  unparryable?: boolean;
}

export interface TearSimulationRunView {
  mode: string;
  diff: string;
  weaponId: string;
  runSeed: number;
  wave: number;
  score: number;
  spawnQueue: readonly unknown[];
  weaponLog: readonly unknown[];
  weaponStats: Readonly<{
    heldHits: number;
    trueCuts: number;
    reversals?: number;
    throws: number;
    throwHits: number;
    perfectParries: number;
  }>;
  waveKills: number;
  runTime: number;
  waveLog: unknown[];
  mult: number;
}

/** Detached-safe environment projection; no constructors, callbacks, or presentation values. */
export interface TearSimulationEnvironmentView {
  readonly stageId: string;
  readonly worldId: string;
  readonly revision: number;
  readonly fields: readonly Readonly<Record<string, unknown>>[];
  readonly combatObjects: readonly Readonly<Record<string, unknown>>[];
  readonly routes: readonly Readonly<Record<string, unknown>>[];
  readonly lastClearReason: string | null;
}

export interface TearSimulationWorldView {
  run(): TearSimulationRunView | null;
  player(): TearSimulationPlayerView | undefined;
  blade(): TearSimulationBladeView | undefined;
  enemies(): TearSimulationEnemyView[];
  projectiles(): TearSimulationProjectileView[];
  /** Optional on legacy observers until their environment capability is wired. */
  environment?(): TearSimulationEnvironmentView;
}
