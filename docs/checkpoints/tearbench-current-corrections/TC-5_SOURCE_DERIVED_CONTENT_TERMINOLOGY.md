# TC-5 — Source-derived content terminology

## Current disposition

TC-5 is green at local implementation commits
`86041ed71c593bfee2a232a93a7f2d44874c7df7` and
`60d1e58b92ad3258e9327830870b81486ebf1f18` on
`codex/tc5-content-terminology`, from baseline
`9123944d4e0a9db0aaa0a6c89696b1e70fbbe496`.
TearBench now derives current stage, boss, publication, environment-mechanic,
and canonical-scenario terminology from production owners without adding a
second gameplay glossary.

## Authority contract

- Stage IDs, display names, boss homes, and published/preview state project
  from the authored stage and publication owners.
- Boss display names project from the production boss definitions.
- Specialized environment identities are source-owned. Generic field and
  combat-object scenarios remain generic and reject injected Bloom Well or
  Root Link ownership.
- Canonical scenario subjects are checked against the source-owned content
  projection, including `tear` -> `The Tear` -> `source`, Verdant ->
  Rootbound, and Pale -> White Hart.
- White Hart remains canonically implemented while Pale remains an
  unpublished preview surface.

## Mutable and immutable wording

The canonical requirement generator applies current terminology only to
mutable rendered descriptions. It does not translate immutable requirement
identity, source statements, source versions, occurrence identity, or source
and atomic text hashes. The tracked requirement JSON and non-lossy annex were
regenerated as current projections; 8,691 requirement records and 7,968 source
occurrences remained present, with zero immutable-field drift and 2,281
mutable rendered-description changes. The capability dashboard did not
change.

The terminology checker now rejects known stale provisional definition
symbols and stale current-facing checkpoint claims on explicit mutable paths.
It excludes `docs/source/**`, `docs/checkpoints/**`, and `docs/ghost3/**` as
immutable history. Selected top-level Ghost3 authorities remain mutable only
for their current-facing sections and are intentionally scanned.

## Discriminating evidence

- Production validators reject injected drift in stage display, boss home,
  publication state, and boss display projections.
- Canonical materialization rejects mutated scenario subjects, missing
  specialized environment ownership, and specialized identities injected
  into generic scenarios.
- A terminology fixture rejects both a stale provisional definition symbol
  and a stale current-checkpoint claim while accepting the same wording under
  immutable checkpoint history.
- Required current name, ownership, and preview/publication projections are
  asserted directly from production owners.

## Validation

- `pnpm requirements:generate` and `pnpm requirements:check` passed for 8,691
  requirements and 7,968 occurrences.
- `pnpm check:terminology` passed across 200 files with 12 registered terms and
  328 allowlisted compatibility occurrences.
- Terminology tests passed 14/14; focused content and authority tests passed
  23/23; documentation authority tests passed 13/13.
- `pnpm check:docs`, TypeScript project typecheck, syntax checks, and `git diff
  --check` passed.
- An independent first review found four integration blockers. The corrective
  commit addressed all four, and the exact-commit re-review passed.

Browser/build evidence was not required because TC-5 changes source-derived
metadata, validation, tests, and generated descriptions rather than runtime
gameplay execution. No merge, push, protected workflow, deployment,
publication, wiki action, or C40 claim was made.
