# C38 Worker credential-safe CORS

The Ghost publication Worker now defaults to **no CORS origins**. A deployment
must inject exact absolute origins through `createGhostPublicationHandler({
allowedOrigins })`; it never reflects arbitrary or `null` origins and never
uses a wildcard or credentialed CORS response.

For an allowlisted origin, preflight is handled before Firebase verification,
D1, R2, or the verifier binding. It allows only the method and headers required
by the addressed API route: `authorization` only for owner reads/aborts,
`content-type` only for JSON or binary upload writes, and `range` for object
reads. Private object retrieval additionally permits `authorization`; public
and unlisted retrieval remains anonymous. All CORS-bearing responses are `no-store` and vary by
origin; preflight additionally varies by requested method and headers.

`tests/unit/ghost-publication-worker-auth.test.ts` proves exact allowed
preflight, null/unknown/overbroad rejection, and that authenticated error
responses carry CORS only for an allowlisted origin. This is a transport
boundary, not deployment, client wiring, player publication UI, cloud sync, or
C38 completion.
