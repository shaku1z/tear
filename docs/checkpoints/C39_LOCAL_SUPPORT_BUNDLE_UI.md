# C39 — Local Sanitized Ghost Support Bundle UI

Healthy, complete schema-v2 Ghost Vault rows expose **SUPPORT**. The normal
review projects only capsule/root/build provenance plus the bounded tick and
track scope. **CREATE LOCAL BUNDLE** is a separate explicit player action.

The controller validates the capsule through the existing sanitized-bundle
boundary and holds the resulting immutable bundle only in memory long enough
to project its hash. It performs no Vault write, upload, network request,
submission, replay-byte/action exposure, account lookup, consent/training
mutation, or publication/transport work. Unhealthy, missing, and changed
capsules fail closed.

The screen explicitly declares excluded replay bytes/actions, account
identifiers, credentials, publication/consent/training/moderation/transport
state, and no training/cloud/submission. This is a local support-artifact UI,
not a support case or C39 operational-completion claim.

## Local preservation corpus

`tests/fixtures/c39-preservation-corpus.json` and
`src/ghost/preservation-corpus.ts` add a versioned deterministic local audit
fixture. Each local source has a committed hash-and-byte descriptor. The runner
materializes its deterministic source exports, verifies every descriptor before
any Vault import, records the source hashes, proves a
V1-to-V2 manifest migration is pure, and reopens readable cases through the
production Vault, Reader, replay mapper, and admission boundary. It reports
only `exact`, `migrated`, `visual-only`, `unsupported`, and `rejected`;
admission is detail, never replay truth. Run `pnpm test:preservation-corpus`.
The canonical PR, nightly, and release `pnpm check` gate runs that corpus once
before the remaining unit suite, writes its machine-readable Vitest result to
`artifacts/tearbench/c39/preservation-corpus-vitest.json`, and retains it
through the existing CI evidence upload. The remaining unit suite explicitly
excludes this file so the same corpus is not rerun as incidental broad-suite
coverage.

This is not remote cold storage, a historical-runtime package, or C39
certification.
