# G5 Baseline Inventory

**Status:** G5 is OPEN after protected game `main` and its green post-merge
`Validate` observation. This is a read-only baseline; it authorizes no move,
quarantine, deletion, branch/worktree change, configuration change, or
deployment. Production remains frozen.

**Protected baseline:** game `main` is
`b3c2066692b75d6fbe1708570e16193011a9a095` (`b3c2066`); exact-head hosted
`Validate` run `32630369249` is green. Music `main` is
`7e443d9d75089b80bb641ba654eee46615b1abd6` (`7e443d9`). Wiki `main` is
`33a7f86f8f12ce7c98d1805d169142c832afdcf1` (`33a7f86`).

## Canonical repositories

- `C:/Users/realm/Desktop/game/Tear` is the canonical game root. Its current
  local audit branch is `codex/g5-organization-audit` at the protected SHA;
  Soundtrack Desk requires the eventual target branch to be `main`.
- The only registered game worktrees are the root and locked detached
  `C:/Users/realm/Desktop/game/Tear-oracle` at `ee5e931`; the oracle remains
  comparison-only.
- `tear-score` and `tear-wiki` each have one clean protected `main` worktree.

## Workspace findings

- There are 24 `gsm-*` directories under
  `C:/Users/realm/Desktop/game` and none under `C:/tmp`. Each has an invalid
  `.git` file targeting the missing
  `game-system-memory/.git/worktrees/<name>` directory; `git rev-parse` exits
  128 for each. Their bounded non-generated payload is 2,559 files and
  16,252,092 bytes.
- Exact non-Git publication/receipt copies are
  `C:/tmp/Tear-main-publication`,
  `C:/Users/realm/Desktop/game/Tear-receipt-clean`,
  `C:/Users/realm/Desktop/game/Tear-receipt-clean2`, and
  `C:/Users/realm/Desktop/game/Tear-receipt-clean3`. The latter two retain
  G3 removal-registration receipts but remained non-empty after removal.
- `C:/Users/realm/Desktop/game/Tear-archives` contains four dated G0/G3/G4
  archive groups: 454 files and 932,153,217 bytes, with SHA256 manifests and
  cleanup receipts. The older
  `C:/Users/realm/Desktop/game/tear-git-recovery-20260728-095822` remains
  outside that archive and contains a 42,593,587-byte preserved-refs bundle;
  its `settings.local.json` was not read or hashed.
- `C:/tmp/tear-g3-preservation-audit-20260822-01` is a separate recovery
  bundle containing bare `game.git`, `music.git`, and `wiki.git` repositories;
  they are not active worktrees and must not be swept as scratch data.

## Soundtrack Desk boundary

The ignored local fallback config
`C:/Users/realm/Desktop/game/tear-score/config/foundry.local.json` points to
`C:/Users/realm/Desktop/game/Tear`, requires branch `main`, and requires a
clean tree. Canonical Soundtrack Desk config and environment variables were
absent. Tracked example configs still mention the disposable
`Tear-main-publication` name; updating those examples and owner guidance is a
follow-up G5 documentation slice. No local config values or credentials were
published here.

## Inventory boundary

The audit excluded dependency trees (`node_modules`), `.git` internals,
build/output directories, ignored runtime artifacts, secrets, local config
contents, and external service state. No unique-data disposition is implied.
Any future quarantine must first create a bounded path/hash manifest, preserve
timestamps and restore instructions, assign an owner and retention date, and
leave canonical repositories, recovery bundles, and music-owned audio scratch
data in place.
