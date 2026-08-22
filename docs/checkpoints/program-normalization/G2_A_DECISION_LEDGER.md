# G2-A Decision Ledger — Canonical Reconciliation Midpoint

**Recorded:** 2026-08-22 (America/New_York)

**Repository:** `shaku1z/tear`

**Status:** `G2 OPEN` — G2-A is recorded; G2 is **not** closed

**Execution branch:** `codex/g2-canonical-reconciliation`

**Canonical game SHA:** `0aa3896cce5ac31e60409e4a3cd6517e81cc8f3f` (`main` = `origin/main`)

**Live-ref snapshot:** 2026-08-22 10:40:05 -04:00, after non-pruning fetches
of the game, music, and wiki remotes. The music and wiki values below are
observations at that time; active work may advance them afterward.

**Scope of this checkpoint:** documentation only; no product, branch, worktree,
deployment, repository-setting, or external-repository mutation

This is the durable midpoint record for G2, “Reconcile unique work and
canonical branches.” It records the decisions made against the canonical game
checkout after the G1 release-authority squash merge. It does not authorize
deletion, branch cleanup, wiki migration, music integration, or deployment.

## Authority and preserved evidence

The full G0 inventory is intentionally not copied here. It remains the source
for the complete branch/worktree/object inventory and preservation evidence:

- [G0 baseline ledger](G0_BASELINE_LEDGER.md)
- [G0 closure](G0_CLOSURE.md)
- [G1 release-authority checkpoint](G1_RELEASE_AUTHORITY_CHECKPOINT.md)
- [G1 ruleset/environment export](G1_RELEASE_AUTHORITY_EXPORT.json)
- [G2 sequencing authority](../../../plans/TEAR_PROGRAM_NORMALIZATION_MASTER_PLAN.md)

The G0 preservation root is
`C:\Users\realm\Desktop\game\Tear-archives\2026-08-20-program-normalization-g0`.
Its all-ref bundles, full Git-directory archives, manifests, and retained
bare-mirror restore drills remain the rollback authority. No G2 decision may
make those artifacts unnecessary.

Decision vocabulary used below:

- **integrate** — approved modern work may enter a canonical branch through a
  new reviewed PR and its required checks;
- **archive/retain** — keep the exact ref and its evidence; do not integrate or
  delete it during G2;
- **reject-never-merge** — the line is historical, legacy, unsafe, or
  superseded; it must not be cherry-picked or merged into modern `main`;
- **quarantine/hold** — the line may be investigated in isolation, but no
  canonical-branch action is authorized until the named blocker is cleared.

## Canonical game and permanent F5 policy

The canonical game is the typed TypeScript/Vite implementation on `main` at
`0aa3896cce5ac31e60409e4a3cd6517e81cc8f3f`. The immediate pre-G1-squash
parent is `9b545b0382fb8c015da7a3410932a1d09e88750b`; the preserved G0 product
baseline is tag
`archive/program-normalization-g0-main-20260820` at
`0bef91dc4970740c80b1969416c0573680bcaf89`.

The definitive Final Five (F5) policy is:

1. The active roster and stable order are **Sword, Hammer, Greatsword,
   Chainblade, Riftlock** (`sword`, `hammer`, `greatsword`, `chainblade`,
   `riftlock`).
2. Spear and Ringblade are retired identifiers. They may appear only in
   explicit migration maps, compatibility tests, or historical evidence; they
   may not be restored to active gameplay, player-facing catalogues, plans, or
   wiki content.
3. `archive/legacy-oracle-ee5e931` at
   `ee5e93141d67cc02505b2227b3be0b10d1819e1c` is comparison-only. Its locked
   worktree is not a development source and no legacy commit may be
   cherry-picked into modern `main`.
4. `archive/invalid-legacy-final-five-weapon-roster` and
   `feat/tear-score-integration` are **reject-never-merge** lines. A future
   F5 fix must be authored against the typed contracts and proven by the
   current tests; it must never re-enter through the legacy JS history.

