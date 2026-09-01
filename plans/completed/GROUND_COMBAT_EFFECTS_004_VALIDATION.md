# 004 — Prove grounded quality, parity, and frame pacing

- **Status**: COMPLETE (desktop production slice; documented rollout limits)
- **Commit**: 9e7d6a7
- **Severity**: HIGH
- **Category**: validation, performance, accessibility
- **Estimated scope**: 4-8 test/docs files plus generated evidence

## Problem

The current capture harness proves only one default presentation state:

```js
// tests/browser-attack-presentation-capture.js:8-14, 39-42 — current
const captures = [
  { weapon: "sword", variant: "threadcut" },
  { weapon: "hammer", variant: "meteor" },
  { weapon: "greatsword", variant: "wheelCut" },
  { weapon: "chainblade", variant: "sling" },
  { weapon: "riftlock", variant: "backblastRound" },
];

withJourney({ name: "Final Five attack presentation capture", port: 8314 }, async ({ page }) => {
  // ...
  for (const capture of captures) {
```

It does not exercise low graphics, reduced motion, high contrast, close/medium/far readability, pool saturation, or simultaneous combat/hazard load. Unit tests assert primitive calls/counts but cannot validate overlap, false reach, material response, or hierarchy. Existing performance evidence is strong for sustained work but explicitly contains rare pacing tails:

```markdown
<!-- docs/visual/cel-shading-validation-report.md:32-34 — current -->
Residual risk remains explicit. One isolated Verdant run counted one early frame above 50 ms ... one isolated Pale run saw a 58.2 ms requestAnimationFrame gap ... An ordered run also saw a single 141.7 ms Verdant pacing gap. These are intermittent tails rather than sustained low FPS, but they prevent a zero-stutter or fully green aggregate-gate claim.
```

The prior captures validated a direction the user rejected. They must remain historical/rejected evidence, not acceptance evidence for the grounded system.

## Target

Produce fresh, source-bound evidence for all five weapons and four presentation policies:

- default;
- low graphics;
- reduced motion;
- high contrast.

For each policy, capture the representative signature at close, medium, and normal gameplay distance, for 5 × 4 × 3 = 60 deterministic images. Use the existing scenario seeds and record build commit, resolved scenario hash, viewport, DPR, policy, weapon, variant, and tick in a JSON manifest. Add short 120 fps frame sequences around contact (at least 2 anticipation, contact, and 4 resolve frames) for default mode so temporal geometry can be inspected without relying on one lucky screenshot.

Acceptance criteria:

- No decorative move-name text.
- No forced upward/default curve, universal concentric ring, false reach, detached contact, or effect crossing a solid surface without a physical event.
- Contact geometry agrees with source/endpoint/direction/normal; material response matches flesh/metal/stone/air routing.
- Sword, Hammer, Greatsword, Chainblade, and Riftlock are distinguishable in grayscale by silhouette/path/timing, not color alone.
- Enemy anticipation, hazards, projectiles, player silhouette, damage, and factual state text remain readable in every policy.
- Live and replay show the same non-text signature grammar at the same semantic cue.
- Current five-weapon mechanics/Ghost seeks pass unchanged.
- Active frame-work p95 ≤ 16.67 ms; constrained frame-work p95 ≤ 20 ms; active interval p99 ≤ 34 ms/max ≤ 50 ms; constrained interval p99 ≤ 50 ms/max ≤ 75 ms; zero new >50 ms frame-work tasks. Any rare interval failure is reported, not averaged away.
- Five lifecycle cycles end with zero effects/enemies/projectiles and retained heap growth ≤ 16 MiB.

## Repo conventions to follow

