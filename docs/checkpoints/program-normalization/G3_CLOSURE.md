# G3 Closure — obsolete refs, worktrees, and wiki canonical branch

**Date:** 2026-08-22  
**Status:** acceptance-complete; canonical when this record is merged through
protected game `main` and its post-merge `Validate`/ref observation is green  
**Scope:** TEAR game, TEAR Music, and wiki branch/worktree normalization  
**Out of scope:** G4 terminology, G5 workspace reorganization, G6 sync
replacement, G7 production certification, and every production deployment

This is the G3 acceptance record for
`plans/TEAR_PROGRAM_NORMALIZATION_MASTER_PLAN.md`. It supersedes the earlier
preservation-only boundary after the exact cleanup gates, wiki migration, wiki
master retirement, and recovery checks below. G4 remains locked until this
record is protected-merged and the post-merge observation is recorded. No
source, generated game artifact, Worker, or production content was changed by
this doc-only closure slice.

## Canonical audit

The consolidated read-only audit covered the three canonical roots and their
GitHub repositories. Every root was clean, had exactly one local branch and
one remote head, tracked same-name `origin/main`, had no stash, and selected
`main` as the default/origin HEAD.

| Repository | Local/remote canonical commit | Local branches | Remote heads | Registered worktrees | Open PRs | Ruleset |
|---|---|---:|---:|---:|---:|---|
| `shaku1z/tear` | `f6b694e83921da8c69f1ad86af6c14a500482c6a` (`f6b694e`) | 1 (`main`) | 1 (`main`) | 2 | 0 | `21119803`, active `main` |
| `shaku1z/tear-score` | `1ba4ee4d7a73de32d93fc4212f941f32e779560b` (`1ba4ee4`) | 1 (`main`) | 1 (`main`) | 1 | 0 | `21119804`, active `main` |
| `shaku1z/tear-wiki` | `37b9a7d92c6566f1ff9b8424c5b12b609c0114e4` (`37b9a7d`) | 1 (`main`) | 1 (`main`) | 1 | 0 | `21119805`, active `main` |

All three rulesets include only `refs/heads/main`, deletion and
non-fast-forward protection, the existing pull-request controls, and required
status context `check` with strict status policy. All have
`bypass_actors: []` and `current_user_can_bypass: never`.

The game worktree list is exactly:

- `C:\Users\realm\Desktop\game\Tear` on `main` at `f6b694e`.
- `C:\Users\realm\Desktop\game\Tear-oracle` detached at
  `ee5e93141d67cc02505b2227b3be0b10d1819e1c`, locked with the description
  `Legacy oracle: comparison-only; never merge or develop here`.

Music has only `C:\Users\realm\Desktop\game\tear-score`; wiki has only
`C:\Users\realm\Desktop\game\tear-wiki`. There are no stashes in any
canonical root. Phase 4 performed exactly 48 local branch deletions (game 42,
music 5, wiki 1) and 25 remote branch deletions (game 21, music 3, wiki 1);
the exact allowlist and deletion logs are retained under
`cleanup-receipts/phase4/`.

Fresh shallow clones created for this audit at
`C:\tmp\tear-g3-final-acceptance-185813\{game,music,wiki}` selected `main`,
resolved the three commits in the table above, and each remote exposed only
`main`. GitHub reports zero open PRs in all three repositories. The obsolete
wiki PR #1 (`cloudflare/workers-autoconfig`) is closed without merge.

## G3 objective evidence

- The exact game branch candidates named in the master plan were removed by
  the phase-4 allowlist after their tips were covered by annotated tags and
  bundles. This includes `backup/main-pre-final-five-20260730`, the
  `codex/architectural-redesign`, `codex/cutting-room-ghost3-integration`,
  `codex/final-five-weapon-roster`, `codex/ghost3-autonomous-completion-plan`,
  `codex/main-normalization`, `codex/pantheon-iv`, `codex/pantheon-v`,
  `codex/pantheon-vi`, `codex/pre-main-switch-backup`,
  `codex/tearscore-normalization`, `codex/weapons-abilities-overhaul`, and
  `design-system`. The oracle tag/worktree was verified before removing the
  weapons/abilities branch.
- No dirty worktree was deleted. The phase-1/phase-2 receipts preserve the
  dirty and detached evidence; the final registered game state is root plus
  locked oracle only.
- Music canonicalization was already protected-merged and reproducibility
  checked before its feature refs were removed. Its canonical commit is
  `1ba4ee4`; the preserved source tip is `4f7a872`.
- The wiki migration was one rollback-capable sequence: PR #3 migrated the
  five branch-sensitive files to `main` and squash-merged at
  `ec461168591c6b33396ddf3d57976e5709dc204c`; PR #4 changed only
  `.github/workflows/validate.yml` and this executed retirement record, then
  squash-merged at `37b9a7d92c6566f1ff9b8424c5b12b609c0114e4`.
