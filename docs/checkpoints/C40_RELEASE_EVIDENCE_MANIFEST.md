# C40 release-evidence manifest verifier

`pnpm tearbench certify` no longer accepts an asserted commit or `--full-check
passed` flag. It accepts only `--manifest <path>` and independently verifies:

- exact `HEAD`, clean-worktree fingerprint, and per-command clean-HEAD binding;
- a retained receipt for every proof: exact command, captured stdout/stderr,
  exit status, timestamp, clean-HEAD binding, and subject artifact path,
  SHA-256, and byte size;
- named arbitrary-state, normal-journey, and full release matrix coverage;
- retained preservation runtime-manifest and preservation-corpus hashes; and
- one exact correction closure for TC-1 through TC-9, including the current
  plan/report hashes, focused exact-source receipts, post-review dispositions,
  current clean source identity, and the one final `pnpm check` receipt.

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
the exact clean `HEAD` named in the certificate. The certificate's
`evidenceManifestSha256` must equal the SHA-256 of the exact manifest bytes;
changing even trailing whitespace invalidates the binding. Schema-1
certificate-shaped files are historical data and must not be consumed as
release evidence.

## Receipt producer (engineering foundation)

`pnpm tearbench evidence record --id <id> [--correction TC-N]
[--subject <generated-artifact>] [--artifact <receipt.json>] -- <explicit
command>` runs an explicitly
named command and verifies that it does
not change the source identity. When `--subject` is omitted, TearBench writes
the captured command output as an ignored subject; this is the required form
for the exact final `pnpm check`. An explicit subject must remain under ignored
`artifacts/tearbench/` and exist after the command. The ignored receipt is
written under `artifacts/tearbench/receipts/`; `--artifact` may choose a unique
receipt filename only within that ignored store. A failed command still
receives a failed receipt, but cannot satisfy the verifier.

Each TC-1 through TC-9 focused receipt must use its exact `--correction` owner.
Focused receipt IDs are unique across checkpoints, so one passing command cannot
be relabeled as evidence for several corrections. Every retained input is
resolved through its canonical filesystem path; symlink or junction escapes
outside the workspace are rejected, and source identity is checked again after
all retained bytes have been read.

`pnpm tearbench evidence partial-manifest --receipts <receipt,...>` composes
those receipts into an intentionally incomplete manifest. It is useful for
retaining real C39 preservation-corpus Vitest JSON and the C40 Source-void
browser engineering proof, but it contains no fabricated coverage and must be
rejected by `tearbench certify` until every required evidence and matrix proof
exists. Source-void evidence remains engineering/non-certifying.

## TC-10 correction closure

The final composer is:

```text
pnpm tearbench evidence correction-manifest \
  --base-manifest artifacts/tearbench/generated/complete-release-evidence-base.json \
  --receipts artifacts/tearbench/receipts/<receipt.json,...> \
  --metadata artifacts/tearbench/generated/correction-closure-metadata.json
```

All three inputs and the generated output must remain under ignored
`artifacts/tearbench/` paths. The base manifest contributes only its coverage
and preservation sections. The composer reconstructs evidence from
the retained receipt bytes, independently captures the current clean source,
hashes the current correction plan and TC-1 through TC-9 reports, and writes
`artifacts/tearbench/generated/correction-release-evidence.json`. A tracked
closure manifest would change the source it claims to certify and is therefore
forbidden.

The metadata artifact has format `tearbench-correction-closure-metadata`,
schema 1. It contains exactly ordered TC-1 through TC-9 entries with `status:
"complete"`, an exact report path, one or more focused receipt IDs, and
`postReviewDisposition: "green"`. It also carries `c40Status` and `blockers`.
An incomplete C40 disposition requires uniquely identified blockers with an
owner, status, and reason. A certified disposition requires an empty blocker
array. The composer always requires the final `pnpm check` and every TC-1
through TC-9 focused receipt. A `certified` disposition additionally requires
all C40 evidence families. An `incomplete` disposition may retain only the
evidence that exists; verification then reports absent C40 proofs and the
rejected certificate preserves the named blockers.

The execution order is immutable:

