import type { VoidHazardState, VoidLane, VoidOptions, VoidOptionsInput, VoidPlatform, VoidRect } from "./voidgen-contracts";
import { finite, normaliseOptions, overlap } from "./voidgen-core";

export function cageGeometry(platform: VoidPlatform | null | undefined, overrides?: VoidOptionsInput): VoidRect | null {
  if (platform?.voidType !== "cage") return null;
  const options = normaliseOptions(overrides);
  const spec = platform.cage;
  const halfWidth = finite(spec?.halfWidth, finite(platform.cageHalfWidth, options.cageHalfWidth));
  const height = finite(spec?.height, finite(platform.cageHeight, options.cageHeight));
  const centerX = platform.x + finite(spec?.offsetX, platform.w + 18);
  return { centerX, x: centerX - halfWidth, y: platform.y - height, w: halfWidth * 2, h: height };
}

function standingRange(surface: VoidPlatform, options: VoidOptions): { x0: number; x1: number } {
  // Platform support uses AABB overlap in the game, so a player can remain
  // supported while overhanging by almost one half-width at either edge.
  return { x0: surface.x - options.playerHalfWidth, x1: surface.x + surface.w + options.playerHalfWidth };
}

function cageCanReachStandingX(cage: VoidPlatform, surface: VoidPlatform, options: VoidOptions): boolean {
  const rect = cageGeometry(cage, options), stand = standingRange(surface, options);
  if (rect === null) return false;
  return overlap(rect.x - options.playerHalfWidth, rect.x + rect.w + options.playerHalfWidth, stand.x0, stand.x1);
}

function cageStandingOverlap(cage: VoidPlatform, surface: VoidPlatform, options: VoidOptions): boolean {
  if (cage.voidLane === surface.voidLane || !cageCanReachStandingX(cage, surface, options)) return false;
  const rect = cageGeometry(cage, options);
  if (rect === null) return false;
  const playerTop = surface.y - options.playerHalfHeight * 2;
  return overlap(rect.y, rect.y + rect.h, playerTop, surface.y);
}

export function fitCageHeights(platforms: readonly VoidPlatform[], options: VoidOptions): void {
  for (const cage of platforms) {
    if (cage.voidType !== "cage") continue;
    let height = options.cageHeight;
    const adjustedFor: string[] = [];
    for (const surface of platforms) {
      if (surface.voidLane === cage.voidLane || surface.y >= cage.y || !cageCanReachStandingX(cage, surface, options)) continue;
      height = Math.min(height, Math.max(0, cage.y - surface.y - options.cageVerticalClearance));
      adjustedFor.push(surface.id);
    }
    cage.cage ??= { offsetX: cage.w + 18, halfWidth: options.cageHalfWidth, height };
    cage.cage.height = height;
    cage.cageHeight = height;
    cage.cageAdjustedFor = adjustedFor;
    const rect = cageGeometry(cage, options);
    if (rect !== null) {
      cage.cageX = rect.centerX;
      cage.cageRect = rect;
    }
  }
}

function cageFree(platform: VoidPlatform, platforms: readonly VoidPlatform[], options: VoidOptions): boolean {
  const px = platform.x + platform.w * 0.5;
  const py = platform.y - options.playerHalfHeight;
  for (const cage of platforms) {
    if (cage.voidType !== "cage") continue;
    const rect = cageGeometry(cage, options);
    if (rect === null) continue;
    if (px + options.playerHalfWidth > rect.x && px - options.playerHalfWidth < rect.x + rect.w &&
      py + options.playerHalfHeight > rect.y && py - options.playerHalfHeight < rect.y + rect.h) return false;
  }
  return true;
}

