# G0 Baseline Ledger — Freeze and Record Truth

**Captured:** 2026-08-20 America/New_York

**Program authority:** `plans/TEAR_PROGRAM_NORMALIZATION_MASTER_PLAN.md`

**Execution branch:** `codex/program-normalization-g0`
**Production change freeze:** Active until G1 closes

This ledger freezes the recoverable starting state for program normalization.
G0 changed preservation refs and documentation only. It did not merge product
work, delete data, close pull requests, change repository settings, or deploy.

## Canonical product baselines

| Repository | Canonical branch at entry | Canonical SHA | Working checkout at capture |
|---|---|---|---|
| Game `shaku1z/tear` | `main` | `0bef91dc4970740c80b1969416c0573680bcaf89` | G0 branch created from that exact SHA |
| Music `shaku1z/tear-score` | `main` | `766b910d07264fd81154be29a3d809c63de5c310` | clean `codex/samply-dropbox-review-sync` at `1611bbb6e6e60d6e9ee1b18d74742c178393f266` |
| Wiki `shaku1z/tear-wiki` | remote `master` | `b57efdaa8774d889555f4708edbe5b1cc6d3ab17` | clean local `master` at `f183b495cc0ee21f9296c7fedcd05cf83ac5eba8`, seven commits behind after non-pruning fetch |

The wiki checkout initially had a stale `origin/master` ref and falsely looked
synchronized. G0 refreshed remote-tracking refs with a non-pruning fetch and
did not merge the seven remote commits.

## Repository truth

### Game

- Entry inventory: 37 local branches, 20 live remote heads plus the
  `origin/HEAD` symref, 16 registered worktrees, one local tag, and one stash.
- `main` and `origin/main` were identical and contain the redesigned
  TypeScript/Vite application. No tracked `js/` tree is present.
- The canonical Final Five in the live bundle are Sword, Hammer, Greatsword,
  Chainblade, and Riftlock. Spear/Ringblade strings occur only in migration
  compatibility.
- Twenty-six unreachable commits existed at entry. G0 made every one reachable
  under `refs/archive/g0-20260820/unreachable/*` before bundling.
- Remaining unreachable non-commit objects after that operation were 591 blobs
  and 766 trees. They are preserved by the full Git-directory archive; no claim
  is made that an all-ref bundle can represent loose non-commit objects.
- Annotated tags now identify the legacy comparison oracle and pre-normalization
  game baseline:
  - `archive/legacy-oracle-ee5e931`
  - `archive/program-normalization-g0-main-20260820`
- `experiment/system-memory-wave-run` incorrectly tracks `origin/main` and is
  reserved for G2/G3 disposition.

### Music

- `main` is foundational and 51 commits behind the complete modern candidate.
- The game-vendored source revision `7633f1e` is not reachable from music
  `main`, but is reachable from the candidate line.
- One unreachable commit (`81be739`) was made reachable under the G0 archive
  namespace before bundling.
- Annotated tags preserve music `main`, the complete candidate, and the exact
  vendored game source revision.
- There are no open pull requests, active default-branch workflows, protection
  rules, or public music deployment.

### Wiki

- Remote `master` is seven generated-data commits ahead of the local checkout.
- Ten pre-existing unreachable commits and the post-fetch displaced Worker
  configuration commit `df54a4b` were made reachable under G0 archive refs.
- Synchronization run `32429787017` fails fetching removed game path
  `js/utils.js` from exact game SHA `0bef91d`.
- Public wiki content reports game source `d62c20e`; `/weapons` returns 404 and
  the canonical Final Five are not documented.
- Wiki PR #1 is an unstable, failed, wide-scope Worker conversion and must not
  merge as-is.

## GitHub and release truth

- None of game `main`, music `main`, or wiki `master` has branch protection or
  a repository ruleset. Delete-after-merge is disabled in all three repos.
- Game PR #1 is stale, dirty, based on the legacy oracle line, and proposes an
  unsafe repository-root static asset directory. It must never merge.
- Current game `main` Validate run `32194860839` failed the Colossus fixed-tick
  browser assertion.
- Cloudflare Workers Build check `95896833010` nevertheless deployed exact game
  commit `0bef91d` as build `2e88ed0d-adfd-478a-b81b-d400f5ffd36a`, production
  version `5f1d5e2d-5d10-4c73-9eb2-0b7f7066f47b`.
- The live game at `https://tearblade.com` contains the expected hashed modern
  bundles and canonical Final Five. It does not publicly expose its Git SHA or
  Worker version.
- The wiki is served by the `tear-wiki` Worker, not Cloudflare Pages. The
  authenticated account has no Pages projects. The latest wiki production
  version is `b72b4f0e-5ae0-4439-9b74-cca7d3fd8d1c` from 2026-07-28.
- `tear-ghost-publication` is configured in source but does not exist in the
  authenticated Cloudflare account.
- Game and wiki GitHub homepage metadata still points to retired Vercel hosts.

## Preservation set

External evidence root:

`C:\Users\realm\Desktop\game\Tear-archives\2026-08-20-program-normalization-g0`

For game, music, and wiki independently, the archive contains:

- an all-ref Git bundle;
- `git bundle verify` output;
- a full `.git` ZIP preserving loose objects and repository administration;
- pre/post archive-ref `git fsck` output;
- local refs, live remote refs, upstreams, worktrees, status, remotes, stashes,
  and identity snapshots;
- a final SHA-256 manifest; and
- a retained bare mirror restore drill.

The earlier recovery bundle at
`C:\Users\realm\Desktop\game\tear-git-recovery-20260728-095822` remains
separate and preserved. Its recorded SHA-256 is
`7337BB54192B57B6E5F6710C19C3026493B4A155BAA24AC0E8A5B3B97527D909`.

## Non-Git workspace inventory — recorded, not removed

- `C:\tmp\Tear-main-publication`: stale divergent non-Git publication copy;
  forbidden for development and deployment.
- `C:\Users\realm\Desktop\game\Tear-receipt-clean`: approximately 370 MB
  non-Git copy requiring unique-file comparison.
- 24 `gsm-*` directories: broken pointers to the missing
  `game-system-memory` repository; preserve until unique evidence is compared.
- `C:\tmp\Foundry-promotion-24577a5ab19c4c1689caf5a25ef2ed90-observed`:
  preserve as audio promotion provenance.
- `C:\tmp\Foundry-Slicing-Life-1-Canonical-Promotion`: preserve as source stem
  and promotion provenance.
- `C:\Users\realm\Desktop\game\Tear-final-five-weapon-roster`: marker-only
  legacy orphan; do not use as a repository.

## Open ownership and disposition questions

These are preserved and intentionally deferred to G2/G3:

- four unique modern commits on `codex/cutting-room-2`;
- alternate guard commit on `codex/main-repair-weapon-core`;
- two system-memory experiment commits;
- detached receipt/budget evidence worktrees;
- the local stash and all rescue refs;
- the complete 51-commit music candidate;
- seven remote-only wiki synchronization commits; and
- large ignored music authoring/source material.

## Freeze declaration

Until G1 closes:

- no production game or wiki deployment;
- no branch, tag, stash, worktree, copied directory, or archive deletion;
- no merge from a legacy JS line;
- no use of copied publication roots;
- no direct attempt to repair production outside the protected release-path
  work scheduled by G1.
