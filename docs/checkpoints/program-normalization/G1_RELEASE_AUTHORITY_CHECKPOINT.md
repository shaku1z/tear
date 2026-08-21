# G1 Checkpoint — Release Authority

**Status:** OPEN — release controls remain  
**Recorded:** 2026-08-21  
**Candidate branch:** `codex/program-normalization-g1`  
**Pull request:** `#2` (`ci: establish attributable release authority`)  
**Candidate:** the current tip of `codex/program-normalization-g1`; the exact
closure SHA will be frozen in the G1 closure record.

## Controls established

- `main` is protected by active repository ruleset `21119803`, **Canonical
  branch authority**. It blocks deletion and non-fast-forward updates, requires
  pull-request integration, requires current status checks, and has no bypass
  actors.
- The required pull-request status is the deterministic `check` job. The
  machine-sensitive browser performance suite remains part of the explicit
  final `pnpm check` release gate; it is not a per-PR hosted-runner contract.
- Merged remote branches are deleted automatically.
- Release preflight rejects wrong-branch, dirty, ahead, and behind checkouts
  before Wrangler can run.
- Production deployment is defined behind the protected GitHub environment
  `Production`; local `pnpm deploy` performs a dry-run only.
- Standalone and CrazyGames builds carry deterministic repository, full-SHA,
  target, and artifact-hash attribution.
- Preview and production workflows consume the exact validated artifact rather
  than rebuilding a different tree.
- Wiki synchronization is downstream of successful production release instead
  of every game push.
- PR `#1` is labeled `do-not-merge` and titled
  `[DO NOT MERGE — LEGACY] Add Cloudflare Workers configuration`.

## Evidence retained

- Functional CI job `96674695099` in run `32449338502` passed the complete
  `check:functional` contract for the exact current candidate
  `1b2a55a4609da2fffdbe42ad765cf26127d72925`.
- Functional CI job `96672829683` in run `32448658427` passed the complete
  `check:functional` contract and uploaded its attributable release artifact
  for candidate `b4652e39f860cbae966be1509a6c1cafa9f22a53`.
- Focused local performance evidence after the active-window reset measured
  desktop simulation/render/frame p95 at `0.8 / 0.8 / 1.6 ms` with zero new
  long tasks.
- Stable-Chrome hosted CI proved the desktop profile can pass. The 4×
  constrained profile subsequently measured simulation p95 `18 ms` against
  the unchanged `10 ms` contract in job `96674695138`.
- A one-job Docker runner experiment for candidate `03f9f0e` was rejected as
  non-representative after even its unthrottled desktop profile measured
  `16.4 ms` against the `4 ms` budget. The ephemeral runner registration and
  container removed themselves after job `96723917619`; no budget or gameplay
  assertion was changed. Docker is not part of the release design.
- Browser failures encountered during G1 were corrected only where the test
  depended on nondeterministic Xvfb input, tab-occlusion, or incomplete sample
  accounting. No gameplay assertion or performance threshold was weakened.
- TEAR Music `main` now uses its committed Node 24 declaration in CI. PR `#2`
  merged as `207b83dc0851c45dc68d43bcefe456ba3138d06e`, and exact-main Validate run
  `32450816799` passed its required `check` job.
- Wiki PR `#2` at `d7346e96dae7b6d94d0dcb1f3893366a912ef6bb`
  passed snapshot-only Validate run `32450973346`. The check verifies the
  retained manifest, 15 tier paths, 13 model profiles, and a 55-page Astro
  build without invoking the retired `js/` synchronizer.
- Wiki ruleset `21119805` now requires current status `check` on protected
  `master`. The wiki PR remains unmerged because Cloudflare Workers Builds is
  still connected and reacted independently to the branch.
- The failing hourly wiki workflow `Synchronize game data` (`311912849`) is
  `disabled_manually`. It retains a retired-file fetch and direct protected
  branch push, so it must remain disabled until G6 replaces that contract.

## Open blockers

1. **Cloudflare Workers Builds:** the obsolete Cloudflare Git integration still
   creates independent `Workers Builds: tear` and `Workers Builds: tear-wiki`
   checks and attempts its own publication paths. Disconnect both before their
   canonical PRs merge so GitHub Actions is the only ordinary deploy authority.
2. **Protected Cloudflare credentials:** add a least-privilege
   `CLOUDFLARE_API_TOKEN` to the GitHub `Preview` and `Production` environments.
   Do not copy a broad local OAuth credential into GitHub.

## Remaining G1 sequence

- [ ] Disconnect Cloudflare Workers Builds for `tear` and `tear-wiki`.
- [ ] Install scoped Preview and Production environment tokens.
- [ ] Merge wiki PR `#2` only after Workers Builds is disconnected; confirm
      exact-main `check` is green and no production publication occurred.
- [ ] Obtain a green required `check` context for the exact candidate.
- [ ] Run the complete `pnpm check` release gate once from the final G1
      candidate on the controlled local host; preserve all performance budgets.
- [ ] Download and independently verify that exact CI artifact.
- [ ] Rehearse a non-production deployment to `tear-preview` and verify live
      `build-info.json` commit/hash attribution.
- [ ] Export final rulesets and environment/release evidence to the G1 closure
      record; only then close G1 and open G2.