export function selectRescue(platforms: readonly VoidPlatform[], centerX: number, _runTime: number, overrides?: VoidOptionsInput): VoidPlatform | null {
  const options = normaliseOptions(overrides);
  const active = platforms.filter((p) => p.void && p.voidType === "plain" &&
    p.materializationState === "active" && p.collidable !== false && cageFree(p, platforms, options));
  if (!active.length) return null;
  const lower = active.filter((p) => p.voidLane === "lower");
  const pool = lower.length ? lower : active.filter((p) => p.voidLane === "upper");
  return pool.sort((a, b) => Math.abs((a.x + a.w * 0.5) - centerX) - Math.abs((b.x + b.w * 0.5) - centerX) || a.id.localeCompare(b.id))[0] ?? null;
}

export function hazardState(platform: VoidPlatform | null | undefined, runTime: number, overrides?: VoidOptionsInput): VoidHazardState {
  if (platform?.voidType !== "fire") return platform?.voidType === "crumble" ? "crumble" : "cold";
  const options = normaliseOptions(overrides);
  const offset = Number.isFinite(platform.hazardPhaseOffset)
    ? platform.hazardPhaseOffset
    : ((platform.hazardSeed >>> 0) / 4294967296) * options.firePeriod;
  const t = ((finite(runTime, 0) + offset) % options.firePeriod + options.firePeriod) % options.firePeriod;
  const hotStart = options.firePeriod - options.fireHotTime;
  const armStart = hotStart - options.fireArmTime;
  if (t < armStart) return "cold";
  if (t < hotStart) return "arming";
  return "hot";
}

function lethalIntervals(platforms: readonly VoidPlatform[]): { x0: number; x1: number; id: string; lane: VoidLane }[] {
  return platforms.filter((p) => p.voidType === "fire" || p.voidType === "cage").flatMap((p) => {
    if (p.voidType === "cage") {
      const rect = cageGeometry(p);
      return rect === null ? [] : [{ x0: rect.x, x1: rect.x + rect.w, id: p.id, lane: p.voidLane }];
    }
    return [{ x0: p.x, x1: p.x + p.w, id: p.id, lane: p.voidLane }];
  }).sort((a, b) => a.x0 - b.x0);
}

export function simultaneousThreats(platforms: readonly VoidPlatform[]): [string, string][] {
  const lower = lethalIntervals(platforms.filter((p) => p.voidLane === "lower"));
  const upper = lethalIntervals(platforms.filter((p) => p.voidLane === "upper"));
  const collisions: [string, string][] = [];
  let i = 0, j = 0;
  while (i < lower.length && j < upper.length) {
    const a = lower[i], b = upper[j];
    if (a === undefined || b === undefined) break;
    if (overlap(a.x0, a.x1, b.x0, b.x1)) collisions.push([a.id, b.id]);
    if (a.x1 < b.x1) i++; else j++;
  }
  return collisions;
}

export function clearanceFailures(platforms: readonly VoidPlatform[], options: VoidOptions): [string, string][] {
  const lower = platforms.filter((p) => p.voidLane === "lower").sort((a, b) => a.x - b.x);
  const upper = platforms.filter((p) => p.voidLane === "upper").sort((a, b) => a.x - b.x);
  const failures: [string, string][] = [];
  for (const lo of lower) {
    for (const up of upper) {
      if (up.x >= lo.x + lo.w) break;
      if (up.x + up.w <= lo.x) continue;
      if (lo.y - (up.y + up.h) < options.laneClearance) failures.push([lo.id, up.id]);
    }
  }
  return failures;
}

export function cageStandingFailures(platforms: readonly VoidPlatform[], options: VoidOptions): [string, string][] {
  const failures: [string, string][] = [];
  for (const cage of platforms) {
    if (cage.voidType !== "cage") continue;
    if ((cage.cage?.height ?? Number.POSITIVE_INFINITY) < options.cageMinBlockHeight) failures.push([cage.id, "too-short"]);
    for (const surface of platforms) {
      if (cageStandingOverlap(cage, surface, options)) failures.push([cage.id, surface.id]);
    }
  }
  return failures;
}
