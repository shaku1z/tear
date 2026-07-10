# Tear — Architecture / Code-Quality / Combat Audit + Phased Plan

_Audit only. No code changed. Nothing ships without an explicit go-ahead on the actual diff._

Verified against the live `js/` and `tear-crazygames/js/` builds (main `?v=115`, CG `?v=112`).

---

## 1. Findings, verified against real code

### Confirmed real defects

| # | Bug shape | Where | Severity | What actually happens |
|---|-----------|-------|----------|-----------------------|
| A | #1 raw-overwrite vs max-merge | `js/upgrades.js:111` (Bloodrite T2) | **Med** | `ev.player.guardT = 1.0` clobbers an in-flight Riposte guard window (`guardT` set by parry at `game.js:1800/1831`). A kill mid-parry shortens or lengthens the guard to a flat 1.0s regardless of what was active. Should be `Math.max(guardT, 1.0)`. |
| B | #2 two systems cap one stat | `js/meta.js:74` (Aether Step) vs `js/upgrades.js:97` (Air Dash) | **Med** | Both resolve to `Math.max(maxDashCharges, 2)`. Buying one makes the other a no-op — a dead purchase. Confirmed identical caps. |
| C | #1 sibling | `js/game.js:1479` (`e.stun = 1`), `game.js:1585` (`e.stun = 0.8`) | **Low** | 8 of 10 stun writes use `Math.max(e.stun, X)`; these two raw-assign and can *shorten* a longer active stun. Context-dependent (enemy state transitions), low blast radius, but inconsistent. |
| D | status fragmentation | `js/player.js` `iframe` + `dashIframe` | **Low/design** | Two separate invuln timers OR-ed in the `invulnerable` getter. Works, but fragile — every new i-frame source has to remember which field to read/write. |

### Data-format divergence (real, currently contained)

- **Shape #5:** `js/meta.js` is a ledger (`lifetimeEarned`/`lifetimeSpent`); `tear-crazygames/js/meta.js` is still flat `coins`. `profile.js` also differs between builds.
- **Why it hasn't bitten:** CG (`v=112`) predates cloud meta-sync, so the only meta data in Firestore was written by the main build (ledger). It becomes a live hazard the moment the CG build starts syncing meta to the shared `users/{uid}` doc.

### Doc claims that are STALE (already fixed — do not re-do)

