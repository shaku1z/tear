# 003 — Unify attack-effect budgets and accessibility behavior

- **Status**: COMPLETE
- **Commit**: 9e7d6a7
- **Severity**: HIGH
- **Category**: performance, accessibility, readability
- **Estimated scope**: 10-14 files, medium implementation

## Problem

A signature contact currently emits legacy hit feedback and then emits a second presentation burst. For example, held collision performs its ordinary burst/damage feedback at `src/gameplay/combat/held-blade-collision-runtime.ts:132-140`, while the director independently calculates another burst:

```ts
// src/presentation/combat/attack-presentation-director.ts:69-79 — current
const particles = this.ports.lowGraphics() ? profile.lowParticleBudget : profile.highParticleBudget;
const burst = (scale: number, color = profile.edgeColor): void => {
  if (this.ports.reducedMotion()) return;
  this.ports.burst(cue.x, cue.y, cue.directionX, cue.directionY,
    Math.max(1, Math.round(particles * scale)), color);
};
```

This doubles cost and clutter instead of treating the complete contact as one budgeted composition. Floaters retain their original short lifetime and complete factual feedback:

```ts
// src/app/live-campaign-training-composition.ts:111-113 — current
const addFloater = (x: number, y: number, text: string, big = false, color = "#000"): void => {
  options.state.floaters().push({ x, y, text, life: 0.8, big, col: color });
};

// src/gameplay/combat/combat-tail-runtime.ts:61-62 — current
for (const floater of input.floaters) { floater.y -= 30 * dt; floater.life -= dt; }
const floaters = input.floaters.filter((floater) => floater.life > 0);
```

Reduced motion only suppresses bursts; fixed ribbons/rings remain and floaters still rise. Low graphics reduces spark counts but preserves expensive/large visual layers. High-contrast state exists at `src/app/live-game-runtime.ts:610` but is not available to the attack director. Critical effects may evict unrelated hazard/environment feedback from the one shared pool at `src/presentation/particles.ts:116-130`.

## Target

- One contact owns one complete local effect budget. Signature presentation replaces, rather than stacks on, the legacy contact burst for that same semantic event.
- Preserve local maxima: Sword 6 high/3 low, Hammer 9/4, Greatsword 8/4, Chainblade 7/3, Riftlock 5/2. These counts include all sparks/shards/smoke/marks for the contact, not each layer separately.
- Preserve the global 320 high / 110 low pool limits. Do not reserve more than 24 slots total for critical attack silhouettes; hazard-critical effects must have equal or higher admission priority.
- Add an explicit `EffectPriority = "cosmetic" | "combat" | "hazard"` admission field. When full, `hazard` may evict cosmetic/combat, `combat` may evict cosmetic only, and cosmetic may not evict. Round-robin replacement occurs only within an equal/lower permitted priority. This replaces the current boolean `critical` policy.
- Preserve uncapped floater admission and the authored short lifetime. Do not merge, suppress, replace, or deprioritize damage/state facts for performance. Optimize lifecycle cleanup only when equivalence is proven. Do not add attack move names.
- Reduced motion: no moving fragments, expanding radius, camera-dependent displacement, or rising cosmetic attack text. Preserve a 0.07-0.10 s static contact mark and factual text; factual floaters fade in place.
- Low graphics: preserve one physical silhouette/contact mark; remove secondary fragments, smoke, additive layers, shadows, and redundant traces before reducing the primary read.
- High contrast: expose `highContrast()` and resolved ink/surface contrast through the director port. Contact marks must meet a 3:1 local contrast target against sampled theme surfaces using configured theme colors—not per-frame canvas sampling. Add a 1 px high-contrast outline only to the primary contact mark.
- No steady-state per-frame allocation for effect admission, floater cleanup, or accessibility routing.

## Repo conventions to follow

- `src/config/game-config.ts:21` owns the existing global FX budgets; retain those values.
- `src/presentation/particles.ts:116-130` owns bounded pool admission and deterministic replacement. Extend this mechanism instead of introducing another collection.
- `src/app/live-game-runtime.ts:260-264` composes live attack presentation; route low graphics, reduced motion, and high contrast from this boundary.
- `src/presentation/world/entity-layer.ts:119-127` renders factual floaters; keep presentation rendering separate from gameplay decisions.
- Collision runtimes already own generic contact feedback. Add a single suppression/ownership decision at the semantic cue boundary rather than scattering weapon-name conditions.

## Steps

1. Trace every held, thrown, terrain, release, and projectile contact that both emits legacy FX and an `AttackPresentationCue`. Add a typed receipt/ownership result so the director-owned composition suppresses only its duplicate legacy burst, never damage or factual state feedback.
2. Convert particle admission from boolean `critical` to `EffectPriority`; implement and unit-test the eviction matrix and the 24-slot combat reservation without raising global capacity.
3. Preserve direct floater admission. If profiling identifies cleanup as material, replace filter-based cleanup with an allocation-bounded equivalent that retains every live floater and the exact authored lifetime.
4. Add `highContrast` and theme-resolved contact colors to live/replay presentation options. Keep replay behavior aligned with live for all non-text attack primitives.
5. Apply reduced-motion and low-graphics policies to every Plan 002 primitive and to factual floater motion. Ensure low graphics changes density/layers, not semantic meaning.
6. Update director recipes so their local count includes every emitted particle/mark. Add tests that enumerate all variants under high, low, reduced-motion, and high-contrast policies and assert the exact maximum count.
7. Add a simultaneous-contact stress scenario with five weapon-family cues plus hazards. Assert hazard visibility/admission, complete floater feedback, effect caps, and deterministic cleanup.

## Boundaries

- Do NOT suppress damage numbers, state facts, enemy telegraphs, hazards, or projectile reads.
- Do NOT merge, suppress, replace, or aggregate factual floaters to meet a performance target.
- Do NOT let presentation receipts feed back into gameplay outcomes or replay hashes.
- Do NOT add per-frame DOM/style/canvas reads, unbounded queues, or larger budgets.
- Do NOT make reduced motion equivalent to no feedback.
- If duplicate ownership cannot be proven for an emission site, keep the legacy effect and report the unresolved overlap rather than risking missing feedback.

## Verification

- **Mechanical**: run `pnpm typecheck`, `pnpm lint`, `pnpm check:architecture`, focused particle/floater/director/collision/replay tests, `pnpm build:test:standalone`, and `pnpm test:browser:performance`. Expected: no effect-cap violation, no missing floater feedback, no hazard-priority regression, no authoritative state/hash difference, and no new >50 ms frame-work task.
- **Feel check**: create dense simultaneous-contact captures in default, low graphics, reduced motion, and high contrast. Confirm:
  - each hit has one coherent response rather than stacked duplicate bursts;
  - damage/state facts remain readable without label collisions;
  - reduced motion is static but unambiguous;
  - low graphics preserves attack direction/contact;
  - hazards remain visible when the particle pool is saturated.
- **Done when**: bounded effect pools remain deterministic, factual floaters retain uncapped short-lived admission, one semantic contact consumes one local effect budget, priority/accessibility policies are test-covered, live/replay primitive grammar matches, and no measured pacing budget regresses.