This policy is binding for G2 and G3. A branch that contains a useful-looking
F5 change still requires a new, typed, reviewable port; branch ancestry alone
is not approval.

## Game disposition ledger

The following table resolves every decision-bearing game line from the G0/G2
queue. Exact tips are recorded so later cleanup can prove reachability before
any ref is changed.

| Ref and exact tip | Evidence / unique content | G2 disposition | Rollback or retained evidence |
| --- | --- | --- | --- |
| `main`, `origin/main` — `0aa3896cce5ac31e60409e4a3cd6517e81cc8f3f` | Protected canonical release line after the G1 squash merge | **integrate authority**; all approved work must target this branch through PR | G0 tag `archive/program-normalization-g0-main-20260820` (`0bef91d…`), parent `9b545b0…`, G0 bundle/archive |
| `codex/cutting-room-2` / `origin/codex/cutting-room-2` — `cdeaf1ff0ee97e9f37ada9cb89556b49a647056f` | Four historical commits: `014fdabee93f982e7aa43bd08464cfe0099d6a68`, `675fb65064728fcc61d5f02f7385ea4cf64caa2f`, `49e3b7d115195fe4bcb322abf61ac92ce9646c2a`, `cdeaf1ff0ee97e9f37ada9cb89556b49a647056f` | **archive/retain; superseded — do not integrate**. The current `main` already carries the later Cutting Room implementation and the `de0ecb9` Field Test correction; the old line must not reintroduce its mixed objective | Exact branch ref; current `main`; G0 bundle. The locked Cutting Room worktree remains untouched until G3 |
| `experiment/system-memory-wave-run` — `30cebcbbf798f4cfe040431d488a507a203fd807` | Experimental commits `99e2460c9691e859dc1db8214b0365ccd4c2b8d3` and `30cebcbbf798f4cfe040431d488a507a203fd807`; the branch incorrectly tracks `origin/main` | **quarantine/hold; never merge to product**. Keep only while the experiment has an owner and a written purpose; correct its misleading upstream in G3, not by silently rebasing it now | `p5-green` at `30cebcbbf798f4cfe040431d488a507a203fd807`; comparison-only baseline worktree at `954fa114763394471f662b46c79e0ac6bf363230`; G0 archive |
| `codex/main-repair-weapon-core` — `f50909f3d4b4b55a1ff7e22b9a9fa8b278584735` | Alternate context-assert guard; equivalent guarded behavior is already in `0bef91d…` and the current typed tree | **archive/retain; superseded — do not cherry-pick** | G0 baseline tag and current `main`; exact branch ref |
| detached receipt line `426b4fffe7edc6da16216216d2bf83c4379eafe2` | Alternate C40 evidence receipt implementation; successor `b8b20b9c2ade6260ee70116ba33a0e9aa69c3720` is contained in current `main` | **archive/retain; superseded — do not merge the alternate** | `b8b20b9…`, current `main`, G0 bundle; the detached receipt worktree remains untouched |
| `codex/extreme-rendering-implementation-plan` — `60a927574ad610bc540269bf33a921c2507692c5` | Candidate rendering plan plus unapproved source changes | **archive/retain the plan only; reject source integration**. Move or reproduce an approved plan in the later document-organization goal; no permanent feature branch is authorized | Exact branch ref and G0 bundle |
| `codex/tearscore-pristine-ost` — `efedb4e7f8280929b3dbd2b5e2d02321fa262de0` | Candidate pristine-OST plan plus unapproved game-side/audio changes | **archive/retain the plan only; reject source integration**. Music remains governed by the separate music HOLD below | Exact branch ref and G0 bundle |
| `archive/invalid-legacy-final-five-weapon-roster` — `45984beb73018f9b2d250264be57586dde9fb730` | Forty-one legacy JS/F5 history commits | **reject-never-merge** | `archive/legacy-oracle-ee5e931`, G0 archive/bundle |
| `feat/tear-score-integration` — `f288a5027d3187068404e5fb840621b0b20a0361` | Eight legacy JS/audio integration commits | **reject-never-merge**; the modern vendored engine and typed audio boundary supersede it | G0 archive/bundle; current `public/vendor/tear-score` provenance |
| `origin/cloudflare/workers-autoconfig` — `6f724aed71bdb45e89c0a48a683316402afb967d` | Obsolete PR #1 deployment configuration; it points at an unsafe repository-root asset path | **reject-never-merge**; keep the PR/remote ref out of every release path until G3 closes it | G0 ledger, G1 checkpoint’s DO-NOT-MERGE decision, G0 bundle |
| `codex/audio-resource-settle-race` — `e6dec731d859b3cf199e158a672526cd06f914de` | Two CI stabilization commits, included by the squash-merged `335e35b91f1817bb0e6b76777f0e90df026b122d` line | **archive/retain; superseded by current `main`** | `335e35b91f1817bb0e6b76777f0e90df026b122d`, G0 bundle |
| `codex/g1-release-closure-candidate` — `dfb7709f36e7dd777b6d85a8168db5143041527f` | G1 closure documentation and pre-squash release-authority commits | **archive/retain; superseded by `origin/main` `0aa3896…`**. Do not continue development on the old candidate | G1 checkpoint/export, current `main`, G0 bundle |
| `codex/g1-preview-token-normalization` — `9b8d92f6fe2fb9fee01a08e7c346f8706c76d83f` and `codex/g1-verification-hash-performance` — `67a9d2f8d55e3495dfbcf6ff81dc1d7ef9186cd9` | Pre-squash G1 review branches; their approved results are in the G1 squash | **archive/retain; superseded by current `main`** | G1 checkpoint/export and current `main` |
| `codex/program-normalization-g0` — `f94ae41b0bd75ef134e1942f51376e50c69902e9`; `codex/program-normalization-g1` — `68c2eb26b15694f143a67bd085aa370cfca91648` | Pre-squash program checkpoint/release lines | **archive/retain; superseded evidence pointers**. The checkpoint files are retained on current `main`; no branch replay is authorized | G0/G1 checkpoint files, G0 bundle |
| `rescue/*` preservation refs (including `rescue/wiki-migration-b4c2791` at `b4c279189a867980098f25f24d6da76eb5717c6d`) | Recovery/WIP pointers preserved during G0; the complete name/tip inventory is in [G0 baseline ledger](G0_BASELINE_LEDGER.md) and the G0 bundle | **archive/retain; no integration**. Compare only when a later cleanup operation has a specific owner and restore proof | G0 all-ref bundle, full Git-directory archive, and exact rescue refs |

