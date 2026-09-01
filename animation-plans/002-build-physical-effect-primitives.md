# 002 — Replace decorative ribbons and rings with physical effect primitives

- **Status**: COMPLETE
- **Commit**: 9e7d6a7
- **Severity**: HIGH
- **Category**: physicality, continuity, timing, choreography
- **Estimated scope**: 9-13 files, medium-to-large implementation

## Problem

The current ribbon invents the same upward anime arc for every weapon, regardless of the measured path:

```ts
// src/presentation/particles.ts:164-166, 283-287 — current
ribbon(x0, y0, x1, y1, col) {
  this._emit({ type: "ribbon", x: x0, y: y0, x1, y1, col: col ?? "#ff8a1e", life: 0.34, max: 0.34 }, true);
}

const mx = (p.x + p.x1) / 2, my = Math.min(p.y, p.y1) - 55;
ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(mx, my, p.x1, p.y1); ctx.stroke();
ctx.globalAlpha = a * 0.55; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(mx, my, p.x1, p.y1); ctx.stroke();
```

Rings also expand with one generic radial behavior:

```ts
// src/presentation/particles.ts:157-165, 241-243 — current
ring(x, y, r0, col) {
  // ... life: 0.32, max: 0.32
}

if (p.type === "ring") p.r += 520 * dt * motionScale;
```

Nearly every recipe at `src/presentation/combat/attack-presentation-director.ts:81-171` combines ribbons, rings, and a burst. Sword, Hammer, Greatsword, Chainblade, and Riftlock consequently share one abstract circular/comic language. The declared `motion` and `trailPersistence` authorities at `attack-presentation-director.ts:4-27` are not consumed, so the current class is a recipe dispatcher rather than a physical animation system.

## Target

Retain the bounded particle system but replace director use of generic `ribbon`/`ring` with four data-only, pooled primitives. All durations are simulation-independent presentation seconds:

1. `edgeTrace(x0, y0, x1, y1, thickness, life, color)`: a straight, source-over tapered trace exactly between measured endpoints. No control-point offset. It does not move; opacity decays from 0.72 to 0 over `life`. Sword uses 2 px/0.09 s; Greatsword uses 5 px/0.14 s. Reduced motion replaces it with a 0.07 s static contact mark at the endpoint.
2. `contactMark(x, y, tangentX, tangentY, length, thickness, life, color)`: a centered source-over line/glint aligned to the normalized tangent. It does not expand. Sword uses 14 px/2 px/0.07 s; Greatsword 26 px/4 px/0.10 s; Chainblade 12 px/2 px/0.08 s; Riftlock impact 8 px/2 px/0.06 s.
3. `groundPulse(x, y, normalX, normalY, halfWidth, life, color)`: a shallow compressed band tangent to the surface. Width interpolates from 35% to 100%, vertical thickness from 5 px to 1 px, and opacity from 0.65 to 0 over 0.16 s. Hammer Meteor may use one 34 px half-width pulse; ordinary Hammer Break uses 22 px. It is not circular and does not pass through walls.
4. `muzzleWedge(x, y, directionX, directionY, length, halfWidth, life, color)`: a three-point source-over wedge aligned to normalized shot direction. Riftlock uses 20 px × 5 px for 0.055 s; Backblast may use 28 px × 7 px for 0.07 s. No full-screen or additive flash.

Extend `AttackPresentationCue` only with optional presentation facts that collision code already knows or can derive without new physics: `normalX`, `normalY`, and `material: "flesh" | "metal" | "stone" | "air"`. When absent, normalize `(-directionX, -directionY)` as the contact normal and use `"air"`; zero-length vectors fall back to `(0, -1)`. These fields remain cosmetic and must not enter authoritative hashes.

Use existing directional sparks, shards, smoke, drips, measured blade trails, projectile history, and restrained ghosts. Do not raise particle ceilings. Apply this five-weapon grammar:

- **Sword**: one short measured edge trace plus endpoint contact mark and 3-6 high / 1-3 low directional sparks. Reversal reads through reversed geometry/direction, not extra text or rings.
- **Hammer**: no edge trace. Break uses one ground pulse plus downward/tangent fragments; Meteor adds smoke and a delayed-looking heavier second material response only if the existing gameplay event emits a distinct resolve cue. Never schedule a new timer.
- **Greatsword**: rely on the existing broad blade silhouette/measured trail; add at most one 0.14 s broad edge trace and one contact mark. No paired ribbons or rings.
- **Chainblade**: represent tension with a straight 0.10-0.12 s trace on the actual source-target cable and a short tangent-aligned snap at real sling release. Do not invent a curve; real chain geometry remains primary.
- **Riftlock**: one muzzle wedge at shot start, weapon recoil already owned by gameplay/rendering, a short projectile trace from existing fixed history, and sparse impact sparks/contact mark. Capture is restrained; a true Backblast may use the larger wedge and upper local spark budget.

