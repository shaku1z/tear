# VAP-0 verification baseline and authority report

- **Report role:** Exact-source, report-only baseline for the TearBench verification-acceleration program.
- **Game baseline:** Protected `origin/main` at `9e7d6a701ca0b992c8d78cccc2af329d698778c0`.
- **Wiki baseline:** Protected `main` at `7fa35d9b4aff9d00a658a3dc648d8512d649887b`.
- **Correction authority:** Locally committed and machine-visible at `b15fb190327acfe58697a4f70a9f1da2a9efa4c9`; protected integration is not claimed.
- **Captured:** 2026-08-30.
- **Behavioral effect:** None. No release gate, build, browser suite, workflow dispatch, deployment, approval, or publication ran for this report.

## Result

VAP-0 is complete for the audited source boundary. The ordinary successful
protected `Validate` gate has a five-run p50 of **13m44s** and p95 of
**18m08s**. The game production job itself has a five-run p50 of **33s**;
the full production workflow, including its observable environment/runner wait,
has a p50 of **1m40s**. Wiki production has a p50 of **59s**. Four matched
game-production-to-wiki-production transactions have a p50 of **4m33s**.

These clocks do not support describing a successful protected candidate gate as
an hour-long upload. Longer agent turns include defect reproduction, correction,
local evidence, protected review, approval waits, and publication work. Defect
repair time is not recoverable from completed workflow metadata and is therefore
recorded as a separate unavailable baseline rather than inferred.

## Source and toolchain identity

| Field | Value |
| --- | --- |
| Game protected source | `9e7d6a701ca0b992c8d78cccc2af329d698778c0` |
| Acceleration branch authority source | `b15fb190327acfe58697a4f70a9f1da2a9efa4c9` |
| Wiki protected source | `7fa35d9b4aff9d00a658a3dc648d8512d649887b` |
| Node | `v24.14.0` |
| pnpm | `11.15.0` |
| Playwright | `1.61.1` |
| Canonical game checkout | clean `main`, equal to `origin/main` at capture |
| Acceleration worktree | clean `codex/verification-acceleration-plan`, two local commits ahead of `origin/main` before this report |
| Preserved correction worktree | dirty and untouched; not used as execution authority |

## Parsing inputs

The static graph is invalidated when any input below changes.

| Game input | SHA-256 |
| --- | --- |
| `package.json` | `9b7ceae3606eef8675bba4b61abacb0780dbc8e5a614ec288e8870e9b5630118` |
| `pnpm-lock.yaml` | `32a618f6a38fd883173d97f79e1ddfd22ae8064bc5647322f9a5cf786583c168` |
| `scripts/tearbench.mjs` | `9ef309586db8370cdf736c21d4ab2fbb1f142626e32ecbcbd55e24820b882012` |
| `scripts/check-reproducible-build.mjs` | `8b7f40cec97ff8e2530113b1ed884c5659a6626dc8ecba63fad2f8bc22087d25` |
| `scripts/release-artifact.mjs` | `93a642d5556dd8828a4a1fce6efa3bb4cee99adb6c52cd9242e18f0b784cc278` |
| `src/tearbench/evidence-routes.json` | `1d24b93ae6aea0270eceed4b7da91cebfc0ff1aaf69bc57e33ab3bbea59acacb` |
| `src/tearbench/release-certification.ts` | `ccdc25c2dcd34757e916d422654cc0f78520381ae4b2af831caf6442a2af8412` |
| `.github/workflows/ci.yml` | `7d69ebc4960ca4fdfe873a71934057c80590dcfe0122ee20b8f26e039abf6d56` |
| `.github/workflows/deploy-production.yml` | `42f909ec9c69fbd475cb0c650ad3beecca6651c59dc814bff595f522887c1385` |
| `.github/workflows/dispatch-wiki-reference.yml` | `8d7961bc23bc6f8c27f181b8427980937c431494b5e58be8fd3ba73c5012fd1f` |
| `.github/workflows/tearbench-program.yml` | `2f4bf680a4a11f652a4c00d2210b4ca57b31ba7ed087cbbfe10b12ab060dad53` |

