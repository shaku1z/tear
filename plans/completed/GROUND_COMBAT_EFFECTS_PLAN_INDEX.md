# Tear grounded combat-effects execution plans

These plans supersede the rejected anime/cel-shaded presentation direction while preserving the typed semantic cue boundary, cosmetic replay projection, scoped deduplication, particle-pool ceilings, and already-verified runtime performance work.

| Plan | Title | Severity | Status |
| --- | --- | --- | --- |
| 001 | Reclassify Tear's combat presentation as grounded stylized action | HIGH | COMPLETE |
| 002 | Replace decorative ribbons and rings with physical effect primitives | HIGH | COMPLETE |
| 003 | Unify attack-effect budgets and accessibility behavior | HIGH | COMPLETE |
| 004 | Prove grounded quality, parity, and frame pacing | HIGH | COMPLETE (desktop slice) |

## Recommended execution order

1. Execute 001 first. It locks the corrected art direction and removes decorative move-name text before more recipes are authored.
2. Execute 002 after 001. It changes the particle/director vocabulary and the five weapon recipes.
3. Execute 003 after 002. It removes duplicate legacy emissions, bounds feedback channels, and makes quality/accessibility policy consistent across the new primitives.
4. Execute 004 last. It expands capture and performance evidence and is the acceptance gate for the preceding plans.

## Dependencies and invariants

- All plans were authored against commit `9e7d6a7` plus the current uncommitted performance/combat-effects worktree.
- Preserve `AttackPresentationCue`, scoped one-shot deduplication, `attack:v1` cosmetic replay encoding, and the rule that presentation never changes authoritative state, RNG, actions, causal gameplay events, or hashes.
- Do not raise the global 320 high / 110 low particle ceilings or the existing weapon-family local ceilings.
- Do not claim zero stutter while the documented rare frame-interval tails remain reproducible.
- Each executor must stop on material source drift instead of guessing.