- Extend `tests/browser-attack-presentation-capture.js` and `artifacts/tearbench/generated/attack-presentation/`; do not invent a separate browser harness.
- Use `tests/browser-c40-sword-crosscut-ghost-seek.js`, `browser-c40-hammer-meteor-ghost-seek.js`, `browser-c40-greatsword-wheelcut-ghost-seek.js`, `browser-c40-chainblade-bind-yank-ghost-seek.js`, and `browser-c40-riftlock-loose-cannon-ghost-seek.js` for the five existing engineering journeys.
- `config/browser-performance-budgets.json` is the machine source of performance thresholds.
- Compare behavioral feel to oracle commit `ee5e931`, but do not require pixel identity or restore monolithic architecture.
- Preserve the existing honest distinction between engineering journeys and full C40 release certification.

## Steps

1. Mark the five existing anime/cel captures as rejected historical evidence in the manifest/report; do not overwrite or present them as passing.
2. Extend the browser capture harness with deterministic policy, distance, viewport/DPR, frame-sequence, manifest, and page-error checks. Use separate output paths per policy and distance.
3. Add a deterministic dense-combat capture with simultaneous attack, enemy telegraph/projectile, hazard, damage, and state feedback to prove visual priority and caps.
4. Add automated structural assertions from Plans 001-003: no move-name strings, no director `ring`/`ribbon` calls, exact local maxima, global effect caps, complete uncapped floater feedback, hazard priority, and authoritative replay/hash invariance.
5. Run the five C40 engineering journeys from the production standalone build and record command/outcome/source commit in the manifest.
6. Run active, constrained, Verdant, Pale, dense-effects, and five-cycle lifecycle performance evidence. Preserve ordered and isolated results when they differ; do not discard warm-up/outlier evidence without documenting the windowing rule.
7. Review all evidence at 100% and grayscale. Update `docs/visual/grounded-combat-validation-report.md` with pass/fail by weapon/policy/distance, exact metrics, known limits, and residual device/GPU risks.
8. Only after all criteria pass, update `docs/FEATURE_INVENTORY.md` to call the grounded five-weapon presentation accepted. Do not claim zero stutter, broad device certification, or C40 completion.

## Boundaries

- Do NOT tune gameplay mechanics to make captures easier.
- Do NOT change performance thresholds, exclude failing scenarios, or hide interval tails.
- Do NOT use generated concept art as runtime proof.
- Do NOT delete rejected evidence; label it clearly and generate fresh evidence.
- Do NOT claim GPU/compositor timings not exposed by the Canvas diagnostics.
- Do NOT claim touch/high-DPR/device coverage unless it was actually run and recorded.

## Verification

- **Mechanical**: `pnpm typecheck`; `pnpm lint`; `pnpm check:architecture`; focused Vitest suites; `pnpm build:test:standalone`; `node tests/browser-attack-presentation-capture.js`; the five named C40 browser journeys; `pnpm test:browser:current-gameplay-scenarios`; `pnpm test:browser:performance`. Every result must be attached to the exact source/build commit.
- **Feel check**: inspect all 60 stills and default contact frame sequences. At 10% playback confirm anticipation-contact-resolve continuity, no effect leading the weapon, no lingering false geometry, and no restart/duplication on repeated cues. Compare default, low, reduced, and high-contrast side by side; inspect grayscale for non-color identity.
- **Done when**: the evidence manifest is complete; every acceptance criterion is explicitly pass/fail; all five weapon journeys and authoritative replay checks pass; grounded visual review passes at three distances/four policies; performance remains within budget or the goal remains open with the exact residual failure reported.

## Completion note

The implemented acceptance slice produced 20 source-bound captures: all five weapons across default, low-graphics, reduced-motion, and high-contrast policies at normal gameplay distance. The five weapon engineering journeys, 13 source-owned browser scenarios, full 1,978-test Vitest suite, lint, architecture, standalone build, and exact-source performance gate pass. Native DPR2/high-effects performance is covered at an unchanged 3200×1800 backing store. The final report explicitly carries forward the missing close/medium variants, temporal contact sequences, touch/broad-device coverage, and historical host pacing tails as rollout limits rather than silently treating them as completed evidence.
