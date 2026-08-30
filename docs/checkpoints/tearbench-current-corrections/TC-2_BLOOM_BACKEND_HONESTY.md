# TC-2 — Bloom backend honesty

## Current disposition

TC-2 is green and in review on `codex/tc2-bloom-backend-honesty` from baseline
`cc81c426d0cbe4ad4fd22ebc66304e06e172735a`. The exact implementation commit
will be recorded only after it exists. `verdant-bloom-well-cycle` is live-only:
the production headless environment cannot restore or observe Bloom's authored
State Forge field, so generic reset/move/tick behavior is explicitly rejected
as Bloom evidence.

## Authority contract

- `BLOOM_WELL_TIMING.totalTicks` is 744 and is the typed lifecycle authority.
- The canonical catalog declares only `live` and uses a 744-tick horizon.
- Typed materialization rejects a headless Bloom claim or horizon drift.
- CLI metadata validation rejects empty, duplicate, unsupported, or ambiguous
  backend declarations and reports the actual declared backend instead of
  `catalog-command`.
- The live materializer accepts the complete 744-tick lifecycle and refuses a
  truncated Bloom run. The Bloom route is explicitly labeled `live-only`.

## Evidence

- Four focused Vitest files passed all 36 Bloom runtime, environment-field,
  current-headless, and current-game-authority tests.
- `tests/tearbench-evidence-selection.test.mjs` passed all 27 selector tests,
  including detached-backend and truncated-horizon negatives; it is rerun after
  the final selector review before the checkpoint commit.
- TypeScript project typecheck passed.
- A fresh `test-standalone` build recorded source fingerprint
  `e904105e721fd1df99436ccf907742a11134d56dbbbf114319ba42458ac571dc`.
- The Class-A current-game browser journey passed all 13 source-owned scenarios.
  Bloom traversed `warning → active → cooldown → dormant` through tick 744 using
  the live production bridge and State Forge restore.

## Retry history and limits

The first browser attempt exposed an out-of-closure test variable and failed
before producing evidence. After correction, the existing build correctly
refused reuse because its source fingerprint was stale. A fresh build and
journey then passed. Neither failed attempt is represented as green evidence.

No broad headless gameplay suite ran because Bloom no longer claims headless
support. No second simulator, merge, push, deployment, wiki action, publication,
or C40 claim was made.
