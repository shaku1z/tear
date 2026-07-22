// Pure deterministic math and geometry shared by simulation systems.

export interface SegmentPointDistance {
  readonly dist: number;
  readonly px: number;
  readonly py: number;
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return value < minimum ? minimum : (value > maximum ? maximum : value);
}

export function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

export function len(x: number, y: number): number {
  return Math.hypot(x, y);
}

export function lerpAngle(start: number, end: number, amount: number): number {
  let delta = end - start;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return start + delta * amount;
}

export function segPointDist(
  ax: number, ay: number, bx: number, by: number, cx: number, cy: number,
): SegmentPointDistance {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const amount = clamp(lengthSquared === 0 ? 0 : ((cx - ax) * dx + (cy - ay) * dy) / lengthSquared, 0, 1);
  const px = ax + dx * amount;
  const py = ay + dy * amount;
  return Object.freeze({ dist: len(cx - px, cy - py), px, py });
}

export function segCircle(
  ax: number, ay: number, bx: number, by: number, cx: number, cy: number, radius: number,
): boolean {
  return segPointDist(ax, ay, bx, by, cx, cy).dist <= radius;
}

export function segSegmentDist(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): number {
  const rx = bx - ax;
  const ry = by - ay;
  const sx = dx - cx;
  const sy = dy - cy;
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) > 1e-8) {
    const qx = cx - ax;
    const qy = cy - ay;
    const amount = (qx * sy - qy * sx) / denominator;
    const otherAmount = (qx * ry - qy * rx) / denominator;
    if (amount >= 0 && amount <= 1 && otherAmount >= 0 && otherAmount <= 1) return 0;
  }
  return Math.min(
    segPointDist(ax, ay, bx, by, cx, cy).dist,
    segPointDist(ax, ay, bx, by, dx, dy).dist,
    segPointDist(cx, cy, dx, dy, ax, ay).dist,
    segPointDist(cx, cy, dx, dy, bx, by).dist,
  );
}

export function aabbOverlap(
  ax: number, ay: number, halfWidthA: number, halfHeightA: number,
  bx: number, by: number, halfWidthB: number, halfHeightB: number,
): boolean {
  return Math.abs(ax - bx) < halfWidthA + halfWidthB && Math.abs(ay - by) < halfHeightA + halfHeightB;
}
