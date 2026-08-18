# C38 private finalized-object retrieval

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
