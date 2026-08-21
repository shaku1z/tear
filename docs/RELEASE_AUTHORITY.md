# Release authority

Production authority belongs to one exact, green `shaku1z/tear` `main` commit.
Cloudflare is a publication target, not an independent source branch.

## Validated artifact flow

1. A pull request is integrated into protected `main`.
2. the `Validate` workflow runs the full `pnpm check` gate at that exact SHA.
3. `Validate` uploads `tear-release-targets-<sha>`. Each target contains
   `build-info.json` with the repository, full SHA, target, file count, and a
   deterministic artifact hash.
4. A maintainer manually starts `Deploy Cloudflare Production` with the
   successful Validate run ID.
5. The protected `production` environment provides the approval boundary and
   scoped Cloudflare credentials.
6. The workflow proves the checkout is clean `main`, tracks `origin/main`, is
   neither ahead nor behind it, and exactly equals the validated SHA.
7. The workflow downloads rather than rebuilds the validated artifact,
   verifies its metadata/hash, and publishes it with the Git SHA and Validate
   run ID in the Cloudflare version message.
8. Only after Wrangler succeeds does the workflow dispatch the deployed SHA to
   `shaku1z/tear-wiki`.

`build-info.json` is excluded from its own artifact hash to avoid a circular
digest. The hash covers every other file as sorted path, byte length, and
content SHA-256. The file is written after PWA generation, so it is fetched
from the network and is deliberately not part of the offline precache.

## Local boundary

`pnpm deploy` and `pnpm deploy:dry-run` build and run Wrangler with
`--dry-run`; neither can publish. There is no package script that performs a
production upload. The only ordinary publisher is the protected GitHub
Actions workflow.

The release preflight rejects, before Wrangler can run:

- a branch other than `main`;
- a dirty checkout, including untracked files;
- an upstream other than `origin/main`;
- a checkout ahead of or behind `origin/main`;
- a SHA that differs from the successful Validate evidence; or
- malformed/mismatched release evidence.

## Rehearsal and production

`Rehearse Cloudflare Release` accepts a successful Validate run ID, downloads
that run's exact artifact, verifies it, and publishes only to the separate
`tear-preview` Worker through the `Preview` environment. It never changes the
`tear` production Worker or its custom domain.

`Deploy Cloudflare Production` is manual even after Validate succeeds. A green
check is necessary but never sufficient to deploy. Its required environment
approval remains the final publication boundary until G7 authorizes the
converged release.

## Rollback

Before any production run, retain the current Cloudflare version ID and Git
SHA in the gate closure/release receipt. Roll back the Worker to that version,
then revert the corresponding Git change through a reviewed pull request.
Never repair production by deploying an uncommitted local tree.
