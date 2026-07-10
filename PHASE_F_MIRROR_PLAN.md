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

## Status
Planning complete. Building F1 → onward.
