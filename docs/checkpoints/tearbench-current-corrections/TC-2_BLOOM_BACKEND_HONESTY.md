# TC-2 — Bloom backend honesty

## Current disposition

TC-2 is green at local implementation commit
`29a2460be71003416a8a73ad4e36b4ad2e617309` on
`codex/tc2-bloom-backend-honesty`, from baseline
`cc81c426d0cbe4ad4fd22ebc66304e06e172735a`.
`verdant-bloom-well-cycle` is live-only:
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
- `tests/tearbench-evidence-selection.test.mjs` passed all 28 selector tests on
  the clean implementation commit, including backend-split, detached-backend,
  route-disposition, and truncated-horizon negatives.
- TypeScript project typecheck passed.
- A clean-commit `test-standalone` build recorded source revision
  `29a2460be71003416a8a73ad4e36b4ad2e617309` and fingerprint
  `9d9bffd9b423d3a5d3cb4e11b34f328a9aa1d7daf45d0c333d9ce37d1585d2c4`.
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
