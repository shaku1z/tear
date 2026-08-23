# TEAR Program Normalization and Release Governance Master Plan

**Status:** G4 is CLOSED after its protected-main merge and green post-merge
`Validate`/ref observation. G5 is OPEN for bounded organization slices;
production remains frozen and no deployment is authorized.

**Prepared:** 2026-08-20

**Execution authorization:** Granted by the user on 2026-08-20

**Initial canonical game baseline:** `shaku1z/tear` `main` at `0bef91dc4970740c80b1969416c0573680bcaf89`

**Certified G5 workspace-preservation operation:** protected game `main` at
`753e456c033880af8a1092bb23d324acf0c3071a` (`753e456`). The completed
whole-root preservation is recorded in
`docs/checkpoints/program-normalization/G5_WORKSPACE_PRESERVATION.md` and is
bound to the report, manifest, journal, and completion receipt recorded there.
No deletion occurred; production remained frozen. Restore/reverse-move,
artifact quarantine, remaining workspace normalization, wiki synchronization,
and deployment remain separately gated work.

**Current goal state:** G0 CLOSED; G1 CLOSED; G2 CLOSED; G3 CLOSED; G4
CLOSED after protected merge and post-merge observation; G5 OPEN for bounded
organization work; G6 synchronization repair and G7 production certification
remain future work.

**Music repository state:** `shaku1z/tear-music` (formerly
`shaku1z/tear-score`) protected `main` is clean at
`7e443d9d75089b80bb641ba654eee46615b1abd6` (`7e443d9`). The full music
`pnpm check` passed on PR #13 head `1577f5c`, including 140 CLI tests. Its
post-merge `Validate` run `32629490375` is green (job `97169930931`, 1m57s).

**Wiki repository state:** protected/default `main` is clean at
`33a7f86f8f12ce7c98d1805d169142c832afdcf1` (`33a7f86`). Post-merge
`Validate` run `32626685362` is green. Sync remains disabled/fail-closed
pending G6, and the `tear-wiki` Worker remains frozen.

**Production state:** Frozen. This G4 slice claims no deployment, Cloudflare,
DNS, Access, Tunnel, or published-artifact mutation.

This document is the single sequencing authority for correcting the current
TEAR repository, naming, workspace, documentation, wiki, and deployment state.
It does not itself authorize branch deletion, worktree removal, renaming,
merging, publishing, or deployment.

The program is a **gated sequence with an inner verification loop**. A later
goal cannot open until the current goal has a committed closure record and all
of its close conditions are checked. If later evidence invalidates an earlier
assumption, execution returns to the owning goal; it does not improvise around
the failed gate.

---

## 1. Permanent decisions

These are settled program truths, not questions for future implementers.

- [x] The redesigned TypeScript/Vite architecture under `src/` is the current
  game. The retired `js/` monolith is comparison/migration evidence only.
- [x] The canonical Final Five are, in stable order: **Sword, Hammer,
  Greatsword, Chainblade, Riftlock**.
- [x] Spear and Ringblade are retired weapon identifiers. They may remain only
  in migration maps, historical evidence, and clearly marked archived plans.
- [x] `main` is the only long-lived production branch for the game.
- [x] Cloudflare production must be attributable to one exact, green `main`
  commit. A separate deployment branch is forbidden.
- [x] TearBench keeps its name.
- [x] The permanent terminology direction is:

| Current/ambiguous term | Permanent term | Scope |
|---|---|---|
| TearScore | **TEAR Music** | Whole music product/repository identity |
| TearScore runtime | **Adaptive Soundtrack** | In-game adaptive playback engine |
| THE SIGNAL | **Music** | Player-facing music area |
| Foundry Studio (audio) | **Soundtrack Desk** | Private soundtrack operations application |
| Foundry (agent training) | **Training Operations** | Automated agent-training operations |
| State Forge / State Forge Studio | **Scenario Console** | Deterministic scenario construction and inspection |
| Ghost Studio | **Replay Editor** | Replay editing surface |
| Ghost Lab | **Replay Hub** | Replay inspection and navigation surface |
| TearBot | **Game Agent** | Scripted/learned gameplay agent |
| Academy | **Training Archive** | Curated training data and review surface |
| Watch Agent | **Run Monitor** | Active/aggregate run observation |
| TearBench | **TearBench** | Verification and evidence program; unchanged |

Compatibility identifiers may temporarily retain old strings, but user-facing
copy, canonical documentation, new APIs, and new files must use the permanent
terms. Compatibility names require explicit expiry tracking.

---

## 2. Re-audited ground truth

### 2.1 Game repository

- The root worktree is clean and `main` equals `origin/main` at `0bef91d`.
- The repository initially had **37 local branches**, **20 remote heads** plus
  the `origin/HEAD` symref, and **16 registered worktrees**.
- Sixteen local branches are `rescue/*`; most are recovery pointers rather
  than active product lines.
- One local-only tag (`p5-green`), one stash, and 26 currently unreachable
  commits are not durable remote backups. They must be included explicitly in
  G0 preservation before any pruning or ref deletion.
- `experiment/system-memory-wave-run` incorrectly tracks `origin/main` rather
  than a same-name remote (or no upstream), which makes its status misleading.
- Automatic remote-branch deletion after merge is disabled, directly
  contributing to branch accumulation.
- Most named feature branches have already merged into `main` and now add
  navigation risk without preserving unique work.
- `main` has no GitHub branch protection or repository ruleset.
- Open PR #1, `cloudflare/workers-autoconfig -> main`, is obsolete and unsafe:
  it configures Cloudflare assets from the repository root rather than
  `dist/standalone`. It must never merge.
- `pnpm deploy` runs the release gate and then invokes Wrangler locally, but it
  does not prove that the checkout is clean `main`, equals `origin/main`, or
  corresponds to a successful GitHub check.
- Current `main`'s GitHub **Validate** run failed because the Colossus browser
  parity journey did not observe continued fixed ticks after the intro.
- Cloudflare was nevertheless deployed after that failure. GitHub's
  `Workers Builds: tear` check maps the production build and version
  `5f1d5e2d-5d10-4c73-9eb2-0b7f7066f47b` to exact game commit `0bef91d`, so
  the current deployment is externally attributable. However, Cloudflare
  version metadata and the public artifact do not expose that Git SHA, and the
  deployment was allowed to pass while the repository's full Validate check
  failed. Production is therefore **identifiable but uncertified**, and its
  provenance currently depends on the GitHub integration record rather than a
  self-identifying release artifact.
- The configured `tear-ghost-publication` Worker does not currently exist in
  the authenticated Cloudflare account. Its checked-in configuration is not
  proof of a deployed service.

### 2.2 Music repository

The following is the G0-era baseline inventory, retained for historical
comparison. The live Stage 1/Stage 2 refs and worktree status are timestamped
in the G2-A ledger; do not read these baseline values as current heads.

- The repository still named `tear-score` is clean, but its checked-out branch
  is `codex/samply-dropbox-review-sync`, not `main`.
- That branch is **51 commits ahead and zero behind** `main`. It contains the
  substantial music application, owned-stem catalog, Soundtrack Desk
  implementation, promotion controls, and the canonical-main target guard.
- Music `main` remains at `766b910` and does not contain those 51 commits.
- There is no open PR, no protected `main`, no ruleset, and no workflow active
  on the default branch.
