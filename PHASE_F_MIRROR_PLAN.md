# Phase F — THE MIRROR: a living reflection that learns and echoes you

_The AI Boss Actor, realized. Additive-not-atomic (per `tear-ai-boss-actor-v1.md`), built on the
two proven seams (`player.aiInput`, `blade.aimOverride`) and the reusable `_segNear` collision.
Same discipline as A–E: each sub-phase is verified in-page and committed in isolation._

---

## The concept

Echo's original, unrealized premise was "a boss that fights like the player." Tear is now a game
**about ghosts, replays, and tears in space** — so the boss shouldn't just fight *like* you, it
should be **a reflection of you that learns your habits and echoes your own movement back at you**,
converging from a crude torn double into a near-perfect adversarial mirror over the course of a duel.

It is not a scripted boss. It is a second, real momentum-blade fighter — same physics you feel —
driven by an adaptive AI that reads how *this* player fights and answers it.

### Four pillars

1. **A real fighter, not a puppet.** The Mirror owns a real `Player` (driven via `aiInput`) and a
   real momentum `Blade` (driven via `aimOverride`). Its dashes, jumps, leash-lag, tip-speed damage —
   all the genuine article. Nothing about the existing player/blade/enemy code changes; the Mirror
   lives *outside* `enemies[]` and the `player` singleton entirely.

2. **It reads you.** A rolling behavioral model tracks this fight's player: approach distance,
   dash cadence, airborne %, swing rhythm, parry attempts, throw frequency. Its decisions bias off
   that read — turtle and it baits; over-commit and it punishes; spam dash and it pre-empts.

3. **It echoes you (the on-brand core).** Tear already records movement for Ghost replays. The Mirror
   keeps a short rolling buffer of *your* recent motion and, at intervals, **replays a mirrored
   snippet of your own last few seconds** as an attack run — "the Tear throws your rhythm back."
   This is the feature that makes "it fights like you" literally true, reusing the ghost recorder's
   shape.

4. **Sync ↔ desync escalation.** A single `sync` value (0→1) is the whole difficulty/phase curve:
   at low sync the Mirror is slow to react, loosely spaced, telegraphed, and renders as a **torn,
   chromatic-aberrated double** of the player. As sync climbs it reacts faster, spaces tighter,
   lands cleaner, unlocks more of your tricks, and visually **converges onto looking exactly like you**.
   Landing a **perfect parry on the Mirror shatters sync** (knocks it back down) — the core parry
   mechanic literally fractures the reflection, giving the player agency over the phase curve.

### Stretch flourishes (built if they land cleanly)
- **Blade-clash deflect:** two momentum blades meeting tip-to-tip at speed throw a shockwave and
  knock both back — emergent swordplay from the existing deflect feel.
- **Playstyle tells:** the Mirror telegraphs with tells that echo the player's own.

---

## Architecture (all additive)

```
Enemy.takeHit(dmg, kx, ky, src)   -> one-line wrapper into existing hit()      [F1]
Player.takeHit(dmg, kx, ky, src)  -> one-line wrapper into existing takeDamage()[F1]
Mirror (js/mirror.js, new)        -> owns its own Player + Blade (aiInput/aimOverride),
                                     lives outside enemies[]/player singleton      [F2+]
Mirror.updateCombat(dt, player, playerBlade)
                                  -> ONE isolated function, two _segNear checks:
                                     player blade vs Mirror.actor, Mirror blade vs player [F2]
```

The main loop only calls `Mirror.update/draw/updateCombat` while a duel is active; nothing existing
has to learn the Mirror exists. Blade tether is decoupled from global `Input.lmb` (a per-blade flag)
so the two blades don't cross-contaminate.

---

## Sub-phases (each verified + committed)

- **F1 — Actor shim.** `takeHit()` wrappers on `Enemy`/`Player`. Zero behavior change; verify existing
  damage still resolves identically. _(smallest, safest — proves the additive thesis)_
- **F2 — Mirror skeleton + isolated collision loop.** `js/mirror.js`: owns Player+Blade, decoupled
  blade tether, `updateCombat` doing both `_segNear` directions, placeholder "face + occasional swing"
  AI. A dev summon to see it collide in isolation before any real AI.
