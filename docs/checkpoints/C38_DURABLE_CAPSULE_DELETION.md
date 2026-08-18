# C38 durable per-capsule cloud deletion

An authenticated owner `DELETE /v1/capsules/:capsuleId` now first writes a
single D1 batch that makes the capsule `deleting` and private, creates or
refreshes its deletion request, and records an audit event. Only after that
durable boundary does the Worker call R2.

Successful R2 deletion records a purged audit/state and returns `deleted`.
An R2 failure remains truthful: the capsule stays private and denied from
object retrieval/discovery, while the response is `202 deleting` with a
retryable pending purge. Repeating the exact owner DELETE retries it; foreign
and missing rows remain opaque. This does not alter the local Vault, add a
timer/background processor, account-wide deletion, deployment, policy, or UI.
