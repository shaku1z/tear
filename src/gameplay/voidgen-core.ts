import type { VoidHazardType, VoidLane, VoidOptions, VoidOptionsInput, VoidPlatform, VoidSeed } from "./voidgen-contracts";

export const LANES: readonly VoidLane[] = Object.freeze(["lower", "upper"]);
// These names describe invisible reachability relationships, not scenery.
// The release renderer never paints ladders, nodes or connector filaments.
export const CONNECTOR_MOTIFS = Object.freeze(["braidRise", "braidDrop", "eclipse"]);
export const ROUTE_MOTIFS = Object.freeze(["fork", "riskReward", "fractureBypass", "staggeredFire", "wispBridge"]);
export const MOTIFS = Object.freeze([...ROUTE_MOTIFS, ...CONNECTOR_MOTIFS]);

export const DEFAULTS: Readonly<VoidOptions> = Object.freeze({
  startX: 0,
  chunkWidthMin: 580,
  chunkWidthMax: 720,
  platformHeight: 22,
  platformWidthMin: 150,
  platformWidthMax: 285,
  edgeInset: 24,
  laneClearance: 76,
  lowerBandMin: 550,
  lowerBandMax: 700,
  upperBandMin: 350,
  upperBandMax: 510,
  transferDeltaMin: 145,
  transferDeltaMax: 165,
  scrollSpeedMin: 170,
  scrollSpeedMax: 351,
  materializationState: "active",
  firePeriod: 3.0,
  fireArmTime: 0.65,
  fireHotTime: 1.05,
  cageHeight: 170,
  cageHalfWidth: 22,
  cageVerticalClearance: 2,
  cageMinBlockHeight: 96,
  playerHalfWidth: 16,
  playerHalfHeight: 25,
  physics: Object.freeze({
    jumpSpeed: 920,
    gravity: 2400,
    moveSpeed: 430,
    dashSpeed: 1500,
    dashDuration: 0.15,
  }),
});

export interface RngState { value: number }
export interface RawPlatformSpec {
  rx: number;
  y: number;
  w: number;
  type: VoidHazardType;
  role: string;
  platform?: VoidPlatform;
}
export type PendingConnector = [VoidLane, number, VoidLane, number, string];

export function clamp(v: number, lo: number, hi: number): number { return v < lo ? lo : (v > hi ? hi : v); }
export function overlap(a0: number, a1: number, b0: number, b1: number): boolean { return Math.max(a0, b0) < Math.min(a1, b1); }
export function finite(v: unknown, fallback: number): number { return typeof v === "number" && Number.isFinite(v) ? v : fallback; }

export function seed32(value: VoidSeed): number {
  if (typeof value === "number" && Number.isFinite(value)) return (value >>> 0) || 1;
  const text = String(value ?? "void");
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) || 1;
}

export function mix32(value: number): number {
  let x = value >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15; x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return (x >>> 0) || 1;
}

export function rngStep(value: number): number {
  let x = value >>> 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  return (x >>> 0) || 0x9e3779b9;
}

export function random(rng: RngState): number {
  rng.value = rngStep(rng.value);
  return rng.value / 4294967296;
}

export function randomInt(rng: RngState, count: number): number { return Math.floor(random(rng) * count); }
export function randomRange(rng: RngState, lo: number, hi: number): number { return lo + (hi - lo) * random(rng); }

export function normaliseOptions(overrides?: VoidOptionsInput): VoidOptions {
  const src = overrides ?? {};
  const physics = { ...DEFAULTS.physics, ...(src.physics ?? {}) };
  const out = { ...DEFAULTS, ...src, physics };
  // Below 580px, two non-adjacent partial chunks can enter a 2000px
  // zoom-0.8 view and push a lane above the seven-surface readability cap.
  out.chunkWidthMin = Math.max(580, finite(out.chunkWidthMin, DEFAULTS.chunkWidthMin));
  out.chunkWidthMax = Math.max(out.chunkWidthMin, finite(out.chunkWidthMax, DEFAULTS.chunkWidthMax));
  out.platformHeight = Math.max(8, finite(out.platformHeight, DEFAULTS.platformHeight));
  out.platformWidthMin = Math.max(100, finite(out.platformWidthMin, DEFAULTS.platformWidthMin));
  out.platformWidthMax = Math.max(out.platformWidthMin, finite(out.platformWidthMax, DEFAULTS.platformWidthMax));
  out.edgeInset = Math.max(0, finite(out.edgeInset, DEFAULTS.edgeInset));
  out.laneClearance = Math.max(48, finite(out.laneClearance, DEFAULTS.laneClearance));
  out.transferDeltaMin = Math.max(80, finite(out.transferDeltaMin, DEFAULTS.transferDeltaMin));
  out.transferDeltaMax = Math.max(out.transferDeltaMin, finite(out.transferDeltaMax, DEFAULTS.transferDeltaMax));
  out.scrollSpeedMin = Math.max(0, finite(out.scrollSpeedMin, DEFAULTS.scrollSpeedMin));
  out.scrollSpeedMax = Math.max(out.scrollSpeedMin, finite(out.scrollSpeedMax, DEFAULTS.scrollSpeedMax));
  out.firePeriod = Math.max(1, finite(out.firePeriod, DEFAULTS.firePeriod));
  out.fireArmTime = Math.max(0.1, finite(out.fireArmTime, DEFAULTS.fireArmTime));
  out.fireHotTime = Math.max(0.1, finite(out.fireHotTime, DEFAULTS.fireHotTime));
  out.firePeriod = Math.max(out.firePeriod, out.fireArmTime + out.fireHotTime + 0.1);
  out.cageHeight = Math.max(24, finite(out.cageHeight, DEFAULTS.cageHeight));
  out.cageHalfWidth = Math.max(4, finite(out.cageHalfWidth, DEFAULTS.cageHalfWidth));
  out.cageVerticalClearance = Math.max(0, finite(out.cageVerticalClearance, DEFAULTS.cageVerticalClearance));
  out.cageMinBlockHeight = Math.max(24, finite(out.cageMinBlockHeight, DEFAULTS.cageMinBlockHeight));
  out.physics.jumpSpeed = Math.max(1, finite(out.physics.jumpSpeed, DEFAULTS.physics.jumpSpeed));
  out.physics.gravity = Math.max(1, finite(out.physics.gravity, DEFAULTS.physics.gravity));
  out.physics.moveSpeed = Math.max(1, finite(out.physics.moveSpeed, DEFAULTS.physics.moveSpeed));
  out.physics.dashSpeed = Math.max(0, finite(out.physics.dashSpeed, DEFAULTS.physics.dashSpeed));
  out.physics.dashDuration = Math.max(0, finite(out.physics.dashDuration, DEFAULTS.physics.dashDuration));
  return out;
}
