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
