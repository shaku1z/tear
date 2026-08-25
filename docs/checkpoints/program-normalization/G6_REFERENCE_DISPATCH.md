# G6 Reference Dispatch — Game Sender Candidate

**Status:** Implemented on `codex/g6-reference-dispatch` from game `main`
`9ddd8f20a9c7d1830a2e043d9e558e259f738d02`; protected merge and any external
dispatch remain pending. Production remains frozen and this candidate has not
executed a repository dispatch.

This checkpoint covers only the game-side sender that hands the already
published game-reference artifact to the protected wiki consumer. It does not
replace the wiki consumer, promote a wiki snapshot, deploy a Worker, or close
G6.

## Sender contract

- `scripts/dispatch-wiki-reference.mjs` accepts a successful Validate run ID
  and, for production, the already resolved release SHA.
- It verifies the exact `Validate` workflow (`322540049`,
  `.github/workflows/ci.yml`), completed successful protected-main push, exact
  repository/head-repository provenance, and the requested run/SHA.
- It lists the run's artifacts and requires one exact
  `tear-game-reference-v1-<SHA>` artifact with a positive ID, matching run,
  main branch, future expiry, bounded size, and a `sha256:<digest>` value.
- It downloads the artifact through a manually inspected HTTPS storage
  redirect. API credentials are sent only to GitHub's API request; the blob
  request has no Authorization header. The downloaded bytes must match both
  published size and digest before use.
- The only outgoing event is `tear-game-deployed` to `shaku1z/tear-wiki`, with
  exactly `game_commit`, `validation_run_id`, `artifact_id`, and
  `artifact_zip_base64` in `client_payload`. Tokens and encoded ZIP data are
  never logged.

## Workflow boundaries

- `.github/workflows/dispatch-wiki-reference.yml` is a manually dispatchable,
  protected-main proof workflow with only `actions: read` and `contents: read`.
  It has no Cloudflare or deployment step.
- The production workflow's final wiki step now calls the same sender and
  passes the validated run ID and SHA. This PR does not invoke that workflow.
- `WIKI_DEPLOY_TOKEN` remains the existing wiki dispatch credential; no new
  secret or direct protected-branch write was introduced.

## Evidence and remaining boundary

- Focused sender tests cover exact run/artifact provenance, duplicate and
  stale metadata, digest/size checks, hostile redirects, token separation,
  exact payload keys, manual workflow permissions, and production wiring.
- The existing `pnpm test:game-reference-artifact` gate includes the sender
  tests through the package script.
- No protected game merge, cross-repository dispatch, wiki commit, preview,
  Cloudflare action, or production execution is claimed here. G6 close
  conditions remain the successful manual dispatch, resulting wiki commit,
  clean-clone verification, and non-production wiki preview.
