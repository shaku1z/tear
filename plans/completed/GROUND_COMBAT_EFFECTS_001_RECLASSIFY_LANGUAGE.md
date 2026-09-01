# 001 — Reclassify Tear's combat presentation as grounded stylized action

- **Status**: COMPLETE
- **Commit**: 9e7d6a7
- **Severity**: HIGH
- **Category**: purpose, cohesion, visual hierarchy
- **Estimated scope**: 5 files, small-to-medium rewrite

## Problem

The current style contract explicitly locks the direction the user rejected:

```markdown
<!-- docs/visual/cel-shading-style-bible.md:13-21 — current -->
## Visual thesis

Combat reads as authored anime motion built from physical blade paths: one dark structural shape, one weapon-family color mass, and one restrained white-hot edge at the decisive contact.

## Family and readability

- Primary family: authored anime
- Supporting influences: comic-book impact graphics and graphic-cartoon value grouping
```

The director reinforces that language with all-caps move names for ordinary attacks:

```ts
// src/presentation/combat/attack-presentation-director.ts:77-92 — current
const label = (value: string, big = true, offset = 58): void => {
  this.ports.floater(cue.x, cue.y - offset, value, big, profile.bodyColor);
};

case "reversal":
  // ...
  label("REVERSAL");
  break;
case "threadcut":
  // ...
  label("THREADCUT", true, 60);
```

Equivalent decorative labels are emitted for `METEOR`, `WHEEL CUT`, `WHEEL RETURN`, `LASH`, `SLING`, `RECOIL CUT`, `CAPTURE`, and `BACKBLAST` at `src/presentation/combat/attack-presentation-director.ts:100-165`. The captures show these labels competing with damage and impact feedback, especially Chainblade and Riftlock. The pre-redesign oracle uses text such as `BREAK`, `PARRIED`, and `RUPTURE` to report an actual state change, but does not use the new move-name vocabulary. Move-name stickers therefore reduce physical credibility and obscure higher-value information.

## Target

Replace the locked style with **grounded stylized action**:

- Physical motion is the source of spectacle. Effects clarify measured direction, velocity, mass, contact normal, material, tension, recoil, and timing.
- Weapon silhouettes, enemy anticipation, hazard edges, projectiles, damage, and state-change facts outrank cosmetic attack accents.
- Ordinary attacks emit no move-name text. Remove `REVERSAL`, `THREADCUT`, `METEOR`, `WHEEL CUT`, `WHEEL RETURN`, `LASH`, `SLING`, `RECOIL CUT`, `CAPTURE`, and `BACKBLAST` from the director.
- Preserve oracle-backed state/fact text such as `BREAK`, `PARRIED`, and `RUPTURE` only at the gameplay event that owns the fact. Do not duplicate `BREAK` in the presentation director.
- Avoid a weapon-by-weapon rainbow as the primary identifier. Weapon identity must come first from shape, path, mass, cadence, and material response. Existing accent colors may remain as restrained secondary accents when contrast is adequate.
- Source-over compositing is the default. White-hot/additive treatment is reserved for a genuinely exceptional event and never layered on every contact.
- No screen-space outlines, full-screen bloom, chromatic aberration, motion blur, or invented reach.

Create `docs/visual/grounded-combat-style-bible.md` as the active contract. Replace `docs/visual/cel-shading-style-bible.md` with a short deprecation note linking to the grounded bible so stale links cannot silently preserve the rejected direction. Update the validation report and feature inventory language from anime/cel terminology to grounded combat presentation without changing the truthful performance measurements.

Remove `floater` from `AttackPresentationDirectorPorts` and `LiveAttackPresentationOptions` once all director labels are gone. Live and replay composition should then expose the same visual grammar; replay must not gain gameplay floaters.

## Repo conventions to follow

- `src/gameplay/combat/attack-presentation-cue.ts:10-28` is the typed, presentation-only semantic boundary. Keep it independent from Canvas primitives.
- `src/presentation/combat/attack-presentation-director.ts:42-67` owns bounded one-shot recipe dispatch and scoped deduplication. Keep that ownership.
- The oracle at commit `ee5e931` is the behavior/feel source of truth. Its `BREAK` feedback near `js/game.js:2933` is state feedback; its return ribbon near `js/game.js:3092` is not accompanied by a `THREADCUT` label.
- `docs/visual/cel-shading-validation-report.md:21-34` contains measured performance evidence. Preserve its values and its explicit residual-risk statement.

## Steps

1. Add `docs/visual/grounded-combat-style-bible.md` with the target thesis, hierarchy, weapon table, effect rules, accessibility rules, performance ceilings, and rejection criteria above.
2. Replace `docs/visual/cel-shading-style-bible.md` with a deprecation note pointing at the new file; do not leave any language that calls the rejected style locked or accepted.
3. In `src/presentation/combat/attack-presentation-director.ts`, delete the local `label` helper and every call to it. Remove the director-owned `BREAK` label as well; the owning hammer gameplay path retains factual break feedback.
4. Remove the `floater` port from `AttackPresentationDirectorPorts`, `src/app/live-attack-presentation.ts`, `src/app/live-game-runtime.ts`, and `src/app/live-replay-screen-adapter-runtime.ts`. Update tests and fixtures so live/replay director construction has the same port shape.
5. Update `docs/visual/cel-shading-validation-report.md` and the relevant attack-presentation entry in `docs/FEATURE_INVENTORY.md` to say that the first visual recipe was rejected, the typed/runtime foundation remains accepted, and grounded recipes are pending Plans 002-004.
6. Add a unit assertion that emitting every `AttackPresentationVariant` never invokes or depends on a floater port, while ordinary gameplay-owned factual floaters remain outside the director.

## Boundaries

- Do NOT remove or rename semantic cue variants, `attack:v1`, replay encoding, dedupe keys, attack IDs, or collision ownership.
- Do NOT remove gameplay-owned damage numbers or oracle-backed `BREAK`, `PARRIED`, or `RUPTURE` facts.
- Do NOT change damage, timing, hit-stop, camera shake, audio, weapon mechanics, or save/replay schemas.
- Do NOT add dependencies or metered/generated assets.
- If factual feedback ownership differs from the cited oracle/current paths, STOP and report instead of deleting it.

## Verification

- **Mechanical**: run `pnpm typecheck`, `pnpm lint`, `pnpm check:architecture`, and `pnpm vitest run tests/unit/attack-presentation-director.test.ts tests/unit/replay-visual.test.ts tests/unit/live-presentation-host.test.ts`. All must exit 0.
- **Feel check**: build with `pnpm build:test:standalone`, run `node tests/browser-attack-presentation-capture.js`, and inspect all five captures. Confirm:
  - no decorative move name appears;
  - damage/state facts remain legible;
  - silhouettes, hazards, and projectiles are not obscured;
  - live and replay use the same attack-effect grammar.
- **Done when**: no active documentation calls the direction anime/cel/comic/cartoon; the director has no floater dependency; no decorative move-name string remains in attack presentation; semantic replay and factual combat feedback still pass.
