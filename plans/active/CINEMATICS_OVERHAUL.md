# Cinematics overhaul plan

## Authority metadata

- **Owner:** Cinematics owner (cinematics-overhaul session)
- **Status:** Active
- **Closure condition:** Every "done when" line below holds, `src/gameplay/runtime/cinematic-director.ts` and the boss ritual files no longer exist, the rule over every boss passes, and `pnpm check:functional` passes from the final commit.

## Why

On 2026-11-20 the owner said of the cinematics: "That whole thing, is trash and needs to be
overhauled completely." They named two faults:

- **Boss fights stop.** "During boss fights, they completely stop the flow of the fight, stopping
  everything, time freeze ahh, having to click to move on." And: "This game is about momentum."
- **They look outdated.**

The lead's decision (brief of 2026-11-20) is binding:

- Nothing inside a boss fight stops the fight: no time freeze, no slow motion by default, and no
  click or hold to continue.
- Scenes outside fights are cut hard, restyled to the current look, skippable, and never trap input.
- One plain system remains; the blocking paths are deleted.
- **Slow motion (lead ruling, 2026-11-20).** No boss-side event slows time: not a phase change, a
  death, a stagger or a strike. The one source left is the player's own parry,
  `CONFIG.juice.parrySlowmo` 0.18 s at time scale 0.28 (`blade-parry-runtime.ts`,
  `live-collision-phase.ts`). It is the player's move, not the fight stopping. Until PR 6, the boss
  arrival still runs at time scale 0.25 (`introScale`); PR 6 removes it with the letterbox.
- A rule over every boss proves that no tick blocks input or the combat step.

This plan covers what exists, what each piece becomes, what is deleted, the in-fight phase change of
each boss, old data, and the pull requests. It holds no code. The look is decided on a look board
(pictures, kept outside the repository) that the owner approves before any visual code.

## What the game does today (verified 2026-11-20 on main `6fb1a7cd`)

### How a fight is stopped

1. A boss crossing a phase threshold calls `bossTransformation`
   (`src/gameplay/entities/enemy-types/boss-runtime.ts:180-205`). For a full boss this sets
   `cinematicRequest`; minibosses already take the non-blocking `bossPhaseBeat` instead (:181-184).
2. `stepEnemyActors` (`src/gameplay/combat/enemy-step-runtime.ts:91-92`) launches a ritual script
   on the one cinematic channel (`src/gameplay/campaign/cinematic-launch-runtime.ts:209-227`).
3. The script sets `blocksCombat: true` and `hideHud: true`, and every beat holds the player in
   `"locked"` (`src/gameplay/entities/boss-ritual-controller.ts:149-173`).
4. While it runs, the combat step returns at once (`src/gameplay/combat/combat-step-prelude.ts:89-95`).
   The player is made invulnerable (`player.ts:222`), keyboard, pad and touch input turn into UI
   input (`src/app/shell/runtime-frame-coordinator.ts:266-267`), and the confirm press is routed to
   the scene (:169-183).