The following lines are already contained in current `main` and therefore have
no new G2 integration work. They remain archive-only until G3 verifies the
backups and worktrees: `backup/main-pre-final-five-20260730`
(`9aa58fed27b555c1ee2432684b2bee8453a7f0d3`),
`codex/architectural-redesign` (`082c93e136ed5be239a92cc4c92d4fc66b293215`),
`codex/cutting-room-ghost3-integration` (`53c13ef49ffdcf46caf60fd63ee8b1b18188ec75`),
`codex/final-five-weapon-roster` (`9785b69c394da2df751bcf3adea49e07d20a933f`,
remote tip `6267ba69ee97c45d65514c3da360c121bc05b416`),
`codex/ghost3-autonomous-completion-plan`
(`179782b5b04845fe5644954e4e4fd7bcd4333241`),
`codex/main-normalization` (`465f7027113e427cec914b0689ef5c01e91b146d`),
`codex/pantheon-iv` (`63d0f49a18d96f36124292af02b68098dc71f9e6`),
`codex/pantheon-v` (`97a672ebd63f0d40b872b2b13bebdc6c53663760`),
`codex/pantheon-vi` (`49a68f0f54c91780291de143e94be6eafc7a656e`),
`codex/pre-main-switch-backup` (`179782b5b04845fe5644954e4e4fd7bcd4333241`),
`codex/tearscore-normalization` (`6d5f06053b2f578facc1d42a638c65a7363b905c`),
`codex/weapons-abilities-overhaul`
(`ee5e93141d67cc02505b2227b3be0b10d1819e1c`), and `design-system`
(`81fe41c7c0c5fb4c347a483c436b545827ed4880`).

