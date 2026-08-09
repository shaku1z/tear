# C38 local Ghost publication bearer

This checkpoint adds only an action-time browser-side Firebase compatibility
port for a future Ghost publication client. `GhostPublicationBearerPort` reads
the current Firebase compat user for each request and returns an in-memory
`Authorization: Bearer …` value only when that user is signed in and
non-anonymous.

The port rejects unavailable Firebase auth, signed-out and anonymous users,
empty tokens, and token-request failures with a typed error. It does not expose
or persist a Firebase UID, persist or log a token, construct a Worker request,
publish a capsule, enqueue retries, or route any normal player UI.

Unit coverage proves fresh action-time acquisition and each unavailable/failure
case. This is a local contract foundation only; it does not establish browser
publication, cloud synchronization, account deletion, deployment, or C38
completion.
