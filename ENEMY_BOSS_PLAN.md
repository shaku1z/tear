# Enemy / Boss Mechanics + AI Boss Actor — Phased Plan

_Audit-first, as usual: each fix is verified against real code, then diff → approve → commit,
one isolated commit per fix. No saved-data shapes involved in any of the bug fixes below._

Sources: `enemy_audit_report.md`, `tear-enemy-boss-audit-findings-v1.md`, `tear-ai-boss-actor-v1.md`.

## Verification status (this session, against live code)

| Finding | Verdict | Evidence |
|---|---|---|
| #1 Boss fake-death dies to DoT | **Confirmed** (Aldric/Source); Warden **differs** | `hit()` floors HP at 1 in `downed` (`enemy.js:1674`, `1924`) but `_dot()` (`82`) has its own unconditional `if (hp<=0) dead=true` and is not overridden. Warden uses a timed `state="fakedeath"` (`1394`, 2.2s) with **no** HP floor / `hit()` override — same phase-skip risk, different code path. |
| #2 Stun grants i-frames | **Confirmed** | `game.js:1488` `if(e.stun>0){e.stun-=dt;continue;}` skips `update()`→`tickTimers()`, so `hitCd` freezes → only one hit lands per stun. The tutorial-dummy path (`1478`) already calls `tickTimers` for exactly this reason but the fix was never generalized. |
| #3 Armored shield-break softlock | **Confirmed** | Enrage (`game.js:1585`) sets `enraged=true` without clearing `atk`/`atkT`; the `stompwind` cleanup at `enemy.js:978` is gated on `!this.enraged`, so it never resolves — telegraph freezes. Enrage also grants an intended 1.8× speed (`989-990`), so the enemy is buffed *and* visually stuck. |
| #4 Chimera cooldown bypass | **Confirmed, but a design call** | `recover` drains `copyT`→0 then hands to `idle` (`enemy.js:1239`), which decrements it negative and instantly re-fires (`1244-1245`). Real, but "nastier Chimera" may be desirable. |
| #5 Geomancer teleport-on-interrupt | Report-only (plausible) | Verify at implementation; cosmetic/positional. |
| #6 Boss difficulty scaling gap | **Design question, not a bug** | Needs your decision (below). |
| #7 Elite-variant hardcoded scaling | Report-only (matches known pattern) | Same "two systems, one stat, no ceiling" shape as Air Dash/Aether Step. Verify at implementation. |

**Corrections carried forward (do NOT chase):**
- Burn's `Math.max`-on-duration is **intended** (non-stacking by design) — both audits' own follow-ups agree. Not a bug.
- The new-abilities spec's **Glacial Wake T1 assumption is wrong**: there is no generic `slowStatus` system; the only slow is a hardcoded `e.burnT>0 && run.mods.cinderSlow` check (`game.js:1496`). When [[tear-new-abilities-spec-v1]] is built, Glacial Wake either needs its own slow impl or should be the occasion to build a real generic slow system.

## Phases

### Phase A — Boss fake-death DoT protection (finding #1) — DO FIRST
Most severe: a lingering Bleed/Burn kills Aldric / Source (and can skip Warden's P3) mid-fake, breaking the scripted fight — happens by accident with any DoT build. Fix: a single phase-lock check both `hit()` and `_dot()` respect. E.g. base `Enemy._phaseLocked()` returns false; bosses return true while scripted-invulnerable (`mode==="downed"` for Aldric/Source, `state==="fakedeath"` for Warden). `_dot()` skips lethality when locked, mirroring the existing `hit()` floor. Small, isolated, own commit. Verify by applying a DoT then forcing the fake-death.

### Phase B — Stun i-frame freeze (finding #2)
High roster-wide impact (Concussive Dash, Sunder, Backlash, Impale, Razor Momentum T3 all stun as combo-enablers). Fix: `game.js:1488` → `if (e.stun > 0) { e.tickTimers(dt); continue; }` (tickTimers already decrements `stun` at `enemy.js:231`, so this both avoids a double-decrement and lets `hitCd`/`flash`/`hpDisplay` tick). No movement/AI change — enemy stays frozen, only timers advance. Verify: stun an enemy, confirm repeated hits now land.

### Phase C — Armored shield-break softlock (finding #3)
Fix at the enrage site (`game.js:1585`, adjacent to the Phase-1 stun edit): also clear the charge — `e.atk = "idle"; e.atkT = 0;` — so the frozen telegraph resolves. Keep the intended enrage speed buff. Verify: break an Armored's shield mid-`stompwind`, confirm the telegraph clears and it resumes normal behavior.

### Phase D — State-machine + scaling hygiene (findings #4, #5, #7) — lower urgency
Fold into one "combat hygiene" pass, each verified first (some may be WONTFIX):
- #4 Chimera `copyT` — decide desirable-aggression vs. add real idle cooldown.
- #5 Geomancer channel-on-climb — clear `atk` when `climbNav` interrupts.
- #7 Elite-variant hardcoded scaling — the architectural one: route variant multipliers through a single scaling application point instead of stacking raw on global wave scaling. Treat as the standing "one source of truth for a stat" fix.

### Phase E — Boss difficulty-scaling gap (finding #6) — YOUR DECISION, no code yet
Campaign bosses currently get zero difficulty-tier scaling (flat `CONFIG` stats on Easy→Extreme) while trash scales; Gauntlet uses a separate formula. Is fixed boss difficulty intentional (a stable skill check) or should bosses route through the shared difficulty system? Decide before any code.

### Phase F — AI-Driven Boss Actor (`tear-ai-boss-actor-v1.md`) — separate track, after A–C
Large, additive feature; build-the-tech-first, no boss home decided. Its **additive-not-atomic** design is sound and matches this project's proven "alongside, not replacing" patterns (Replay Passport, tiered replays). Sequence per its own doc: (1) `takeHit()` shim wrappers on `Enemy`/`Player` (zero behavior change) → (2) `BossActor` + isolated collision loop with placeholder input → (3) port attract.js movement primitives → (4) decision-making v1 (parry-recognition + baiting) → (5) v2 (commitment awareness) → (6) build-awareness (stretch) → (7) home decision.
Validate its two load-bearing assumptions **early** (Phase F1–F2), before investing in AI:
- `_segNear`/`tipSpeed` collision math is cleanly reusable pointed at a new (blade, target) pair.
- A second live `Blade` instance's cost is acceptable (its open question) — measure before committing to "literal second Blade" vs. a lighter collision-only weapon.
Keep multiplayer's networking/rollback/determinism blocker firewalled out, per the doc.

## Status
- **A, B, C, E — DONE** (shipped + pushed, isolated commits `b24387b`, `49c5555`, `7f94080`, `597c68b`). Each verified in-page.
- **D — DONE** (`9ffd735`, cache `v=120`): #4 Chimera idle-beat restored, #5 Geomancer channel-hold. **#7 assessed as NOT a bug** (intended multiplicative variant identity — compounds cleanly with wave scaling, not the dead-cap anti-pattern) and left as-is, same call as Burn's `Math.max`.
- **F** — not started (separate multi-week track). Recommended next if continuing.

## Recommended order
A → B → C (three independent quick, verifiable fixes, one commit each) → **E** (owner confirmed: real gap, fixed) → D (hygiene) → F as its own track. Nothing here touches saved data.
