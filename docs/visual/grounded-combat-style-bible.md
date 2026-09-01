# Tear grounded combat presentation style bible

## Document control

- Project: Tear
- Engine/version: custom TypeScript 6.0 / Canvas 2D runtime, Vite 8
- Render pipeline: deterministic 120 Hz simulation with requestAnimationFrame presentation
- Targets: standalone/PWA and CrazyGames desktop/touch browsers
- Target frame rate: 60 fps minimum presentation; 120 Hz authoritative simulation
- Status: direction locked; physical primitives and the five-weapon desktop production slice validated
- Representative slice: all five weapons across held contact, throw contact/return, physical impact/release, and Riftlock projectile start/contact

## Visual thesis

Tear's signature is its **blade, ink, and hard-silhouette grammar**: sharp weapon geometry, decisive black structure, restrained paper-and-ink contrast, and physical motion that stays legible as a hard shape. “Grounded stylized action” describes the behavior, but blade/ink/hard silhouette is the art-direction anchor.

Motion, weight, contact, and consequence create the spectacle. Effects clarify the real blade path, travel direction, impact normal, material, tension, recoil, and timing. They do not invent reach, decorate every action with a symbol, or substitute color and text for physical behavior.

The desired result is restrained at rest and forceful at the decisive instant. A hit may be bright, sharp, and dramatic, but it must still look caused by the weapon and the world.

## Information hierarchy

1. Enemy anticipation, hazard boundaries, hostile projectiles, and the player silhouette.
2. Weapon geometry, measured path, and contact point.
3. Damage and factual state feedback such as `BREAK`, `PARRIED`, or `RUPTURE`.
4. Cosmetic fragments, smoke, afterimages, and accent color.

Ordinary attacks never display their move name. Decorative `REVERSAL`, `THREADCUT`, `METEOR`, `WHEEL CUT`, `WHEEL RETURN`, `LASH`, `SLING`, `RECOIL CUT`, `CAPTURE`, and `BACKBLAST` labels are outside the style.

Damage numbers use the established restrained 16 px mono read with no bold weight and no oversized spawn pop. Larger/bold typography is reserved for a true named state change, not routine damage.

## Weapon identities

| Weapon | Primary physical read | Secondary accent | Strategic variation |
| --- | --- | --- | --- |
| Sword | narrow measured edge, fast contact glint | cool steel/cyan | reversal is visible through reversed travel; Threadcut closes the real throw path |
| Hammer | compression, ground band, heavy fragments and dust | warm steel/amber | impact scale follows descent and mass; Meteor owns the heaviest bounded response |
| Greatsword | broad blade silhouette and carried sweep | restrained violet-steel | width and persistence communicate commitment; return follows real geometry |
| Chainblade | cable tension, source-target line, tangent snap | dark steel/green | Hook is taut; Sling follows actual target velocity and release tangent |
| Riftlock | muzzle direction, recoil cadence, projectile history | cold steel/pale cyan | Capture is restrained; true Backblast receives the stronger ballistic response |

Weapon identity must remain legible in grayscale through geometry, width, direction, cadence, and material response. Accent colors are subordinate and must not become a five-color arcade grammar.

## Motion and VFX grammar

- Simulation owns facts; presentation owns only bounded cosmetic projection.
- Trails use measured weapon/projectile history. They never lead the weapon, bow toward an arbitrary control point, continue through hit-stop as if time advanced, or cross a solid surface without a physical event.
- Source-over compositing is the default. Additive or white-hot treatment is reserved for an exceptional impact and must remain local and brief.
- Directional sparks follow travel/contact direction with gravity and drag.
- Shards and dust follow material and impact normal. Smoke is reserved for heat, pulverized ground, or a genuinely large impact.
- Rings are not a universal contact symbol. A radial shockwave is allowed only when the gameplay event physically produces an omnidirectional pressure response.
- One semantic contact owns one complete local effect budget. Signature presentation replaces duplicate generic layers instead of stacking on top of them.
- Camera shake, hit-stop, and audio remain separately owned, priority-coalesced one-shots; visual recipes do not change them.

## Weapon recipes

- Sword: one short velocity-aligned edge trace, one brief contact glint, and a small directional spark fan.
- Hammer: one shallow ground-compression band with downward/tangent fragments; Meteor may add bounded dust/smoke and a heavier existing resolve pulse.
- Greatsword: the real broad blade/trail is primary; at most one broad afterimage and one contact glint.
- Chainblade: the real chain is primary; one taut source-target trace and one tangent snap at real release.
- Riftlock: one short muzzle wedge, recoil/projectile history, and sparse material-aware contact sparks; Backblast may use the upper local budget.

## Accessibility and quality tiers

- Reduced motion preserves a static 70-100 ms contact silhouette and factual feedback. It removes moving fragments, expanding radii, displaced cosmetic text, and screen flash.
- Low graphics preserves the same physical meaning while removing secondary fragments, smoke, additive layers, shadows, and redundant traces.
- High contrast resolves contact colors from configured theme surfaces and may add a 1 px outline to the primary mark; it does not sample Canvas pixels per frame.
- Effects must remain readable at close, medium, and normal gameplay distance without obscuring enemy telegraphs, hazards, projectiles, or damage/state facts.

## Performance contract

- Machine source: `config/browser-performance-budgets.json`.
- Ordinary/biome workloads: frame work p95 <= 16.67 ms, frame-interval p99 <= 34 ms, interval max <= 50 ms, zero new >50 ms frame-work tasks.
- Constrained 4x CPU: frame work p95 <= 20 ms, interval p99 <= 50 ms, interval max <= 75 ms.
- Retain the global 320 high / 110 low bounded particle pool and local weapon ceilings of 5-9 high / 2-4 low. Do not raise either to buy spectacle.
- No per-frame DOM/style/canvas readback, unbounded cue/floater queue, gameplay-clock mutation, or cosmetic RNG in simulation.
- The semantic cue/dedupe/replay architecture remains typed, scoped, and presentation-only.

## Rejection criteria

- Decorative move-name text appears during ordinary combat.
- A default upward curve, concentric ring, or identical recipe is reused across weapon families.
- An effect hides gameplay information, implies false reach, contradicts velocity/normal/material, or detaches from the contact that caused it.
- Weapon identity depends on hue alone.
- Reduced motion removes the contact read; low graphics changes its meaning.
- Presentation changes canonical state, RNG, actions, causal events, replay hashes, damage, timing, or physics.
- Evidence omits default/low/reduced/high-contrast states, close/medium/far review, all five weapon journeys, or frame pacing.
- Rare pacing tails are hidden behind averages or described as zero stutter.
