# Tear combat presentation first-slice validation report

Status: this report records the rejected cel/anime direction and its historical evidence. The accepted replacement is Tear's [grounded combat presentation](grounded-combat-style-bible.md), validated in [the grounded combat report](grounded-combat-validation-report.md). Earlier pacing outliers remain documented here rather than being erased by later green runs.

## Baseline

- Reference commit: `9e7d6a701ca0b992c8d78cccc2af329d698778c0`.
- One full baseline run reproduced 14 frame-work tasks above 50 ms in the 4× constrained scenario and failed the existing zero-long-task budget.
- A focused constrained rerun passed with simulation p95 4.8 ms, render p95 5.8 ms, frame-work p95 9.4 ms, and max 34.5 ms, confirming an intermittent tail rather than sustained low FPS.
- Verdant baseline: simulation/render/frame-work p95 3.9/3.9/7.7 ms; max frame work 30.7 ms.
- Pale baseline: simulation/render/frame-work p95 3.0/2.5/5.0 ms; max frame work 31.2 ms.

## Required acceptance evidence

- Targeted unit/type/architecture gates.
- Current five-weapon deterministic parity and gameplay scenarios.
- Built-browser five-weapon signature capture, including reduced-motion/low-graphics behavior.
- Post-change active, constrained, Verdant, and Pale performance artifacts including frame-interval p99/max.
- No page errors, duplicate cues, budget overruns, or authoritative-state differences.

## Post-change performance evidence

The production standalone build passes all sustained simulation, render, and frame-work percentile budgets. Active and 4× constrained gameplay also pass their long-task and end-to-end pacing budgets. The full aggregate gate is not claimed green: repeat runs on the loaded desktop produced isolated stage pacing outliers after the sustained workloads.

| Scenario | Simulation p95 | Render p95 | Frame work p95 / p99 / max | Frame interval p99 / max |
|---|---:|---:|---:|---:|
| Active gameplay | 1.1 ms | 1.3 ms | 2.3 / 3.7 / 4.8 ms | 16.7 / 16.9 ms |
| 4× constrained | 6.5 ms | 6.4 ms | 11.5 / 14.8 / 29.9 ms | 24.9 / 66.6 ms |
| Verdant (isolated) | 4.5 ms | 3.4 ms | 7.3 / 17.4 / 42.3 ms | 25.0 / 41.7 ms |
| Pale (isolated) | 3.8 ms | 3.9 ms | 7.3 / 26.3 / 40.5 ms | 33.3 / 58.2 ms |

This materially improves the reproduced constrained tail: the baseline full gate produced 14 tasks above 50 ms, while the final ordered constrained workload produced none and stayed below every configured budget. The music observation path also stopped cloning every enemy, projectile, and stage record on every display frame.

Residual risk remains explicit. One isolated Verdant run counted one early frame above 50 ms even though its retained 600-frame window ended with a 42.3 ms maximum, and one isolated Pale run saw a 58.2 ms requestAnimationFrame gap against the 50 ms ceiling while frame work itself stayed at or below 40.5 ms. An ordered run also saw a single 141.7 ms Verdant pacing gap. These are intermittent tails rather than sustained low FPS, but they prevent a zero-stutter or fully green aggregate-gate claim. The five-cycle lifecycle gate passes with 1,323,060 bytes of retained heap growth against the 16 MiB ceiling and zero reset effects, enemies, or projectiles.

### Grounded recipe rerun

After replacing the rejected attack grammar and removing duplicate signature bursts, the final exact-source browser-performance run passed every configured workload. Active frame-work p95/p99/max was `1.7/2.4/3.0 ms`; constrained was `15.7/26.8/33.2 ms`; Verdant was `4.8/6.8/25.3 ms`; and Pale was `4.5/6.1/25.6 ms`. Frame-interval p99/max was `10.4/10.7 ms`, `29.1/39.1 ms`, `10.7/29.5 ms`, and `19.9/29.9 ms` respectively, with zero new long tasks. Peak effect gauges were 66 active, 58 constrained, 35 Verdant, and 47 Pale. Five-cycle retained heap growth was 1,279,996 bytes against the 16 MiB ceiling, with zero effects at every reset. This clean run materially improves confidence but does not erase the earlier intermittent host pacing tails or establish universal device-level zero stutter.

## Rejected visual evidence and retained replay evidence

- Historical built-browser captures exist for Sword Threadcut, Hammer Meteor, Greatsword Wheel Cut, Chainblade Sling, and Riftlock Capture-to-Backblast under `artifacts/tearbench/generated/attack-presentation/`. They demonstrate why the visual recipe was rejected and must not be cited as passing grounded-quality evidence.
- Decorative move-name callouts have been removed from the director. Factual gameplay-owned feedback remains separate.
- All five built-browser C40 engineering journeys pass with live mechanics, Ghost V3 capture, and fresh production seeks.
- The compact `attack:v1` replay projection is presentation-only and does not enter canonical state, RNG, the action track, causal gameplay events, or authoritative hashes.

## Known limits

- Signature mechanics and grounded recipes for all five weapons are migrated; the completed desktop policy-matrix validation and its narrower-than-planned coverage are recorded in the grounded report.
- The `attack:v1` visual replay projection preserves signature reads but legacy packets cannot reconstruct cues they never recorded.
- GPU/compositor time is not directly exposed by the Canvas diagnostics; frame interval is the end-to-end pacing proxy.
- Device-specific touch/high-DPR evidence remains a rollout gate, not a claim from desktop headless Chromium.