- The game vendors music engine commit `7633f1e`. That commit is reachable from
  the two music feature branches but **not from music `main`**. Consequently,
  the game has hash-valid vendored provenance, but the upstream canonical
  branch does not retain the referenced source revision.
- The earlier canonical-main promotion guard at `1611bbb` is implemented only
  on the feature branch. It is not yet a canonical repository guarantee.
- The current branch name understates its scope; it is effectively the
  complete modern music program rather than a narrow Samply/Dropbox change.
- `codex/tearscore-pristine-ost` is six commits ahead of music `main`; its tip
  is already contained in the larger 51-commit branch.
- The game bundle uses the pinned `7633f1e` engine/runtime and current music
  catalog data. It does not embed or prove deployment of the newer private
  soundtrack operations application.

### 2.3 Wiki repository and public wiki

The following is the G0-era baseline inventory, retained for historical
comparison. The live protected/default `origin/master` and stale local
checkout are timestamped in the G2-A ledger; do not read these baseline
values as current branch or ruleset state.

- `tear-wiki` is a separate repository whose pre-fetch local `master` was
  clean but seven sync commits behind live remote `master` (`b57efda`). The G0
  non-pruning fetch refreshed only the remote-tracking ref; nothing was merged.
- The public wiki responds successfully through Cloudflare, but it is served
  by the `tear-wiki` Worker, not Cloudflare Pages. The authenticated account
  has no Pages projects, and the latest wiki Worker production deployment is
  version `b72b4f0e-5ae0-4439-9b74-cca7d3fd8d1c` from 2026-07-28. Successful
  hosting therefore does not mean current content or current source.
- The game-side `Synchronize TEAR Wiki` workflow succeeds and sends the exact
  game commit.
- The wiki-side workflow has failed continuously since 2026-07-17. It attempts
  to fetch `js/utils.js` and the retired JS-era module set, receives HTTP 404,
  and never reaches build or commit.
- The wiki's generated source record is stale at game commit `c601874...`.
- The public sitemap has no canonical Final Five weapons area, and the
  synchronizer cannot represent the redesigned weapon/catalog contracts.
- The wiki sync currently runs once explicitly and again through its `build`
  script, duplicating work even after the source contract is repaired.
- Wiki `master` is not protected.
- Wiki PR #1 (`cloudflare/workers-autoconfig -> master`) is an unstable,
  failed, wide-scope deployment conversion and must not merge as-is.

### 2.4 Naming and identity

- Ambiguous names are present in runtime copy, source symbols, filenames,
  package names, persistence keys, routes, tests, generated evidence, and
  historical specifications.
- `Foundry` currently means both soundtrack operations and agent training.
- `Studio` is used for several unrelated inspection/authoring surfaces.
- `TearScore`, `THE SIGNAL`, `State Forge`, `TearBot`, `Academy`, `Ghost Lab`,
  and `Watch Agent` are embedded deeply enough that a global search/replace
  would break persisted data, hashes, tests, routes, and provenance.
- Historical TearBench source and generated requirement records are
  hash-bound evidence. They must not be rewritten merely to modernize names.
  Canonical terminology should be supplied through a terminology registry and
  historical-name annotations.
- Retired Spear/Ringblade references in `weapon-selection` migration tests are
  valid. References in active-facing plans or wiki copy are stale.

### 2.5 Directory and workspace organization

- The game `src/` tree is intentionally domain-separated. Its main directories
  (`app`, `gameplay`, `simulation`, `presentation`, `audio`, `agents`,
  `tearbench`, `ghost`, `replay`, `platform`, and others) should not undergo a
  cosmetic broad rearrangement.
- The repository root mixes active operations documents, historical plans,
  experiments, generated logs, and configuration. The code architecture is
  substantially cleaner than the root information architecture.
- `plans/` mixes active TearBench handoffs, completed Final Five work, QA notes,
  and obsolete Spear/Ringblade state-machine plans.
- `docs/` mixes current architecture, generated evidence, historical source,
  checkpoint receipts, and player/product documentation without an index that
  clearly distinguishes authority.
- The tracked `tear-wiki/` directory in the game repository contains only one
  handoff document. It is not the actual sibling wiki repository and invites
  confusion.
- Large generated evidence is intentionally ignored under `artifacts/`, but
  the local repository has no retention/cleanup policy for it.
- Ignored nested bisection repositories under `artifacts/t26w/` must be treated
  as possible Git object owners during preservation, not as ordinary cache
  files.
- `.gitattributes` still mentions removed `js/DESIGN_SYSTEM.md`, and
  `.gitignore` retains a pre-architecture dependency-directory rule. These are
  minor stale-policy evidence, not reasons to restore the old layout.
- The broader `Desktop/game` workspace contains about two dozen orphaned
  `gsm-*` worktree directories whose `.git` files point to a missing
  `game-system-memory` repository. They consume several gigabytes and are not
  valid worktrees.
- `Tear-main-publication` and `Tear-receipt-clean` are large non-Git directory
  copies. They must be inspected for unique files before recoverable removal.
- The dated Git recovery directory contains a preservation bundle and audit
  records and should be consolidated into a deliberate archive location, not
  discarded as clutter.

---

## 3. Program state machine

Only one goal may be **OPEN** at a time.

| Order | Goal | Initial state | Opens when | Closes when |
|---:|---|---|---|---|
| G0 | Freeze and record truth | ELIGIBLE | User authorizes execution | Baseline ledger and backups are verified |
| G1 | Establish release authority | LOCKED | G0 closed | Protected, green, attributable release path exists |
| G2 | Reconcile unique work and canonical branches | LOCKED | G1 closed | All unique refs have a written disposition and canonical branches contain approved work |
| G3 | Remove obsolete refs and normalize worktrees | LOCKED | G2 closed | Branch/worktree targets are met and recovery is proven |
| G4 | Normalize permanent terminology | ACCEPTANCE-COMPLETE / PR APPROVED | G3 closed | Public/internal names and migrations pass their gates; protected merge/post-merge observation closes the goal |
| G5 | Organize repositories, documents, and workspace | OPEN | G4 closed | Information architecture and local workspace policy are enforced |
| G6 | Replace the wiki synchronization contract | LOCKED | G5 closed | Wiki proves exact current game SHA and modern content |
| G7 | Certify and deploy the converged program | LOCKED | G6 closed | Live game/wiki provenance and post-deploy evidence match |
| G8 | Operate the prevention loop | LOCKED | G7 closed | Never permanently closes; produces recurring evidence |

No prior ad-hoc work automatically closes a goal. Every goal needs a new
closure record from the final intended commit state.

### Mandatory loop inside every goal

Every goal repeats this loop until all close conditions pass:

1. **Observe** — refresh read-only state and compare it with this baseline.
2. **Constrain** — list the exact files, refs, worktrees, services, and external
   actions in scope.
3. **Preserve** — create the rollback point required by that goal.
4. **Change** — make one narrow, reviewable slice.
5. **Disprove** — run the smallest canonical check able to reject the slice.
6. **Pause** — state what is complete, what remains, and whether assumptions
   changed.
7. **Integrate** — commit/PR only the reviewed slice.
8. **Close or repeat** — record evidence; never advance with a failing check.

Common pause checklist:

- [ ] Current branch and worktree are the intended ones.
- [ ] The diff contains no unrelated user work.
- [ ] The source-of-truth assumption still matches the refreshed audit.
- [ ] Completed objectives and remaining objectives are written down.
- [ ] The next action does not cross a deployment/deletion boundary without
      explicit authority.
