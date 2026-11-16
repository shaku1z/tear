# Release authority

Production authority belongs to one exact, green `shaku1z/tear` `main` commit.
Cloudflare is a publication target, not an independent source branch.

## Validated artifact flow

1. A pull request is integrated into protected `main`.
2. The `Validate` workflow runs the deterministic `pnpm check:functional`
   contract at that exact SHA and uploads the resulting targets. The complete
   `pnpm check`, including controlled-host performance evidence, runs once for
   the final release candidate before the gate closes.
3. `Validate` uploads `tear-release-targets-<sha>`: `dist/standalone` (what
   the deploy workflows publish) and the CrazyGames package. Each target
   contains `build-info.json` with the repository, full SHA, target, file
   count, and a deterministic artifact hash. The artifact is kept 7 days for a
   `main` run and 2 days for a pull-request run. Production only deploys the
   current `main` head (step 7). If that head's artifact has expired, re-run
   its Validate run, which uploads a fresh artifact under the same run ID.
4. A maintainer manually starts `Deploy Cloudflare Production` with the
   successful Validate run ID.
5. The protected `Production` environment provides the approval boundary and
   scoped Cloudflare credentials. The spelling is case-sensitive and matches
   the configured GitHub environment.
6. A no-secret `protected-main` job proves the workflow is executing from
   protected `main`; the environment-backed deployment job depends on it.
7. The workflow proves the checkout is clean `main`, tracks `origin/main`, is
   neither ahead nor behind it, and exactly equals the validated SHA.
8. The workflow downloads rather than rebuilds the validated artifact,
   verifies its metadata/hash, and publishes it with the Git SHA and Validate
   run ID in the Cloudflare version message.
9. Only after Wrangler succeeds does the workflow dispatch the deployed SHA to
   `shaku1z/tear-wiki`.

`build-info.json` is excluded from its own artifact hash to avoid a circular
digest. The hash covers every other file as sorted path, byte length, and
content SHA-256. The file is written after PWA generation, so it is fetched
from the network and is deliberately not part of the offline precache.

## Merging

`main` does not require a pull request to be up to date with it before merging
(owner decision, 2026-11-13). These rules take its place. `pnpm merge:ready <pr>`
applies them and answers yes or no with the reason; the merge helper calls it.

1. **A red `main` stops merges.** The latest finished Validate run on `main`
   must have passed. The one exception is a pull request labelled `fixes-main`,
   and its own check must still be current.
2. **A stale pass is not a pass.** The pull request's latest Validate run for
   its current head must have passed. Since the `main` commit that run checked,
   `main` must not have changed:
   - any file the pull request changes;
   - any shared file: `package.json`, the lockfile, workflow files, anything
     under `config/`, the TearBench task registry, tsconfig, ESLint, Prettier,
     Vite and Vitest configuration, and `scripts/build-target.mjs`.

   Otherwise `pnpm merge:ready <pr> --refresh` starts a fresh run.
3. **Every check is of the change merged with `main` as it is when the check
   starts.** Validate checks out the pull request's head, merges current `main`
   itself, and records both commits on the run as the `checked` annotation.
   - A re-run therefore also tests current `main`.
   - Neither a re-run nor a reopened pull request reuses GitHub's prepared
     merge ref.
   - The release artifact is named after the commit actually built.

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

`Rehearse Cloudflare Release` runs only from protected `main`, accepts a
successful Validate run ID, downloads that run's exact artifact, verifies it
with trusted `main` tooling, and publishes only to the separate `tear-preview`
Worker through the `Preview` environment. Candidate source is never executed
in the secret-bearing deploy step. The rehearsal never changes the `tear`
production Worker or its custom domain.

`Deploy Cloudflare Production` is manual even after Validate succeeds. A green
check is necessary but never sufficient to deploy. Its required environment
approval remains the final publication boundary until G7 authorizes the
converged release.

## Rollback

Before any production run, retain the current Cloudflare version ID and Git
SHA in the gate closure/release receipt. Roll back the Worker to that version,
then revert the corresponding Git change through a reviewed pull request.
Never repair production by deploying an uncommitted local tree.