“Already contained” means no new work is needed on that line; it does **not**
authorize deleting the ref or its worktree during G2.

## Cutting Room verdict

The four-commit `codex/cutting-room-2` line is **superseded, not a second
product path**. Current `main` contains the later implementation lineage:

- `460c7c5` — Cutting Room curriculum;
- `e4bda44` — practice handoff and physics ghost coach;
- `89067a6` — enemy reads and the encounter rooms;
- `de0ecb9` — the shipped Field Test correction; and
- `e11107d` — current world-configuration ownership.

The shipped Field Test contract is only:

`live Charger commit -> dash away -> Charger recovery -> blade punish`

The old branch’s upward-launch and projectile mixed objective is not to be
reintroduced. Launch/projectile mixed testing is a future tutorial slice, not
G2-approved product work. The branch and its worktree remain preserved for
G3-era cleanup only.

## Music decision — HOLD

**Decision:** hold music canonicalization; do not merge the candidate or
delete any music branch.

| Music ref | Exact SHA | Meaning |
| --- | --- | --- |
| `origin/main` (`shaku1z/tear-score`) | `207b83dc0851c45dc68d43bcefe456ba3138d06e` | Current protected/validated canonical head after the G1 Node-version checks |
| Local `main` | `766b910d07264fd81154be29a3d809c63de5c310` | Preserved G0 baseline; local checkout is two commits behind `origin/main` |
| `codex/samply-dropbox-review-sync` | `1611bbb6e6e60d6e9ee1b18d74742c178393f266` | The 51-commit modern candidate; includes vendoring/control-plane work |
| Vendored source commit | `7633f1e49b15073a28b7d5d0b84e2c12cdb463b9` | Game-vendored TEAR Music source revision; must remain reachable after integration |
| Stage 1 `origin/codex/g2-music-canonicalization` | `9d96484c901b62f27910574da292bf303947542c` | Recorded remote tip at this snapshot; no newer remote Stage 2 commit was observed |

Stage 1 recorded a clean isolated worktree at
`C:\tmp\tear-score-g2-music-canonicalization` at remote tip `9d96484…`.
The same isolated worktree is now the active Stage 2 workspace and has 11
uncommitted path entries (observed at this snapshot); its current status must not be
mistaken for the Stage 1 clean-checkout evidence. The Stage 1 tip and clean
state are therefore timestamped observations, not a claim that active work
will remain clean.

The HOLD is substantive, not a scheduling label. The candidate still needs:

1. a clean-clone release-train audit of all 51 commits, generated audio,
   owned stems, licenses, large binaries, local paths, secrets, and promotion
   boundaries;
2. a complete `pnpm check` from that clean candidate checkout, with the
   declared Node version and lockfile proven;
3. a reachability check proving `7633f1e…` survives the proposed music-main
   integration and a review of the `1611bbb…` canonical-game-root guard
   against game `main` `0aa3896…` and the G1 release policy;
4. a reviewable PR into protected music `main`, with required `check`, before
   any merge or source-branch deletion; and
5. a fresh-clone rebuild of the merged result before the game’s vendored
   provenance is updated in a separate reviewed game PR.

The dirty `codex/g2-music-canonicalization` worktree is preserved as user
work. It is evidence that the review line is active, not evidence that music
is ready to integrate. No game G2 close condition may be marked complete while
these blockers remain.

## Wiki decision — retain `master`

**Decision:** retain `master` as the wiki canonical/default branch during G2;
do not create or migrate to `main` in this goal.