- [ ] A failure reopens the current goal rather than being waived.

---

## 4. G0 — Freeze and record truth

**Goal:** Make every subsequent operation recoverable and prevent further
unattributed production or branch mutation while normalization is underway.

### Entry checklist

- [x] User explicitly authorizes execution of G0.
- [x] Game, music, and wiki working trees are rechecked for user changes.
- [x] No agent/editor bridge besides the designated executor has write
      authority.

### Objectives

- [x] Record exact local/remote refs, worktrees, open PRs, default branches,
      tags, stashes, upstream mappings, GitHub checks, Cloudflare versions, and
      public endpoint headers.
- [x] Record all unreachable commits and inspect nested ignored Git
      repositories before garbage collection or artifact cleanup.
- [x] Create temporary archival refs for every chosen unreachable or
      reflog-only object before bundling; prove those refs from a fresh bundle
      clone before any local reference is removed.
- [x] Create a dated Git bundle for **every ref** in the game repository.
- [x] Create separate dated bundles for the music and wiki repositories.
- [x] Generate SHA-256 records and prove each bundle with `git bundle verify`.
- [x] Run `git fsck` and retain its output with the baseline ledger.
- [x] Create annotated immutable tags for the legacy oracle (`ee5e931`) and any
      baseline that is proven necessary after review.
- [x] Record, but do not delete, every non-Git copy and orphaned worktree path.
- [x] Declare a temporary production change freeze until G1 closes.

### Checkpoint G0-A — midpoint pause

- [x] All three repositories have bundle and hash evidence.
- [x] Every unique local commit is reachable from a bundle or annotated tag.
- [x] External deployment state is recorded without changing it.
- [x] Remaining unknown ownership is listed explicitly.

### Close conditions

- [x] A new clone can list all preserved refs from each bundle.
- [x] The baseline ledger is committed on a short-lived plan/governance branch.
- [x] No branch, worktree, file copy, PR, or deployment has yet been deleted.
- [x] G0 closure record is approved; only then may G1 open.

---

## 5. G1 — Establish release authority

**Goal:** Make it impossible to deploy an unverified or unidentifiable commit
through the ordinary project workflow.

### Game repository objectives

- [x] Diagnose and correct the current Colossus fixed-tick browser failure from
      a fresh branch based on current `main`; do not weaken the assertion.
- [x] Require a green `Validate` check on pull requests and `main`.
- [x] Add a GitHub ruleset for `main`: block force-push and deletion, require
      PR integration, require current status checks, and preserve administrator
      recovery without allowing routine bypass.
- [x] Enable automatic deletion of merged remote feature branches.
- [x] Add a release preflight that fails unless the checkout is clean, on
      `main`, has `origin/main` as upstream, is exactly equal to it, and has the
      expected release evidence.
- [x] Move production deployment into a GitHub Actions environment named
      `Production` with protected secrets and an explicit approval boundary.
- [x] Keep a guarded local dry-run/preview path; do not leave an ordinary local
      command able to publish from an arbitrary branch.
- [x] Generate deterministic build metadata containing repository, full Git
      SHA, build target, and artifact hash. Do not use a wall-clock value in
      reproducible assets.
- [x] Attach the Git SHA to Cloudflare deployment annotations/message and make
      it observable through a small build-info asset or response.
- [x] Make the wiki dispatch consume a successful game validation/release event
      for the exact SHA instead of firing independently on every push.

### Music and wiki bootstrap objectives

- [x] Add minimal CI to music `main` before attempting the 51-commit promotion.
- [x] Add protected-branch rules to music `main` and the wiki default branch.
- [x] Define the safe migration procedure for wiki `master -> main`, including
      the `tear-wiki` Worker build/source configuration and custom-domain
      routing, before changing it.

### Checkpoint G1-A — midpoint pause

- [x] Current game `main` now has a green full gate from the exact candidate.
- [x] A simulated wrong-branch, dirty-tree, behind-main, and ahead-main deploy
      is rejected before Wrangler runs.
- [x] Cloudflare dry-run still uploads only `dist/standalone`.
- [x] Music and wiki cannot accept unreviewed direct production changes through
      the normal path.

### Close conditions

- [x] One non-production deployment rehearsal proves commit attribution.
- [x] Branch protections/rulesets are exported to the closure record.
- [x] PR #1 is formally marked **DO NOT MERGE**; deletion waits for G3.
- [x] The game release gate is green. Targeted checks alone do not close G1.
- [x] G1 closure record is approved; G2 is eligible for reviewed integration.

---

## 6. G2 — Reconcile unique work and canonical branches

**Goal:** Decide what every divergent line means before deleting anything, and
place approved modern work on the correct canonical branch through review.

### Game unique-work queue

| Ref | Verified unique content | Required disposition |
|---|---|---|
| `codex/cutting-room-2` | Four unique modern commits | Focused feature audit; migrate approved slices from current `main`, test, then integrate or archive |
| `experiment/system-memory-wave-run` | Two experimental commits | Keep quarantined only if experiment is active; otherwise archive as tag/bundle |
| `codex/main-repair-weapon-core` | Alternative one-commit guard fix | Compare against current `main`; retain only missing behavior, never merge blindly |
| detached `426b4ff` | Alternate receipt/evidence line | Compare with merged successor; archive unless it contains unique valid evidence |
| rendering and pristine-OST plan branches | Unique planning documents | Preserve approved documents in canonical plan/archive locations, not as permanent branches |
| `archive/invalid-legacy-final-five-weapon-roster` | 41 legacy JS commits | Never merge; preserve only as clearly named historical archive/tag/bundle |
| `feat/tear-score-integration` | Eight legacy JS/audio commits | Never merge; modern vendored engine supersedes it; archive only |
| `rescue/*` | Recovery/WIP pointers | Compare hashes against archive refs and `main`; preserve genuinely unique material, then retire refs in G3 |

### Music canonicalization objectives

- [x] Audit the full 51-commit candidate as a release train, including source,
      generated audio, licenses, large binaries, secrets, local paths, and
      promotion boundaries.
- [x] Run the candidate's complete `pnpm check` from a clean checkout.
- [x] Verify that vendored game commit `7633f1e` remains reachable after the
      proposed music-main integration.
- [x] Review the canonical game-root guard at `1611bbb` against the actual game
      root and the new G1 release policy.
- [x] Integrate through a reviewable PR after music CI exists. Because the
      branch is zero-behind, preserve its intentional commit history unless a
      specific commit is rejected; do not collapse it merely for cosmetic
      neatness.
- [x] Delete no source branch until the merged music `main` passes CI and a
      fresh clone can build the same adapter/vendor artifacts.

### Checkpoint G2-A — midpoint pause

- [x] Every unmerged game ref has a written `integrate`, `archive`, or
      `reject-never-merge` decision. See
      `docs/checkpoints/program-normalization/G2_A_DECISION_LEDGER.md` for the
      exact ref-level ledger and the separate quarantine/hold decisions.
- [x] Every decision names its evidence and rollback ref.
- [x] Music candidate scope and provenance are fully reviewed. The candidate
      passed the clean-clone audit, full gate, vendored-source reachability
      proof, canonical-game guard review, and protected PR merge.
- [x] No legacy JS implementation has entered modern `main`; the definitive
      Final Five policy rejects legacy re-entry.
- [x] Cutting Room is recorded as superseded by the current `main` lineage;
      its shipped Field Test contract is Charger evade followed by recovery
      punish, while launch/projectile mixed testing remains future-only.
