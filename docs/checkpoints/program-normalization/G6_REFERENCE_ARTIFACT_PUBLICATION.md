# G6 Reference Artifact Publication — Slice 7

Status: game-side exact manifest transport is implemented on
`codex/g6-reference-artifact-publication`; wiki consumption, snapshot
promotion, dispatch, and deployment remain open and locked.

This checkpoint records only the retrievable artifact boundary for the modern
typed game. It does not promote a manifest to the wiki, change `tear-wiki`, or
authorize a Cloudflare action.

## Publication contract

- The `Validate` workflow is `.github/workflows/ci.yml` (workflow name
  `Validate`). It runs the focused publication contract test, then the full
  `pnpm check:functional` gate.
- Only after that gate succeeds on a `push` to protected
  `refs/heads/main` does the workflow run `pnpm publish:game-reference` and
  upload this artifact. Both steps are explicitly gated to that event/ref and
  have no `always()` condition, so a failed Validate run or pull-request run
  cannot publish this artifact. The existing
  `tear-release-targets-<GITHUB_SHA>` upload remains unchanged and separate.
- The publisher requires `GITHUB_SHA` to be a full 40-character SHA, requires
  the checked-out clean `HEAD` to equal it, and requires
  `GITHUB_REPOSITORY=shaku1z/tear`, `GITHUB_EVENT_NAME=push`,
  `GITHUB_REF=refs/heads/main`, and a numeric `GITHUB_RUN_ID`. It repeats the
  exporter’s clean-source preflight before Vite or typed game modules are
  loaded by the exporter.
- The artifact name is exactly
  `tear-game-reference-v1-<GITHUB_SHA>`. Its fixed upload directory is
  `artifacts/game-reference`; no caller-controlled path is accepted.
- The uploaded directory must contain exactly these two files:

  - `game-reference.v1.json` — the deterministic schema-2 game manifest.
  - `game-reference.v1.receipt.json` — a machine-readable receipt with
    `shaku1z/tear`, exact source SHA, `game-reference.v1`, schema `2`,
    `g4-terminology-v1`, both filenames, the manifest’s SHA-256 over its exact
    UTF-8 bytes, the artifact name, validation run ID/event/ref, generator, and
    `retentionDays: 90`.

- The GitHub artifact retention is 90 days. No wall-clock value is written, so
  repeated publication for the same SHA has stable manifest and receipt
  content.

## Fail-closed boundaries

- A wrong SHA, dirty checkout, wrong repository, stale manifest, unsupported
  schema/terminology, missing manifest/receipt/digest, extra output file, or
  unsafe output directory fails before upload.
- The publisher contains no Wrangler, Cloudflare, wiki dispatch, snapshot
  promotion, or deployment operation. The artifact is evidence transport only.
- No wiki consumer fetch, generated-file commit, release promotion, or
  production deployment is claimed by this slice. G6 remains open until the
  later consumer and exact-SHA promotion gates succeed.

## Evidence

- `scripts/publish-game-reference-artifact.mjs` owns the preflight, exporter
  invocation, manifest envelope check, SHA-256 calculation, receipt, and exact
  two-file output check.
- `tests/game-reference-artifact-publication.test.mjs` covers workflow ordering,
  exact SHA binding, clean-tree rejection, missing/extra artifact members,
  missing digest, fixed output scope, 90-day retention, and no deployment or
  dispatch path.
- `pnpm test:game-reference-artifact` is run as an explicit Validate step.
- `pnpm check:game-reference` remains the source/export contract gate and is
  still part of `pnpm check:functional`.

These checks prove only game-side post-validation artifact transport. They do
not prove protected-main state, wiki synchronization, snapshot promotion, or
Cloudflare deployment.
