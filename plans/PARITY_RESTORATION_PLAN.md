# TEAR — Source-of-Truth Parity Restoration Plan

**Oracle commit:** `ee5e93141d67cc02505b2227b3be0b10d1819e1c` ("fix(weapons): align throw range and handling") — the last pre-redesign monolith (`js/*.js`). Everything in this plan is measured against that commit's *behavior*, not just its text.

**Problem statement:** the architectural redesign (`0829094` + `3318931`, 571 files, js/ monolith → modular TS `src/`) introduced "lazy" divergences. Four restore commits already re-matched some code textually (`937a09c`…`b98497b`), yet the blade/cursor/mouse still doesn't feel like the source, and UI screens like the draft differ. That tells us the remaining bugs are **systemic** (frame order, state ownership, dt model, adapter plumbing) rather than line-level — so this plan attacks parity as a *measurable property*, not a vibe.

---

## Phase 0 — Build the Parity Oracle (foundation for everything else)

You can't restore a feel you can't measure. Before touching gameplay code:

1. **Twin-serve harness.** `git worktree add ../Tear-oracle ee5e931` and serve it (it's plain JS, `serve.py` works). Run oracle and redesign side by side in two browser tabs for direct A/B feel checks.
2. **Input-trace replayer.** A small dev harness that records a raw event stream (mousemove deltas, buttons, keys, timestamps) once, then injects the identical stream into BOTH builds. Dump per-frame `{aimX, aimY, reticle, blade tip, player x/y/vx/vy, state}` to JSON.
3. **Golden-trace differ.** A script (`scripts/parity-diff.mjs`) that compares the two dumps and reports first-divergence frame + field. This turns "feels off" into "frame 214: aimX diverges by 31px because delta was consumed twice."
4. **Cursor-state probe.** Log every pointer-lock request/exit, `Input.mode` change, and CSS cursor change with the game state at that moment, in both builds, for the same scripted session (menu → play → draft → pause → menu).

Deliverable: `tests/parity/` harness + first divergence report. This is the microscope every later phase uses.

## Phase 1 — Blade / Cursor / Mouse: restore the input contract end-to-end

Known structural differences already spotted (all in the new build):

- **Double-capture path:** `live-game-runtime.ts:384` (`sampleAim: () => blade.captureDeviceAim(...)`) lets the replay recorder consume pointer-lock deltas *before* the simulation; `blade-core.ts` then calls `captureDeviceAim` again inside `_updateAim`. The second call sees a zeroed delta — harmless only if call *order and hand position* exactly match the oracle's single mid-update read. In the oracle, `_updateAim` was the one and only sampler. Audit exactly when `sampleAim` fires relative to player physics; the hand anchor it uses (`handPos(player)` pre-step vs post-step) shifts the aim vector by a frame of player movement every frame — a classic "mushy aim" source.
- **`aimOverridePoint()` lazily latches** (`aimOverride ??= {…}`, blade-core.ts:122) — the oracle never latched; overrides were written explicitly per frame by attract/mirror. Any stray call on the *player's* blade permanently hijacks aim until `clearOverrides` runs. Verify no live-play path (mirror echo, replay adapters, debug snapshot) touches the player blade's `aimOverridePoint`.
- **Pointer-lock lifecycle:** oracle rules — `Input.allowLock = (state === "playing")` set every frame (game.js:3581), `exitPointerLock()` at every transition out of play (draft open, pause, continue, replay, pgmenu…), and `Input.consumeDelta()` flushed on re-lock (game.js:6577) so freed-cursor motion never kicks the reticle. Verify each of those exits/flushes has a 1:1 equivalent in the state-machine adapters; the redesign scattered them across `live-debug-harness`, `reward-runtime`, and screen adapters — a missed one = reticle jump or stuck-locked cursor.
- **Cursor presentation:** `cursor-contract.ts` shows the **native** cursor during unlocked "playing" — the oracle drew the UI arrow on every non-playing screen (game.js:3868) and showed *nothing extra* in playing; check `data-imode` body attribute parity too (game.js:468). Reproduce the oracle's exact policy table: {state × mode × locked} → cursor.
- **Frame/dt model:** oracle ran variable-dt rAF; the redesign has `runtime-frame-driver` / `runtime-frame-coordinator` (possible fixed-step). Blade whip feel (tip speed → glow → hit checks in `_recomputeTip`, spring constants, `lerp(…, k*dt)`) was tuned for the oracle's dt regime. Confirm the sim step matches; if fixed-step was introduced, either revert to source timing or prove trace-parity through the differ.
- **Sensitivity & tether:** diff `CONFIG.blade` (aimSensitivity, aimRadius, minTether, spring constants) field-by-field between `js/config.js@ee5e931` and `src/config/*`; also `Input.tetherHeld` derivation (lmb + padTether channels).

Exit criteria: input-trace differ shows zero divergence over a 60s recorded session covering held swings, capture/release, throws, tether-tighten, pause/draft round-trips; side-by-side A/B feels identical.

## Phase 2 — Drafts UI (and sibling reward screens) back to source

The oracle's draft flow (game.js): `buildDraft()` (≥2 Specials guaranteed per 10-wave stage, expandedDraft → 4 cards), `state = "draft"` + `exitPointerLock()`, `renderDraft()` with card layout, keyboard `focus`, `listScroll` reset so cards are never culled, `uiZoom` for small touch screens, reroll + reserve + tierup as sibling states.

1. **Pixel parity pass:** screenshot oracle draft/reserve/tierup at 1920×1080 and mobile logical size; diff against the new `src/presentation/screens` renderers (card geometry, typography, rarity colors, special badges, reroll button, hover/focus halo, entrance animation timing).
2. **Behavior parity:** draft guarantee math (`specialsOffered`, `specialBlock`, `draftsLeft` window), reroll count sourcing, reserve-pick flow, evolve-priority path ("nothing to evolve → normal draft", game.js:2226), wave-clear beat delay before the draft opens (game.js:2173), zoom + scroll reset rules.
3. **Input parity on the screen itself:** mouse hover vs keyboard focus vs pad focus; click-source tagging so touch taps aren't misread; cursor arrow drawn over the draft (non-playing screen rule from Phase 1).
4. Extend the same audit to the screens the draft shares chrome with: **pause, gameover, win, continue, confirmquit** — the redesign rebuilt them from the same screen-registry machinery, so any systemic styling drift will show there too.

## Phase 3 — Full-surface UI regression sweep (find the *other* lazy changes)

A systematic hunt rather than waiting for you to notice each one:

1. **Screen census:** enumerate every oracle state (`menu, setup, playing, paused, draft, reserve, tierup, settings, continue, gameover, win, pgmenu, pglab, rename, replay, codex/profile/leaderboard hubs, ledger sub-screens`) and capture oracle screenshots as the reference set.
2. Walk the same census in the redesign (browser journey tests already exist in `tests/` — reuse them) and image-diff. Triage divergences into: intentional (none expected — source of truth wins), lazy simplification (fix), or missing feature (restore).
3. Special attention to systems the memories flag as painstakingly tuned: attract-mode live background on all tabs, hero PLAY menu, Ledger's 7 sub-screens, mobile Pocket overlay zoom + touch density, controller focus/scroll model, HUD (style meter, storm bank, boss ritual banners).
4. **UI.t token audit:** diff `js/ui.js` + `js/DESIGN_SYSTEM.md` tokens against `src/presentation/ui-tokens.ts` — one wrong token value silently reskins dozens of screens.

## Phase 4 — Player & enemy behavior parity

The oracle's `enemy.js` (4225 lines), `player.js`, `mirror.js`, `projectile.js`, `voidgen.js` were shredded into `src/gameplay/**`. Beyond feel, the risks are dt-sensitivity and lost side effects:

1. **Physics constants + integrators:** diff player movement (accel, friction, jump, dash, updraft/slam empowerment windows, coyote/buffer timing) and confirm integration order (velocity-then-position vs position-then-velocity changes feel at identical constants).
2. **Enemy AI conformance:** for each enemy kind + the four Pantheon bosses + THE MIRROR, replay a scripted player trace in both builds and diff enemy positions/HP/phase timings. The wave-clear planner, spawn scheduler, and affix application already have unit tests — add *oracle-conformance* fixtures generated from the old build.
3. **Combat resolution:** tip-speed hit gating (`minHitSpeed`), pierce sets, parry windows, launch/spike/superslam empowerment branches, tether yank forces (incl. boss resistance 0.18/0.12 counter-pull), throw range/recall state safety (the oracle commit itself was a throw-handling fix — verify it survived the port).
4. **Weapons overhaul (WA1)** sits on top: confirm the five-weapon ability layer still matches its own conformance tests *after* any physics/dt corrections, since retuning dt can silently rebalance it.

## Phase 5 — Lock it in

1. Convert every trace/screenshot comparison that found a bug into a permanent test: golden input-replay checksums for blade/player, snapshot tests for screens, conformance fixtures for enemies.
2. `docs/PARITY.md`: the contract table (cursor policy, pointer-lock lifecycle, frame model, draft guarantees) so future refactors have a spec instead of re-deriving from the monolith.
3. Commit per phase, push after each commit (project rule). Suggested branch: continue on `codex/architectural-redesign`.

## Confirmed parity repairs

- **Boss arrival release (2026-07-22):** the oracle mutates the live boss's `introT` to zero before discarding `bossIntro` (`js/game.js@ee5e931:3593-3594`). The redesigned frame boundary advanced a detached snapshot, discarded it on the terminal frame, and stranded the real actor at a small positive `introT`. That permanently activated every boss's movement and collision-protection gate. The adapter now explicitly commits the terminal mutation, with a detached-snapshot unit regression and a five-boss browser journey that proves intro release, post-intro AI movement, pointer capture, and real held-blade damage.

## Sequencing & effort

Phase 0 first and non-negotiable (~the microscope). Then 1 → 2 (the two named complaints), then 3 ∥ 4 (independent), then 5. Each phase ends with a side-by-side A/B session as the human acceptance test.