- [x] Wiki canonical-branch decision is recorded: retain `master` during G2;
      defer the broken data-contract migration to G6.

### Close conditions

- [x] Game `main` contains all approved unique modern work and none of the
      rejected legacy lines.
- [x] Music `main` contains the approved modern music program and the vendored
      game source commit is reachable from it.
- [x] Wiki canonical branch migration decision is recorded but the broken data
      contract remains scheduled for G6.
- [x] The three canonical remote refs are clean, protected, and green at the
      recorded integration commits. The wiki remains on protected `master`;
      its migration and synchronization repair remain deferred to G6. Stale
      local worktrees are explicitly G3 scope and are not represented by this
      remote-ref check.
- [x] G2 is closed by the protected merge of PR #9. This checkbox is
      authoritative only when this record is present on protected `main`;
      G3 remains eligible only after a fresh post-merge ref observation.

### G2 final pause and boundary

The final G2 state is recorded in
`docs/checkpoints/program-normalization/G2_CLOSURE.md`. The integrated game
change is the exact game PR #8 squash merge `85f1ec9`; the music PR #3
merge commit on protected `main` is `1ba4ee4`, with its restored source
branch at `4f7a872`. The game PR #8 source branch remains at `d2b5855`.
The canonical Final Five remains **Sword, Hammer, Greatsword, Chainblade,
Riftlock**. All preserved branches and worktrees remain intact, and Cloudflare
production remains frozen with no deployment performed. Protected PR #9 is the
approval mechanism; once this record is present on protected `main`, G2 is
closed and G3 is eligible only after a fresh post-merge ref observation
confirms these facts.

---

## 7. G3 — Remove obsolete refs and normalize worktrees

**Goal:** Reduce branches and worktrees to intentional active lines without
losing recoverability. **Acceptance:** complete by the consolidated audit and
the closure record at
`docs/checkpoints/program-normalization/G3_CLOSURE.md`; canonical closure
requires that record to land through protected `main` and pass its post-merge
observation.

### Game branches already merged and eligible after verification

- [x] `backup/main-pre-final-five-20260730` — removed by the exact G3
      allowlist; retained by the game all-ref/phase-4 bundles and archive tag
      coverage.
- [x] `codex/architectural-redesign` — removed by the exact G3 allowlist;
      retained by the game archive tag and restore assertions.
- [x] `codex/cutting-room-ghost3-integration` — removed by the exact G3
      allowlist; retained by the game archive tag and restore assertions.
- [x] `codex/final-five-weapon-roster` — removed by the exact G3 allowlist;
      retained by the game archive tag and restore assertions.
- [x] `codex/ghost3-autonomous-completion-plan` — removed by the exact G3
      allowlist; retained by the game archive tag and restore assertions.
- [x] `codex/main-normalization` — removed by the exact G3 allowlist; retained
      by the game archive tag and restore assertions.
- [x] `codex/pantheon-iv` — removed by the exact G3 allowlist; retained by the
      game archive tag and restore assertions.
- [x] `codex/pantheon-v` — removed by the exact G3 allowlist; retained by the
      game archive tag and restore assertions.
- [x] `codex/pantheon-vi` — removed by the exact G3 allowlist; retained by the
      game archive tag and restore assertions.
- [x] `codex/pre-main-switch-backup` — removed by the exact G3 allowlist;
      retained by the game archive tag and restore assertions.
- [x] `codex/tearscore-normalization` — removed by the exact G3 allowlist;
      retained by the game archive tag and restore assertions.
- [x] `codex/weapons-abilities-overhaul` — oracle tag verified before exact
      removal; the locked oracle remains at `ee5e93141d67cc02505b2227b3be0b10d1819e1c`.
- [x] `design-system` — removed by the exact G3 allowlist; retained by the
      game archive tag and restore assertions.

### Cleanup objectives

- [x] Close obsolete PR #1 without merging it. The legacy unsafe wiki PR #1
      was closed without merge before the retirement gate.
- [x] Remove clean registered worktrees for merged branches first, then remove
      their local branches, then their remote branches. Phase 4 records exactly
      48 local and 25 remote deletions; dirty worktrees were preserved.
- [x] Correct active-branch upstreams: all three canonical roots now have only
      local `main` tracking same-name `origin/main`; no feature branch remains
      to silently track `origin/main`.
- [x] Convert needed recovery branches into annotated tags and dated bundles;
      tags are historical pointers, not development lines. The original,
      phase-4, dirty-worktree, and wiki supplemental bundles all verify.
- [x] Keep the locked oracle worktree as comparison-only at
      `C:\Users\realm\Desktop\game\Tear-oracle`.
- [x] Keep at most the canonical main worktree, the locked oracle, and one or
      two explicitly active short-lived worktrees. The final registered state
      is game root plus locked oracle, music root, and wiki root only.
- [x] Delete no dirty worktree. Dirty game evidence was preserved by the phase
      2 receipts; no dirty registered worktree was removed by phase 4.
- [x] Remove the music feature branch only after its canonical merge and
      reproducibility proof. Music `main` is `1ba4ee4`; its clean `pnpm check`
      log is retained by the G2/G3 receipts.
- [x] Migrate wiki `master` to `main` only after GitHub default branch,
      Cloudflare Worker build/source settings, custom-domain routing, workflow
      triggers, local remotes, and documentation are updated as one
      rollback-capable slice. PR #3 performed the migration and PR #4 completed
      the workflow/retirement gate; Cloudflare remained frozen and unmutated.

### Target steady state

| Repository | Long-lived branches | Temporary branches | Historical storage |
|---|---:|---:|---|
| Game | `main` only | 0 normally; 1–2 active PR branches | annotated tags + offline bundles |
| Music | `main` only | 0 normally; 1–2 active PR branches | annotated tags + release/provenance records |
| Wiki | `main` only | 0 normally; 1 active PR branch | annotated release tags as needed |

### Checkpoint G3-A — midpoint pause

- [x] Branch deletion candidates are still reachable from verified backups;
      phase-4 coverage and restore assertions report zero failures.
- [x] `git worktree list` contains no stale registered worktree.
- [x] Remote branch list matches open PRs plus approved temporary exceptions:
      each canonical repository now has exactly one remote head, `main`, and
      zero open PRs.
- [x] The legacy oracle remains locked and clearly labeled.

### Close conditions

- [x] Fresh branch/ref inventory meets the target table: game, music, and wiki
      each have one local and one remote `main` branch.
- [x] Fresh clones of all three repositories select `main` and resolve the
      expected canonical commits.
- [x] No open PR targets legacy or unsafe deployment configuration; the three
      repositories report zero open PRs and the legacy wiki PR #1 is closed.
- [x] Restore drills from the original and phase-4 bundles, plus the wiki
      supplemental bundle, succeed with `git fsck --full` exit `0` and recover
      retired refs/tags.
- [x] G3 closure record is approved by protected merge and post-merge
      observation; that observation is recorded and G4 is acceptance-complete
      for its protected-main closure PR.

---

## 8. G4 — Normalize permanent terminology

**Goal:** Replace ambiguous product and subsystem names permanently while
preserving saves, replay evidence, routes, provenance, and historical truth.

### Naming architecture

- [x] Add one canonical terminology registry with: permanent display name,
      canonical code identifier, deprecated aliases, persistence impact,
      migration owner, and removal checkpoint.
