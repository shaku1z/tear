// ------- small math / geometry helpers -------
function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function len(x, y) { return Math.hypot(x, y); }

// shortest-path angle lerp
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// closest distance from point C to segment AB, returns {dist, px, py}
function segPointDist(ax, ay, bx, by, cx, cy) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 === 0 ? 0 : ((cx - ax) * dx + (cy - ay) * dy) / l2;
  t = clamp(t, 0, 1);
  const px = ax + dx * t, py = ay + dy * t;
  return { dist: len(cx - px, cy - py), px, py };
}

// segment AB intersects circle (cx,cy,r)?
function segCircle(ax, ay, bx, by, cx, cy, r) {
  return segPointDist(ax, ay, bx, by, cx, cy).dist <= r;
}

// axis-aligned overlap of two rects (center-based, half extents)
function aabbOverlap(ax, ay, ahw, ahh, bx, by, bhw, bhh) {
  // strict: merely *touching* an edge (e.g. standing exactly on a floor) is not
  // an overlap. With <= , resting on the ground registered as a horizontal
  // collision and killed left/right movement every frame.
  return Math.abs(ax - bx) < ahw + bhw && Math.abs(ay - by) < ahh + bhh;
}