| Wiki ref | Exact SHA | Disposition |
| --- | --- | --- |
| Local `master` | `f183b495cc0ee21f9296c7fedcd05cf83ac5eba8` | Retain as the stale local rollback checkout; its configured upstream is `origin/master` and it is eight commits behind the fetched remote at this snapshot. Tag: `archive/program-normalization-g0-master-20260820` |
| `origin/master` / protected remote default | `27c67acfc076624b65e95e65d095adc4908ee21e` | Retain as the fetched remote canonical/default branch; ruleset `21119805` is active and protects `master` |
| `codex/program-normalization-g1` | `8bf83add033ff61d623d58d723df239bf7a70e10` | Retain as review/evidence line; do not merge as a branch-renaming shortcut |
| Wiki ruleset | `21119805` | G1 evidence records protected `master` with required `check` |

The wiki synchronizer still targets retired JS-era paths and cannot represent
the modern typed/F5 contract. A branch rename would therefore couple GitHub
default-branch state, Worker build/source settings, workflow triggers,
custom-domain routing, content generation, and rollback in one unsafe partial
operation. G6 owns that migration after a typed manifest and a current-game
SHA contract exist. Until then:

- no `master` → `main` rename;
- no direct protected-branch push or deletion;
- no new G2 production wiki deployment; and
- preserve both local `master` and remote `origin/master` plus the G0 archive.

## Rollback references and non-destructive boundary

The rollback order for any future G2/G3 action is:

1. stop and preserve the dirty/unknown worktree;
2. restore the affected exact ref from the G0 all-ref bundle or full Git
   directory archive;
3. restore game `main` to `0aa3896…` (or the G0 tag `0bef91d…` only when the
   owning gate explicitly calls for the G0 baseline);
4. restore the locked comparison oracle from
   `archive/legacy-oracle-ee5e931` without merging it; and
5. re-run the owning goal’s evidence checks before any retry.

No G2 operation may delete a branch, worktree, stash, tag, bundle, copied
directory, or external repository state. G3 owns cleanup only after a new
reachability and restore drill.

## G2-A checklist

- [x] Every decision-bearing unmerged game ref has an explicit
      `integrate`, `archive/retain`, `reject-never-merge`, or `quarantine/hold`
      disposition in this ledger.
- [x] Every disposition names exact evidence and a rollback/retention ref.
- [ ] Music candidate scope and provenance are fully reviewed. **HOLD:** the
      clean-clone, full-check, vendor-reachability, guard-review, and PR gates
      above remain outstanding.
- [x] No legacy JS implementation has entered modern `main`; the active F5
      policy is explicit and rejects legacy re-entry.
- [x] The Cutting Room superseded verdict and shipped Charger
      evade → recovery-punish contract are recorded.
- [x] The wiki decision is recorded: retain `master`; defer migration to G6.
- [ ] G2 close conditions are not met. G2 remains open until approved modern
      game work, music canonicalization, protected canonical branches, and the
      closure review all pass.

**Checkpoint decision:** G2-A is recorded and reviewable. G2 remains OPEN;
G3, G4, G5, G6, and G7 remain locked by the master plan.

## Supersession note — final G2 state

This ledger is the historical G2-A midpoint snapshot. Its HOLD and OPEN
statements are superseded by the completed integration evidence recorded for
review in [`G2_CLOSURE.md`](G2_CLOSURE.md), but final G2 closure remains
pending the protected merge of PR #9. Game PR #8 is integrated at `85f1ec9`;
music PR #3 is merged on protected `main` at `1ba4ee4`, while its restored
source branch remains at `4f7a872`. The music source branch was auto-deleted
after merge and immediately restored at that exact tip; the game source branch
remains at `d2b5855`. The recorded hosted/full gates are green. Remote
canonical refs are clean, protected, and green; stale local worktrees remain
G3 scope. Branches and worktrees remain preserved, Cloudflare production
remains frozen, and G3 is still locked until PR #9 merges.
