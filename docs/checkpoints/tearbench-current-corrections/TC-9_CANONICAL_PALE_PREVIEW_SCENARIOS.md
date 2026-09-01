# TC-9 — Canonical Pale preview scenarios

## Current disposition

TC-9 is green at local implementation commit
`3f5787047892a1df48cfdbbed36919ca6e4c546f` on
`codex/tc9-pale-canonical`, from baseline
`14c404a1f5b2b8f124fb426a0399eff6d85d1c47`. Pale Traverse remains an
unpublished preview. Its essential Aurora, Rimehound, variant, and White Hart
mechanics now have source-owned canonical live TearBench execution instead of
depending on ad hoc Playground preparation.

## Canonical scenario boundary

The locked TC-9 set contains the existing natural
`white-hart-pale-traverse-foundation-live-encounter` scenario plus ten new
canonical surgical scenarios:

- Aurora Track behavior;
- Rimehound/Aurora interaction;
- `rime-runner`, `prism-seer`, `snowfall-kite`, `hailcaster`, and
  `glacier-guard` variant behavior; and
- White Hart phases 1, 2, and 3.

The ten surgical scenarios derive their exact stage, wave, boss, phase, seed,
and State Forge state class from the production Pale State Forge documents.
Catalog materialization rejects coordinate, seed, state-class, backend,
publication, subject, or descriptor disagreement. Each scenario is live-only,
engineering-only, unpublished-preview, and non-publishable. No headless,
replay, seek, campaign-publication, or certification claim was added.

## Evidence ownership and runtime truth

Each new catalog entry owns a per-ID `pnpm tearbench run <scenario-id>` command.
That command launches the source-owned canonical State Forge document through
the generic live materializer and executes both registered invariants and
subject-specific structured assertions. Pale evidence routes require the exact
scenario IDs; complementary presentation journeys cannot substitute for the
canonical runs.

State Forge restore now preserves source-owned Pale variant behavior, supports
the unpublished White Hart preview-stage slot without inserting Pale into
campaign progression, and rebases surgical source discovery to the scenario's
deterministic fixed-tick origin. Stage-owned environment fields validate their
owner against the current observed stage while unknown owners still fail.

Run artifacts preserve `surgical-valid`, the authoritative catalog seed, and
the canonical scenario identity in both the runtime envelope and replay-context
snapshot. A canonical surgical run passes only with zero failures at its exact
declared tick horizon. Failed, early, truncated, malformed, or non-surgical
nonterminal artifacts fail closed at the CLI boundary.

## Validation

- All ten new canonical live runs passed with zero failures, exact declared
  horizons, `status: "passed"`, and per-ID JSON/action/screenshot artifacts.
- Pale focused unit coverage passed 46/46.
- TearBench runner coverage passed 14/14, including valid current-stage and
  invalid unknown-owner reference cases.
- Evidence-selection coverage passed 35/35, including missing/mutated State
  Forge descriptors, ad hoc route substitution, false backend/publication,
  wrong subject, failed/truncated artifact, and fixed-horizon negatives.
- Snapshot provenance coverage passed 5/5; a representative White Hart phase
  run preserved the surgical class and authoritative seed.
- The focused Rimehound, variant, and White Hart browser presentation journeys
  passed as complementary visual evidence.
- Typecheck, documentation, terminology, script syntax, and `git diff --check`
  passed.
- Independent review first rejected canonical-evidence bypass, false
  seed/state-class provenance, and weak negative coverage. Those gaps were
  corrected. A later exact-commit review found the replay snapshot class
  mismatch; commit `3f5787047892a1df48cfdbbed36919ca6e4c546f` corrected it, and the final exact
  re-review passed with no integration blocker.

No merge, push, protected workflow, deployment, Pale publication, wiki
mutation, headless promotion, or C40 claim was made.
