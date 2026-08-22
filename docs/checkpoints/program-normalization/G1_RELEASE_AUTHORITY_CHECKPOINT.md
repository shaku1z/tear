# G1 Checkpoint — Release Authority

**Status:** OPEN — release controls remain  
**Recorded:** 2026-08-22
**Candidate branch:** `codex/g1-release-closure-candidate`
**Pull request:** `#6` (`ci: gate production on protected main`)
**Candidate base:** `main` at `9b545b0382fb8c015da7a3410932a1d09e88750b`.
The earlier implementation was integrated through PR `#2`; this document now
records the evidence review for the new closure candidate. The exact closure
SHA will be frozen only in an approved G1 closure record.

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
- Production consumes the exact validated artifact rather than rebuilding a
  different tree. Preview artifact resolution binds to the validated run's
  release artifact SHA instead of assuming its branch SHA.
- The production workflow now has a no-secret `protected-main` job gate. The
  environment-backed `deploy` job depends on that gate and enters the existing
  case-sensitive `Production` environment only after it succeeds.
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
- Required job `96727452676` in run `32467607156` passed for branch candidate
  `1582f175ea485a9f1ec3ce12f91f04ec9aef44c4`. Its release artifact
  `tear-release-targets-b5e5a9909213ff4eee05f707f8d650fdd50a7e82` exposed
  the PR-merge-SHA versus branch-SHA mismatch in preview artifact lookup.
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
  `master`.
- Cloudflare Workers Builds configurations for both `tear` and `tear-wiki`
  were deleted on 2026-08-21. Subsequent configuration reads returned error
  `12040` (no build configuration), while both Worker settings endpoints
  continued to return HTTP 200. The live Workers were preserved.
- Preview publication is restricted to workflow runs on protected `main`.
  Trusted `main` supplies Wrangler and its fixed `tear-preview` configuration;
  a candidate contributes only the exact validated release artifact, so PR
  source cannot execute in the secret-bearing deployment step.
- GitHub environment `Preview` now requires reviewer `shaku1z` and accepts only
  protected branches. That approval and branch boundary was established before
  its Cloudflare credential was installed.
- Separate account-owned Cloudflare tokens named `TEAR GitHub Preview` and
  `TEAR GitHub Production` were created with only `Workers Scripts: Write`.
  GitHub environment secret records confirm `CLOUDFLARE_API_TOKEN` was added to
  `Preview` at `2026-08-21T09:51:34Z` and `Production` at
  `2026-08-21T09:52:57Z`; their values were never recorded in repository
  evidence.
- Both secret-bearing workflows reject dispatch unless the workflow itself is
  running from protected `main`. Production names the existing `Production`
  environment exactly; branch restrictions and required review remain intact.
- The failing hourly wiki workflow `Synchronize game data` (`311912849`) is
  `disabled_manually`. It retains a retired-file fetch and direct protected
  branch push, so it must remain disabled until G6 replaces that contract.

## Closure-candidate evidence review (2026-08-22)

- Validate run `32571321610` succeeded from `main` at
  `9b545b0382fb8c015da7a3410932a1d09e88750b`; required job `97027073498`
  passed and uploaded `tear-release-targets-9b545b0382fb8c015da7a3410932a1d09e88750b`.
- The GitHub artifact record is `9475495881` with archive digest
  `sha256:2326589490f8ccff6f199430a13a4dc05c726d88a118d7a12707f48e6377049d`.
  Independent verification of the downloaded standalone target passed with
  artifact hash
  `f93be4ee46f20b572ce0464010e64394be9412e7800527ac2d341a9d0bbcb1d8` and
  `111` artifact files.
- Preview rehearsal run `32572769987` succeeded from the same SHA; job
  `97030609365` published only `tear-preview` at
  `https://tear-preview.shatheartboy.workers.dev` with Cloudflare version
  `940bfa1c-24dd-4d29-a78b-e3164abfd28d`.
- The live preview `build-info.json` exactly reports repository `shaku1z/tear`,
  SHA `9b545b0382fb8c015da7a3410932a1d09e88750b`, target `standalone`, hash
  algorithm `sha256-path-size-content-v1`, artifact hash
  `f93be4ee46f20b572ce0464010e64394be9412e7800527ac2d341a9d0bbcb1d8`, and
  `111` artifact files.
- Production was unchanged by the rehearsal: the retained `tear` receipt
  remains the `d5d8…` / `5f1d5e2d-5d10-4c73-9eb2-0b7f7066f47b` pair, and the
  retained `tear-wiki` receipt remains the `bbcc…` /
  `b72b4f0e-5ae0-4439-9b74-cca7d3fd8d1c` pair.

This evidence advances the candidate but does not close G1.

## Open blockers

The following closure evidence remains pending and must not be inferred from
the successful hosted `check:functional` run or preview rehearsal:

- the complete controlled-host `pnpm check` from the exact intended final
  candidate, including its machine-sensitive performance evidence;
- a retained production-credential receipt proving the protected `Production`
  environment configuration without recording secret values; and
- final ruleset, environment, and release-evidence exports attached to the
  approved G1 closure record.

## Remaining G1 sequence

- [x] Disconnect Cloudflare Workers Builds for `tear` and `tear-wiki`; verify
      both live Worker services remain present.
- [x] Install distinct account-owned, Workers-Scripts-only Preview and
      Production environment tokens without recording their values.
- [ ] Merge wiki PR `#2` only after Workers Builds is disconnected; confirm
      exact-main `check` is green and no production publication occurred.
- [x] Obtain a green required `check` context for the exact candidate in
      Validate run `32571321610`.
- [ ] Run the complete `pnpm check` release gate once from the final G1
      candidate on the controlled local host; preserve all performance budgets.
- [x] Download and independently verify that exact CI artifact; see archive
      `9475495881` and the hash above.
- [x] Rehearse a non-production deployment to `tear-preview` and verify live
      `build-info.json` commit/hash attribution in run `32572769987`.
- [ ] Retain production-credential evidence for the protected `Production`
      environment without recording secret values.
- [ ] Export final rulesets and environment/release evidence to the G1 closure
      record; only then close G1 and open G2.