- [x] Mark historical specifications and hash-bound TearBench sources as
      historical; do not rewrite their content or regenerate requirement IDs
      solely for naming.
- [x] Add a user-facing-copy check that rejects deprecated names outside
      explicit compatibility/history allowlists.
- [x] Add an active-roster check asserting the exact five weapon IDs and
      rejecting Spear/Ringblade outside migration/history allowlists.

### Migration order for every renamed subsystem

1. [x] Define the new canonical type/API and compatibility alias for the Music
       surface; retain the narrow `src/audio/signal` import shims.
2. [x] Add dual-read migration for the Music settings route and catalog format;
       write only the new form after migration while preserving settings fields,
       station IDs, and cue IDs.
3. [x] Change Music user-facing copy, navigation, settings accessibility labels,
       and snapshots; unrelated signal/event vocabulary remains unchanged.
4. [x] Rename the Music modules/files in a narrow subsystem PR with import and
       architecture checks.
5. [x] Update focused Music/settings tests and the non-historical G4-B checkpoint.
6. [x] Prove the old settings route, catalog format, and import aliases normalize
       to the canonical Music surface without changing semantic catalog content.
7. [ ] Remove compatibility aliases only at their recorded expiry checkpoint.

### Music-specific migration

- [ ] Rename the product and repository from TearScore/`tear-score` to TEAR
      Music/`tear-music` only after GitHub redirects, provenance URLs, package
      aliases, vendoring scripts, and the Soundtrack Desk target are ready.
- [ ] Rename the runtime concept to Adaptive Soundtrack.
- [ ] Rename the private app to Soundtrack Desk and prefer an explicit host such
      as `soundtrack.tearblade.com`; preserve a temporary redirect from the old
      host if it exists.
- [ ] Migrate `@tear-score/*`, `tear-foundry-*`, `tear-signal-*`, localStorage,
      SQLite, environment variables, CLI commands, custom elements, and API
      routes through explicit compatibility maps rather than search/replace.
- [ ] Keep old vendored artifact paths readable until the game has shipped and
      verified the new provenance contract.

### TearBench-program migration

- [ ] Keep `TearBench` and `src/tearbench` unchanged.
- [ ] Scenario Console, Training Operations, Replay Editor, Replay Hub, Game
      Agent, Training Archive, and Run Monitor become the canonical surfaces.
- [ ] Version codec/format aliases where names are serialized. Do not invalidate
      preservation-corpus hashes or replay schemas.

### Scenario Console first slice — G4-C-SCENARIO-CONSOLE

- [x] Add a canonical Scenario Console browser facade and export aliases while
      retaining the State Forge implementation, `src/tearbench` paths, and
      TearBench codec names.
- [x] Accept `scenario-console=1` as the canonical developer route and
      continue reading `stateforge`/`stateforge=1` without changing scenario,
      checkpoint, replay, capsule, or evidence identifiers.
- [x] Change the active panel heading and accessibility labels to Scenario
      Console; keep legacy DOM IDs and query links readable for C23 evidence.
- [x] Prove facade semantic equivalence and unchanged TearSDL fixture/hash
      behavior with focused compatibility tests.
- [x] Complete the Scenario Console compatibility slice: canonical DOM/route
      aliases for the old deep links and explicit dual-read/semantic-equivalence
      coverage for TearSDL, checkpoint/timeline, replay/capsule, and evidence
      boundaries, while retaining all legacy selectors and identifiers.
- [ ] Retire State Forge UI/route aliases only after the registry removal
      condition `G4-C-SCENARIO-CONSOLE` is signed; this remains unproven.

### Replay surfaces compatibility slice — G4-D-REPLAY-SURFACES

- [x] Establish canonical Replay Editor and Replay Hub API/module names over
      the existing replay, Ghost Studio, and Ghost Lab implementations.
- [x] Write canonical `replay-hub=1` browser links while continuing to read
      `ghostlab=1`; retain the `replay`/`ghostlab` screen IDs and old action IDs.
- [x] Add canonical Replay Editor/Replay Hub action aliases and route resolution
      with semantic-equivalence coverage for old actions and bookmarks.
- [x] Update active copy/accessibility to Replay Editor and Replay Hub while
      preserving `ghost-studio-edl` v1, EDL source/root/clip/hash fields, replay
      schemas, capsule hashes, evidence IDs, and legacy DOM selectors.
- [x] Prove canonical/legacy EDL creation and local export produce identical
      bytes and hashes through focused compatibility tests.
- [x] Record proportional typecheck, architecture, terminology, active-roster,
      focused test, browser journey, and diff evidence in the G4-D checkpoint.
- [ ] Retire Ghost Studio/Ghost Lab aliases only after registry conditions
      `G4-D-REPLAY-EDITOR` and `G4-D-REPLAY-HUB` are signed; this remains
      unproven.

### Adaptive Soundtrack loader compatibility slice — G4-E-ADAPTIVE-SOUNDTRACK

- [x] Establish canonical `AdaptiveSoundtrackClient`,
      `AdaptiveSoundtrackMusicBackend`, and
      `preparePinnedAdaptiveSoundtrackClient` game-facing facades over the
      existing pinned audio contract.
- [x] Make runtime loading canonical-first for the future
      `public/vendor/tear-music/adaptive-soundtrack.esm.js` pair, while
      delegating absent/unloadable canonical assets to the current pinned
      `public/vendor/tear-score/*` preparation path.
- [x] Preserve current vendored bytes, `TearScore*` adapters/imports, backend
      identifiers, replay metadata readers/fields, shared AudioContext,
      exactly-one backend behavior, and lifecycle/failure fallback semantics.
- [x] Add focused loader-order, canonical-success, fallback, concurrent
      preparation, shared-host, backend lifecycle, and replay metadata tests.
- [x] Vendor the accepted `shaku1z/tear-music` schema-v2 ESM entrypoint
      byte-exactly, with its manifest, independent provenance, paired Tone
      host/license, and fixed source commit/hash record.
- [x] Add a canonical Adaptive Soundtrack provenance check and same-limit
      bundle budget while retaining the legacy TearScore check/key and path.
- [x] Record the compatibility boundary in the terminology registry and
      `docs/checkpoints/program-normalization/G4_E_ADAPTIVE_SOUNDTRACK.md`.
- [x] Record proportional typecheck, architecture, terminology, focused audio,
      browser lifecycle, provenance, and diff evidence in the G4-E checkpoint;
      hosted Validate and protected merge remain pending.
- [ ] Retire the old `tear-score` loader/path only after the canonical artifact,
      paired Tone host, provenance, replay, and hosted audio lifecycle gates are
      signed; this remains unproven.

### Game Agent and Run Monitor compatibility slice — G4-F-GAME-AGENT-RUN-MONITOR

- [x] Establish canonical Game Agent and Run Monitor module/API facades over
      the preserved TearBot evaluation and Watch Agent runtime implementations.
- [x] Write canonical `game-agent`/`run-monitor` route and query vocabulary,
      while continuing to read `botevidence`/`tearbot`, `watch`, and
      `watchagent` aliases without changing screen IDs or action evidence.
- [x] Add canonical Game Agent and Run Monitor action aliases; existing
      `replay.hub.*` and `ghostlab.*` action tokens remain readable.
- [x] Update active normal-build copy, accessibility labels, navigation, and
      overlays to Game Agent and Run Monitor; the test-only Watch Agent panel
      remains available through its legacy route.
