# C38 local Ghost publication job custody

This bounded C38 slice provides local immutable publication intent only. It exports
one complete healthy Vault capsule at enqueue time, freezes its manifest/root/export
hash, privacy, visibility, eligibility, cloud-publication consent, and deterministic
part metadata, then stores a CAS-bound job in `uploadJobs`.

The job never stores a Firebase bearer, account UID, raw capsule export, or network
state. It has no transport, timer, retry/resume loop, or UI. Reads fail closed by
terminally cancelling an outstanding job if its exact source or custody bytes change;
explicit cancellation preserves the local capsule. Cloud transport remains a later
C38 slice.

## Local publication consent ledger

`GhostLocalPublicationConsentLedger` is a separate action-time C38 boundary. It
accepts only a signed-in, non-anonymous local actor, hashes that actor before every
durable write, and never retains a Firebase UID, bearer, display name, or training
grant. Its immutable policy defaults to pseudonymous/private/no-training and denied
cloud publication. Explicit grant and revoke records advance an exact revision; an
identical retry is idempotent while a conflicting or skipped revision fails closed.

Every `GhostLocalPublicationJobs` instance now requires this validator. Enqueue pins
the validated grant record in its immutable custody bytes, and every queued-job read
rechecks the current exact grant. Revocation, corruption, actor mismatch, or revision
change terminally cancels the local job without deleting its capsule. This remains a
local consent/custody foundation: it adds no UI, queue pump, timer, network action,
or deployment.
