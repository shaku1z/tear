# C38 private finalized-object retrieval

The Ghost publication Worker and the files this note names were removed in shaku1z/tear#190.

`GET /v1/capsules/:capsuleId/object` keeps verified public and unlisted
public/pseudonymous capsule retrieval anonymous. A verified, finalized private
capsule requires a valid Firebase Bearer whose verified opaque subject exactly
matches the durable upload owner.

Missing, invalid, and foreign private requests all receive the same `404` body
and do not call R2. Uploading, quarantined, deleted, or otherwise non-verified
capsules are never downloaded, including by their owner. Successful owner and
anonymous reads preserve the existing range, ETag, content-range, nosniff, and
`no-store` response contract.

`tests/unit/ghost-publication-worker-auth.test.ts` covers the exact owner
private read, range preservation, opaque non-owner failures without R2 access,
and the minimal CORS preflight header set. This Worker-only boundary does not
add client synchronization, deployment, discovery/listing, account deletion,
or moderation.

## Explicit local player controls

Profile → Vault now offers **LOAD MY CLOUD CAPSULES**, then a separate transient
owner catalog with **RECOVER TO THIS DEVICE** on each eligible entry. Opening,
rendering and refreshing the local Vault perform no cloud recovery request or
bearer acquisition. The existing standalone capability must be configured and
the current account must be non-guest; unsupported targets, missing storage and
anonymous accounts remain unavailable. Existing sign-in/out controls are reused.

Each explicit operation captures its actor and a generation invalidated by the
real account-change listener, including A→B→A. Service fences surround credential,
response and local-read waits and run immediately before import initiation. An
already-started import can commit for its original operation; its returned
operation ID and superseded disposition do not relabel it as the newer account's
action or repaint that account's catalog. Returning to the local Vault discards
remote catalog metadata. Local health/playback remain separate from remote
verified-cleared custody, and exact existing local custody is idempotent.

Focused injected-port controls exercise the real recovery service and memory
Vault for explicit catalog → import → already-recovered, deferred-token account
transition refusal, object-body transition refusal, and committed-import identity.
These are local engineering controls, not real Firebase or cross-device proof.
At `8a6569f7`, a fresh standalone build and the existing normal Vault browser
journey passed: anonymous/unconfigured navigation and the unavailable cloud
control sent no recovery request and left every retained Vault record unchanged.
The same journey completed explicit local Doctor repair, preserving original
manifest/chunk bytes and forensic evidence while restoring selected metadata.
No service is deployed and no live account or cross-device cloud completion is
claimed.
