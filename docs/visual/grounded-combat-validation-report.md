# Tear grounded combat presentation validation report

## Outcome

The five-weapon combat presentation is accepted for the current desktop production slice. Tear's visual anchor is **blade, ink, and hard-silhouette grammar**: measured weapon geometry, decisive dark structure, restrained contrast, and physically caused flashes at contact. The rejected anime/cel recipe, decorative move labels, universal rings, and forced curved ribbons are not part of the accepted direction.

Routine damage numbers are restored to the restrained treatment: 16 px mono, normal weight, no oversized spawn pop. Named factual state changes such as `BREAK`, `PARRIED`, and `RUPTURE` retain separate hierarchy.

This acceptance is not a claim of universal zero stutter on every driver/host, pixel identity with the oracle, or full C40 release certification.

## Source-bound evidence

- Branch: `codex/performance-combat-effects`
- Reference commit: `9e7d6a701ca0b992c8d78cccc2af329d698778c0`
- Source state: dirty isolated worktree; no commit, push, merge, or deployment
- Exact source fingerprint, artifact hash, browser version, and capture time are read from each generated performance report rather than duplicated here as mutable prose.
- Capture manifest: `artifacts/tearbench/generated/attack-presentation/evidence.json`
- Performance artifact: `artifacts/tearbench/generated/browser-performance.json`

## Visual and behavioral review

Twenty fresh deterministic 1600×900, DPR 1 captures cover Sword Threadcut, Hammer Meteor, Greatsword Wheel Cut, Chainblade Sling, and Riftlock Backblast under default, low-graphics, reduced-motion, and high-contrast policies.

| Criterion | Result | Evidence |
| --- | --- | --- |
| No decorative move-name text | PASS | All five recipes and four policies |
| Weapon identity is geometric, not color-only | PASS | Narrow Sword edge, Hammer compression, broad Greatsword sweep, taut Chainblade path, ballistic Riftlock wedge |
| Contact follows real source, endpoint, direction, and normal | PASS | Live normal/material routing plus focused director and presentation tests |
| No director-owned universal ring or forced curved ribbon | PASS | Typed director ports and structural/unit coverage |
| Low graphics retains the primary physical read | PASS | Five low-graphics captures |
| Reduced motion retains a static contact silhouette | PASS | Five reduced-motion captures and floater-motion test |
| High contrast uses configured theme ink | PASS | Five high-contrast captures |
| Routine damage typography is restrained | PASS | 16 px normal-weight numeric treatment; Chainblade impact is numeric-only |
| Gameplay/replay authority is unchanged | PASS | Cosmetic `attack:v1` projection remains outside canonical state, RNG, actions, causal events, and hashes |

The prior cel/anime captures remain historical rejection evidence. Generated concept art is not accepted as runtime proof.

## Mechanical and regression evidence

- `pnpm lint`: PASS
- `pnpm check:architecture`: PASS
- `pnpm build:test:standalone`: PASS
- `node tests/browser-attack-presentation-capture.js`: PASS, 20 captures
- Five production C40 engineering journeys: PASS for Sword, Hammer, Greatsword, Chainblade, and Riftlock
- `pnpm test:browser:current-gameplay-scenarios`: PASS, 13 source-owned scenarios
- Full Vitest: PASS, 457 files passed / 4 skipped; 1,980 tests passed / 4 skipped
- Ghost V3 physical capture, active-campaign capture, dynamic configuration, admission, and live-recorder gates: PASS

These C40 journeys are weapon engineering evidence only; they do not constitute full C40 release certification.

## Final exact-source performance evidence

| Scenario | Simulation p95 | Render p95 | Frame work p95 / p99 / max | Frame interval p99 / max | Long tasks | Peak effects |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Active gameplay | 0.7 ms | 0.9 ms | 1.4 / 1.6 / 6.0 ms | 16.8 / 25.0 ms | 0 | 64 |
| 4× constrained | 4.1 ms | 4.3 ms | 7.6 / 11.0 / 21.2 ms | 16.9 / 33.3 ms | 0 | 64 |
| Verdant | 1.2 ms | 1.1 ms | 2.2 / 2.6 / 11.5 ms | 16.8 / 25.0 ms | 0 | 25 |
| Pale | 1.2 ms | 1.1 ms | 2.1 / 2.9 / 13.9 ms | 16.8 / 33.4 ms | 0 | 47 |

