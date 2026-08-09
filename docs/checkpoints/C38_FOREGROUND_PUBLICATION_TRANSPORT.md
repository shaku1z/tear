# C38 foreground publication transport

This slice adds `GhostPublicationTransport.runOnce(jobId, now)`: an explicit,
foreground-only bounded action over a locally custody-bound publication job and
the authenticated Worker resume protocol. It does not add a timer, service
worker/background sync, UI route, deployment, or automatic upload.

Every invocation re-reads the job, granted custody, complete Vault export,
export hash, byte length, content hash, and every declared part hash. It obtains
a new Firebase bearer for every HTTP action, reconciles only the Worker’s
declared topology and exact ETag ledger, uploads only missing exact byte ranges,
then completes with the reconciled ledger. Source/custody/topology/ETag changes,
malformed Worker responses, sign-out, and authorization failures fail closed.
Transient transport and 5xx failures record bounded exponential retry metadata;
they never schedule a retry.

Durable local transport state contains only attempt count, exact ETags, retry
deadline, and terminal result metadata—never export bytes, bearer tokens, or
identity. `cancel` is an explicit local action and makes only a best-effort
authenticated remote abort; local source evidence remains untouched.

This is not C38 completion: there is no normal player publication UI, deployed
endpoint evidence, cloud synchronization, account deletion flow, or end-to-end
cross-device proof.
