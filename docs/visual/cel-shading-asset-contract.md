# Tear combat presentation asset contract

Tear's current combat art is procedural Canvas 2D geometry; this slice introduces no external image, model, shader, or DCC asset. Authored intent is carried by typed data rather than inferred from a stock material.

## Runtime data

- `BladeRenderSnapshot` remains the physical source for weapon position, tip, trail, tension, chambers, and reversal markers.
- `AttackPresentationCue` is the semantic one-shot source: weapon/action/phase/variant, stable IDs, source/impact coordinates, direction, and intensity.
- `ATTACK_PRESENTATION_PROFILES` owns palette, physical motion family, trail persistence, and high/low particle ceilings for the canonical five weapons.
- Canvas primitives use real alpha. No bitmap chroma key, texture atlas, normal map, or hidden generated copy is permitted in this slice.

## Geometry and line ownership

- Weapon bodies own their silhouette stroke/fill in `blade-renderer.ts`.
- Attack recipes own only transient ribbons, rings, sparks, and labels.
- Environment, hazard, particle, and UI outlines remain separately owned; no global black-outline pass is allowed.
- Line width must remain stable at gameplay scale and must not imply collision beyond authoritative geometry.

## Lifecycle and budgets

- Cue dispatch is bounded and deduplicated. Particle creation remains subject to the shared effect pool and view culling.
- High/low graphics and reduced-motion behavior are explicit profile/recipe inputs.
- Future sprite sheets must use deterministic manifests, consistent pivots, real alpha, rights/provenance, and motion review as animation. No sprite generation is authorized by this change.

## Validation

- Verify the Sword slice at close, normal, and far gameplay framing; normal, dark, high-contrast, low-graphics, and reduced-motion settings.
- Confirm Reversal and Threadcut originate and terminate on physical source/impact coordinates.
- Confirm no duplicate recipe is emitted for the same semantic cue and no gameplay/replay state includes cosmetic objects.