| Wiki input | SHA-256 |
| --- | --- |
| `package.json` | `17320f9008f0d632a0150c2647bcdb7e5a247bc94180aadcb86b0913704717fa` |
| `package-lock.json` | `3474a71eb43f610e7dbcf6d2f2b74169387b3472f75ed2e8eea926b92d54ee43` |
| `.github/workflows/sync-game-reference.yml` | `0d60a4b0956d29df85f2fd5bb19cb915f4b1302ea5cf95b16623eac0ffeb898e` |
| `.github/workflows/validate.yml` | `445b87d2e7eb88008abbd8a962cab4ce30d76d0547a44864703b2f12f3f4b29b` |
| `.github/workflows/deploy-wiki-production.yml` | `07a11c50e497ef186c56bca9f89f18aa84d7a78f64ea66de07b79e3a6eadade0` |
| `.github/workflows/deploy-wiki-preview.yml` | `32edea0955585cb7669d8f54350b3ee6becd231037074c3a930f7adb8e014bc9` |

## Current verification graph

```text
game pull request or protected-main push
  -> install dependencies
  -> resolve changed-files scope
  -> install Chromium when gameplay evidence is required
  -> release-preflight negative
  -> TearBench diff-aware selection and execution
  -> documentation-only gates
     OR game-reference publication tests
        -> serial check:functional
        -> upload exact game release targets
        -> protected-main game-reference artifact

manual game production
  -> verify protected-main Validate success
  -> download exact release artifact
  -> verify source/artifact identity
  -> production approval/environment boundary
  -> deploy exact artifact
  -> dispatch exact game-reference identity to wiki

wiki generated-reference path
  -> sync and promote reference
  -> full check:snapshot
  -> synchronization PR
  -> PR full check:snapshot
  -> merged-main full check:snapshot
  -> manual production full check:snapshot
  -> production approval/environment boundary
  -> deploy wiki build
```

The scheduled TearBench workflow is evidence collection and explicitly does not
certify a release. The protected `Validate` push gate is the current game
candidate authority.

## Static inventory

| Measurement | Baseline | Classification |
| --- | ---: | --- |
| TearBench evidence routes | 30 | Unique routing definitions |
| Routes declaring matrix metadata | 29 | Metadata, not materialized execution |
| Distinct route matrix labels | 25 | Includes labels outside the canonical matrix registry |
| Direct package-script calls in `check:functional` | 46 | Serial process/wrapper overhead |
| Vite build-target executions in a clean `pnpm check` | approximately 10 | Six ordinary/repeated targets plus four intentional reproducibility builds |
| Chromium processes in `check:functional` | approximately 35 | Serial browser startup and test time |
| Fixed browser-port declarations/uses | 55 | Local concurrency constraint |
| Unique fixed ports | 40 | Local concurrency constraint |
| Fixed-port collision groups | 11 | Unsafe for naive local sharding |
| Full wiki `check:snapshot` executions in ordinary generated-reference publication | at least 4 | Distinct trust boundaries with repeated complete build/check work |

### Atomic candidate inventory

| Surface | Current operation classes | Current identity/proof boundary |
| --- | --- | --- |
| TearBench selected evidence | fixed TearBench unit files, selected authority commands, scenario/browser commands, optional Graveyard reruns | changed files, route/scenario set, source revision/fingerprint; shared last-writer capability output |
| Universal functional gate | workspace/docs, type/lint/architecture, preservation, broad unit/headless, provenance/reference, builds, package/reproducibility/dry-run, browser journeys | process exit status plus produced artifacts; independent from TearBench selection |
| Performance gate | another test-standalone build and performance browser command | current local build and browser result |
| Release artifact | standalone/CrazyGames production targets and package | source revision/fingerprint plus artifact hashes/build info |
| Production | protected run check, artifact download/verification, environment approval, exact artifact deploy | protected source/run and release artifact identity |
| Game-reference dispatch | published game-reference artifact, digest, target wiki repository | exact game source/run/artifact |
| Wiki sync/PR/main/production | reference promotion and repeated `check:snapshot` | wiki source, game source, reference receipt, environment/run status |