## Repo conventions to follow

- `src/presentation/entities/blade-renderer.ts:173-195` already renders measured blade history; imitate its geometry-first approach instead of inventing arcs.
- `src/presentation/particles.ts:116-130` is the bounded admission/eviction authority. New primitives must pass through `_emit` and the same visibility culling.
- `src/presentation/particles.ts:133-141` creates directional, gravity-affected sparks and `:168-178` creates ballistic shards. Reuse these rather than adding a second particle engine.
- `src/presentation/combat/attack-presentation-director.ts:42-67` must remain a bounded one-shot dispatcher with no gameplay clock ownership.
- `src/gameplay/combat/attack-presentation-cue.ts` owns semantic facts; Canvas types must not leak into gameplay.

## Steps

1. Add optional normal/material fields to `AttackPresentationCue`, its constructor/emission call sites, and the `attack:v1` cosmetic codec. Bump only the cosmetic codec version if backward-compatible optional decoding cannot be retained; legacy `attack:v1` packets must continue to decode with fallbacks.
2. In `src/presentation/particles.ts`, add pooled union members and `ParticleSystem` methods for `edgeTrace`, `contactMark`, `groundPulse`, and `muzzleWedge`. Implement visibility bounds, update behavior, and source-over drawing exactly as specified. Avoid arrays, closures, gradients, paths cached per frame, and additive compositing.
3. Add unit tests for endpoint fidelity, normalized/fallback vectors, lifetimes, culling, pool admission, and zero steady-state growth after expiry. Assert that no primitive extends beyond its declared geometry plus cull margin.
4. Replace the director port surface `ribbon`/`ring` with the four physical methods and wire them through live and replay composition.
5. Rewrite each director recipe to the five-weapon grammar above. Consume `motion` and `trailPersistence`, or replace those fields with exact primitive-duration fields that are actually used. Remove dead profile authorities.
6. Route material/normal data from held collision, thrown collision, Hammer terrain impact, Chainblade release, and Riftlock projectile contact without changing collision outcomes.
7. Keep old generic `ring`/`ribbon` methods only for unrelated legacy effects that still need them; the attack director must no longer call either method.
8. Update unit snapshots/expectations and replay visual tests to assert semantic equivalence and bounded primitive calls, not the rejected ribbon/ring counts.

## Boundaries

- Do NOT change hitboxes, collision decisions, damage, momentum, release velocity, hit-stop, camera, audio, or authoritative timing.
- Do NOT infer material via DOM/canvas pixel reads or allocate per-frame geometry objects.
- Do NOT add post-processing, gradients, universal outlines, full-screen flashes, or dependencies.
- Do NOT raise global 320/110 or local 5-9 high / 2-4 low ceilings.
- Do NOT remove legacy rings/ribbons outside attack presentation without separate evidence.
- If a collision path cannot provide a truthful normal/material, use the documented fallback instead of changing gameplay physics.

## Verification

- **Mechanical**: run `pnpm typecheck`, `pnpm lint`, `pnpm check:architecture`, and focused Vitest for particle runtime, director, held/thrown collision, Hammer Meteor, replay visual, and all five weapon roster tests. Expected outcome: all exit 0 and replay authoritative hashes are unchanged.
- **Feel check**: build and run the five capture scenarios at 10% playback/single-frame inspection. Confirm:
  - every trace begins/ends on measured geometry and never bows upward by default;
  - Sword is narrow/fast, Hammer compresses the ground, Greatsword is broad, Chainblade follows cable/tangent, Riftlock reads as recoil/ballistics;
  - no weapon gains false reach and no effect crosses an occluding surface merely because a radial ring expands;
  - contact response direction agrees with travel and surface normal.
- **Done when**: attack presentation contains no calls to generic `ribbon` or `ring`; all five weapons have visibly distinct physical reads; the new primitives remain pooled, culled, bounded, replay-safe, and mechanically inert.