- [x] Preserve calibration/ladder/V3 evaluation formats, persistence keys,
      `watch-policy:v1:*` journal identity, post-promotion authority records,
      evidence IDs, and hashes byte-for-byte through focused compatibility tests.
- [x] Record the G4-F boundary and proportional evidence in
        `docs/checkpoints/program-normalization/G4_F_GAME_AGENT_RUN_MONITOR.md`.
- [x] Confirm the proportional browser/build evidence and compare production
      output against protected `main`; no test-only agent bridge/global/panel
      markers reach production, and no production bridge or global was added.
- [ ] Retire TearBot/Watch Agent aliases only after the registry conditions
      `G4-F-GAME-AGENT` and `G4-F-RUN-MONITOR` are signed; this remains
      unproven.

### Training Archive compatibility slice — G4-G-TRAINING-ARCHIVE

- [x] Establish canonical Training Archive module/API facades over the
      existing Academy custody, consent, inspection, and corpus stores;
      keep Academy implementation paths, durable keys, and record formats.
- [x] Keep the headless intake compatibility facade TearBench-owned so the
      production agents barrel cannot reach `src/tearbench` through the new
      normal-build facade.
- [x] Write canonical `training-archive` route/query/action vocabulary and
      canonical menu/Ghost Lab links while continuing to read `academy` and
      `agent-academy` routes, query flags, screen IDs, and Academy actions.
- [x] Update active normal-build copy, navigation, and accessibility-facing
      Training Archive labels without renaming the underlying Academy screen
      contract or persistence namespaces.
- [x] Prove canonical/legacy route normalization, action pairing, exact API
      identity, unchanged `tear-behavior-cloning-dataset` bytes/root hashes,
      and the preserved `tearbench-production-headless-academy-intake`
      boundary with focused compatibility tests.
- [x] Update the narrow Training Archive terminology allowlists and record
      the G4-G checkpoint evidence without changing Training Operations or
      Foundry implementation names.
- [ ] Run final proportional hosted validation and open the protected-main
      PR; protected merge, post-merge validation, and deployment remain
      outside this slice until reviewed.
- [ ] Retire Academy/Agent Academy aliases only after the registry condition
      `G4-G-TRAINING-ARCHIVE` is signed; this remains unproven.

### Training Operations compatibility slice — G4-H-TRAINING-OPERATIONS

- [x] Establish a canonical Training Operations agent, application, and
      presentation facade over the safe local job, schedule, recovery,
      launch-profile, and bootstrap APIs; keep the Foundry implementation
      modules and public screen ID as compatibility boundaries.
- [x] Write canonical `training-operations` route/query/action vocabulary and
      canonical menu/Ghost Lab links while continuing to read `foundry` links,
      screen IDs, and action IDs.
- [x] Update active normal-build copy, navigation, and accessibility-facing
      labels to Training Operations without changing persisted namespaces or
      authority inputs.
- [x] Prove canonical/legacy route normalization, action pairing, exact safe
      API identity, and unchanged `tear-foundry-*` job/schedule bytes, formats,
      hashes, and durable keys with focused compatibility tests.
- [x] Retain all v1-v4 execution-binding, promotion, monitoring, rollback,
      online-launch authority, and hash-bound receipt modules unchanged; their
      canonical rename remains a later gated slice.
- [x] Run proportional focused typecheck, architecture, terminology,
      active-roster, browser/build, production-isolation, lint, and diff gates.
- [x] Update the narrow Training Operations terminology expiry references and
      record the retained legacy boundary in
      `docs/checkpoints/program-normalization/G4_H_TRAINING_OPERATIONS.md`.
- [x] Commit, push, and open protected-main PR #19 at head
      `b65ed8369abb8be5e3f6211b042f7d3ae9099cf6`.
- [x] Final hosted Validate passed: run `32623991184`, job `97156393776`.
- [ ] Protected merge, post-merge validation, deployment, and Cloudflare
      changes remain outside this slice; do not merge or deploy here.
- [ ] Retire Foundry aliases only after the registry condition
      `G4-H-TRAINING-OPERATIONS` is signed; this remains unproven.

### Checkpoint G4-A — midpoint pause

- [x] Public surfaces use only permanent terms.
- [x] Deprecated identifiers appear only in allowlisted migration/history code.
- [x] Old save/replay/audio fixtures pass migration tests.
- [x] TearBench requirements and preserved evidence retain their original
      hashes and historical wording.

### Close conditions

- [x] Game full gate passes.
- [x] Music full gate passes.
- [x] Wiki content contract schema uses the permanent public names.
- [x] Terminology registry has no alias without an owner and expiry condition.
- [x] G4 closure record reached protected `main` and its post-merge
      `Validate`/ref observation is green; G5 is open.

---

## 9. G5 — Organize repositories, documents, and workspace

**Status:** OPEN after protected G4 merge and post-merge `Validate`/ref
observation. This section records the bounded baseline, authority indexes, and
the completed report-driven whole-root preservation operation; no deletion or
bulk reorganization is claimed.

The bounded G5 baseline is recorded in
`docs/checkpoints/program-normalization/G5_BASELINE_INVENTORY.md`; the completed
preservation receipt is recorded in
`docs/checkpoints/program-normalization/G5_WORKSPACE_PRESERVATION.md`. The
authority indexes are `docs/README.md` and `plans/README.md`; they classify the
current tree without claiming that the remaining workspace or artifact lanes
are complete.

This G5 docs-checker slice adds `scripts/check-docs.mjs`, its focused permanent
`tests/docs-authority-checker.test.mjs` coverage, and the `check:docs`/`test:docs`
package commands, both gated immediately after `requirements:check` in
`check:functional`. The checker scans only tracked root/docs/plans/tear-wiki
Markdown, validates local links without network access, enforces the exact
three-file root table, and asserts the ten fixed TearBench paths remain present.
The separate document-placement slice updates only the approved Markdown
locations and their authority checks; no workspace cleanup, dependency change,
or production mutation is claimed.

**Goal:** Make authority obvious without destabilizing the working architecture.

### Intended game repository information architecture

```text
Tear/
  .agents/                 project skills and agent policy
  .github/                 CI and release workflows
  config/                  machine-readable budgets and policies
  docs/
    architecture/          current technical authority
    operations/            deployment, platform, recovery, contribution
    product/               current feature and terminology contracts
    evidence/              indexes and generated evidence pointers
    checkpoints/           immutable program checkpoint records
    history/               superseded designs and completed plans
    source/                preserved source specifications
  plans/
    active/                the few executable current plans/handoffs
    completed/             closed plans with closure references
    archive/               superseded plans retained for history
  experiments/             explicitly non-production labs
  preservation/            small tracked preservation manifests
  public/                  shipped static assets and verified vendor inputs
  scripts/                 repository automation
  src/                     current typed application architecture
  tests/                   permanent automated evidence
  workers/                 Cloudflare Worker source
```

This is a target classification, not permission for a bulk move.

### Repository organization objectives

- [x] Add `docs/README.md` and `plans/README.md` authority indexes before moving
      documents.
- [x] Classify every root Markdown file as current authority, active plan,
      completed plan, or history.
- [x] Move root redesign/audit/economy/enemy/shop/mirror plan documents through
      link-checked placement slices; the first two are in `docs/history/` and
      this slice places Economy, Enemy/Boss, Shop, and Phase F in their
      classified destinations.
