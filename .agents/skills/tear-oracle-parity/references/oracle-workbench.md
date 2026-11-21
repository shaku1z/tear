# Reading the oracle

Ways to consult `ee5e93141d67cc02505b2227b3be0b10d1819e1c`, cheapest first.

## Point reads, no checkout needed

```bash
git show ee5e931:js/game.js | sed -n '3560,3620p'
git show ee5e931 --stat
git grep -n "aimSensitivity" ee5e931 -- js/
```

Oracle files: `js/game.js` (state machine, screens, draft flow, pointer-lock policy), `js/ui.js` (tokens
and components), `js/input.js`, `js/blade.js`, `js/player.js`, `js/enemy.js` (all enemies and bosses),
`js/mirror.js`, `js/config.js` (all tuning), `js/voidgen.js`, `js/projectile.js`. They exist only at that
commit; `main` has no `js/` folder.

## The locked checkout

A checkout pinned at the oracle sits beside the canonical game checkout, in a folder named `Tear-oracle`.
It is locked ([docs/DECISIONS.md](../../../../docs/DECISIONS.md), D-002): read and serve it, never edit,
commit in or build from it, and do not create another one.

The parity commands look for it at `../Tear-oracle` relative to the repository root. From a worktree that
path is wrong, so set `TEAR_ORACLE_ROOT` to the locked checkout's path. They refuse to run if it is not
exactly at `ee5e931`.

## Parity commands

[docs/PARITY.md](../../../../docs/PARITY.md), "Parity microscope", is the authority. Each serves the oracle
and the current test build on separate local origins, replays one fixture from `tests/parity/` through
both, and writes paired traces and a report under `artifacts/parity/`:

- `pnpm parity:blade`, `pnpm parity:player`, `pnpm parity:enemy`, `pnpm parity:combat`,
  `pnpm parity:ranged`, `pnpm parity:projectile-parry`, `pnpm parity:mirror`
- `pnpm parity:diff` compares two trace files and reports the first differing frame and field.
- `pnpm test:parity:unit` tests the differ itself.

The required check runs the same fixtures against the current build only (the `test:browser:*` scripts that
pass `--current-only`), so it needs no oracle.

## Measuring by hand

- **Constants:** compare `js/config.js` at the oracle with `src/config/` field by field.
- **Tokens:** compare the oracle's `js/ui.js` values with `src/presentation/ui-tokens.ts`. One wrong token
  changes many screens.
- **Strings:** search the oracle's labels, empty states and column headers and confirm each is in the
  current renderers.
- **Side by side:** serve the oracle with any static file server and the current build with
  `pnpm preview`, and play the same scripted session in both.
- **Screens:** capture the oracle at a reference viewport and compare with the current journey's
  screenshots.

## Oracle screen states

`menu, setup, playing, paused, draft, reserve, tierup, settings, continue, gameover, win, pgmenu, pglab,
rename, replay`, plus the codex, profile and leaderboard hubs. Use the list when sweeping for the same
difference elsewhere.