This complete matrix ran with high effects at a 1600×900 CSS viewport, device pixel ratio 2, and an unchanged 3200×1800 canvas backing store. The five-cycle lifecycle check retained 1,384,180 bytes against the 16 MiB ceiling and began every new run with zero effects. All configured thresholds passed. The matching DPR1 matrix also passed with frame-work p95 of 1.2, 5.1, 2.2, and 1.8 ms for active, constrained, Verdant, and Pale respectively, zero long tasks throughout, and 779,936 bytes retained across five lifecycle cycles.

An additional 80-second native-DPR2 Verdant soak passed at 3200×1800 with high effects and zero long tasks. Its simulation, render, and frame-work p95 values were 1.9 ms, 1.4 ms, and 3.0 ms. Completed off-pattern Rootbound Bloom Wells are pruned, reducing the observed Verdant field peak from 8 to 5 without cancelling active/cooling fields or restarting the selected pattern.

Allocation sampling identified canonical verification hashing—not rendering quality—as the original dominant transient-allocation source. The hash-only path streams the same canonical UTF-16 sequence directly through exact FNV-1a arithmetic instead of materializing and discarding the entire canonical string. Fixed-hash fixtures, replay/capsule gates, and a dedicated encoding-equivalence corpus pass unchanged. A representative large-state benchmark improved from 461.1 ms to 133.4 ms for 20 hashes, sampled browser allocation fell from approximately 3,688 MiB to 308 MiB, and a matched trace reduced minor-GC cycles from 143 to 64.

The later Verdant hitch audit removed four additional lossless allocation sources: diagnostics percentile snapshots now reuse fixed typed scratch storage; canonical hashing formats validation paths only on error; environment admission/update performs one deep-copy/freeze pass instead of two; immutable environment entries are reused across isolated snapshots; and the stable live collision adapter is cached by runtime identity. In matched eight-second allocation profiles, sampled allocation fell from 339.6 MiB to 192.7 MiB (43% lower). Replay schema, error messages, snapshot isolation, collision behavior, gameplay state, effects, floater admission, and resolution are unchanged.

A subsequent matched native-DPR2/high-effects active-combat profile removed repeated backdrop palette parsing/formatting and identical per-mote CSS colour construction. Total sampled allocation fell from 123.75 MiB to 108.30 MiB (12.5%); mote self-allocation fell from 6.21 MiB to 2.25 MiB, while `_rgb`, `_mix`, and `_rgba` left the leading allocation list. The caches are presentation-local and hard-bounded; continuously animated flare alphas remain uncached. Exact CSS-output and one-colour-bind-per-draw tests pass, as do all 20 grounded capture scenarios. PNG hashes are not used as a pixel-parity claim because two unchanged reruns changed all 20 encoded files; the harness is visually reviewed and structurally asserted rather than misrepresented as byte-deterministic.

The live combat boundary now exposes stable, field-backed opening and collision views instead of rebuilding aggregate `values`/`readState` objects for each proxy property access. Scalar impact writes no longer filter and reinstall all three entity collections; collection validation still runs when that collection is actually replaced. In the matched pre-change profile, the attributable `values`, `readState`, and generic collision-write `filter` stacks totalled 9.76 MiB. All three disappeared from the leading allocation list after the change. Two repeat native-DPR2/high-effects profiles sampled 103.21 and 108.10 MiB total versus the prior 108.30 MiB sample; unrelated gameplay stacks varied between runs, so the targeted stack removal—not the small whole-profile delta—is the reliable claim. Both timing runs passed at 1.5 ms frame-work p95, 4.5-4.8 ms maximum Tear work, and zero long tasks. Focused adapter, world-state, weapon-scenario, type, and build gates pass.

