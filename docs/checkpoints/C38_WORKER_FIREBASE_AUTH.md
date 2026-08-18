# C38 Worker Firebase owner authentication

The Ghost publication Worker no longer accepts `x-tear-owner` (or any other
caller-supplied owner identifier) for owner-scoped endpoints. It accepts only a
Firebase ID token in `Authorization: Bearer <token>` and uses its verified,
opaque `sub` claim as the D1 owner and audit actor.

`workers/firebase-auth.ts` checks RS256 signatures against cached Firebase
JWKS, the Firebase project audience and issuer, expiration, and bounded
non-empty subject. Authentication failures are `401` before the Worker reads
or mutates owner-scoped publication state. The implementation contains no
Firebase Admin credential and no deployment is implied by this checkpoint.

Covered locally with an injected verifier:

- missing and forged bearer tokens are rejected;
- `x-tear-owner` cannot override a verified subject;
- a valid subject can begin an upload;
- one verified subject cannot upload a part to another subject's capsule.

This only closes the Worker owner-authentication seam. It does not establish
real deployment, browser publication routing, cloud sync, account deletion,
or C38 completion.