## Repetition classification

### Exact or avoidable duplicate execution

- CI runs TearBench selected evidence and then an independent universal
  `check:functional` chain for the same candidate.
- TearBench's fixed unit evidence is included again by the broad non-preservation
  Vitest run.
- The final-five weapon, current headless weapon parity, and current headless
  gameplay scenario files are included in the broad unit run and then invoked
  explicitly again.
- A current-weapon diff can run the same five live/browser proofs once through
  TearBench selection and again through `test:browser:current-weapon-parity`.
- Test-standalone is rebuilt for ordinary functional evidence, current-weapon
  parity, and performance despite compatible consumers frequently sharing the
  same source and target.
- The wiki generated-reference path runs the complete snapshot/build contract at
  sync, PR validation, merged-main validation, and production.

### Semantic overlap requiring typed task/claim analysis

- Browser journeys can cover related screens or gameplay states while proving
  different input, platform, presentation, or lifecycle claims.
- TearBench selected commands and the universal browser gate often overlap by
  subject without having a shared task identity or claim model.
- Production dry-run and deployment both inspect an artifact, but only the
  deployment workflow crosses the protected environment boundary.

### Intentional independent evidence

- Standalone A/B and CrazyGames A/B reproducibility builds must remain
  independent.
- Distinct live/headless/backend executions remain independent when each backend
  is honestly supported.
- Protected CI, production approval, game deployment, wiki protected validation,
  and wiki production remain separate trust boundaries.
- A retry is not a duplicate success: both attempts must be retained and a later
  pass must be labeled recovered-flaky.

## Protected timing samples

Percentiles use nearest rank: sort all retained durations and select rank
`ceil(p * n)`. No successful sample was discarded.

### Candidate-to-certificate proxy: protected `Validate`

The current repository has no aggregate TearBench release certificate, so the
successful protected-main `Validate` completion is the honest baseline proxy.

| Run | Source | Duration |
| ---: | --- | ---: |
| `33316839231` | `9e7d6a7` | 824s |
| `33314448473` | `7a2d879` | 970s |
| `33292065009` | `81a7fac` | 1088s |
| `32957141293` | `91706363` | 726s |
| `32821064971` | `a8a476c` | 700s |

- p50: **824s / 13m44s**
- p95: **1088s / 18m08s**
- run-level created-to-started queue: **0s for all five**

Five successful scheduled TearBench evidence runs measured 284s, 280s, 283s,
295s, and 157s: p50 **283s**, p95 **295s**. They are non-certifying evidence
and are not substituted for `Validate`.

### Certificate/gate-to-game-live proxy

| Production run | Source | Total workflow | Observable gate-complete to deploy-job start |
| ---: | --- | ---: | ---: |
| `33317506163` | `9e7d6a7` | 100s | 57s |
| `33305687854` | `81a7fac` | 123s | 84s |
| `33292750290` | `81a7fac` | 61s | 13s |
| `32958195666` | `91706363` | 202s | 153s |
| `32822089774` | `a8a476c` | 66s | 29s |

- total workflow p50/p95: **100s / 202s**
- deploy-job execution p50/p95: **33s / 40s**
- observable environment/runner wait p50/p95: **57s / 153s**

The observable gap includes environment approval and runner scheduling. It is
not labeled pure human approval time.

### Wiki production and game-live-to-wiki-live

