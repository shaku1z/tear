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
   `main` run and 2 days for a pull-request run. Production deploys a green
   commit on `main`: its head or an earlier one (step 7). If that commit's
   artifact has expired, re-run its Validate run, which uploads a fresh
   artifact under the same run ID.
4. A maintainer manually starts `Deploy Cloudflare Production` with the
   successful Validate run ID.
5. The protected `Production` environment provides the approval boundary and
   scoped Cloudflare credentials. The spelling is case-sensitive and matches
   the configured GitHub environment.
6. A no-secret `protected-main` job proves the workflow is executing from
   protected `main`; the environment-backed deployment job depends on it.
7. The workflow proves the checkout is clean `main`, tracks `origin/main` and
   is neither ahead nor behind it, and that the validated SHA is `main`'s head
   or an earlier commit on `main`'s own line (owner decision, 2026-11-16: a
   merge that lands while a release is prepared no longer invalidates it). The
   deploy tooling and `wrangler.jsonc` come from `main`'s head, so an earlier
   commit is refused when `wrangler.jsonc` has changed since it.
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
     under `config/` except the tool catalogue, the TearBench task registry,
     tsconfig, ESLint, Prettier, Vite and Vitest configuration, and
     `scripts/build-target.mjs`.

     The tool catalogue only describes `package.json` and `scripts/`. A change
     that adds or removes a script must edit the catalogue, so it overlaps any
     catalogue change on `main` anyway.

   Otherwise `pnpm merge:ready <pr> --refresh` starts a fresh run.
3. **Every check is of the change merged with `main` as it is when the check
   starts.** Validate checks out the pull request's head, merges current `main`
   itself, and records both commits on the run as the `checked` annotation.
   - A re-run therefore also tests current `main`.
   - Neither a re-run nor a reopened pull request reuses GitHub's prepared
     merge ref.
   - The release artifact is named after the commit actually built.
4. **A passed batch covers its members.** `pnpm merge:batch [<pr> ...]` builds
   a branch `codex/batch-<time>` from `main` and merges each pull request's head
   into it, in the order given. Without numbers, it takes every ready pull
   request in number order. A pull request that conflicts is left out and
   named. It pushes the branch and starts Validate on it. The run records the
   members it checked as the `batch` annotation.

   A member is then ready to merge when all of these hold:
   - main's latest finished run is green;
   - its head is still the one the batch checked;
   - every commit on `main` since the batch's `main` is the merge of another
     member, at the head the batch checked.

   The combination was checked as a whole, so main's newest commit need not
   have a finished run, and shared-file changes by other members do not make
   the pass stale. Anything else on `main`, a moved head or a red `main` ends
   the cover, and the member is back on rules 1 and 2.
   - `pnpm merge:batch --status <branch>` says whether the batch passed and, if
     not, which checks failed. Build it again with `--without <pr>`.
   - `pnpm merge:batch --merge <branch> --authorize-owner-merge` merges the
     members through the owner merge helper, in batch order, then runs
     `--verify`.
     - A network failure is tried again, after checking the merge did not go
       through.
     - A refusal, or a member that moved or closed, stops it there.
   - After the last merge, `pnpm merge:batch --verify <branch>` confirms that
     main's tree is the tree the batch run checked, and says loudly if it is
     not.
   - Main's own run still runs after each merge, and still makes the deploy
     artifact.
   - `pnpm merge:batch --prunable` lists batch branches nothing can still
     merge on: a failed run, or every member merged or closed.
     `pnpm merge:batch --prune` deletes those, on origin and locally, and says
     what it deleted.
   - It never deletes a branch while any check on it is running, or within an
     hour of its push, before its run may have started.
   - The pre-push guard allows a deletion only for a name that is exactly a
     batch branch (owner decision, 2026-11-16).

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
- a validated SHA that is not on `main`, or whose Wrangler configuration
  differs from `main`'s head;
- a SHA that differs from the successful Validate evidence; or
- malformed/mismatched release evidence.

## Rehearsal and production

`Rehearse Cloudflare Release` runs only from protected `main`, accepts a
successful Validate run ID, downloads that run's exact artifact, verifies it
with trusted `main` tooling, and publishes only to the separate `tear-preview`
Worker through the `Preview` environment. Candidate source is never executed
in the secret-bearing deploy step. The rehearsal never changes the `tear`
production Worker or its custom domain.

The preview also serves the test build of the same commit below `/dev/`
(Boss Test, Enemy Test and the other engineering surfaces), on the same origin
so it shares the preview's saves and settings. Validate builds it on main
pushes only (`node scripts/build-target.mjs test-standalone --preview-dev`) and
uploads it as its own `tear-preview-dev-<sha>` artifact; the rehearsal verifies
it as a `test-standalone` build of that commit. Production verifies a
`standalone` build and never reads that artifact.

`Deploy Cloudflare Production` is manual even after Validate succeeds. A green
check is necessary but never sufficient to deploy. Its required environment
approval remains the final publication boundary until G7 authorizes the
converged release.

## Rollback

Before any production run, retain the current Cloudflare version ID and Git
SHA in the gate closure/release receipt. Roll back the Worker to that version,
then revert the corresponding Git change through a reviewed pull request.
Never repair production by deploying an uncommitted local tree.