- Wiki PR #3 required Validate run `32602863708` (job `97103644385`) and
  post-merge run `32602897926` (job `97103724485`), both green. PR #4 required
  Validate run `32603336657` (job `97104747776`) and post-merge run
  `32603365794` (job `97104817470`), both green.
- The old wiki `master` commit
  `27c67acfc076624b65e95e65d095adc4908ee21e` remains recoverable from
  `archive/g3-wiki-canonical-master-20260822` and the all-ref bundles; it is
  no longer a live branch. The final-main annotated tag targets `37b9a7d`.
- `sync-game.yml` remains disabled/fail-closed pending G6. No workflow
  enablement, sync repair, or generated data refresh was claimed by G3.

## Recovery and bundle evidence

Every original and phase-4 bundle passed `git bundle verify` in the final
audit. SHA-256 values:

| Artifact | SHA-256 |
|---|---|
| `bundles/game-all-refs-g3-20260822.bundle` | `28C55890110C848EEA832956568743DD6C0F2A0160D64763E2F361DC8B12905F` |
| `bundles/game-phase4-predelete-all-20260822.bundle` | `C413CE700AE38F4F572D3A3CABF369FD687A944C6FCEA09294459819E2192C25` |
| `bundles/game-dirty-worktrees-g3-20260822.bundle` | `169D09E7AEF49BCA26B5299E2B2B36F4262E7658FDD341EF2B530ACAA5A7DC0B` |
| `bundles/music-all-refs-g3-20260822.bundle` | `0E217F7B9B0D26B022E1C039819C7C679D8C9AABA7022B4B28152CBC494B70FD` |
| `bundles/music-phase4-predelete-all-20260822.bundle` | `B8596E312E766D8300D3AF3A0ED603E9CABFC349308CA888EC7FA8632E13CD53` |
| `bundles/wiki-all-refs-g3-20260822.bundle` | `0A4C289AC80F545581712F1DA05A2A8785167E241F405189EE260C8CD5A1C862` |
| `bundles/wiki-phase4-predelete-all-20260822.bundle` | `B5D54DF8886DD2799C5CB979EF097C8F852FCBCD43316BF3060278DB73E0D980` |
| `bundles/wiki-all-refs-g3-post-master-retirement-final-main-20260822.bundle` | `CBFFB215917B7AB6F687CC849F9E07F375D47576E489BEDBFD17F71E4B805AF3` |

The `game-dirty-worktrees` bundle preserves the dirty evidence; the
authoritative final wiki supplemental bundle is the final-main artifact in the
table.

The phase-4 restore at
`C:\tmp\tear-g3-phase4-final-restore-20260822-01` passed `git fsck --full`
with exit `0` for game, music, and wiki and recovered the retired branch/tag
tips (the phase-4 assertion set reports zero failures). The wiki supplemental
restore at
`C:\tmp\tear-wiki-g3-master-retirement-restore-final-main-20260822` also
passed fsck exit `0` and recovered:

- retired `master` → `27c67acfc076624b65e95e65d095adc4908ee21e`;
- current `main` → `37b9a7d92c6566f1ff9b8424c5b12b609c0114e4`;
- annotated old-master tag object
  `1ef8e9a5edee70861e8bbf7c62c927b5dd645973`;
- annotated final-main tag object
  `4dbd43a49fe0374fb54f5495cd5a4e10472959de`.

The archive’s original `SHA256SUMS.json` remains unchanged at
`185C04105F3F0D6AFAA9A9E27F95384F3687C2EADBC028A9AFE4BA926DCB7298`.

## Cloudflare and production boundary

Cloudflare was read-only and frozen throughout G3. The current existing
production deployments are unchanged: Worker `tear` reports deployment
`d5d8fe36-d1c9-4859-9fed-f4e49c5c1019`, version
`5f1d5e2d-5d10-4c73-9eb2-0b7f7066f47b` at 100%; Worker `tear-wiki` reports
deployment `bbccf944-f0fd-4ef2-b179-78557529c0ed`, version
`b72b4f0e-5ae0-4439-9b74-cca7d3fd8d1c` at 100%. Both are Wrangler-sourced;
Worker triggers and deploy hooks are empty. The wiki script-trigger list is
also empty, its build configuration remains absent with error `12040`, and
`wiki.tearblade.com` remains an enabled production domain for `tear-wiki`.
No deployment, Worker source, version, domain, route, build setting, trigger,
hook, or production content was mutated.

## Validation boundary and next gate

The only relevant local validation for this doc/governance-only slice is
`git diff --check`; no runtime, build, browser, or full `pnpm check` suite is
appropriate for the two documentation files. Hosted protected-branch checks
remain the authoritative merge gate. The closure PR’s protected merge and
post-merge `Validate`/ref observation must be appended to the archive receipt
before G4 is opened.

G3 is therefore complete in evidence and remains explicitly bounded: G4 may
open only after this record is protected-merged and observed green; G6 still
owns the typed wiki synchronization replacement; G7 still owns any future
production certification and deployment.
