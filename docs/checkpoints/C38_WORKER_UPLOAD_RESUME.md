# C38 Worker authenticated upload resume boundary

The Ghost publication Worker now has a bounded, authenticated resumability
seam. `GET /v1/uploads/:capsuleId` authenticates first and returns only the
same owner's `capsuleId`, current status, declared byte length, and
part-number-sorted durable D1 ledger. Responses are `no-store`; absence and
non-ownership are deliberately indistinguishable `404` responses.

`POST /v1/uploads` is idempotent only for an existing `uploading` row owned by
the verified Firebase UID whose entire parsed immutable manifest is identical.
That path returns the retained multipart handle with `resumed: true` and makes
no R2 or D1 mutation. A changed manifest, different owner, or terminal row is
a conflict. If concurrent D1 insertion loses after a new R2 multipart handle
was made, the Worker aborts that handle, refetches, and resumes only an exact
same-owner immutable winner.

Before R2 completion, the Worker compares every submitted part number and ETag
against the durable `ghost_upload_parts` ledger. Duplicate submitted numbers,
invalid ledger duplicates, missing entries, extra entries, and changed ETags
are rejected before `complete()` is called.

`tests/unit/ghost-publication-worker-auth.test.ts` covers verified same-owner
status, foreign/absent indistinguishability, exact idempotent begin, immutable
and terminal conflicts, and durable-ledger mismatch/duplicate refusal.

This is a local Worker-contract increment only. It does not deploy a Worker,
create a browser queue, route player publication, migrate data, define upload
expiry/TTL cleanup, establish cloud sync, or complete C38.