```text
commit every tracked correction-plan/verifier/report change
→ capture the exact clean source
→ run and retain focused TC-1 through TC-9 receipts
→ run exactly one retained `pnpm check` receipt
→ compose the ignored correction/release manifest
→ run `pnpm tearbench certify --manifest ...`
→ perform the independent final review
```

No tracked edit may follow the final full-check receipt. A valid correction
closure with named broader C40 blockers is structurally verified but still
produces a `rejected` non-zero certificate. Only `c40Status: "certified"`, an
empty blocker list, complete release evidence, and all other verifier rules can
produce `status: "certified"`.

## Scheduled evidence program

`.github/workflows/tearbench-program.yml` retains three non-release profiles:
nightly diff-aware TearBench selection plus source checks, weekly endurance
evidence, and an explicit evidence-review profile. Evidence review records the
preservation corpus and Source-void engineering receipts at a clean `HEAD`,
composes a partial manifest, and verifies that the verifier emits a schema-2
`rejected` certificate. That expected rejection keeps the workflow green while
proving no partial evidence was promoted to a release decision. The uploaded
artifact is provenance for review, not a release certificate or deployment.

## Additional C40 engineering proof: Chainblade transport seek

`tests/browser-c40-chainblade-bind-yank-ghost-seek.js` creates one Class-A
State Forge normal Chainblade/charger state, drives only semantic aim, throw,
and recall commands, and observes the native Bind, Yank, and catch lifecycle.
It seals and verifies a forensic V3 capsule, then opens three fresh C29
production seek worlds at each retained prethrow, Bind, Yank, and postcatch
receipt. This is narrow engineering evidence: it does not establish all weapons,
all input devices, a normal-player journey, a graveyard case, or certification.

## Additional C40 engineering proof: Hammer terrain Meteor seek

`tests/browser-c40-hammer-meteor-ghost-seek.js` forges one Class-A State Forge
normal Hammer state and drives only semantic down-aim, throw, and recall
commands. It observes the live ballistic blade embedding through authored
terrain before ordinary throw expiry, the shared native Meteor resolve, and the
return catch. It seals and verifies a forensic V3 capsule, then opens three
fresh C29 production seek worlds at each retained prethrow, embedded-resolve,
and postcatch receipt. This is narrow engineering evidence: it does not
establish every Hammer interaction, every weapon, all input devices, a
normal-player journey, a graveyard case, or certification.

## Additional C40 engineering proof: Riftlock Loose Cannon seek

`tests/browser-c40-riftlock-loose-cannon-ghost-seek.js` creates one Class-A State
Forge normal Riftlock state, captures a live target through semantic aim and
throw, then uses the real Backblast recall and catch. It seals and verifies a
forensic V3 capsule, then opens fresh C29 production seek worlds at each
retained prethrow, Capture, Backblast, and postcatch receipt. This is narrow
engineering evidence: it does not establish every Riftlock interaction, all
weapons, all input devices, a normal-player journey, a graveyard case, or
certification.

## Additional C40 engineering proof: Greatsword Wheel Cut seek

`tests/browser-c40-greatsword-wheelcut-ghost-seek.js` creates one Class-A State
Forge normal Greatsword state, drives the real center-pivoting Wheel Cut through
semantic aim and throw, then uses semantic recall and catch. It seals and
verifies a forensic V3 capsule, then opens fresh C29 production seek worlds at
each retained prethrow, Wheel Cut, return, and postcatch receipt. This is narrow
engineering evidence: it does not establish every Greatsword interaction, all
weapons, all input devices, a normal-player journey, a graveyard case, or
certification.

## Additional C40 engineering proof: Sword Seam/Crosscut seek

`tests/browser-c40-sword-crosscut-ghost-seek.js` creates one Class-A State
Forge normal Sword/charger state with bounded authored-arena placement for the
real charger. After the normal tether settles, it drives only semantic aim,
throw, and recall commands. The outgoing throw applies the native Seam; the
retraced return records native Crosscut, consumes that Seam, and defeats this
normal low-HP charger before the ordinary catch. It seals and verifies a
forensic V3 capsule, then opens three fresh C29 production seek worlds at the
retained prethrow, Seam, retraced-Crosscut, and postcatch receipts. This is
narrow engineering evidence: it does not establish all Sword interactions, all
input devices, a normal-player journey, a graveyard case, or certification.
