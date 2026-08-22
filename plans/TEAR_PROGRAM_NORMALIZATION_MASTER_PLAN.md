# TEAR Program Normalization and Release Governance Master Plan

**Status:** Executing — G0 and G1 closed; G2 eligible

**Prepared:** 2026-08-20

**Execution authorization:** Granted by the user on 2026-08-20

**Initial canonical game baseline:** `shaku1z/tear` `main` at `0bef91dc4970740c80b1969416c0573680bcaf89`

**Current G1 closure candidate:** `shaku1z/tear` `main` at `9b545b0382fb8c015da7a3410932a1d09e88750b`

**Current goal state:** G0 CLOSED; G1 CLOSED; G2 ELIGIBLE. G2 remains
integration-gated behind the reviewed PR for the G1 closure candidate.

**Music repository baseline:** `shaku1z/tear-score` `main` at `766b910`; current candidate branch at `1611bbb`

**Wiki repository baseline:** `shaku1z/tear-wiki` remote `master` at `b57efda`; the pre-fetch local checkout was stale at `f183b49`

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
| G4 | Normalize permanent terminology | LOCKED | G3 closed | Public/internal names and migrations pass their gates |
| G5 | Organize repositories, documents, and workspace | LOCKED | G4 closed | Information architecture and local workspace policy are enforced |
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

- [ ] Audit the full 51-commit candidate as a release train, including source,
      generated audio, licenses, large binaries, secrets, local paths, and
      promotion boundaries.
- [ ] Run the candidate's complete `pnpm check` from a clean checkout.
- [ ] Verify that vendored game commit `7633f1e` remains reachable after the
      proposed music-main integration.
- [ ] Review the canonical game-root guard at `1611bbb` against the actual game
      root and the new G1 release policy.
- [ ] Integrate through a reviewable PR after music CI exists. Because the
      branch is zero-behind, preserve its intentional commit history unless a
      specific commit is rejected; do not collapse it merely for cosmetic
      neatness.
- [ ] Delete no source branch until the merged music `main` passes CI and a
      fresh clone can build the same adapter/vendor artifacts.

### Checkpoint G2-A — midpoint pause

- [ ] Every unmerged game ref has a written `integrate`, `archive`, or
      `reject-never-merge` decision.
- [ ] Every decision names its evidence and rollback ref.
- [ ] Music candidate scope and provenance are fully reviewed.
- [ ] No legacy JS implementation has entered modern `main`.

### Close conditions

- [ ] Game `main` contains all approved unique modern work and none of the
      rejected legacy lines.
- [ ] Music `main` contains the approved modern music program and the vendored
      game source commit is reachable from it.
- [ ] Wiki canonical branch migration decision is recorded but the broken data
      contract remains scheduled for G6.
- [ ] All three canonical branches are clean, protected, and green.
- [ ] G2 closure record is approved; only then may G3 open.

---

## 7. G3 — Remove obsolete refs and normalize worktrees

**Goal:** Reduce branches and worktrees to intentional active lines without
losing recoverability.

### Game branches already merged and eligible after verification

- [ ] `backup/main-pre-final-five-20260730`
- [ ] `codex/architectural-redesign`
- [ ] `codex/cutting-room-ghost3-integration`
- [ ] `codex/final-five-weapon-roster`
- [ ] `codex/ghost3-autonomous-completion-plan`
- [ ] `codex/main-normalization`
- [ ] `codex/pantheon-iv`
- [ ] `codex/pantheon-v`
- [ ] `codex/pantheon-vi`
- [ ] `codex/pre-main-switch-backup`
- [ ] `codex/tearscore-normalization`
- [ ] `codex/weapons-abilities-overhaul` after the oracle tag is verified
- [ ] `design-system`

### Cleanup objectives

- [ ] Close obsolete PR #1 without merging it.
- [ ] Remove clean registered worktrees for merged branches first, then remove
      their local branches, then their remote branches.
- [ ] Correct active-branch upstreams: same-name remote when intentionally
      published, otherwise no upstream. A feature/experiment branch must never
      silently track `origin/main`.
- [ ] Convert needed recovery branches into annotated tags and dated bundles;
      tags are historical pointers, not development lines.
- [ ] Keep the locked oracle worktree as comparison-only.
- [ ] Keep at most the canonical main worktree, the locked oracle, and one or
      two explicitly active short-lived worktrees.
- [ ] Delete no dirty worktree. A worktree with unknown files returns to G2.
- [ ] Remove the music feature branch only after its canonical merge and
      reproducibility proof.
- [ ] Migrate wiki `master` to `main` only after GitHub default branch,
      Cloudflare Worker build/source settings, custom-domain routing, workflow
      triggers, local remotes, and documentation are updated as one
      rollback-capable slice.

### Target steady state

| Repository | Long-lived branches | Temporary branches | Historical storage |
|---|---:|---:|---|
| Game | `main` only | 0 normally; 1–2 active PR branches | annotated tags + offline bundles |
| Music | `main` only | 0 normally; 1–2 active PR branches | annotated tags + release/provenance records |
| Wiki | `main` only | 0 normally; 1 active PR branch | annotated release tags as needed |

### Checkpoint G3-A — midpoint pause

- [ ] Branch deletion candidates are still reachable from verified backups.
- [ ] `git worktree list` contains no stale registered worktree.
- [ ] Remote branch list matches open PRs plus approved temporary exceptions.
- [ ] The legacy oracle remains locked and clearly labeled.