- **F3 — Movement layer.** Port attract.js's kite-band/orbit/approach + real dashes, driven by a
  decision layer rather than raw distance.
- **F4 — Behavioral read + decision v1.** Rolling player-read model; states: approach / space / commit /
  bait-feint / punish / defend (parry-or-dash react to an incoming player swing).
- **F5 — Ghost-echo.** Rolling capture of the player's recent motion; the Mirror periodically replays a
  mirrored snippet as an attack run. The signature feature.
- **F6 — Sync escalation + torn-double visual.** The 0→1 sync curve driving reaction/spacing/accuracy/
  trick-unlocks; chromatic torn rendering that converges as sync rises; perfect-parry shatters sync.
- **F7 — Fightable duel (integration).** A real, self-contained encounter the player can actually fight
  (HP, defeat/victory, the Tear aesthetic), wired in additively (summonable) so the "home" decision
  stays deferred per the doc. This is the finish line.
- **F8 — Build-awareness (stretch).** Read `run.mods` and bias behavior (contest air vs air builds,
  bait parries less vs Backlash, etc.).

Firewalled out of scope (per doc): all networking / rollback / determinism.

## Status — SHIPPED (F1–F8 complete, pushed to main)

| Sub-phase | Commit | What shipped |
|---|---|---|
| F1 | `3797d6c` | Additive `takeHit()` shims on Enemy + Player |
| F2 | `01485cd` | Mirror skeleton + isolated two-way collision loop; blade `lmbOverride` |
| F3+F4 | `7279fb2` | Adaptive AI: read-model + decision states (approach/space/strike/bait/punish/dodge), sync-gated reactions |
| F7 | `01071ee` | Fightable integration — summon in Playground with **M** |
| F5 | `30f9718` | Ghost-echo — replays your own recorded motion back at you |
| F6 | `0fba79a` | Sync escalation + torn-double chromatic visual + blade-clash sync-fracture |
| F8 | `a836fa0` | Build-awareness — reads `run.mods` (air / parry) and biases behavior |

Every sub-phase verified in-page (headless sims + direct-call checks): two-way collision, approach→band→strike,
echo capture+replay, sync drift/clash/nudge, torn draw, mod-flag derivation + guard-window refusal. Live in-game
visual not auto-captured (the Input layer ignores synthetic events) — **to see it: Playground → press M**.

Deferred (optional future): a dedicated non-Playground "home" for the Mirror (Echo's true form / a new boss),
richer decision v2 (stamina/commitment reads), and audio. Networking/rollback stay firewalled out per the doc.

## F9 — Full-kit swordplay + robustness (v2)

Follow-up pass so the Mirror unmistakably *wields the actual momentum blade like the attract hero* and is
bulletproof to summon in the Playground.

- **Wields the blade like attract.** It now keeps the blade LIVE — bursting a real slash arc whenever you're
  within reach (~140px), not only when a state explicitly commits — so the sword reads as a constant threat,
  exactly like the attract demo's deliberate slashing (still never swings while baiting/dodging/mid-throw).
- **Its own blade identity.** Additive per-blade `trailColor`/`glowColor` on `Blade`; the Mirror wields a
  **violet** blade so its swoosh/tip-glow read as the Mirror's, distinct from your cyan.
- **Full momentum-blade kit — it THROWS.** New `throw` intent: at mid-range it hurls its real blade at you
  (`Blade.throwBlade`), the thrown blade damages on contact (collision case 3), and it **auto-recalls**
  (`freeRecall = true` + a recall timer guarantee it's never left weaponless). While the blade is out it
  kites — the complete "fights like you" moveset (held + thrown + echo).
- **Robustness / definitely-playable.** `startRun` force-deactivates any summoned Mirror so it can never leak
  into a real campaign/endless run; the actor's `moveBoost`/`slowMult` default to 1 (constructor) so its
  physics are self-sufficient without the per-frame fields `game.js` only sets on the real player.

Summon unchanged: **Playground → M**.
