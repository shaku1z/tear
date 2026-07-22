# Oracle Workbench

Ways to consult `ee5e93141d67cc02505b2227b3be0b10d1819e1c`, cheapest first.

## Point reads (no worktree needed)

```bash
git show ee5e931:js/game.js | sed -n '3560,3620p'
git show ee5e931 --stat
git log ee5e931 --oneline -20          # what the oracle itself contains
git diff ee5e931 HEAD -- js/ src/      # full divergence surface (huge; scope it)
```

Key oracle files: `js/game.js` (state machine, screens, draft flow, pointer-lock policy), `js/ui.js` (UI.t tokens + components), `js/input.js` (Input.mode, allowLock, consumeDelta), `js/blade.js`, `js/player.js`, `js/enemy.js` (~4225 lines: all enemies + bosses), `js/mirror.js`, `js/config.js` (all tuning constants), `js/voidgen.js`, `js/projectile.js`.

## Worktree

`../Tear-oracle` is a git worktree pinned at the oracle. If missing:

```bash
git worktree add ../Tear-oracle ee5e931
```

Use it for grep across the whole monolith, and for serving.

## Twin-serve A/B

The oracle is plain JS — serve it directly with `python ../Tear-oracle/serve.py` (or any static server) from the worktree. Serve the redesign build alongside. Open both in two tabs for direct side-by-side feel/pixel checks of the same scripted session (menu → play → draft → pause → menu).

## Measurement, not vibes

- **Constant diff:** field-by-field diff of `js/config.js@ee5e931` vs `src/config/*` (blade aimSensitivity, aimRadius, tether, spring constants, physics accel/friction).
- **Token diff:** `js/ui.js` UI.t values vs `src/presentation/ui-tokens.ts` — one wrong token reskins dozens of screens.
- **String-literal sweep:** grep oracle screen strings (labels, empty states, column headers) and confirm each exists in the redesign renderers.
- **Trace differ:** where it exists (`tests/parity/`, `scripts/parity-diff.mjs`), record one raw input stream, inject into both builds, dump per-frame state, report first-divergence frame + field. Prefer extending this over eyeballing.
- **Screenshot census:** capture the oracle screen at reference viewports (1920×1080 + mobile logical size) and image-compare against the redesign journey screenshots.

## Oracle state census

`menu, setup, playing, paused, draft, reserve, tierup, settings, continue, gameover, win, pgmenu, pglab, rename, replay` plus codex/profile/leaderboard hubs and the 7 Ledger sub-screens. Use this list when sweeping for sibling divergences.
