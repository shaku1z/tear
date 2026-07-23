# TearBench Evidence Contract

## Evidence ladder

| Evidence | Establishes | Does not establish |
|---|---|---|
| Unit/contract | Local rule or schema behavior | Real gameplay integration |
| Deterministic scenario | Behavior under a named state, seed, actions, and invariants | Full menu-to-menu journey |
| Graveyard case | A former failure remains fixed | Unrelated regression safety |
| Base comparison | Candidate differs or matches at the first material tick | Visual or physical parity unless observed |
| Journey checkpoint | Transitions and runtime wiring reach a visible checkpoint | Pixel-only autonomy unless Class C |
| Interaction matrix | The tested browser/input/platform/viewport/network boundary | Untested matrix cells |
| `pnpm check` | Repository release gate from the current worktree | Live-service health or undeployed cloud resources |

## Selection fields

- `scenarios`: canonical entries from `src/tearbench/canonical-scenarios.json`.
- `graveyardCases`: historical regression families that the change can reopen.
- `journeyCheckpoints`: browser-visible integration stops that must be observed.
- `baseComparisons`: oracle or current-base behavior comparisons.
- `interactionMatrices`: affected rows from the browser, input, platform, viewport, frame-rate, network, interruption, performance, and long-run matrices.

If no prefix matches, `shared-runtime` is selected deliberately. Do not return an empty evidence plan.

## Failure interpretation

1. Reproduce from the emitted artifact.
2. Separate the first material divergence from downstream effects.
3. Confirm stability across repeated runs.
4. Minimize actions, timeline, and state while preserving the failure.
5. Compare candidate and base using the same scenario, seed, observation class, and build inputs.
6. Attribute only when evidence distinguishes:
   - product behavior;
   - agent/policy behavior;
   - test or infrastructure;
   - inconclusive evidence.

## Release reporting

Certification requires all named evidence groups, full journeys, directly affected arbitrary states, and a golden cross-version replay corpus. Unsupported historical builds remain unsupported; visual-only legacy playback must not be described as exact verification.
