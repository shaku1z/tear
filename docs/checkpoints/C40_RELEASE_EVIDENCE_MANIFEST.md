# C40 release-evidence manifest verifier

`pnpm tearbench certify` no longer accepts an asserted commit or `--full-check
passed` flag. It accepts only `--manifest <path>` and independently verifies:

- exact `HEAD`, clean-worktree fingerprint, and per-command clean-HEAD binding;
- a retained receipt for every proof: exact command, captured stdout/stderr,
  exit status, timestamp, clean-HEAD binding, and subject artifact path,
  SHA-256, and byte size;
- named arbitrary-state, normal-journey, and full release matrix coverage;
- retained preservation runtime-manifest and preservation-corpus hashes.

The command always writes a certificate when it can determine repository state.
Any absent, stale, forged, mutated, or incomplete proof writes a `rejected`
certificate and exits non-zero. It is a verifier foundation, not C40
certification: this repository does not currently possess the complete release
evidence corpus or a clean final `pnpm check` run.

Certificates are generated evidence, not checked-in approval records. Unless
`--artifact` is supplied, the CLI writes to
`artifacts/tearbench/generated/release-certificate.json`; `artifacts/` is
ignored by Git. A certificate is meaningful only when its schema is `2`, its
`evidenceManifest` is present, and the verifier accepted that manifest against
the exact clean `HEAD` named in the certificate. Schema-1 certificate-shaped
files are historical data and must not be consumed as release evidence.

## Receipt producer (engineering foundation)

`pnpm tearbench evidence record --id <id> --subject <generated-artifact> --
<explicit command>` runs an explicitly named command only when the tracked
worktree is clean at `HEAD`. It checks that condition again afterwards, then
writes an ignored receipt under `artifacts/tearbench/receipts/`. A failed
command still receives a failed receipt, but cannot satisfy the verifier.

`pnpm tearbench evidence partial-manifest --receipts <receipt,...>` composes
those receipts into an intentionally incomplete manifest. It is useful for
retaining real C39 preservation-corpus Vitest JSON and the C40 Source-void
browser engineering proof, but it contains no fabricated coverage and must be
rejected by `tearbench certify` until every required evidence and matrix proof
exists. Source-void evidence remains engineering/non-certifying.

## Scheduled evidence program

`.github/workflows/tearbench-program.yml` retains three non-release profiles:
nightly diff-aware TearBench selection plus source checks, weekly endurance
evidence, and an explicit evidence-review profile. Evidence review records the
preservation corpus and Source-void engineering receipts at a clean `HEAD`,
composes a partial manifest, and verifies that the verifier emits a schema-2
`rejected` certificate. That expected rejection keeps the workflow green while
proving no partial evidence was promoted to a release decision. The uploaded
artifact is provenance for review, not a release certificate or deployment.