5. One beat, the boss's spoken line, waits for a tap or a reading timeout (`completion:
   "confirm-or-timeout"`). Holding confirm for 0.8 s skips. After the scene, the player gets 0.45 s
   of grace (0.7 s after a landing) and the press that ended the scene is thrown away
   (`combat-step-prelude.ts:97-105`, `src/input/scene-release.ts`).

The cinematic preference (Full, Brief, Off) shortens or skips the rituals. The Source's void descent
ignores it.

### Every cinematic in the game

Durations marked "measured" come from `pnpm playtest bosses --phase 1,2 --seed 1,2,3 --player
scripted,cuts-objects` on `6fb1a7cd` (the `cinematicTicks` field, 120 ticks a second), with the
default Full preference and no presses. The rest are computed from the timings in the cited files.

| # | Cinematic | Where it plays | How long | Blocks? | Becomes |
| --- | --- | --- | --- | --- | --- |
| 1 | Boss arrival card | Every boss, every mode | 1.4 s of wall time at time scale 0.25 (`bossTheater`, `game-config.ts:313`; `frame-runtime.ts:50-57`), so 0.35 s of game time; letterbox bars, HUD hidden | Slows time; input works; the boss cannot attack | **Kept, restyled, made non-blocking:** an entrance move in game ticks plus the name banner. No slow motion, no letterbox, HUD stays. |
| 2 | Warden Phase II ritual `warden-unchained` | Warden fight | **6.73 s measured** | Yes | **Non-blocking:** Warden move plus banner |
| 3 | Warden Phase III ritual `warden-nothing-left` | Warden fight | **5.10 s measured**, then its 2.2 s fake death (live, the Warden can be hit) | Yes (the ritual) | **Non-blocking:** the fake death stays as its move; the ritual goes |
| 4 | Colossus Phase II ritual `colossus-breach` | Colossus fight | 6.09 s (computed; 4.71 s Brief) | Yes | **Non-blocking:** Colossus move plus banner |
| 5 | Colossus Phase III ritual `colossus-meltdown` | Colossus fight | **6.11 s measured** | Yes | **Non-blocking** |
| 6 | Aldric Phase II "THE THRONE BURNS" | Aldric fight | 1.15 s banner with 0.4 s slow motion (`boss-runtime.ts:64`) | No | **Kept;** slow motion removed |
| 7 | Aldric Phase III ritual `aldric-crownfall` | Aldric fight | 6.79 s (computed) | Yes | **Non-blocking:** the crown falls as part of his move |
| 8 | Aldric revive ritual `aldric-witnessed` / `aldric-angered` | Aldric fight, after the kneel | 5.33 s / 5.19 s (computed, always Brief) | Yes | **Non-blocking:** banner plus his first frenzy move |
| 9 | Rootbound Phase II ritual `rootbound-garden-remembers` | Rootbound fight | **6.20 s measured** | Yes | **Non-blocking,** designed by the Verdant rebuild (see "Rootbound") |
| 10 | Rootbound Phase III ritual `rootbound-nothing-here-dies` | Rootbound fight | **6.72 s measured** | Yes | **Non-blocking,** as row 9 |
| 11 | Source Phase II "THE WORLD UNMAKES" banner, then the void descent `voidDescent` | Source fight | Descent **11.3-11.6 s measured** (1,353-1,389 ticks; playtest finding of 2026-11-20). Two spoken lines that wait for a tap or timeout, then unmake 0.8 s, lift 0.72 s, reveal 0.82 s, and a landing that waits until the player stands on something | Yes; it ignores the preference; in one measured fight it never ended and the player fell forever | **Non-blocking:** the Unmake move |
| 12 | Source Phase III "IT REMEMBERS EVERY BLADE" banner and kneel | Source fight | 1.15 s banner with 0.42 s slow motion; 3.6 s live kneel | No | **Kept;** slow motion removed |
| 13 | Source true-form ritual `source-true-form` | Source fight, after the kneel | 6.79 s (computed) | Yes | **Non-blocking:** banner plus its first true-form move |
| 14 | Echo phase changes (live Echo is `MirrorHost` in `src/gameplay/entities/mirror.ts`) | Echo fight | Move cancelled, 1.1 s before its next move, **0.55 s slow motion** plus 0.07 s hit-stop (`mirror.ts:315-356`), floating text | No | **Kept;** slow motion removed; the text becomes the shared banner |
| 15 | White Hart phase changes (`white-hart.ts:681-697`) | Pale, unpublished | 0.55 s recovery, no banner | No | Unchanged (Pale is out of scope); covered by the rule |
| 16 | Miniboss phase banner (`bossPhaseBeat`) | Endless and Gauntlet minibosses | 1.15 s banner, 0.38-0.42 s slow motion | No | **Kept;** slow motion removed |
| 17 | Boss death | Every boss | 0.9 s dying body (`enemy-base.ts:321-337`), death preset slow motion 0.70-0.85 s and hit-stop 0.08-0.10 s (`boss-runtime.ts:19-112`), then another 0.18 s slow motion at `resolveBossDeath` (`combat-actions.ts:740`) | Slows time | **Kept;** both slow motions removed; dying body and hit-stop stay |
| 18 | Chapter opening | Adventure, each stage on first entry in a session | Full: 38.7 s (Chapter I, with the 3-page prologue), 24.8-31.3 s for the others; Brief: 9.9-14.8 s. Each page waits for a tap or its reading time; hold 0.8 s skips to the biome reveal | Yes (no enemies yet; the first wave is held) | **Kept, cut and restyled:** a chapter card of 2.4 s over the live arena; the player is in control from the first tick |
| 19 | Finale "the final cut" | End of Adventure, after the Source dies | Silence 0.55 + wound 1.45 + relics 2.0 + the cut (the player swings through anchors; assist after 13 s) + restoration at least 2.4 + epilogue (waits for a tap) + reward (waits for a tap) | Yes | **Kept, cut and restyled:** the cut stays and is played on the live combat step; the epilogue is one card; the reward beat merges into the results screen |

Blocked time per fight today, measured or summed from the table:

| Boss | Fight length (measured, scripted players) | Time the fight stands still |
| --- | --- | --- |
| Rootbound | 31.8-36.6 s from Phase I | **12.9 s (about 38 %)** |
| Warden | to its death, both rituals | 11.8 s |
| Colossus | to its death, both rituals | 12.2 s |
| Aldric | to its death, crownfall and revive | 12.1 s |
| Source | to its death, descent and true form | 18.1-18.4 s |

All seven chapter openings together run 200.8 s at Full (169.5 s for the six published stages).

## Target shape

### Inside a fight: a phase change is a boss move

- **The boss shows it.** A phase change is a move on the boss's own move table, with windup, active
  and recover in ticks like every other move. The body changes (silhouette, colour, weapon) and the
  new phase's first move follows. This is how Echo and Aldric's Phase II already work.
- **The player keeps control.** The combat step runs on every tick. Input never turns into UI input,
  nothing waits for a press, and the player is never made invulnerable by a phase change.
- **At most a banner and a camera nudge.** `bossPhaseBeat(boss, title, color)` stays the one in-fight
  beat (same name and signature, agreed with the Verdant rebuild on 2026-11-20). It adds:
  - a banner under the boss bar: phase numeral and title, plus an optional short line, no panel,
    no letterbox, HUD up, no input;
  - the boss's `phaseTransition` feedback: shake, flash, zoom nudge 0.03-0.05 and its sound.
  It never sets slow motion. The boss arrival uses the same banner.
- **Hit-stop.** The phase-breaking hit keeps only the hit-stop that hit already has. That is at most
  `CONFIG.hitStop.big` 0.07 s, the largest hit-stop any in-fight hit uses today (blade big hits,
  Echo's phase change). No extra freeze is added for a phase change. The death preset keeps its
  existing 0.08-0.10 s hit-stop: it is the largest in the game today, and the fight is over.
- **A window where the boss can't be hit is at most 0.8 s.** Measured against Aldric's and
  Colossus's phase pacing (the time from the phase tick to the boss's first new-phase attack, read
  from their code):

  | Phase change | Gap before its first new attack | Can it be hit in the gap? |
  | --- | --- | --- |
  | Colossus Phase II | 0.8 s (`crossT = 0.8`, `colossus.ts:242`) | Yes |
  | Colossus Phase III | 0.35 s (first hot panel) | Yes |
  | Aldric Phase II | none (fire starts at once) | Yes |
  | Aldric Phase III | up to 6.0 s kneel | Yes, at 0.3 times damage |

  So no boss may refuse damage for longer than 0.8 s (96 ticks) from its phase tick, and the
  refusal must show on its body (under the floor, in the rear plane). Aldric's kneel is not a
  refusal; it stays.
- **No ritual layer.** No script, no channel, no player mode, no confirm.

### Outside fights: one card, no waiting

- **Chapter card.** When a stage starts in Adventure, the chapter numeral, title and the stage's
  one-line intro (`chapter.intro`, for example "ORDER ENDS AT THE EDGE.") write themselves into the
  stage's upper sky in the biome ink. They hold for 2.4 s and fade.
  - The player is in control from the first tick and can move through the empty arena.
  - The first wave arrives when the card ends, or at once if the player attacks or throws first.
    That attack is the skip: it needs no prompt, no extra key and no hold. The wave's existing grace
    (ruleset v9) still applies.
  - The lore pages, the three-page prologue and the fallen boss's outro page leave play. They add
    reading time to the run, and the owner's verdict and the brief ("cut them hard") do not keep
    them in play.
  - Their text is not deleted (lead ruling, 2026-11-20). It moves into the Codex as lore entries,
    written as data rows, in the same pull request that removes it from play. If the Codex has no
    place for lore, that pull request adds the smallest one that fits and says so.
- **Finale.** After the Source dies:
  - Silence, wound and relics merge into one 1.2 s beat. The relics fly to the blade while the player
    already moves.
  - The cut stays and is the best part: the anchors are world objects the player cuts with the
    ordinary held or thrown blade on the live combat step. If no anchor is cut for 6 s, one is
    severed for them every 1.15 s (today's `cutAutoStep`); the "hold confirm to assist" path goes.
  - Restoration takes 1.5 s; colour and gravity return under the player's own physics.
  - The epilogue is one card in the same style as a chapter card ("AFTER THE DESCENT", "THE FIRST
    MORNING" and one line). It holds for its reading time. Any press goes on to the results screen.
  - The reward beat is deleted. The results screen already shows the score and time, and it gains
    the restored blade trail and campaign emblem line.
- **Skippable without trapping.** Nothing outside a fight waits for a press. A card can be cut short
  by playing (chapter) or by any press (epilogue), and Escape opens pause as usual.

### One system: the stage beat

There is one plain way to stage a beat: a **stage beat**. It is a small piece of world state:
`{ kind: "banner" | "chapter" | "epilogue", title, line, accent, startTick, ticks }`.

- It is owned by one module, `src/gameplay/stage-beat.ts`. Kinds and their durations are data there.
- It is stepped in simulation ticks like any world timer. It never gates input or the combat step.
- `bossPhaseBeat` and the boss arrival add a `banner`. A stage start adds a `chapter`, and the wave
  rule reads it. The finale adds an `epilogue`.
- One presentation function draws all three, with a layout per kind:
  - banner: under the boss bar;
  - chapter and epilogue: in the stage's upper sky, in the biome ink.
- Being world state, a beat is in the snapshot, so replays and State Setup show it with no extra
  path.

A boss move is not staging: it is gameplay on the boss's move table. So after the overhaul the game
has boss moves for what happens, and stage beats for what is written on screen. There is no
director, no channel, no script, no player mode and no confirm.

## The in-fight phase change of each boss

Each entry gives the threshold (`src/gameplay/run/boss-definitions.ts:36-86`), what happens on the
phase tick, the body, the moves, and any can't-be-hit window. Banners use the boss's existing phase
tag as their title. A spoken line, where kept, is the banner's short line: shown with the title,
never typed out letter by letter, and gone with the banner.

### Warden (Phase II below 0.65, Phase III below 0.30)

- **Phase II, "UNCHAINED".**
  - Phase tick: the Warden slams its staff. That move has a 0.3 s windup on the body: the staff
    raised, the badge lights.
  - On the slam, the searchlights spawn and the first lockdown cages rise at both walls. This is
    what `_enterPhase` already does (`warden.ts:291-339`); only the ritual in front of it goes.
  - Banner: "II · UNCHAINED", line "THE RULES ARE ALL THAT REMAIN."
  - Moves: Phase II's 3-beat string with the unparryable finisher, searchlights and recurring
    lockdown, unchanged.
  - Can't be hit: never.
- **Phase III, "NOTHING LEFT".**
  - Phase tick: the fake death (2.2 s slump, death-locked, takes damage) starts at once. It is
    already a live move.
  - The arena platform fracture and the zone clear happen on the same tick.
  - Banner: "III · NOTHING LEFT", line "THERE IS NOTHING LEFT TO GUARD." It is shown during the slump.
  - Moves: the ceiling cling, marked debris and the dive lunge, unchanged.
  - Can't be hit: never (the slump is a free-hit window, as today).

### Colossus (Phase II below 0.60, Phase III below 0.25)

- **Phase II, "BREACHED".**
  - Phase tick: the front shield tears off the arm. Its first Phase II move is the saw throw, with
    a 0.45 s windup: the arm draws back and the saw glows. Today the throw waits until the ritual
    ends (`after: "throwShield"`).
  - The cross-burst begins at `crossT = 0.8` as today.
  - Body: the shield plate gone, the ruptured arm showing (`warden-colossus-renderers.ts:255, 277`).
  - Banner: "II · BREACHED", line "OUTER CONTAINMENT FAILED."
  - Can't be hit: never; it takes damage as soon as the shield is gone.
- **Phase III, "MELTDOWN".**
  - Phase tick: the core opens and the four hot panels start stepping 0.35 s later, as today.
  - Body: the core glow, already drawn.
  - Banner: "III · MELTDOWN", line "CORE CONTAINMENT: LOST."
  - Can't be hit: never.

### Aldric (Phase II below 0.65, Phase III below 0.20)

- **Phase II, "THE THRONE BURNS":** already in-fight (`_lightFire`, `bossPhaseBeat`). Only the 0.4 s
  slow motion goes.
- **Phase III, "CROWNFALL".**
  - Phase tick: the phase-breaking hit knocks the crown off with the velocity it already gets
    (vx ±330, vy −420; `aldric.ts:800-837`), and Aldric drops to his kneel.
  - The crown is now a world object in flight under gravity. When it lands it fractures the platform
    it lands on. The fracture is the same arena fracture request, chosen by the same "platform below
    the crown" rule that `prepareCrown` uses today; that rule moves into Aldric. The platform shows
    its crack tell from the moment the crown is airborne. Today the crown is lerped there by the
    ritual.
  - Banner: "III · CROWNFALL", line "A THRONE IS ONLY WOOD."
  - The kneel, its reduced damage, regeneration, the witnessed and angered branches and the
    "STRIKE — OR STAND WITNESS" prompt are unchanged and live.
  - Can't be hit: never.
- **Revive.**
  - Phase tick: frenzy starts and his first frenzy move is the vertical vault at once (today
    `resolve-first-vertical` waits for the ritual to end).
  - Banner: "III · WITNESSED" with "A KING NEEDS NO THRONE.", or "III · THE BEAST" with "YOU CHOSE
    THE BEAST."
  - Body: the frenzy body and heat colour, already drawn.

### Echo (live `MirrorHost`, Phase II below 0.60, Phase III below 0.25)

- Echo already changes phase in the fight. On the phase tick:
  - its move is cancelled and it waits 1.1 s before its next move;
  - the blade grows (length bonus 30 → 65 → 100) and the colour shifts;
  - in Phase II a Reflection splits off; in Phase III the reflections dissolve and the whiteout
    cycle begins.
- Change: the 0.55 s slow motion goes. The 0.07 s hit-stop stays, because it is `hitStop.big`. The
  floating "THE REFLECTION SPLITS" and "FINAL REFLECTION" become the shared banner ("II · THE
  REFLECTION SPLITS", "III · FINAL REFLECTION").
- Can't be hit: never.
- The legacy `Echo` class in `echo-enemies.ts` is drawn only by the bestiary preview
  (`bestiary-preview.ts:88`). Its `bossTransformation` call is removed with the ritual layer.
- **Follow-up outside this plan (lead ruling, 2026-11-20):** the bestiary preview draws the live
  `MirrorHost`, and the legacy `Echo` class is deleted.

### Source (Phase II below 0.58, Phase III below 0.28)

- **Phase II, "THE WORLD UNMAKES": the Unmake move.** This replaces the 11.5 s void descent.
  1. Phase tick: the Source stays in the front plane and starts a 1.6 s channel. Its body rises and
     draws in light, and it can be hit (at its normal damage).
  2. Tick 0 to 0.8 s: the arena floor and platforms show their crack tell. At the same time the
     first void platforms of the stream materialize, drawn as forming, at the heights the descent's
     reveal places them today (`arena-rules.ts`, `ensureStream`). The player can see where to go
     before anything gives way.
  3. 0.8 s: the old arena dissolves. The player keeps ordinary control. If they were on the floor,
     they get the descent's lift (`descentLiftVelocity`) once as an upward impulse, then normal
     gravity, so they land on a void platform. Today the lift is a scripted float.
  4. 1.6 s: the channel ends and the Source moves into the rear plane for its Phase II depth attacks,
     as today.
  - Banner: "II · THE WORLD UNMAKES", line "THERE IS NO BELOW."
  - Can't be hit: never during the Unmake. The rear plane after it is Phase II's normal mechanic, not
    part of the change.
  - This removes the cause of the 2026-11-20 playtest finding, where the player fell below the arena
    after the descent: footing now exists before the floor goes. The fall-forever case gets its own
    permanent regression test: it replays that fight (Riftlock, seed 1, avoids-tells) and requires
    a landing on a void platform within the cap after the dissolve, and never a position below the
    stream.
  - **The timings above are a starting point, not settled (lead ruling, 2026-11-20).** The Source
    pull request first takes a fresh `pnpm playtest bosses --boss source` run, sets the channel,
    crack tell and lift numbers from it, and puts those numbers in the pull request.
- **Phase III, "IT REMEMBERS EVERY BLADE":** the live kneel and frozen void stay as they are. Only
  the 0.42 s slow motion goes.
- **True form.**
  - Phase tick: the void thaws at ×1.35 and the core turns `perfect`.
  - The first true-form move follows at once.
  - Banner: "III · TRUE FORM", line "EVERY BLADE RETURNS TO ME."

### Rootbound

- The Verdant rebuild session (`verdant-pale-rebuild`) designs and builds Rootbound's phase changes.
  Agreed shape (its message and this plan's reply, 2026-11-20):
  - the change happens on the threshold tick, as moves on its own table ("Uproot", "Last Bloom");
  - it is under the floor and can't be hit for about 0.6-0.8 s, inside the 0.8 s cap;
  - it surfaces in its new body state;
  - it calls only `bossPhaseBeat`, never `bossTransformation`;
  - no slow motion; the phase-breaking hit keeps its contact hit-stop (0.035-0.055 s);
  - its death uses the shared death beat.
- Until pull request 1 lands, Rootbound's slices call `bossPhaseBeat` with a per-call `slowmo: 0`.
- This plan builds nothing for Rootbound.

### Boss arrival and death (every boss)

- **Arrival.**
  - The boss's entrance is a move of 1.0 s of game time (120 ticks) in which it cannot attack. Today
    it is 1.4 s of wall time at time scale 0.25, which is 0.35 s of game time.
  - The entrance is counted in simulation ticks. Today `introT` is counted by the frame prelude in
    wall time (`frame-runtime.ts:50-57`). The intro-clock slice (after PR 3) moves it onto ticks
    first with the arrival unchanged; PR 6 then restyles the arrival on that tick clock.
  - It can be hit, except where a boss's own design says otherwise (Rootbound blocks during its
    intro today; that is the Verdant rebuild's call).
  - Existing entrance moves stay: Warden's shockwave, Colossus's two ground shocks.
  - The name and epithet come in as a banner. No letterbox, no hidden HUD, no slow motion.
- **Death.**
  - The 0.9 s dying body and the death preset's hit-stop stay.
  - The death preset's slow motion and the 0.18 s slow motion at `resolveBossDeath` go.

## What is deleted

### Whole files (`src/`, sizes from `wc -c` on `6fb1a7cd`)

| File | Bytes | Replaced by |
| --- | --- | --- |
| `src/gameplay/runtime/cinematic-director.ts` | 27,382 | stage beat |
| `src/gameplay/entities/boss-ritual-controller.ts` | 10,610 | boss moves |
| `src/gameplay/entities/boss-ritual-cues.ts` | 4,246 | banner data on each boss |
| `src/gameplay/campaign/live-cinematic-runtime.ts` | 12,222 | nothing |
| `src/gameplay/campaign/cinematic-launch-runtime.ts` | 7,996 | nothing |
| `src/gameplay/campaign/cinematic-player-runtime.ts` | 6,687 | normal player physics (the finale landing's few lines move into the finale) |
| `src/gameplay/campaign/cinematic-contracts.ts` | 1,521 | nothing |
| `src/gameplay/campaign/cinematic-preference.ts` | 1,146 | nothing (setting retired) |
| `src/gameplay/campaign/chapter-cinematic-binding.ts` | 8,139 | stage beat |
| `src/gameplay/campaign/campaign-sequences.ts` | 3,107 | nothing |
| `src/gameplay/campaign/finale-binding.ts` | 5,271 | finale state in the world |
| `src/app/campaign/cinematic-host.ts` | 6,735 | nothing |
| `src/app/engineering/state-setup-cinematic-advance.ts` | 574 | nothing |
| `src/presentation/cinematics.ts` | 9,738 | stage beat drawing |
| `src/presentation/ui-cinematic.ts` | 22,412 | stage beat drawing (about 4 KB new) |
| `src/presentation/cinematic-prompts.ts` | 1,613 | nothing (no prompts) |
| `src/input/scene-release.ts` | 1,282 | nothing |
| `src/playtest/headless/chapter.ts` | 2,114 | nothing |
| **Total** | **132,795** | |

### Shrunk

- **Rewritten.**
  - `ui-chapter.ts` (19,319) becomes the chapter and epilogue layouts of the stage beat drawing,
    about 6 KB.
  - `chapter-controller.ts` (11,168) keeps only stage chapter data, about 3 KB.
  - `finale-controller.ts` and `finale-runtime.ts` (29,451 together) lose the director binding,
    player modes and confirm beats, about 12 KB removed.
  - The descent half of `arena-rules.ts` (`prepareDescent`, beats, `enterDescentBeat`, about 6 KB)
    becomes the Unmake steps, about 3 KB.
- **The rest of `src/`, about 56 KB.** Mostly the blocking branch in `combat-step-prelude.ts`, player
  protection and grace (`player.ts`), the `cinematicRequest`, `cinematicT`, `cinematicPose` and
  `cinematicColor` fields and their gates in `enemy-base.ts` and the boss files, the transformation
  poses in `enemy-renderer-runtime.ts` (about 3.7 KB), and the cinema branches in State Setup,
  TearBench, playtest, the agent host, the frame coordinator, presentation composition, the snapshot
  validator (about 3.3 KB) and settings. The full file list is in the shared notes
  (`cinematics-periphery-inventory.md`), and each pull request reports its own measured bytes.

### Tests

- **Deleted whole (about 69 KB).**
  - Rituals and descent (32,573 bytes): `boss-ritual-controller`, `boss-ritual-gate`,
    `cinematic-director-state`, `live-cinematic-host`, `boss-phase-change-landing`,
    `browser-state-setup-source-void.js`.
  - The preference (2,878 bytes): `cinematic-preference`, `browser-cinematic-preferences.js`.
  - Chapter binding (33,560 bytes): `chapter-cinematic-binding`, `chapter-opening-flow`,
    `chapter-presentation-contract`, `live-campaign-sequences`, `detached-campaign-binding`.
- **Shrunk:** about 35 KB in 15 files, the largest being `production-replay-composition.test`,
  `browser-state-setup-runtime.js`, `live-state-setup-runtime-bridge.test` and
  `browser-boss-parity.js`.
- **New:**
  - the rule over every boss;
  - the stage beat test;
  - the chapter card test;
  - the Source Unmake landing test;
  - the old-settings test.

**Net:** about 133 KB of whole `src/` files and about 80 KB of other `src/` code go, against about
20 KB of new code. Tests lose about 104 KB and gain about 25 KB. Of the 107 `src/` files that
mention cinematics or rituals today, 15 are deleted whole; with `finale-binding.ts`,
`scene-release.ts` and `headless/chapter.ts` that is 18 `src/` files, plus 13 test files.

## The rule over every boss

A permanent test, `tests/unit/boss-fight-flow.test.ts`, is the rule over all content. It iterates the
game's boss catalog (`boss-definitions.ts`, plus the live Echo), so a new boss is covered by adding it
to the catalog.

1. **Setup.** For each boss, the production headless environment starts the fight. A probe player
   alternates left and right input every 12 ticks and attacks. Damage is dealt to carry the boss
   below each threshold and then to its death.
2. **Every tick from the boss's spawn to the end of its death:**
   - the combat step ran (no early return);
   - the player's input reached the player: velocity follows the probe's direction within one input
     window, except while the player is stunned or knocked back by a real hit;
   - no stage beat, boss or campaign state gated input or the combat step.
3. **From each phase tick:** the boss refuses damage for at most 96 ticks (0.8 s) in a row.
4. **Data check.** No `phaseTransition`, `death` or arrival feedback preset, and no boss's own phase
   feedback (Echo's included), carries `slowmo`. No hit-stop is above 0.10 s.
5. **Until pull request 5.** The test has an allowlist of the phase changes that still block. It may
   only shrink, like the repository's other baselines. Pull requests 2, 3 and 4 and the Rootbound
   rebuild each remove their entries. Pull request 5 deletes the allowlist.

## Old data

- **Replays (coordinated with the replay owner).**
  - Each pull request that changes the simulation steps the ruleset in
    `src/gameplay/run/ruleset-version.ts`, with a one-line reason: pull requests 1, 2, 3, 4, 6, 7 and 8,
    and the intro-clock slice.
  - A replay recorded under an earlier ruleset shows the replay plan's retired-ruleset line in
    place of WATCH (`REPLAY_OVERHAUL_PLAN.md`, "Stored and published replays when the format or
    ruleset changes"). Nothing is deleted.
  - Players only ever record under deployed rulesets, so the intermediate steps between two
    production deploys cost nothing.
  - This plan also removes most of the replay plan's failure mode 2 ("story pauses, cinematic
    confirms or the finale run on application frames"). After pull request 8 no scene waits for a
    confirm, and every beat runs in simulation ticks. The application-frame confirm path
    (`runtime-frame-coordinator.ts:169-183`, `ghost-frame-recording.ts:91-101`) is deleted in pull
    request 8 or in replay PR 5, whichever lands second.
- **Snapshots (codecs owned by the replay owner, in `src/gameplay/snapshot`).**
  - Pull request 5 removes these fields, with a version step on each changed codec:
    - player `cinematicProtected` and `cinematicGraceT` (`tear.player.v1`);
    - enemy and boss `cinematicRequest`, `cinematicT`, `cinematicPose`, `cinematicColor` and
      Source's `requestVoidCinematic` (`tear.enemy.v1`, `tear.boss.v1`);
    - the world runtime's `cinemaProtection`, `bossCinematicBinding` and `cinemaInput`.
  - Pull request 6 adds the stage beat field to the world runtime.
  - Pull request 8 removes `tear.cinematic.v1` and the world runtime's `chapterBinding` and
    `finaleBinding`.
  - A State Setup state saved before a step is refused with a plain message naming the version.
  - The tutorial gold proof fixture (`tests/fixtures/tutorial-gold-reference-proof.json`) holds
    `tear.cinematic.v1` and the player fields. It is regenerated together with the reference data
    and binding, as `AGENTS.md` ("Tutorial gold") says.
- **The cinematic preference.**
  - It is stored as `cinematics` in the plain `tear_settings` blob (`settings-controller.ts:46, 147,
    210, 263`), which has no envelope version.
  - Pull request 7 adds `"cinematics"` to `RETIRED_SETTINGS` (`settings-controller.ts:69`), the same
    path that dropped the retired station.
  - Its test loads an old blob with `cinematics: "brief"` and checks that the key is gone and every
    other setting is kept, like the existing station test (`settings-controller.test.ts:182`).
  - The "Story scenes" row leaves Settings.
- **Seen keys.**
  - The ritual writes `tear.cinematic.<id>` to local storage on completion (`cinematic-host.ts:169`),
    and nothing reads it.
  - Pull request 5 stops writing it and removes existing keys in the legacy state cleanup, with a
    test.
- **Achievement `cinematic_kill`.** It means a kill during the stage-clear transition, not the
  director. Its persisted id stays unchanged.

## Pull request sequence

Each pull request leaves `main` shippable: every fight is winnable, every boss reaches every phase,
and Adventure plays from Chapter I to the finale.

### Where it stands (handoff, 2026-11-21)

This section is the handoff. Whoever picks the overhaul up, with or without the earlier sessions'
notes, starts here.

- **Merged:** PR 0 (#340), PR 1 (#350), PR 2 (#357) and PR 3 (#367, Aldric, ruleset v18).
- **In review:** the intro-clock slice (#374, ruleset v19), on branch `codex/cinematics-intro-clock`.
  The lead approved it. It merges alone, after #373, which resumes preview deploys.
  - Before it merges, run `git merge origin/main` on the branch.
  - If #366 has landed, move the cinematics position edit into the cinematics area's file under
    `config/position/` and run `pnpm position:render`.
  - If main took a ruleset step in the meantime, #374 takes the next free number. #372 (replay)
    plans to take v20 after it.
  - If main changed the determinism corpus in the meantime, regenerate
    `tests/fixtures/canonical-hash-stream.json`. Run it twice: the two runs must give the same
    hashes. A pinned boss seed that no longer survives is re-picked by the rule in
    `tests/support/hash-stream-corpus.ts` (the first surviving seed in the fixed list), and the
    counts there are updated.
- **Preview card:** the in-game card for #367 is on the ledger as `visuals/cinematics-aldric-preview`, posted
  2026-11-21 against preview main b9c31197. It gives the preview link, the quickest route to Aldric (`/dev/`,
  PLAY, Boss Test, Aldric), what to watch in the crownfall and the revive, and two test-build frames.
  **Owed:** once #374 is on the preview, add it to that card: the boss arrival counts game ticks and
  should feel as before (1.4 s). This is a new picture or a note on the same document, never a new card.
- **Next slice:** PR 4, the Source (below). Its first step is a fresh `pnpm playtest bosses --boss
  source` run, whose numbers set the Unmake timings. The fall-forever regression test comes next.
- **After it:** PR 5 waits for Rootbound's pull request (see "Coordination"). PRs 6-8 draw new art
  on the owner-approved look board.

### PR 0: this plan (docs only)

The plan, its row in `plans/README.md`, and a cinematics area in `config/position/cinematics.json`.

**Order (lead ruling, 2026-11-20).** Pull requests 1-5 only take blocking and slow motion out.
They draw nothing new: a phase change shows with today's `bossPhaseBeat` banner and the boss's
existing body and arena tells. They start now. Pull requests 6-8 draw something new (the banner
style, the chapter card, the epilogue card) and wait for the owner's verdict on the look board.

### PR 1: the rule over every boss, and no slow motion

- The rule test lands, with its allowlist of the 10 phase changes that still block (this plan first
  counted 11; the rule measured 10: two each for the Warden, the Colossus, Aldric, Rootbound and the
  Source).
- Slow motion goes from:
  - every `phaseTransition` and `death` preset;
  - Echo's phase change;
  - `resolveBossDeath`.
- Slow motion also goes from every boss stagger preset (0.30-0.35 s) and from boss strikes and
  counters: Aldric's Crownfire 0.38 s and Overhead 0.35 s; the Colossus's CORE EXPOSED 0.42 s,
  Meltdown Slam 0.40 s and smash landing 0.36 s; the Source's MEMORY COLLAPSED 0.38 s and IT TOOK YOUR
  BLADE 0.35 s (lead ruling). The boss feedback types lose their slow-motion field.
- Ruleset step.
- Done when the rule's data check passes for every boss and `pnpm test:determinism` passes.

### PR 2: Warden and Colossus change phase in the fight

- Their four rituals are replaced by the moves above, shown with today's banner.
- Colossus's saw throw becomes its first Phase II move.
- Four entries leave the allowlist. Ruleset step.
- Done when the rule passes for both bosses with no allowlist entry, and `pnpm playtest bosses
  --boss warden,colossus --phase 1,2` reports 0 cinematic ticks and phase rows for every phase it
  reaches.

### PR 3: Aldric changes phase in the fight

- Crownfall and revive become the moves above.
- The crown is a world object that fractures the platform it lands on.
- Two entries leave the allowlist (crownfall and the revive). Ruleset step.
- The ritual binding saved in a world snapshot keeps its crown fields (`crownStart`,
  `crownTarget`, `crownPlatform`, `crownSound`, `crownFractureColor`) and the ritual's
  `bomberColor`, always empty now: they are part of the `bossCinematicBinding` shape, which PR 5
  removes with its codec step. No ritual moves a crown after this pull request.
- Done when the rule passes for Aldric, and the existing kneel, witness and anger tests pass
  unchanged.

### The intro-clock slice: the arrival counts simulation ticks

Approved by the lead on 2026-11-21, after PR 3. It narrows replay's frame-clock exception (see
"Coordination") and changes nothing a player sees or hears.

- `introT` counts 42 simulation ticks at the same time scale 0.25, instead of 1.4 s of wall time
  counted by the frame prelude.
- A test proves the wall-clock arrival is unchanged: 1.4 s within one frame, at 60 Hz and at the
  120-tick step.
- Before and after frames match at the same moments.
- One ruleset step, at the next free number.
- The lead is copied on the pull request, and the replay overhaul gets its number.
- PR 6 later restyles the arrival on this tick clock.
- Done in the slice's pull request:
  - Ruleset v19. The detached step's frame-clock exception now covers cinematics only.
  - On a frame where a tick ran, the arrival's progress equals the frame clock's. Between ticks it
    holds, so its fades step at 30 Hz, as the bodies in the arrival already did.
  - A headless world (replay verify, the headless playtest) used to play the arrival as 168
    full-speed ticks; it now plays 42, as live play does. The determinism corpus's fixed-cadence
    boss script had leaned on that free window: about half its boss seeds died before their horizon.
    The boss streams now play with the boss playtest's tell-avoiding player, each on a pinned seed.
  - **Named gap:** per-weapon Phase II is not covered by an 18 s boss stream. Phase changes are
    covered per boss, with the sword only, and nothing covers them per weapon (docs/PITFALLS.md).

### PR 4: the Source's Unmake and true form

- A fresh `pnpm playtest bosses --boss source` run comes first. The Unmake timings are set from it,
  and its numbers are in the pull request.
- The void descent and the true-form ritual are replaced by the moves above.
- The fall-forever regression test is added: a landing guaranteed within the cap.
- Two entries leave the allowlist. Ruleset step.
- Done when the rule passes for the Source, `pnpm playtest bosses --boss source --weapon riftlock
  --seed 1 --player avoids-tells` no longer reports a broken fight, and no player falls below the
  void stream in `pnpm playtest sweep` for the Source.

### PR 5: delete the blocking path

Waits for PRs 2-4 and the Rootbound rebuild's phase-change pull request, so that the allowlist is
empty.

- Delete:
  - the blocking branch in `combat-step-prelude.ts` and player protection and grace;
  - `bossTransformation` and `cinematicRequest`;
  - the ritual controller and cues, the launch, live and player cinematic runtimes;
  - the transformation poses in the enemy renderer;
  - the State Setup ritual and descent branches and the codec fields listed under "Old data";
  - the seen keys;
  - the tests listed as deleted for rituals and descent.
- The rule test loses its allowlist.
- Done when nothing in `src/` mentions `blocksCombat`, `cinematicRequest` or `ritual`, the rule
  passes for every boss, and `pnpm check:functional` passes.

### PR 6: the stage beat, the banner and the arrival

Waits for the owner's verdict on the look board.

- `src/gameplay/stage-beat.ts`, with the `banner` kind and one drawing function for it, in the
  approved style. Its world field goes into the world codec, live capture and the detached world
  hydrator (see "Coordination").
- `bossPhaseBeat` and the boss arrival add a banner.
- The arrival loses its slow motion (`introScale`), letterbox and hidden HUD. The entrance, already
  counted in ticks since the intro-clock slice, becomes 120 simulation ticks.
- Ruleset step.
- Done when the banner matches the approved board in a built screenshot, the detached parity tests
  pass, and `pnpm test:determinism` passes.

### PR 7: the chapter card

Waits for the owner's verdict on the look board.

- Chapter openings become `chapter` stage beats over the live arena.
- The wave rule is "card ended or first attack".
- The pages, prologue and boss outros leave play, and their text moves into the Codex as lore data
  rows in this pull request.
- The cinematic preference is retired with its old-save test, and the Settings row goes.
- The chapter tests listed as deleted are replaced by the chapter card test.
- `DESIGN_SYSTEM.md` ("Adventure chapter presentation contract") and
  `VISUAL_DESIGN_DIRECTION.md` ("Adventure chapters, boss cards, and the finale") are rewritten to
  the approved board.
- Ruleset step.
- Done when an Adventure run reaches wave 1 of Chapter I with the player moving from the first
  tick, the card matches the approved board in a built screenshot, and the browser progression
  journeys pass.

### PR 8: the finale and the director go

Waits for the owner's verdict on the look board (the epilogue card).

- The finale plays on the live combat step, with the epilogue card. The reward beat merges into
  the results screen.
- Delete:
  - `cinematic-director.ts` and `tear.cinematic.v1`;
  - the application-frame confirm path and the UI-mode switch during scenes;
  - replay's frame-clock exception and its test (see "Coordination");
  - `scene-release.ts`, the cinematic presentation files and prompts.
- Update `docs/FEATURE_INVENTORY.md`, `RUNTIME_RECOVERY_CONTRACT.md`, `PITFALLS.md`, the skills'
  routing text and `config/change-impact-defaults.json`.
- Ruleset step.
- Done when Adventure finishes from the Source's death to the results screen with no press
  required, nothing in `src/` mentions the cinematic director, and `pnpm check:functional` passes.

## Evidence per pull request

- The closest unit tests, the rule over every boss, and `pnpm test:determinism`.
- `pnpm playtest bosses` before and after for every boss the pull request touches: fight length,
  cinematic ticks (must reach 0) and time in each phase.
- **Visual slices (6, 7, 8):** screenshots from a built `dist/test-standalone`, beside the approved
  board frames.
- If `combat-step-prelude.ts` or anything else in the tutorial gold closure changes, the build's
  tutorial gold check runs. The tutorial has no cinematics, so its output is expected to stay the
  same.

## Coordination

- **Verdant rebuild (`verdant-pale-rebuild`):** owns Rootbound's phase changes and death cleanup
  ("nothing outlives its move"). Shape agreed on 2026-11-20 (see "Rootbound"). PR 5 waits for its
  phase-change pull request.
- **Replay overhaul:** owns the snapshot codecs and the ruleset table's player-facing line. Every
  codec field change above goes to it for review before merge, with the PR number sent before the
  PR touches `src/gameplay/snapshot`. Agreed on 2026-11-20; the order above does not clash with
  theirs.
  - Replay PR 4 moves the detached world from `src/tearbench` to `src/app/world/detached/`. For
    example, `production-application-frame.ts` becomes `application-frame.ts`, and
    `detached-world-hydrator.ts` becomes `world-hydrator.ts`. Live capture and restore move to
    `src/gameplay/snapshot/live-capture.ts` and `live-restore.ts`. Codec PRs here branch from
    main after that lands and use the new paths.
  - The stage beat field (PR 6) goes in three places: the world codec, live capture and the
    detached world hydrator. `tests/unit/detached-live-parity.test.ts` and
    `detached-finale-live-parity.test.ts` check that they agree.
  - Replay PR 5 deletes `ghost-frame-recording.ts` and `application-frame-events.ts`. Whichever
    of that and PR 8 lands second deletes the remaining application-frame confirm path.
  - **The frame-clock exception (lead ruling, 2026-11-21).** Replay PR 5b records the cinematic
    and boss-intro frame clock as its one exception to "actions at ticks only". This plan narrows it
    and then removes it:
    - the intro-clock slice takes the boss arrival off it;
    - PR 5 takes the rituals and the Source's descent off it;
    - PR 6 adds no frame-clock reader (the arrival stays on ticks);
    - PR 8's done list deletes the exception and its test.
    Skip and confirm are removed with the scenes, not made into GameActions.
  - The lead's Verdant and Pale rebuild plan may touch the same snapshot fields; agree the order
    with the lead before PR 5.
- **Playtest tool:** `cinematicTicks` in `src/playtest/boss-fight.ts` stays as the measure (it reads
  0 after PR 5). It is removed in PR 8 together with `cinematicActive()`.

## Not in scope

- Boss move sets beyond their phase-change beat.
- The player's parry slow motion (0.18 s at time scale 0.28). It stays: it is the player's own move
  (lead ruling, 2026-11-20).
- Music, the wiki, mobile, and any outside service.
- White Hart and Pale (covered by the rule only).
- Deleting the legacy `Echo` class.
- A Codex lore page.

## Design check (`docs/ENGINEERING_STANDARD.md`)

1. **General case.** Anything written on screen during play (a phase banner, a boss arrival, a
   chapter title, the epilogue) is one stage beat in world state, drawn by one function. A boss's
   change of phase is a boss move like any other. Both apply to every boss and stage today and to
   any added later.
2. **One owner.**
   - Stage beats: `src/gameplay/stage-beat.ts` (data and stepping) and its one drawing function.
   - Each phase change: the boss's own module.
   - The in-fight beat call: `bossPhaseBeat` in `boss-runtime.ts`.
   - The rule: `tests/unit/boss-fight-flow.test.ts`.
3. **The next one.**
   - A new boss's phase change is moves on its own table plus one `bossPhaseBeat` call with its
     title. The rule covers it through the catalog.
   - A new stage's chapter card is its existing `chapter.number`, `title` and `intro` data.
   - A new beat kind is one entry in the stage beat data and one layout.
4. **Cause.**
   - The fight stopped because phase changes were built as scripts on an exclusive channel that
     owns the player and the combat step, instead of as moves.
   - Every ritual boss shared it, and so did the Source descent (where it also trapped the player)
     and the chapter and finale scenes.
   - The rule over every boss stops it returning, and deleting the channel removes the means.
5. **Measured.**
   - Time a fight stands still: today 11.8-18.4 s per boss (Rootbound 12.9 s of a 32-37 s fight);
     after, 0.
   - Chapter openings: 200.8 s at Full across seven stages today; after, 16.8 s of cards, all in
     control.
   - Code: about 133 KB of whole `src/` files plus about 80 KB of other code removed, against
     about 20 KB added.
   - Each pull request reports its measured bytes and playtest numbers.
6. **Removed.**
   - The cinematic director, the ritual layer, the launch, live and player cinematic runtimes, the
     chapter binding and the finale binding.
   - The preference, the confirm and skip input path, the UI-mode switch and scene release.
   - The blocking branch, player protection and grace, and the cinematic codec and its fields.
   - 18 whole `src/` files, 13 whole test files and about 104 KB of tests in all.