The 4× constrained roster then exposed redundant strict-runtime projection work under support-heavy combat. Support resolution now mutates only private result copies, while the live adapter reuses one per-world snapshot/identity workspace and the existing live buff/link arrays. Empty world-hazard and boss-zone paths and absent projectile categories avoid resolver projections while still validating time input, restoring neutral slow state, and binding deterministic actor identities in the original order. On Playwright's same bundled Chromium path, sampled constrained allocation fell from 165.32 MiB to 114.23 MiB (30.9%). The prior support projection/clone stacks dropped from approximately 42.6 MiB combined to 10.2 MiB, and `updateSupports` self-allocation fell from 4.20 MiB to 1.85 MiB. Three exact-source isolated stable-Chrome constrained runs passed the unchanged 10 ms simulation ceiling at 4.5, 5.8, and 4.6 ms p95 with zero long tasks. Support composition, Mender selection, Anchor shared fate, live-link projection, workspace reuse, hazard neutralization, category skips, identity ordering, production combat parity, and type gates pass unchanged.

## Known limits and residual risk

- The completed capture matrix covers four policies at normal gameplay distance, not the originally proposed close/medium/normal 60-image matrix or temporal contact frame sequences.
- Native high-DPI combat is covered by a full matrix plus three active repeats on the reference Chrome host at DPR 2 without a backing-store cap. Touch and broad physical device/GPU coverage remain rollout validation work; responsive automation covers six viewport/DPR cases.
- Playwright's bundled Chromium can be selected explicitly with `TEAR_PERF_BROWSER=bundled` so CI-family behavior is no longer hidden by an installed stable-Chrome preference. On the current Windows host at DPR 1/high effects, two bundled-Chromium active runs passed with frame-work p95 values of 2.4-2.6 ms, maximum Tear frame work of 4.7-5.2 ms, and zero long tasks. A third run preserved a pacing failure at 50.0 ms p99/50.1 ms max even though Tear frame work remained 2.5 ms p95/4.3 ms max with zero long tasks. The bundled headless path normally presented at roughly 30 Hz on this host, unlike hardware-accelerated stable Chrome; the failing interval was therefore outside Tear's measured callback rather than evidence of a long simulation/render task. A forced DPR 2 bundled run retained the full 3200×1800 backing store but collected only 444 of 500 required samples before the unchanged deadline, so it remains a recorded environment limitation rather than a weakened or passing gate.
- Under intentional 4× CPU throttling, that Windows bundled path falls further to roughly 6-8 Hz and batches many fixed steps into each animation callback; its constrained simulation p95 therefore remains above 10 ms and its frame intervals reach roughly 133-183 ms. This is recorded as a non-passing host/browser condition, not hidden or converted into a weaker budget. Current protected-main evidence is likewise runner-sensitive: parallel canary `33466031200` measured the clean-main constrained simulation p95 at 13.6 ms twice, while the same head's 97-task serial certificate passed the browser performance task. Reconciliation must repeat both isolated and protected parallel evidence before merge readiness is claimed.
- The original 57–59 ms Verdant pauses were traced to the performance fixture transferring full environment snapshots through browser automation every sample, not production gameplay. Lightweight direct count sampling removes that observer effect.
- Measured-window Chrome traces attribute remaining rare outside-frame intervals to GPU command/raster flushes while Tear frame work remains short. Low-effects A/B testing did not reduce them, so authored effects were retained. A single machine cannot prove absence of OS, driver, compositor, or host-contention stalls.
- Exact-main canary `33463144114` observed one browser `LongTask` during active gameplay on clean `9df6c5c`, but that main revision does not contain this optimization branch and its pre-optimization harness aborted before emitting frame-work values. The optimized harness now prints measurements before assertions and can select the bundled browser explicitly; integration evidence must repeat that canary after the branch is reconciled rather than claiming the isolated main failure is already fixed.
- Canvas diagnostics now separate end-to-end frame interval from preceding Tear frame work; direct GPU attribution still requires an opt-in Chrome trace.
- Legacy replay packets cannot reconstruct presentation facts they never recorded.