| Wiki production run | Wiki source | Game source | Duration |
| ---: | --- | --- | ---: |
| `33317775693` | `7fa35d9` | `9e7d6a7` | 57s |
| `33305887906` | `2dc49a1` | `81a7fac` | 49s |
| `32958785323` | `997f0ba` | `91706363` | 59s |
| `32822355570` | `30875d6` | `a8a476c` | 83s |
| `32820171342` | `371f8a3` | `aa2ab1b` | 61s |

- wiki production total p50/p95: **59s / 83s**
- wiki environment/run-created-to-job-start p50/p95: **20s / 33s**
- wiki deploy-job execution p50/p95: **38s / 49s**
- four exact matched game-live-to-wiki-live durations: 314s, 222s, 273s,
  and 215s; p50 **273s**, p95 **314s**

The fifth wiki sample followed a manual reference path after a failed game
production attempt and is intentionally excluded only from the matched
game-live-to-wiki-live sample, not from wiki-production timing.

## Clock definitions for all later checkpoints

| Clock | Start | Stop |
| --- | --- | --- |
| Repair/investigation | first confirmed candidate defect or failed atomic task | source frozen after the final corrective edit |
| Candidate certification | frozen exact source/plan becomes runnable | protected aggregate certificate completes |
| Approval/environment wait | certificate/gate completion | deploy job starts |
| Game deployment | deploy job starts | exact game artifact is live and verified |
| Wiki synchronization | successful game dispatch | exact reference PR/main candidate is ready |
| Wiki publication | exact wiki candidate enters production workflow | exact wiki site is live and verified |

Repair/investigation must be measured prospectively by future receipts. It may
never be added to candidate certification or described as upload duration.

## Regeneration procedure

The report can be regenerated without running a build or release gate:

1. Re-resolve `origin/main`, record `git status --short --branch`, `git rev-parse
   HEAD`, and `git rev-parse origin/main` in both repositories.
2. Record `node --version`, `pnpm --version`, and `pnpm exec playwright --version`.
3. Hash every parsing input above with SHA-256.
4. Expand `check`, `check:functional`, and `check:performance` from
   `package.json`; classify referenced scripts and internal build calls.
5. Inspect route/matrix metadata and the selector/executor boundaries in
   `scripts/tearbench.mjs`, `evidence-routes.json`, and
   `release-certification.ts`.
6. Count browser entrypoints/launches and fixed-port declarations from the
   exact package expansion and `tests/` sources.
7. Count `check:snapshot` consumers in the wiki workflows and package script.
8. Query completed workflow metadata with read-only `gh run list`, `gh run
   view`, and `gh api`; record run IDs, source SHAs, created/started/completed
   timestamps, and retain all samples selected by the stated rule.
9. Recompute nearest-rank percentiles and keep repair time separate.

## VAP-0 disposition

| Checklist item | Evidence | State |
| --- | --- | --- |
| Source/worktree/toolchain/workflow identity | Exact SHAs, versions, statuses, and input hashes above | Complete |
| Correction plan tracked, indexed, checked, temporary, retirement-bound | Local commit `b15fb19`; `check:docs`; 13 focused docs tests including negative temporary/retirement mutation | Complete locally; protected integration not claimed |
| Atomic candidate inventory | Current graph and operation-class table above | Complete |
| Duplicate/overlap/intentional classification | Repetition classification above | Complete |
| Build/browser/port/package/wiki counts | Static inventory above | Complete |
| Protected p50/p95 samples | Exact run tables and nearest-rank method above | Complete |
| Repair time separate | Prospective clock contract; historical value explicitly unavailable | Complete |
| Release behavior unchanged | No gate/build/browser/deploy/publication execution | Complete |

## Not claimed

This report does not close TC-1 through TC-10, VAP-1 or later, C40, protected
integration, required-check cutover, game deployment, wiki modification, or
publication. Any change to the hashed inputs reopens the static VAP-0 graph;
new protected runs extend rather than silently replace the timing sample.