- **Meta ledger migration (doc Problem 2 / Q2):** already shipped in `js/meta.js` — inline migration in both `load()` and `merge()`, idempotent (`if 'coins' in raw && !('lifetimeEarned' in raw)`). And its `Math.max` merge is now **correctly monotonic** (both ledger fields only ever increase), which is precisely the fix for the original non-monotonic coins bug. This is done and deployed.
- **Button styling (doc Problem 3 #2):** `js/ui.js` `button()` already unifies the default style (frosted body + ink hairline + cyan accent bar on hover/focus). The doc's "basic white boxes" description is against an older build.
- **PROFILE.merge Math.max (`profile.js:92-109`):** every merged stat is a monotonic counter or max — safe, not a sibling of the coins bug.
- **`slowStatus`** (`game.js:1496`) is recomputed every frame from live burn state — clean, no stale-slow bug.
- **`game.js:58` swallowed error** is `isLowEnd()` returning a safe `false` default from feature detection — not a real swallow.

### Combat model — fresh assessment

Fundamentally sound and, honestly, better than the doc implies:
- **Damage** (`blade.js:288 damageAt`) is skill-shaped: `(tipSpeed - minHitSpeed) * damageScale` clamped to `maxDamage`, then multiplied by slice quality (cut > poke) and commit (hilt actually travelling > wrist-flick). Good, readable, rewards technique.
- **`hit()` vs `_dot()` split** (`enemy.js:235 / 82`) is correct: DoTs and detonations bypass i-frame + knockback; direct hits don't. Mark amplifies before shield absorption in the right order.
- **Status framework** (`bleed`/`burn`/`mark` via `tickStatus` returning damage for kill-crediting) is the right shape. `stun` and `slowStatus` sit *outside* it — and that's fine: one is a state flag, the other a speed multiplier, neither is a DoT.
- **Balance opinion worth raising (not a bug):** `maxDamage` is a hard clamp, so past a certain swing speed extra tip-speed is wasted. Combined with the commit/slice multipliers stacking multiplicatively, the effective skill ceiling is lower than the inputs suggest. Worth a deliberate look during any combat-tuning phase — but it's a design call, not a defect.

### Q3 — CG replay backport storage assumption is FALSE / risky

The doc assumed CG local storage "has headroom" for the full GHOST v2 + Vault payload. Checked against real code:
- `CG.store` on-platform writes go to `window.CrazyGames.SDK.data.setItem`, **mirrored** to `localStorage` (`crazy.js:76-83`). SDK.data is per-key limited (~1MB) and CrazyGames recommends keeping total data small; localStorage is the usual ~5MB per origin.
- The Vault keeps up to **22 recordings** (`MAX_UNPINNED 12 + MAX_PINNED 10`, `ghost.js:195`), each a full multi-track blob (px capped at 9000 samples ≈ 15 min, `ghost.js:37`).
- The code already **silently drops saves on overflow** (`ghost.js:207` "storage full -> skip silently", `_saveIndex` swallows). So on CG this would fail invisibly: players lose recordings with no signal.

**Recommendation:** do **not** assume headroom. Before any backport, measure a real max-length recording's serialized size, then either (a) ship CG **playback-only** (watch shared replays from Firestore, no local Vault), or (b) backport the Vault with a **much smaller CG cap** and an explicit size budget.

---

## 2. Phased plan (sequenced by risk + dependency)

Principle: isolated low-risk fixes first; anything touching the **shape of saved data** gets its own commit, a synthetic test, AND a real-save test before it ships.

### Phase 0 — Baseline & guardrails (no behavior change)
- Snapshot `git status`; confirm working tree; capture a real local save + a real Firestore `users/{uid}` doc as migration test fixtures.
- No commit.

### Phase 1 — Isolated combat fixes (low risk, no saved-data shape change)
- **A:** Bloodrite T2 → `guardT = Math.max(guardT, 1.0)`.
- **B:** Resolve the Aether Step / Air Dash dead-upgrade — decide whether they stack (`+lv` additive) or one is removed/repriced. This is a **balance decision**, flag for your call before coding.
- **C:** Make the two raw `stun =` sites use `Math.max` for consistency (or confirm intentional and comment why).
- Each is a small, independently reviewable diff. One commit per logical fix.

### Phase 2 — Player status consolidation (design debt, still no saved-data change)
- Optionally unify `iframe`/`dashIframe` behind a single source of truth (the doc's "timers dict" idea, but scoped to only the timed buffs — leave `flowDR`/`berserk`/`shield` computed, as the doc itself concedes). Runtime-only state, not persisted, so lower stakes. Do only if we're touching this area anyway.

### Phase 3 — CG build data-format alignment (SAVED-DATA SHAPE — max scrutiny, isolated)
- Port the ledger model (or a read-compatible migration) into `tear-crazygames/js/meta.js` **before** CG ever syncs meta.
- Prove migration on the Phase-0 fixtures: synthetic flat-coins save → ledger, and a real save round-trip. Own commit, own review.
- Companion: reconcile `profile.js` divergence between builds.

### Phase 4 — CG replay strategy (depends on Q3 measurement)
- Measure real recording size first. Then choose playback-only vs capped Vault. Do **not** backport the full engine blind.

### Phase 5 — Two-build drift (structural, ongoing)
- Establish canonical source + a sync step so `js/` and `tear-crazygames/js/` stop diverging. Largest scope; do last, after the data shapes agree.

---

## 3. What I need from you before touching code
1. **Bug B (Aether Step vs Air Dash):** stack them, or remove/reprice one? Balance call.
2. Confirm Phase order, or reprioritize.
3. Explicit go-ahead is still required on each actual diff, per your process discipline.