- [x] G5 disposition: preserve the game repo's
      `tear-wiki/Weapons-and-Abilities.md` as a
      G6-owned handoff exception. G5 does not move or rewrite it. G6 may
      relocate or supersede it only within the manifest-backed wiki
      synchronization transaction, after the game manifest schema and wiki
      consumer contract are ready; until then it remains comparison/handoff
      material.
- [x] Classify `experiments/coop-lab.html` as an experiment and move it after
      updating its tracked references and external-network/export rationale.
- [x] Relocate `scripts/serve.py` as the documented repository-root helper;
      its loopback, bounded PNG, and create-only save contract is covered by
      `tests/serve-contract.test.mjs`.
- [x] G5 disposition: retain generated TearBench catalogs in their existing
      path-bound locations. No G5 move is authorized; any future relocation
      requires a separately reviewed atomic scripts+paths+CI migration.
- [x] Add `scripts/check-docs.mjs` as the scoped link/path and documentation
      authority check; `pnpm check:docs` is included immediately after
      `requirements:check` in the functional gate, with focused `test:docs`
      coverage for canonical success and negative link/table cases.
- [x] Add the bounded, read-only artifact retention policy and report command;
      generated artifacts remain ignored and never enter deployment bundles.
- [x] Add the portable, report-only external workspace recovery policy and
      bounded exact-name reporter. It requires explicit roots, owner, and
      retention date, records protected/review/no-go evidence, and never scans
      archive/recovery roots or emits quarantine eligibility. Running the real
      local inventory remains separately evidenced; artifact quarantine remains
      a separate unchecked goal.
- [x] Add the read-only, new-only, integrity-bound quarantine-manifest
      preparer. It consumes a supplied report, revalidates exact clean-main and
      source evidence, and plans only a new same-volume destination mapping with
      `applyAuthorized:false`; it creates no destination and authorizes no
      quarantine, move, or deletion.
- [x] Add the acknowledgement-gated, apply-only whole-root preservation
      journal. It performs same-volume renames only after stable manifest
      revalidation, records numbered immutable events and a completion receipt,
      and supports safe resume; restore remains a separate future slice.
- [ ] Add `quarantine-artifacts.mjs` only after the report manifest, owner,
      retention date, and recovery procedure receive a separate review; no
      quarantine or deletion is authorized by the report slice.
- [x] Add `pnpm check:workspace` to verify canonical-root identity, expected
      repository structure, active terminology allowlists, exact Final Five
      IDs, generated-document freshness, worktree integrity, and deployment
      root safety.
- [x] G5 disposition: keep the current `src/` domain boundaries unchanged in
      G5. A future focused refactor requires measured architecture evidence and
      a separate review.

### Local workspace objectives

- [x] Inventory and hash orphaned `gsm-*` directories; compare for files not
      reachable from preserved repositories or bundles. The completed operation
      consumed `workspace-recovery-report-753e456.json`, SHA-256
      `f8fd04b326bbd44a5ddc16462996e41e27dde4e63a9f01305d98b60d3ee90ab2`,
      against protected `main` `753e456`.
- [x] Preserve the reviewed source roots in the clearly named
      `quarantine-payload-753e456` recovery location before any deletion. The
      completion receipt records 28 sources, 61 journal events, event-log
      SHA-256 `73d08dc4421dcf961c09d0a4e4cbb9d541eb9d64f433bc7e2db3648326458ff4`,
      retention through `2026-11-23T23:59:59Z`, and manual reverse-move
      prerequisites. No deletion occurred.
- [ ] Inspect non-Git `Tear-main-publication` and `Tear-receipt-clean` copies for
      unique files; dispose of them recoverably only after evidence says none
      are needed.
- [ ] Treat `C:/tmp/Tear-main-publication` as forbidden for development and
      deployment. It is an unregistered, divergent copy and is the likely
      residue behind the earlier `main is already used by worktree` conflict.
- [x] Keep the dated recovery bundle in the dedicated `Tear-archives`
      location outside active repositories, with
      `workspace-quarantine-manifest-753e456.json` (SHA-256
      `bb23434cf259a9a7ef70e5477e770bb84a467afc04755891d58490b007d83da7`),
      `workspace-quarantine-journal-753e456`, and the completed receipt.
- [ ] Adopt one parent layout for canonical repositories, active worktrees,
      scratch output, and archives. Do not hardcode the user's absolute path in
      repository logic.
- [ ] Update Soundtrack Desk configuration to discover/validate the canonical
      game repository rather than pointing at disposable publication copies.

### Checkpoint G5-A — midpoint pause

- [ ] Every proposed move has a reference/import/link search result.
- [ ] No build, CI, Vite, Wrangler, TearBench, vendoring, or wiki path is broken.
- [x] Quarantined local data has an integrity-bound manifest and recovery
      window; hashes are recorded where policy permits and protected entries
      remain metadata-only. See the G5 workspace-preservation receipt for the
      manifest, journal, receipt, and retention date.
- [ ] `src/` changes, if any, are justified by architecture evidence rather
      than aesthetics.

### Checkpoint G5-B — completed whole-root preservation

The exact operation evidence and fail-closed manual reverse-move procedure are
recorded in
`docs/checkpoints/program-normalization/G5_WORKSPACE_PRESERVATION.md`.
This checkpoint closes only the bounded preservation lane. G5 remains OPEN for
the remaining non-Git copy review, parent-layout and Soundtrack Desk policy
work, artifact-retention/quarantine decisions, and the final close conditions.

### Close conditions

- [ ] Root contains only operational entrypoints/configuration and intentionally
      root-level project documents.
- [ ] Documentation indexes identify exactly one current authority per topic.
- [ ] Active plans are few, named, and have owners/close conditions.
- [ ] Workspace has no invalid `.git` pointer and no unexplained large clone.
- [ ] Full game and music gates pass after final path changes.
- [ ] G5 closure record is approved; only then may G6 open.

---

## 10. G6 — Replace the wiki synchronization contract

**Goal:** Make the wiki consume a stable, typed, versioned representation of
the modern game at an exact verified commit.

The game repo's `tear-wiki/Weapons-and-Abilities.md` is a G6-owned handoff
exception. G6 may adopt, relocate, or supersede it only as part of the exact
SHA game-reference manifest transaction, preserving its handoff/history
semantics and recording the resulting path and hash in the G6 receipt.

### Game-owned manifest

- [ ] Define a JSON-safe `game-reference.v1` schema owned by the game.
- [ ] Generate it deterministically from current authoritative TypeScript
      definitions; do not concatenate or execute browser runtime files.
- [ ] Include repository, full source SHA, schema version, Final Five catalog,
      weapon mechanics/ratings, upgrades, enemies, bosses, stages, modes,
      achievements, public tuning, and terminology version.
- [ ] Exclude secrets, private diagnostics, mutable runtime state, and
      implementation-only objects.
- [ ] Assert the exact Final Five IDs and fail if retired roster IDs enter the
      active catalog.
- [ ] Add schema, determinism, source-SHA, and stale-generation checks to game
      CI.

### Wiki consumer

- [ ] Fetch only the manifest for the exact validated game SHA in the dispatch
      payload.
- [ ] In local mode, accept only a clean canonical game `main`; reject dirty,
      feature, copied, or ambiguous worktrees.
- [ ] Validate schema, source repository, full SHA, uniqueness, required
      collections, and terminology version before changing generated files.
- [ ] Replace `src/scripts/game-engine.js` consumers with the validated data
      layer. Do not import arbitrary game TypeScript into Astro.
