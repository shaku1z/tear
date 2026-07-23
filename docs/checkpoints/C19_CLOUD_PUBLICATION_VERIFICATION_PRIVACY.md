# C19 — Cloud Publication, Verification, Privacy, and Moderation

## Outcome

Complete. Ghost publication remains local-first while a governed cloud boundary handles resumable transfer, honest verification, privacy, and moderation.

## Delivered

- Searchable D1 metadata separated from R2 capsule objects.
- Streaming R2 multipart creation, resume, part replacement, completion, byte-range download, deletion, visibility, and owner metadata sync.
- Structural, integrity, compatibility, simulation, result, anomaly, and moderation verdict stages.
- Historical-runtime lookup and signed, versioned verdict contracts.
- Explicit eligibility for resumed, modded, coached, Ghost-assisted, bot, debug, and State Forge runs.
- Metadata sanitization, pseudonymous identity, separate training consent, rate policy, reporting, blocking, audit, and appeals.
- Optional immutable relay frames delayed by authoritative ticks and unable to expose future events.
- Generated Worker binding types, D1 migration, current compatibility date, observability, and an isolated deployment dry-run.

## Evidence

- An incomplete multipart upload produced no public metadata.
- A complete matching capsule received a signed verified verdict and became discoverable.
- Changed bytes caused an integrity rejection.
- A missing historical runtime produced `unsupported`, never `verified`.
- Assisted and State Forge provenance made a run ineligible for human records.
- Partial download returned the exact requested bytes.
- Cloud deletion stopped metadata and object serving while explicitly leaving the local Vault unaffected.
- Relay frames were unavailable before their delay and could not be replaced at the same tick.

## Operational Boundary

The repository includes the deployable publication transport and its generated binding contract. Actual Cloudflare resource IDs, authentication at the trusted edge, signing keys, and the independently deployed historical-runtime verifier are environment-owned release inputs; no secrets or invented production resources are committed.

## Gate Results

- Focused Vitest: 5 tests passed.
- TypeScript (application and Worker): passed.
- Focused ESLint: passed.
- Source architecture: passed.
- Wrangler binding generation and deployment dry-run: passed.

## Decision

Promote C19. Begin C20 preservation, CI, and release certification.