### Close conditions

- [ ] Fresh branch/ref inventory meets the target table.
- [ ] Fresh clones of all three repositories select the canonical branch.
- [ ] No open PR targets legacy or unsafe deployment configuration.
- [ ] Restore drill from the G0 bundle succeeds.
- [ ] G3 closure record is approved; only then may G4 open.

---

## 8. G4 — Normalize permanent terminology

**Goal:** Replace ambiguous product and subsystem names permanently while
preserving saves, replay evidence, routes, provenance, and historical truth.

### Naming architecture

- [ ] Add one canonical terminology registry with: permanent display name,
      canonical code identifier, deprecated aliases, persistence impact,
      migration owner, and removal checkpoint.
- [ ] Mark historical specifications and hash-bound TearBench sources as
      historical; do not rewrite their content or regenerate requirement IDs
      solely for naming.
- [ ] Add a user-facing-copy check that rejects deprecated names outside
      explicit compatibility/history allowlists.
- [ ] Add an active-roster check asserting the exact five weapon IDs and
      rejecting Spear/Ringblade outside migration/history allowlists.

### Migration order for every renamed subsystem

1. [ ] Define the new canonical type/API and compatibility alias.
2. [ ] Add dual-read migration for persisted keys, routes, formats, and replay
       metadata; write only the new form after migration.
3. [ ] Change user-facing copy, navigation, docs, accessibility labels, and
       telemetry presentation.
4. [ ] Rename modules/files/packages in narrow subsystem PRs with import and
       architecture checks.
5. [ ] Update tests and generated non-historical documentation.
6. [ ] Prove old saves, routes, replay capsules, and imported artifacts still
       open correctly.
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

### Checkpoint G4-A — midpoint pause

- [ ] Public surfaces use only permanent terms.
- [ ] Deprecated identifiers appear only in allowlisted migration/history code.
- [ ] Old save/replay/audio fixtures pass migration tests.
- [ ] TearBench requirements and preserved evidence retain their original
      hashes and historical wording.

### Close conditions

- [ ] Game full gate passes.
- [ ] Music full gate passes.
- [ ] Wiki content contract schema uses the permanent public names.
- [ ] Terminology registry has no alias without an owner and expiry condition.
- [ ] G4 closure record is approved; only then may G5 open.

---

## 9. G5 — Organize repositories, documents, and workspace

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

- [ ] Add `docs/README.md` and `plans/README.md` authority indexes before moving
      documents.
- [ ] Classify every root Markdown file as current authority, active plan,
      completed plan, or history.
- [ ] Move root redesign/audit/economy/enemy/shop/mirror plan documents through
      separate link-checked commits.
- [ ] Move the game repo's single `tear-wiki/Weapons-and-Abilities.md` handoff to
      an explicit integration/history location after the real wiki owns the
      modern manifest.
- [ ] Classify `coop-lab.html` as an experiment and move it only after all
      references and relative asset paths are updated.
- [ ] Prove whether `serve.py` still owns any supported workflow; retire or
      relocate it only after replacement commands are documented.
- [ ] Separate generated TearBench catalogs from narrative docs only through an
      atomic scripts+paths+CI migration. Do not move hash-bound files manually.
- [ ] Add a link/path checker and a documentation authority check.
- [ ] Add artifact retention commands/policy; generated artifacts remain
      ignored and never enter deployment bundles.
- [ ] Add `pnpm check:workspace` to verify canonical-root identity, expected
      repository structure, active terminology allowlists, exact Final Five
      IDs, generated-document freshness, worktree integrity, and deployment
      root safety.
- [ ] Keep the current `src/` domain boundaries unless a measured architecture
      issue justifies a focused refactor.

### Local workspace objectives

- [ ] Inventory and hash orphaned `gsm-*` directories; compare for files not
      reachable from preserved repositories or bundles.
- [ ] Quarantine candidates to a clearly named recovery location before any
      deletion, with a retention date and restore instructions.
- [ ] Inspect non-Git `Tear-main-publication` and `Tear-receipt-clean` copies for
      unique files; dispose of them recoverably only after evidence says none
      are needed.
- [ ] Treat `C:/tmp/Tear-main-publication` as forbidden for development and
      deployment. It is an unregistered, divergent copy and is the likely
      residue behind the earlier `main is already used by worktree` conflict.
- [ ] Keep the dated recovery bundle in a dedicated `Tear-archives` location
      outside active repositories, with a manifest and checksum.
- [ ] Adopt one parent layout for canonical repositories, active worktrees,
      scratch output, and archives. Do not hardcode the user's absolute path in
      repository logic.
- [ ] Update Soundtrack Desk configuration to discover/validate the canonical
      game repository rather than pointing at disposable publication copies.

### Checkpoint G5-A — midpoint pause

- [ ] Every proposed move has a reference/import/link search result.
- [ ] No build, CI, Vite, Wrangler, TearBench, vendoring, or wiki path is broken.
- [ ] Quarantined local data has a hash manifest and recovery window.
- [ ] `src/` changes, if any, are justified by architecture evidence rather
      than aesthetics.

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
- [ ] G2 closed — unique work and canonical branches are reconciled.
- [ ] G3 closed — obsolete branches/worktrees are removed safely.
- [ ] G4 closed — permanent terminology is implemented with migrations.
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
