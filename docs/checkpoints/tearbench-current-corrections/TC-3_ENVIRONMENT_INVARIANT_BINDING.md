# TC-3 — Environment invariant binding

## Current disposition

TC-3 is green at local implementation commits
`1bb873e1cecdf1682d71a3134b7f8d5adc4683af` and
`7a0c3e700c74cd2652822c62c9778c6daf043bd3` on
`codex/tc3-environment-invariants`, from baseline
`7619e9ab14ff7a9dea46eea5381973a42a821e8e`.
Environment scenarios now receive their required invariant set from their typed
subject kind, and live/browser execution consumes that same materialization.

## Authority contract

- `ENVIRONMENT_REQUIRED_INVARIANT_IDS` is the one source-owned environment
  invariant set. Both environment-field and environment-combat-object subjects
  receive finite-state, unique-ID, valid-reference, no-orphan-link,
  legal-transition, and bounded-population checks automatically.
- The runner applies the effective set even when a caller supplies only the
  scenario's base assertions. Non-environment subjects retain their declared
  assertions unchanged.
- Browser materializers load the typed canonical scenario and do not inject
  globally inapplicable privileged assertions.
- Privileged world, wave, boss, UI, and softlock checks fail closed when their
  source-owned diagnostic inputs are absent or invalid.
- `replay.branch-equivalence` and `test.production-isolation` are registered but
  explicitly unsupported until real comparison/input contracts exist; canonical
  scenario validation refuses either claim.
- Runtime finite-state scans player, blade, entity, run, diagnostic, and
  navigation numerics. Environment numerics remain owned by the structured
  environment checks.
- Native causal mappings fail closed on unknown run, stage, wave, weapon,
  projectile, world, environment, or effect values. Legacy stage facts with an
  omitted transition remain compatible as `entered`.
- Causal-event provenance is mandatory at construction. Production native
  callers pass `engine`; bridge callers must explicitly pass `derived`.

## Evidence

- Eight focused Vitest files passed all 65 invariant, event, runner,
  live/headless, Ghost, Academy, and current-game authority tests.
- The minimal environment negative matrix rejects duplicate IDs, missing
  owner/target references, illegal transitions, population overflow, removed
  automatic binding, self-ownership, missing privileged fields, navigation
  non-finite values, unsupported invariant claims, and unknown native mappings.
- TypeScript project typecheck passed. Both affected browser scripts passed
  JavaScript syntax checks, and `git diff --check` passed.
- A clean-commit `test-standalone` build recorded source revision
  `7a0c3e700c74cd2652822c62c9778c6daf043bd3` and fingerprint
  `0c124bdceb1710d2f41173836fed7772354b463a8eab6236e74dd8ae57225294`.
- The Class-A current-game browser journey passed all 13 source-owned scenarios.
- The selected live `verdant-bloom-well-cycle` materialization passed seed 1001
  through its complete 744-tick horizon. Its ephemeral engineering artifact had
  SHA-256 `3dba8d117b41183ff615ca1a5b0d50f00e9e5c77a0e9a8b904a7ffab6c51bfff`.

## Review history and limits

The first independent TC-3B review found three blockers: globally injected
privileged browser assertions, omitted navigation numerics, and optional event
provenance. All three were corrected. The bounded re-review passed with no new
actionable defect, and the focused/type/browser evidence was rerun after the
corrections.

No exhaustive corruption matrix, second invariant framework, second runtime,
merge, push, protected workflow, deployment, publication, wiki action, or C40
claim was made.