- [ ] Add current Final Five pages/components and prove Greatsword, Chainblade,
      and Riftlock are present while Spear/Ringblade are absent from the active
      roster.
- [ ] Remove the duplicate sync invocation from either the workflow or build
      script so one run has one synchronization attempt.
- [ ] Keep the hourly schedule only as a recovery mechanism after it passes;
      reduce frequency if a less noisy freshness check is sufficient.
- [ ] Update wiki rules and synchronization documentation from `js/**` to the
      manifest contract.
- [ ] Commit generated snapshots only after synchronization, verification, and
      Astro build succeed.
- [ ] Retain the previous verified snapshot as explicit rollback material, but
      never silently fall back to it when a requested exact SHA fails.

### Checkpoint G6-A — midpoint pause

- [ ] Local wiki builds against the exact current game `main` SHA.
- [ ] A nonexistent SHA, wrong repository, stale schema, malformed manifest,
      duplicate weapon ID, and legacy active roster all fail closed.
- [ ] Generated diff contains only expected reference data/content.
- [ ] No `tear-wiki` production Worker deployment has occurred yet.

### Close conditions

- [ ] One manual repository dispatch for the exact merged game SHA succeeds.
- [ ] The resulting wiki commit records that same SHA.
- [ ] Wiki tests/build pass from a clean clone.
- [ ] A non-production `tear-wiki` Worker preview shows permanent terminology
      and the canonical Final Five.
- [ ] G6 closure record is approved; only then may G7 open.

---

## 11. G7 — Certify and deploy the converged program

**Goal:** Produce one auditable release chain from canonical branches to public
surfaces.

### Pre-deploy objectives

- [ ] Game: `pnpm check` passes from the exact protected `main` commit.
- [ ] Music: complete repository check passes from protected `main`.
- [ ] Wiki: clean install, manifest verification, and production build pass from
      protected `main`.
- [ ] TearBench evidence selection and any required retained evidence are bound
      to the final game SHA; foundation checks are not called certification.
- [ ] The live deployment manifest names the intended game, music provenance,
      wiki schema, and artifact hashes.
- [ ] Rollback version and Git revert procedure are written before deployment.

### Deployment sequence

1. [ ] Approve the exact green game `main` SHA in the protected production
       environment.
2. [ ] Deploy only `dist/standalone` to the `tear` Worker.
3. [ ] Verify build-info SHA, asset hashes, cache behavior, fullscreen start,
       Final Five selection, and representative run/boss/audio paths live.
4. [ ] Dispatch the exact deployed game SHA to wiki.
5. [ ] Verify the wiki `main` commit and `tear-wiki` Worker deployment report
       the same game SHA and current terminology.
6. [ ] Treat `tear-ghost-publication` as a separate service gate. Deploy it only
       if its R2/D1/service prerequisites, migrations, auth, and cloud checks
       pass; its absence must remain explicit otherwise.

### Checkpoint G7-A — post-deploy pause

- [ ] Public game SHA equals the approved GitHub `main` SHA.
- [ ] Public wiki source SHA equals the deployed game SHA.
- [ ] Cloudflare version IDs and artifact hashes are retained in the release
      record.
- [ ] No deployment originated from a feature branch or dirty worktree.
- [ ] Rollback remains available and has not been invalidated by cleanup.

### Close conditions

- [ ] Live smoke and browser console are clean for agreed journeys.
- [ ] Current deployment is green, attributable, and reproducible.
- [ ] All temporary release branches are deleted after merge.
- [ ] Final branch/worktree/directory/name/wiki audit matches target state.
- [ ] G7 closure record is approved; G8 becomes the operating loop.

---

## 12. G8 — Prevention loop

**Goal:** Make recurrence visible early and prevent routine workflows from
recreating the current mess.

### Every pull request

- [ ] Branch name matches the approved short-lived namespace and purpose.
- [ ] Branch is based on current canonical `main` and contains one coherent
      scope.
- [ ] Changed-file ownership selects the smallest Tear gates, followed by the
      complete required merge gate.
- [ ] Deprecated product names and retired active weapon IDs pass allowlist
      checks.
- [ ] Documentation links, generated manifests, and architecture boundaries
      pass.
- [ ] Deployment configuration proves only generated target assets can upload.

### Weekly read-only hygiene report

- [ ] List open PRs, remote branches, branch age, ahead/behind counts, and
      registered worktrees.
- [ ] Flag merged branches older than seven days and active branches with no PR
      or owner after fourteen days.
- [ ] Flag dirty, missing, locked, or stale worktrees; never auto-delete them.
- [ ] Compare game `main`, live Cloudflare SHA, wiki source SHA, and vendored
      music provenance.
- [ ] Report failing or cancelled game, music, wiki, and TearBench workflows.
- [ ] Report documentation authority collisions and deprecated-name drift.

### Monthly maintenance

- [ ] Review ignored artifact size and apply documented retention.
- [ ] Verify recovery bundle checksums and restore one small sample.
- [ ] Review compatibility aliases and close only those whose fixtures and
      release window permit removal.
- [ ] Confirm branch protections/rulesets and production environment approval
      have not drifted.

### Non-negotiable safeguards

- No automated stale-branch or worktree deletion.
- No force-push or direct routine push to production `main`.
- No deployment from a local feature branch.
- No merge from the legacy JS oracle or legacy weapon roster.
- No claim that checked-in Worker configuration proves deployment.
- No claim that a targeted/foundation gate proves release completion.
- No rename of persisted or hash-bound identifiers without migration evidence.
- No absolute disposable worktree path as a production integration target.

---

## 13. Closure record template

Create one record per goal under the future canonical checkpoint location.

```markdown
# Gx Closure — <goal name>

- Baseline SHA(s):
- Final SHA(s):
- Authorized scope:
- Files/refs/services changed:
- Backups and hashes:
- Targeted checks:
- Full checks:
- External actions:
- Deployment/version IDs, if applicable:
- Assumptions re-audited:
- Remaining exceptions with owner/expiry:
- Rollback procedure:
- Reviewer decision:
- Closure status: CLOSED | REOPENED
```

---

## 14. Master objective checklist

- [x] G0 closed — truth and recovery are frozen.
- [x] G1 closed — release authority is protected, green, and attributable.
- [x] G2 closed — unique work and canonical branches are reconciled by
      protected PR #9.
- [x] G3 closed — obsolete branches/worktrees are removed safely, all three
      canonical repositories have one protected `main`, and recovery is
      proven by tags, bundles, and restore/fsck evidence in the G3 closure
      record. This becomes canonical on protected merge and post-merge
      observation of this record.
- [x] G4 closed — permanent terminology reached protected game `main` at
      `b3c2066`, with exact-head post-merge `Validate` run `32630369249` green.
- [ ] G5 closed — repositories, docs, and local workspace are organized.
- [ ] G6 closed — wiki synchronizes from the modern typed manifest.
- [ ] G7 closed — exact canonical commits are deployed and verified.
- [ ] G8 active — prevention evidence is recurring.

**Final program condition:** the game, TEAR Music, and wiki each have one
protected canonical branch; the game and wiki public surfaces identify their
exact source commits; the active roster is the canonical Final Five; TearBench
retains its name; deprecated terms survive only in governed compatibility or
historical evidence; and no ordinary workflow can recreate the current branch,
worktree, directory, synchronization, or deployment ambiguity.
