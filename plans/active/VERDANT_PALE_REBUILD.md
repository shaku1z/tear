# Verdant and Pale rebuild

## Authority metadata

- **Owner:** Verdant rebuild owner (verdant-pale-rebuild session)
- **Status:** Active
- **Closure condition:** Every "done when" line below holds for Verdant, the owner has approved the new Verdant on preview, and `pnpm check:functional` passes from the final commit.

## Why

On 2026-11-20 the owner rejected the Verdant Sanctum gameplay for the third time (after 2026-11-13 and
2026-11-16). The verdict:

- The shared Verdant base is slop.
- Move visuals linger after the move.
- Verdant leans on tells far more than any other boss.
- "every other boss is immensely more enjoyable than verdant. Namely the crimson and echo fights, but
  same for undercroft too."

The lead's decision (brief of 2026-11-20) is to rebuild Verdant's boss, enemies and stage from scratch,
in the pattern of Aldric (The Crimson Fields), the Echo (The Voidspire) and the Colossus (The
Undercroft). Kept:

- the owner-approved art: the Rootbound seed-pod figure and the drawn Verdant background;
- the owner's fight brief for the Rootbound: "a mix of all 3", meaning a relentless mover, a heavy
  duelist and an arena controller whose arena control is its own moves;
- cutting;
- healing only as a punishment for sitting back;
- the Rootbinder as an enemy that plants.

Pale is not the focus now (owner: "not focused on Pale right now"). It gets one paragraph,
[at the end](#pale).

This plan holds no code. The lead reviews it before any code is written.

Every number below was measured on main `6fb1a7cd` unless it says otherwise. The game steps at
**120 ticks a second** (`src/app/shell/composition.ts:347`), so every tick count in this plan is at
120 Hz. The playtest commands:

- `pnpm playtest bosses --boss aldric,echo,colossus,rootbound --seed 1,2` (normal);
- the same with `--phase 1,2,3 --player scripted,avoids-tells,no-dodge`;
- the same with `--difficulty easy --seed 1,2,3 --player scripted,no-dodge,still`.

All runs use the Sword. The rates per 10 s are worked out from the tool's `--json` output (ticks / 120).

## 1. Why the three reference fights are enjoyable

### 1.1 How each boss moves

**Aldric is a hunter at every height.**
- He walks at 130 px/s, ×1.2 in Phase II and ×1.5 in Phase III (`aldric.ts:536`; `game-config.ts:537`).
- In the duel he steps back when the player is inside 190 px, so the cleaver keeps its reach
  (`aldric.ts:711-713`).
- When the player has stood above him for 0.82 s he picks the platform the player is on and goes
  there (`aldric.ts:715-728`, `_chooseVerticalTarget` at 279-314). He vaults onto it, rises through it
  (Cleaver Ascension) or, every third time after Phase I, falls onto it (Thronefall). The cooldown is
  4.6 s, then 3.35 s, then 2.45 s.
- Whatever else he is doing, hovering above him for 1.0 s brings a pounce (`aldric.ts:743-751`).
- Measured travel: 145 px/s (scripted player) to 187 px/s (avoids-tells) in Phase I, and 88 to
  274 px/s in Phase III.

**The Echo shadows the player and follows them up.**
- It holds 200 px off the player (`echo-enemies.ts:184-185`) at 280 px/s (`game-config.ts:362`).
- When the player is 55 px above it, it jumps to the platform nearest them (`echo-enemies.ts:187-199`).
- In Phase III it flies, drifting above the player (`echo-enemies.ts:239-244`).
- Measured travel: 224-263 px/s in Phase I, 217-263 px/s in Phase II, 332-335 px/s in Phase III. It
  is the fastest body in the game.

**The Colossus is slow until it isn't.**
- It walks at 58 px/s, +30 % each phase (`colossus.ts:513`).
- It shoulder-charges at 1350 px/s (`game-config.ts:631`).
- The Overhead Smash rises 170 px and tracks the player before it falls (`colossus.ts:453-463`).
- The Meltdown leaps to the arena centre (`colossus.ts:398-431`).
- Measured travel: 66-76 px/s in Phase I, 49-53 px/s in Phase II, 55-56 px/s in Phase III. That is
  low, but each burst is a 1350 px/s charge or a 170 px rise.

**What the three share.** The body is always going somewhere, and a player who climbs is followed or
answered. None of the three stands still to attack.

### 1.2 How the moves change across phases

| Boss | Phase I | Phase II | Phase III |
| --- | --- | --- | --- |
| Aldric | The duel. Lunge, Cleaver Arcs at range, Vault and Ascension (`aldric.ts:711-742`, `755-771`) | At 65 %: the throne burns. Fire lanes, Overhead Cleaver leaving a burning seam, a chained second lunge, Thronefall in the rotation (`aldric.ts:470-475`, `607-655`, `726`, `767`) | At 20 %: the crown falls. A 6 s kneel that the player decides (strike, or stand witness), then the frenzy: Charge with seams, Crownfire, chains of 2 or 3, every cooldown shorter (`aldric.ts:476-477`, `519-528`, `537-554`, `800-867`) |
| Colossus | Sealed. The front shield lets only an aerial hit through (`colossus.ts:133-138`). Stomp, Sweep, Smash, Charge (`colossus.ts:552-554`) | At 60 %: breached. The shield is thrown as a saw that the player parries back (`colossus.ts:192-214`, `322-339`), and a cross burst fires every 2.2 s (`colossus.ts:370-376`) | At 25 %: meltdown. Floor panels light in turn, each warned by the next one arming (`colossus.ts:255-265`, `377-388`), and a Meltdown Slam comes every 8.5 s (`colossus.ts:389-431`) |
| Echo | The mirror. It copies the player's last trick 0.55 s later (`echo-enemies.ts:97-135`) | At 60 %: a second voice. A clone copies on a longer, offset delay (`echo-enemies.ts:61`, `147`) | At 25 %: inverted. It flies, aims for 0.32 s, then dives at 1500 px/s, while cycling in and out of sight (`echo-enemies.ts:148`, `202-256`) |

**What the three share.**
- Each phase changes what the body does: it adds one to three moves and shortens the cadence.
  Aldric's attack cooldown divides by 1.25 and then 1.7 (`aldric.ts:769`); the Colossus's by
  1 + 0.25 per phase (`colossus.ts:587`).
- Each phase also adds one new thing to dodge or answer.
- No phase adds a stage object.

**Rootbound today, for contrast.**
- Phase II adds three moves that place stage objects instead of striking (Plant Graft, Root Cage,
  Bloom Shift: `rootbound-moves.ts:87-111`).
- Phase III opens with a 3.2 s channel (`rootbound-moves.ts:119`).
- With a scripted player in Phase III it lands **no hit** and moves **0 px/s** (table in 1.5).

### 1.3 What the player dodges, and how they read it

**The tell is the body first.**
- Aldric's cleaver angle springs to a target per state: raised overhead (-2.1 rad) for the Overhead
  and Thronefall windups, drawn back (-1.5) for the lunge, driven down for the plunge
  (`aldric.ts:868-904`).
- His shoulders lead by 9 px in a windup (`aldric-echo-renderers.ts:84-85`).
- The Colossus rises before the Smash and tracks the player (`colossus.ts:453-463`).
- The Echo's tell is the player's own last move (`echo-enemies.ts:97-135`).

**On top of the body, at most one drawn mark per heavy move, through the shared helpers.**

| Boss | Drawn marks | Where |
| --- | --- | --- |
| Aldric | 6: the charge lane, the Crownfire column, the Overhead column, the vertical-target reticle, the Ascension column and the vault arc | `aldric-echo-renderers.ts:131-183` |
| Colossus | 3: the charge lane, the Smash column and the Meltdown column | `warden-colossus-renderers.ts:295-357` |
| Echo | 2: the dive line and the repeat ring | `aldric-echo-renderers.ts:230-237`; `echo-enemies.ts:104-107` |

`perilPing` marks the moves that can't be parried (`boss-runtime.ts:209-217`).

**Each fight has a verb that opens the boss.**
- **Colossus:** bait the charge into a wall for a 1.1 s stagger and 2.5 s of open core at ×1.65
  damage (`colossus.ts:447-450`, `300-311`); parry the saw back (`colossus.ts:322-339`); attack from
  above (`colossus.ts:353`).
- **Aldric:** parry the Cleaver Arcs, which are deflectable crescents (`aldric.ts:774-799`); choose at
  the kneel (`aldric.ts:227-236`).
- **Echo:** every copy is a move the player chose, and repeating a move makes the copy come twice as
  fast (`echo-enemies.ts:99-108`). The player controls the threat by varying what they do.

**No shelter.**
- Aldric's pounce and vertical hunt (`aldric.ts:715-751`).
- The Colossus's Pillar Quake breaks a camped platform (`colossus.ts:514-533`), and its Seismic
  Backhand swats a player who crowds it (`colossus.ts:535-546`).
- The Echo jumps to the player's platform (`echo-enemies.ts:187-199`).

**The body is a threat too.**
- Touching it hurts while it walks and winds up (`boss-body-contact.ts:36-52`).
- In the full Phase I fights the scripted, avoids-tells and still players lost to the three
  references, and in 14 of 18 the killing hit was the boss body ("boss body: idle"). The other four
  were "unmarked" hits: projectiles and zones.

**Timing in ticks (120 Hz), read from `game-config.ts` and the code above.**

| Boss | Move | Windup | Hit | Recover |
| --- | --- | --- | --- | --- |
| Aldric | Lunge | 54 | 30 | 42 |
| Aldric | Chained lunge | 31 | 30 | 42 |
| Aldric | Royal Vault | 50 | 82 (flight) | 55 |
| Aldric | Cleaver Ascension | 46 | 65 | 46 |
| Aldric | Thronefall | 82 | up to 144 (fall) | 98 |
| Aldric | Overhead Cleaver | 72 | about 12 (plunge) | 86, plus a 312-tick seam |
| Aldric | Frenzy Charge | 60 | to the wall | 84 |
| Aldric | Crownfire | 102 | 1 | 54 |
| Colossus | Stomp, Sweep | 72 | 1 | none (back to walking) |
| Colossus | Charge | 84 | to the wall | 60 if it stops short; 132 stagger at a wall |
| Colossus | Overhead Smash | 84 | about 12 | 84 |
| Colossus | Seismic Backhand | 34 + 14 | 1 | 54 |
| Colossus | Meltdown Slam | 108 | 1 | 108 |
| Echo | Copied dash | 66 (33 on a repeat) | 29 | 36 |
| Echo | Inverted dive | 38 (aim) | 41 | none; next dive 108-180 ticks later |

The band: ordinary windups run 46-84 ticks (0.38-0.7 s), and the one signature slam per fight runs
102-108 ticks. Recovers run 42-98 ticks, and the longest recovers belong to the heaviest hits.

### 1.4 How the stage takes part without stage objects

- **The shared boss arena.**
  - Elevated platforms stress while stood on, crack, break for 4.5 s and reform (`arena-rules.ts:244-289`;
    `game-config.ts:301-310`).
  - Aldric's vault adds 0.72 stress to the platform it lands on, and Thronefall breaks it
    (`aldric.ts:364-371`).
  - The Colossus's Pillar Quake breaks a camped platform (`colossus.ts:524`).
  - Every boss gets this from one rule.
- **Zones the boss owns.**
  - Aldric's seams are floor strips left by the Overhead and the Charge, 2.6 s each
    (`aldric.ts:627-637`, `661-671`).
  - His throne fire alternates floor columns with a 0.8 s warning (`throne-fire.ts:19-40`).
  - The Colossus's hot panels step every 0.72 s (`colossus.ts:377-388`).
- **Who owns those zones.** They belong to the boss's `zones`, live and die with its moves, and end at
  death (`aldric.ts:257-261`).
- **Nothing the stage keeps between moves.**
  - The Crimson Fields, the Undercroft and the Voidspire have no stage features
    (`stage-environment-definitions.ts:80-83`).
- **A correction to the brief.** The `src/gameplay/voidgen-*` files are the Source's void run
  (imported by `src/gameplay/campaign/source-void-runtime.ts`), not the Echo's fight. The Voidspire's
  stage is its six authored platforms (`stages.ts:380-420`).

### 1.5 Pace, measured, with today's Rootbound as the baseline

Fights start at the named phase through boss practice (normal, Sword, seeds 1 and 2). "Hit" is a hit on
the player. "Landed" counts ticks in which the boss lost health. Travel is boss px/s.

| Boss | Phase | Scripted: hits per 10 s | Scripted: landed per 10 s | Travel (scripted / avoids-tells) | Cleared (scripted) | Middle clear time |
| --- | --- | --- | --- | --- | --- | --- |
| Aldric | I | 4.3 | 31.0 | 145 / 203 | 2 of 2 | 20.8 s |
| Aldric | II | 10.6 | 31.7 | 107 / 230 | 0 of 4 | - |
| Aldric | III | 5.9 | 22.8 | 88 / 274 | 0 of 2 | - |
| Colossus | I | 4.7 | 9.9 | 71 / 44 | 0 of 2 | - |
| Colossus | II | 1.4 | 27.2 | 53 / 49 | 2 of 2 | 7.0 s |
| Colossus | III | 5.7 | 31.1 | 56 / 55 | 2 of 4 | 3.8 s |
| Echo | I | 7.3 | 19.1 | 177 / 226 | 0 of 2 | - |
| Echo | II | 4.8 | 13.8 | 217 / 263 | 1 of 2 | 11.3 s |
| Echo | III | 4.4 | 5.0 | 335 / 332 | 1 of 3 | 4.6 s |
| **Rootbound today** | I | 2.8 | 25.4 | 28 / 23 | 2 of 2 | 6.5 s |
| **Rootbound today** | II | 1.1 | 12.3 | 50 / 57 | 3 of 4 | 4.8 s |
| **Rootbound today** | III | **0.0** | 33.8 | **0** / 0 | 5 of 5 | 3.8 s |

**Full fights from Phase I.**

- **Normal, scripted player:**
  - The player loses to Aldric in 21.5 s, to the Colossus in 11.9 s and to the Echo in 10.6-17.8 s.
  - The player loses to the Rootbound in 20.9-39.7 s.
- **Easy, scripted player:**
  - The player loses to all three references, in 15.9-24.3 s.
  - The player *beats* the Rootbound on every seed, in 36.9-37.6 s.
  - 12.9 s of those 37 are the Rootbound's two blocking phase cinematics, about 6.4 s each
    (`cinematicTicks` 1548). That is a third of the fight with nothing to play.
- **A player standing still** is hit 4.1 (Aldric), 7.2 (Colossus), 7.4 (Echo) and 5.4 (Rootbound)
  times per 10 s. So the Rootbound can reach a player who doesn't move. A player who moves is barely
  touched: 2.8, 1.1 and then 0 hits per 10 s against the references' 4.3-10.6.
- **Body and size:**
  - Today's Rootbound uses the generic `CONFIG.boss` body: 2500 health, 70 px/s (`game-config.ts:294`).
  - Every update sets its walking speed to zero (`rootbound.ts:689`).
  - Its neighbours in the campaign are Aldric at 4300 health (chapter III) and the Echo at 3000
    (chapter V).

**What makes the three enjoyable, in one list.** The design below is checked against every line.

1. **R1 The body hunts.** It walks or flies at the player and follows them up. Phase I travel is at
   least 66 px/s with bursts to 1350, or 145-263 px/s when continuous.
2. **R2 Each phase changes the body's moves.** One to three new moves, a shorter cadence, and one new
   thing to dodge. No phase adds a stage object.
3. **R3 The tell is the body.** At most one drawn mark per heavy move, through the shared helpers; at
   most 6 marks per boss.
4. **R4 A verb that opens it.** The player has one action that wins time: bait into the wall, parry it
   back, or vary what they do.
5. **R5 No shelter.** Climbing or crowding it is answered.
6. **R6 The stage takes part through shared arena rules and the boss's own zones,** which end with the
   move and at death.
7. **R7 The pace keeps the player busy.** A scripted player is hit 4-7 times per 10 s in most phases,
   and the boss is never idle in a phase.

## 2. The Verdant design

### 2.1 Rootbound: the keeper that will not let go

**Body.**
- It gets its own `CONFIG.rootbound` row: 118 × 118 px (the approved figure's frame), 3800 health
  (between Aldric's 4300 and the Echo's 3000; tuned by the pace targets in 2.4), 120 px/s walk,
  contact 20, knockback taken 0.4.
- Its body hurts while it walks, idles and winds up, like Aldric's row in `boss-body-contact.ts`.
  See [Decision D1](#decisions-this-plan-asks-the-lead-for).
- It never spawns inside the player: the boss placement row for it sets a 360 px start gap.

**The figure.** Every pose below already exists in the approved figure (`rootbound-figure.ts:193-266`):
coil, lunge, sink, rise, crouch, stretch, swell, burst, slam, kneel, split, phase-2, phase-3 and death.
The Graft marks go. No new art is needed for the moves.

**Moving (R1, R5).**
- **Walk.** It walks at the player at 120 px/s. Inside 190 px it steps back, keeping its vine's reach
  (Aldric's duel spacing).
- **Burrow** when the player is more than 700 px away, or on its 4 s cooldown.
- **Canopy Vault** when the player has stood more than 54 px above it for 98 ticks (0.82 s, Aldric's
  `verticalResponse`).
- **Thorn Burst** when the player has crowded it within 130 px for 48 ticks (the Colossus's
  backhand).

**Moves.** Windup, hit and recover are in ticks at 120 Hz. "Open" means it takes ×1.35 damage (the
Colossus's Phase III multiplier).

| Move | Phases | Chosen when | Windup (pose) | Hit | Recover (pose) | Damage | Parry | Drawn mark |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Vine Swing | I, II, III | player within 300 px and level | 54 (coil) | 22: a 280 px arc in front, as the figure's vine already draws | 42 (lunge) | 18 | yes; a parry staggers it 72 ticks, open | none: the coil is the tell |
| Second Swing | II, III | straight after a Vine Swing | 32 (coil) | 22 | 42 | 18 | yes | none |
| Seed Throw | I, II, III | player 300-700 px away | 54 (coil) | a seed pod thrown on an arc, deflectable (Aldric's Cleaver Arc) | 42 | 14 | deflect | none |
| Burrow | I, II, III | player beyond 700 px, or 4 s cooldown | 30 (sink) | under the floor at 900 px/s to the player's x, at most 96 ticks; it can't be hit (it is under the floor) | goes into Surface Strike | - | - | none: the moving mound is the body |
| Surface Strike | I, II, III | end of Burrow | 42 (rise), the mound swells where it will come up | 14: a column 144 px wide and 180 px high | 54 (split), open | 20 | no (peril) | 1: the surface reticle |
| Canopy Vault | I, II, III | player above for 98 ticks; cooldown 4.6 / 3.35 / 2.45 s by phase | 50 (crouch) | 82 flight to the player's platform, landing hits within 140 px; adds 0.72 platform stress through the shared arena rule | 55 (stretch) | 18 | no (peril) | 2: the vault arc |
| Thorn Burst | I, II, III | player within 130 px for 48 ticks; cooldown 3 s | 34 (swell) | 12: a ring of 150 px | 54 (burst), open | 16 | no (peril) | none: the swell is the tell |
| Root Seam | II, III | the hit of every Vine Swing | - | the vine stays planted for 120 ticks and drives a root seam along the floor in the swing's direction: a boss zone 110 px wide, 300 px/s, at most 240 ticks, 7 damage per 48 ticks (Aldric's seams) | - | 7 every 48 ticks | - | none: the seam is the hit |
| Bramble Rows | II, III | cooldown 9 s, player on the floor | 60 (kneel) | three floor sections light in turn: each warns for 36 ticks, then burns for 84; the next starts 48 ticks after the last. It stays kneeling and open the whole time (about 360 ticks) | 48 (rise) | 12 per 48 ticks | - | 3: the zone warning, through the shared zone renderer |
| Mend | II | player hasn't hit it for 480 ticks and is more than 500 px away | 24 (kneel) | heals 1.5 % of its full health a second for up to 240 ticks, never above the health it entered Phase II with; any hit ends it | 72 (split), open, after a hit | - | - | none: the kneel is the tell |
| Spring Surge | III | cooldown 7.5 s | 102 (spring): rises at the arena centre | 1: two root waves run along the floor both ways (jumpable ground shocks, 760 px/s, 16) and five seed pods arc out (deflectable, 12) | 66 (slam), open | 16 / 12 | pods deflect | 4: the centre column (Aldric's Crownfire) |

**Cadence by phase.**

- **Phase I:** an attack cooldown of 180 ticks (Aldric's is 204).
- **Phase II:** ÷1.25; Burrow surfaces twice, the second time 60 ticks after the first.
- **Phase III:** ÷1.6, 160 px/s walk, every windup ×0.85; Burrow surfaces three times, 48 ticks apart.

**Cutting (R4).**
- From Phase II, the vine that drives a Root Seam stays planted in the floor for 120 ticks.
- One blade hit on it, held or thrown, cuts it. The seam ends that tick, and the keeper staggers for
  72 ticks and is open.
- This is the Colossus's saw return on Verdant's own terms: cutting is aimed at the boss's move, not at
  a stage object.

**Healing (the owner's rule).**
- Mend is the only healing. It only happens when the player stands back and stops attacking, and one
  hit stops it.

**Arena control (the owner's "arena controller").**
- Root Seams and Bramble Rows are zones the boss owns, like Aldric's seams and the Colossus's panels.
- They end when the move ends, on a phase change and when its death starts.
- Vault landings stress platforms through the shared arena rule. Nothing is placed in the stage.

**Phase changes inside the fight.** These were proposed to the cinematics-overhaul session on
2026-11-20; see [2.3](#23-the-shape-of-a-phase-change).

| Change | At | Shape (ticks) |
| --- | --- | --- |
| Uproot (I to II), banner "THE GARDEN REMEMBERS" | 65 % | sink 24, under the floor 72 (it can't be hit), Surface Strike's 42-tick windup under the player, then it comes up in the phase-2 pose: 138 ticks (1.15 s) in all, against 6.4 s of blocking cinematic today |
| Last Bloom (II to III), banner "NOTHING HERE DIES" | 28 % | the same shape, surfacing at the centre with a 180 px Thorn Burst ring; the pod is cracked (phase-3 pose) |

**Tell weight (R3).**
- It has four drawn marks: the surface reticle, the vault arc, the bramble zone warning and the Spring
  Surge column.
- That is under Aldric's 6. Today it has 10 move marks and 6 stage warnings.

**Death.**
- On the tick its death starts, every vine, seam, bramble row and mound ends.
- The death beat is the cinematics session's shared, non-blocking one.

**Checked against R1-R7.**
- **R1:** it walks, burrows and vaults; targets in 2.4.
- **R2:** Phase II adds Second Swing, Root Seam, Bramble Rows and Mend; Phase III adds Spring Surge and
  a faster cadence. No stage objects.
- **R3:** 4 marks.
- **R4:** parry the Vine Swing, cut the planted vine, punish a recover.
- **R5:** Canopy Vault, Thorn Burst and Burrow.
- **R6:** boss zones and the shared arena stress.
- **R7:** the targets in 2.4.

### 2.2 The Verdant enemies

The Verdant pool (`stages.ts:322-331`) has one Verdant-only kind, the **Rootbinder**. The others are
shared with other biomes and are not redesigned: flyer, ranged, charger, mender, anchor, armored and
chimera. They lose only the Verdant-only hooks listed in [3](#3-delete-list).

**Rootbinder: an enemy that plants and sends roots.**
- It is like the ranged enemies of the other biomes: it keeps its distance, plants and fires, and has
  no stage objects.
- It roots no allies and snares no player, because those needed stage links and the enemy-base hooks
  being deleted.
- Body: as today, from `game-config.ts:737`: 34 × 46 px, 72 health, 105 px/s, contact 7.

| Move | Chosen when | Windup | Hit | Recover | Damage |
| --- | --- | --- | --- | --- | --- |
| Walk | always, outside the others | - | keeps 300 px from the player: backs away inside it, closes outside 520 px | - | contact 7 while walking |
| Plant | 300-520 px from the player for 60 ticks | 60 (kneels, its stem rises) | planted for up to 480 ticks; open (×1.3 damage, body harmless) | - | - |
| Root Run | while planted, every 180 ticks | 36 (the stem flicks back, and a bulge forms at its feet) | a root runs along the floor at the player: a jumpable ground shock, 560 px/s, lasting 192 ticks | 24 | 10 |
| Uproot | one hit of 30 % of its health, or the player within 140 px for 60 ticks | 18 | hops 220 px away from the player | 48, then Walk | - |

- **Cutting:** a hit on a planted Rootbinder is the cut. It uproots it, as the 30 % rule says.
- **Drawn marks:** none. The bulge at its feet is part of the body.

**Verdant's waves.**
- The wave script (a stage wave script, shared data) is kept.
- Its Rootbinder rows are measured again with `pnpm playtest waves --stage verdant-sanctum` once the
  new Rootbinder exists.

### 2.3 The shape of a phase change

Proposed to cinematics-overhaul (`local_c638a62c`) on 2026-11-20, with the measured 6.4 s per change.

1. **The phase changes on the tick the threshold is crossed.**
   - The Rootbound never calls `bossTransformation` and never sets `cinematicRequest`.
   - So `combat-step-prelude.ts:89-95` never blocks for it, and the new boss doesn't wait on the
     cinematics plan.
2. **The change is a move on the boss's own table** (Uproot, Last Bloom), with ticks like every other
   move. Its only protection is being under the floor for 72 ticks (0.6 s). The player keeps full
   control.
3. **It reads from the body and its moves.**
   - On top: one banner that takes no input, plus a shake or flash.
   - No slow motion. Today every boss's `phaseTransition` preset carries `slowmo` 0.38-0.42
     (`boss-runtime.ts:26-108`, seven presets).
   - The hit that breaks the phase gets only the contact hit-stop combat already has (0.035-0.055 s).
4. **On the phase tick, everything from the old move ends** (rule 5.1).

**Agreed with cinematics-overhaul on 2026-11-20.** It accepts points 1 to 4. It will cite this plan in
`plans/active/CINEMATICS_OVERHAUL.md`.

- **Phase beat.** `bossPhaseBeat(boss, title, color)` in `boss-runtime.ts` stays the only in-fight
  phase beat, with the same name and signature.
  - Its first code slice removes `slowmo` from every `phaseTransition` preset and keeps shake, flash,
    zoom (0.03-0.05) and the cue.
  - The banner takes no input, and the HUD stays up.
  - The same slice deletes `bossTransformation`, `cinematicRequest` and the ritual layer.
  - Until then, the Rootbound passes `slowmo: 0` per call (`bossFeedback` merges overrides), so nothing
    blocks before that slice merges.
- **Death beat.** This plan builds none.
  - The Rootbound gets the enemy base's 0.9 s dying (`deathDur`) and `bossFeedback(boss, "death")`,
    like every boss.
  - The cinematics slice removes `slowmo` from every `death` preset and keeps its 0.08-0.1 s hit-stop.
  - The cleanup at death start, for rule 5.1, is this plan's.
- **Can't-be-hit window.** 0.6-0.8 s under the floor is in the range it expects to accept.
  - Its cap will be measured live: the longest window Aldric or the Colossus gives at a phase change
    today.
  - Slices 2 and 3 show Uproot's and Last Bloom's 72 ticks (0.6 s) against that cap.
  - The window must show on the body; being under the floor does.
- **Its rule over all content.** From a fight's first tick to its last, no tick blocks input or the
  combat step. The test covers every boss, so the Rootbound is in it without being added.

### 2.4 Pace targets, measured each slice

Measured with `pnpm playtest bosses --boss rootbound,aldric,colossus,echo --seed 1,2 --phase 1,2,3`
(normal, Sword) and the easy full fight. The numbers go in each slice's pull request.

| Measure | Target for the new Rootbound | Reference band (1.5) | Today |
| --- | --- | --- | --- |
| Hits on a scripted player per 10 s, each phase | 4-7 | 1.4-10.6, mostly 4-7 | 2.8 / 1.1 / 0.0 |
| Boss travel, scripted player, each phase | at least 120 px/s, rising with the phase | 53-335 | 28 / 50 / 0 |
| Full easy fight, scripted player | the boss wins on at least one of three seeds | references win on all | the player wins on all three |
| Middle clear time per phase (avoids-tells) | 12-25 s / 10-20 s / 8-15 s | 7-21 s | 9.2 / 4.2 / 4.4 s |
| Blocking ticks in a fight | 0 | references block in their phase changes today | 1548 |
| Drawn marks | at most the largest reference (Aldric's 6) | 2-6 | 16 |

The health (3800) and the cooldowns are the dials, in this order.

## 3. Delete list

**How it was measured.**
- Every size is `wc -c` bytes on main `6fb1a7cd`.
- "What depends on it" comes from an import graph over `src/`, `tests/` and `scripts/`, so it includes
  type-only imports.
- The full per-file inventory, with line numbers, is in the session notes as
  `verdant-rebuild-delete-inventory.md`. This section is its summary and its decisions.
- The **When** column says which slice deletes the row:
  - "switch": slice 6;
  - "Pale": not in this plan, because Pale still imports it.

### 3.1 Totals

| Group | Bytes | When |
| --- | --- | --- |
| Verdant stage features in `src/gameplay/environment/**` and `src/presentation/environment/**` (14 files) | 108,155 | switch |
| Rootbound, Rootbinder, their renderer, TearBench setups, Verdant telemetry, playtest readers | 80,632 | switch |
| The boss attack layer: `boss-attacks.ts` (13,023) and `boss-attack-runner.ts` (30,854), one user (D3) | 43,877 | switch |
| Their tests: 21 unit tests, `browser-verdant-replay-parity.js` and `boss-attacks.test.ts` (36,873) | 242,058 | switch |
| The tell contract: `boss-tells.ts` 3,901, `boss-tell-renderer.ts` 6,634, `boss-tell-skin.ts` 9,882 | 20,417 | switch, once the playtest-tool session has agreed the "no tell" column (5.2) |
| Its tests: `boss-tell-rules.test.ts` 10,806, `boss-tell-skin.test.ts` 9,448 | 20,254 | switch |
| **Verdant total removed by the switch** | **515,393** | |
| Verdant content tests rewritten, not deleted (waves, catalog, variants, State Setup, publication) | 28,208 | switch |
| Environment framework (only Pale uses it once Verdant is gone) | 94,950, plus 98,962 of tests | Pale |
| Framework consumers outside the folder that need edits (environment codec, authored validation, weapon contact, environment layer and telemetry) | 35,021 | Verdant branches at the switch; the rest with Pale |
| Pale-only gameplay, presentation and tests | 39,200 + 61,791 + 156,935 | Pale |

The brief's 242,305 bytes of `environment/**` is confirmed: 39 files, 108,155 Verdant + 39,200 Pale +
94,950 shared.

### 3.2 Verdant files deleted at the switch

| File | Bytes | What still depends on it, and what the switch does about it |
| --- | --- | --- |
| `gameplay/environment/verdant-environment-feature.ts` | 22,925 | `app/world/world-composition.ts` l.24/236: drop the Verdant entry |
| `gameplay/environment/bloom-well.ts` | 15,910 | world-composition l.22/237, rootbound.ts, `snapshot/authored-environment-validation.ts`, TearBench setups, 10 tests: the Verdant block goes from each |
| `gameplay/environment/root-snare.ts` | 12,022 | `special-enemies.ts` l.19: goes with the old Rootbinder |
| `gameplay/environment/graft-anchor.ts` | 9,336 | **`rootbound-figure.ts` l.1 (kept art)**: see 3.4 |
| `gameplay/environment/regrowth-link.ts` | 8,967 | `snapshot/validation.ts` l.9: the Regrowth checks (l.87-88, l.95-220) go with it |
| `gameplay/environment/root-cage.ts` | 5,686 | rootbound.ts only |
| `biome-actors/rootbound-actors.ts`, `rootbinder-actors.ts`, `bloom-well-actors.ts` | 12,847 | `bind-biome-actors.ts` (kept for Pale): drop the Verdant binds |
| `rootbinder-presentation-facts.ts`, `bloom-well-presentation-facts.ts` | 4,209 | `app/world/environment-layer.ts`, TearBench live runtime: drop the Verdant lines |
| `presentation/environment/verdant-environment-presentation.ts`, `rootbinder-presentation.ts`, `bloom-well-presentation.ts` | 16,253 | `environment-layer.ts`: drop the Verdant lines. These draw Grafts, the cage and roots, not the background |
| `enemy-types/rootbound.ts`, `rootbound-moves.ts`, `rootbound-tuning.ts` | 39,448 | `entities/enemies.ts`, `snapshot/validation.ts` l.8, `scripts/asset-sheets/manifest.ts` l.14/335, `boss-figure.test.ts` l.70-72: replaced by the new files at the same names (6) |
| `presentation/enemies/renderers/rootbound-renderer.ts` | 14,767 | `enemy-presentation.ts`, `config/asset-manifest.json` l.250: replaced by the new renderer that draws the kept figure |
| `entities/rootbinder-runtime.ts` and the `Rootbinder` class in `special-enemies.ts` l.60-142 (about 3,557) | 11,671 | `enemies.ts`, State Setup factories: replaced by the new Rootbinder |
| `tearbench/rootbound-graft-anchor-setup.ts`, `rootbinder-network-setup.ts` | 2,465 | `tearbench/live-runtime-environment.ts` l.46-47, 960-961, 993-994: the hooks go |
| `progression/verdant-telemetry.ts` | 1,262 | `app/run/live-gameplay-event-fanout.ts`: the Verdant line goes (4.3) |
| `playtest/wave-roots.ts`, `playtest/boss-objects.ts` | 11,019 | the playtest tool's wave and boss reports: changed with the playtest-tool session (5.2) |
| `entities/boss-attacks.ts`, `boss-attack-runner.ts` | 43,877 | the old Rootbound only (D3) |

### 3.3 Enemy-base hooks

The brief listed five hooks. Measured:

| Hook | Verdict |
| --- | --- |
| `setRooted()` and `rooted` (`enemy-base.ts` l.82, l.250-254) | Delete at the switch, with the edit at `combat/combat-entity-runtime.ts` l.407 |
| `rootable` (l.84) | Delete at the switch |
| `attackHold` (l.581) | **Keep.** It is the wave-1 opening grace on every stage (`live-enemy-spawn.ts` l.183), not a Verdant hook |
| `anchored` (l.80) | **Keep.** It belongs to the Anchor support enemy and many combat files read it. Only its Verdant writer, `setRooted`, goes, along with the Bloom Well readers |
| `fieldSpeed` | Doesn't exist in `src`, `tests` or `scripts`. Nothing to delete |

### 3.4 What is kept, and what that needs

- **The Rootbound figure** (`presentation/enemies/figures/rootbound-figure.ts`, 11,531).
  - It imports `GRAFT_ANCHOR_TYPES` from `graft-anchor.ts`. The switch removes the Graft marks
    (`graftFlag`, the Graft flags in `ROOTBOUND_RENDERER_FLAGS` and the Haste/Bastion parts at
    l.46-67) and keeps every pose.
  - `ROOTBOUND_MOVE_POSES` (l.269-279) is re-keyed to the new move ids. The pose names don't change.
  - The owner approved how it looks. Slice 2 posts a before-and-after capture of the figure to the
    ledger's To look at section, to show the Graft marks are the only change.
- **The approved background's guard** (`tests/browser-verdant-presentation.js`, 8,803).
  - It is the check that `config/stage-readability.json` l.16 lists for verdant-sanctum, and
    `tests/unit/stage-art.test.ts` l.129-133 requires that check file to exist.
  - The switch removes only the Bloom Well and stage-object parts: l.80-92, l.223 and the
    `tear.hazard.v1` reads at l.84 and l.91.
  - It keeps the `assertStageReadable` and `assertStageStill` calls at l.95 and l.100, after "The drawn
    stage at rest".
  - The background files stay: `stage-art/recipes/verdant-sanctum.ts` and
    `platform-materials/verdant-rootstone.ts`.
- **Boss identity and rewards.** These stay:
  - `boss_rootbound` / `killRootbound` and the Rootbound cosmetics;
  - `_biomes` and `biomesSeen`.

### 3.5 Config the switch edits (each only shrinks)

- `config/architecture-roles.json`: `biome.verdant.sources` and `biome.verdant.implementation`
  (l.16-29, l.42-58). These name every deleted file.
  - The neutral roles keep only what Pale still uses.
  - The vocabulary regex in `scripts/architecture/rules.mjs` l.97 drops Bloom, Graft and RootCage.
- `config/code-budget-baseline.json`: the Verdant entries go, at l.121 and l.148, and l.151 shrinks.
  This is done with `--update`, never a raise.
- `src/tearbench/evidence-routes.json`: the eight `verdant-c*` routes (l.317-678) go. The new files get
  routes in the slices that add them.
- `config/asset-manifest.json`: the rootbinder subject (l.204), and `boss_rootbound`'s sources
  (l.246-251) point at the new renderer.
- `config/tool-catalogue.json`, `package.json` and `config/checks.json`: no Verdant entry is removed.
  `test:browser:verdant-presentation` stays (3.4).
- `src/tearbench/canonical-scenarios.json`: the four Verdant stage-object scenarios (l.485, 718, 764
  and 811) go. `verdant-variant-selection` (l.306) is rewritten.
- `config/terminology-registry.json`: its `environmentMechanics` owner stays while Pale uses the
  framework. Verdant mechanic names leave its scans.
- `config/architecture-layers.json`, `architecture-baseline.json` and `change-impact-defaults.json`
  have no Verdant entries.
- `src/gameplay/training/arena-rules.ts`: `createBossArena` maps `rootbound` to the arena material
  `verdant-rootstone` and sets the floor's `arenaMaterial` to it. After PR 369 (stage drawing) nothing
  draws that name, so the switch removes it, with the assertion at `tests/unit/rootbound-foundation.test.ts`
  l.336. Pale's rebuild removes `pale-ice` the same way (`white-hart-foundation.test.ts` l.132).
- **Tutorial gold.** `TUTORIAL_GOLD_ROOTS` names none of these files, but its fingerprint reaches 46
  of them through other imports. The first build after the switch reruns the gold test. The gold is
  committed again only if its output changes.

## 4. Old data

### 4.1 Ruleset and replays

- **The switch slice steps the ruleset** (`src/gameplay/run/ruleset-version.ts`) to
  `tear-rules-six-biome-verdant-r3-pale-preview-v14`, with the comment line "v14: Verdant's boss, the
  Rootbinder and the stage are rebuilt without stage features".
  - `config/campaign-publication-boundary.json` names the same version. `stages.ts:49-51` refuses a
    mismatch, so the two change together.
- **The slices before the switch** put the new Verdant only on the engineering channel (see 6), so
  they don't change what a released mode plays.
  - Slice 2 checks whether a run on the engineering channel can be recorded. If it can, every slice
    that changes the new boss's behaviour steps the ruleset too, and says so in its pull request.
  - **Found in slice 2:** it can. A Boss Test run opens fresh on a boss (`freshBossOpening` in
    `src/ghost/replay-admission.ts`), so it is recordable, and the new boss is a new entity kind, which
    changes the replay content hash (`ENTITY_KIND_REGISTRY`). Slice 2 stepped the ruleset to v19 (cinematics PR 3 took v18).
    Slices 3 to 5 step it again unless replay admission refuses runs with an engineering-only boss;
    that is proposed to the replay-overhaul owner, not done here.
- **Old replays.**
  - A replay plays only under the ruleset it was recorded with (replay overhaul plan, "Stored and
    published replays when the format or ruleset changes", rule 1).
  - A replay recorded before the switch shows CAN'T PLAY in the Vault (`theaterUnavailable`,
    `library-screen-adapters-runtime.ts:312`), the same as a damaged capsule.
- **Every stage's replays are affected, not just Verdant's.** The ruleset is one identity for the whole
  game, so the step retires every saved replay of every stage, as each Verdant step already did (v2 to
  v13). The replay plan expects this ("Ruleset bumps ... retire every saved replay each time"). The
  lead should tell the owner.
  - A per-stage ruleset would be a second identity, built for one case. I don't recommend it.

### 4.2 The snapshot codecs

- After replay PR 3 (#322), the codecs are in `src/gameplay/snapshot/`.
- Stage-object state is encoded by `environment-codec.ts` under the codec id `tear.hazard.v1`. The
  codec is generic over the object kinds, and Pale still uses it, so the id stays.
- The switch removes only the Verdant parts:
  - `VERDANT_CODEC_VALIDATION` in `authored-environment-validation.ts` l.13-57;
  - the Verdant object kinds (bloom-well, root-link, graft-anchor, regrowth-link) in
    `environment-object-kinds.ts`;
  - the Rootbound checks in `snapshot/validation.ts` (l.8-9, l.87-88, l.95-220).
- An old replay that carries those kinds is from a retired ruleset, so it is never
  played: the ruleset check refuses it (4.1).
- **Coordination with replay-overhaul (`local_95888a64`).** That session moves these files and plans
  more moves (PR 4: the detached world; PR 5: application frame events). Before the switch slice is
  cut, I send it the exact codec branches it deletes, so neither of us edits a file the other is
  moving in the same week.
  - Whichever pull request merges second takes main in and applies the other's change. Neither cuts a
    replacement branch.

### 4.3 Saves

- Saves and leaderboards don't change, except for the fields the rebuild removes. Leaderboards have no
  feature fields.
- **The fields removed**, measured:
  - The profile stats `verdantEntered`, `bloomWellsActivated`, `rootLinksSevered` and `graftsDestroyed`.
    They are written only by `verdant-telemetry.ts`, which is deleted, and read by nothing but its
    tests.
  - The stat `rootboundRegrowthFullInterrupt`, which backs the achievement `rootbound_regrowth`
    ("Regrowth Interrupted", `achievement-catalog.ts` l.218-226, written at `achievement-runtime.ts`
    l.96-102). There is no Regrowth to interrupt any more.
    - **The achievement keeps its id**, so a player who earned it keeps it.
    - It is re-pointed to the new fight's verb: "Defeat The Rootbound after cutting its planted vine
      three times in one fight", with a new stat.
    - The migration drops the old stat and leaves the earned achievement alone.
  - Pale's `paleEntered` and `auroraTracksActivated` stay until Pale's rebuild.
- Each removed field gets one pure migration step in the existing save contract (the
  `tear-save-cloud-contract` skill rules: versioned envelope, a fixture for the previous version, and a
  malformed-data case).
- **The test.** `tests/unit/verdant-rebuild-save-migration.test.ts` loads a saved profile captured from
  main before the switch, with each removed field filled. It proves that:
  - the profile loads;
  - the field is gone;
  - nothing else in the save changed, compared field by field;
  - a cloud merge of an old and a new save keeps the player's currency, unlocks and records.
- The same test also proves the earned `rootbound_regrowth` achievement survives the migration.

## 5. The two rules over all content

Both rules are tests over **every** boss and enemy the game defines, not only Verdant's. Both read the
game's own lists (`src/gameplay/run/boss-definitions.ts` and the enemy kinds of the published game) so
the next boss or enemy is covered without editing the test.

### 5.1 Nothing outlives its move

**The rule.** On the tick after a move ends, after a death starts, during a stun, and after a phase
change, an entity's renderer draws nothing that belongs to the old move.
- **Zones and marks are not the same (lead, slice 1).** A boss zone may outlive the move that made it,
  but only by its own declared length (`maxLife`), and it ends on the phase-change tick and on the
  death tick. A mark belongs to the live move only, and to the move state it began in: a windup's mark
  is gone when the strike starts.
- **A stun hides the move's marks; it does not end the move (lead, slice 1).** `endMove()` runs only
  when a death starts and on a phase change. After a stun the move resumes its windup where the stun
  caught it, as it did before.
- **Marks go through the shared helpers only (lead, slice 1).** The new Rootbound and Rootbinder draw
  every mark through them.

**The test: `tests/unit/move-visual-lifetime.test.ts`** (built in slice 1; the harness is
`tests/unit/move-visual-harness.ts`).
1. For each boss and each enemy kind and variant, it builds the entity through the production enemy
   types and steps it at 120 Hz through the production step (`stepEnemyActors`). Bosses run 40 s in
   each phase. At the end of a phase the fight waits for a live move, then sets the boss's health just
   under the next mark, so every phase change has a move to end. Then comes a lethal hit and 12 s of
   death. Enemies run 20 s. Every third move is stunned on its tenth tick.
2. Each tick it draws the entity into a recording canvas through the production renderers. The shared
   mark helpers (`chargeTelegraph`, `dangerLane`, `dangerColumn`, `dangerReticle`, `drawPeril`,
   `weaponGlint`) and the prop helpers (the crown, the cleaver, the wardstaff) report each call.
3. It fails on any of these:
   - a mark drawn on a tick when no move is live (`liveMove()` is null), or while the entity is stunned;
   - a mark carried from one move state into the next (a windup's mark into the strike or recovery,
     or one move's mark into another's);
   - a move that does not resume where the stun caught it;
   - a live move that is still live on the tick the boss's committed phase changes;
   - a mark or a zone on any tick from the start of a death;
   - a boss zone that lives on past the phase-change tick, or past its declared length;
   - something drawn outside the helpers that looks like a mark: dashed, or reaching further past the
     entity's box than the mark reach (120 px).
4. **The lists and thresholds are in `config/move-rules-baseline.json`**, a gate file
   (`config/gate-files.json`), so an entry is added, or the cap raised, only with the lead's review.
   The test fails on an entry that no longer applies:
   - an exempt entity that breaks no rule leaves the list;
   - an entity on the hand-drawn list that stops drawing by hand leaves it, and one that starts fails;
   - the two measured sizes are re-measured over every fight and must not move: bodies and props
     reach at most 83 px (Aldric's cleaver in a lunge), and the nearest hand-drawn mark reaches 156 px
     (the Geomancer's wall and the Gravedigger's arc).
- **The proof.** Three faults planted in the test each make it fail:
  - a mark kept one tick into rest (Aldric);
  - a windup's mark kept into the next state (the Colossus);
  - the step not telling the boss its phase changed (Aldric).

  The bosses as they are pass. `pnpm test:determinism` also plays two Phase III practice fights through
  the production game (the Colossus, who dies, and Aldric). Emptying `endMove()` makes the Colossus
  stream diverge at tick 2,580, after its death starts at 2,533. At its two phase-change ticks the
  Colossus is between moves, so the phase-change end is proven by the unit test above, not by the
  stream.

**The cause it fixes once, for every entity.**
- Causes 3 and 4 in the brief: a dying or stunned enemy skips `update`, so its last move's marks
  freeze.
- Slice 1 moves the cleanup that `aldric.ts` and `source.ts` each wrote by hand into the enemy base:
  one `endMove()` (in `enemy-base.ts`) runs when a death starts and on the phase change.
  - `endMove()` ends the move only. An entity with a `state` keeps its move there, and its
    `atk`/`atkT` are the cooldown until its next attack, which keeps running.
  - The step calls `noticePhase()` before each update. A boss opts in by declaring its committed phase
    (`practicePhaseEntry()`, the rule the playtest reader uses). On the step its health first reaches a
    phase it has not entered, the live move ends, before the update enters that phase. Each phase ends a
    move once, so healing back across a mark does not end another, and an entity whose `phase` field is
    something else (the Wraith's animation clock) is not touched.
  - A boss with zones of its own ends them in `endMoveZones()`.
- The renderer runtime hides every shared mark while the entity is stunned or dying. The peril diamond
  (`drawPeril`) shows only during the move state that rang it, not for a fixed 0.6 s: before, it ran on
  into the Colossus's grab and recovery, the Warden's lunge and the Source's next move.
- This changes what bosses do in released modes, so the ruleset steps (v17, after cinematics PR 1's
  v14, the flyer fix's v15 and cinematics PR 2's v16).

**Measured by.** The number of offending ticks per entity, by rule. It is 0 for every entity not on
the exemption list.
- The bosses and enemies not yet rebuilt (Rootbound, White Hart, Rimehound) sit on the exemption list.
  - The Rootbound leaves the list in the switch slice.
  - The White Hart and the Rimehound leave it with Pale's rebuild.
  - Their marks are not held to the rules, but the shared runtime now hides their marks too while they
    are stunned or dying.
- Marks drawn by hand today sit on the hand-drawn list: 25 entries, each with its file and what it
  draws. They are the Warden, the Colossus and the Source, and the charger, ranged, flyer, bomber,
  armored, priest and herald kinds and variants that draw their own windup lines, rings and floor
  warnings.
- **Named gaps.** These are not covered in slice 1, and each names the slice that closes it:
  - Hand-drawn marks do not hide during a stun: only the shared helpers do. The rifleman's aim line,
    the charger's arrow, the Colossus's slam line and the Source's beam stay drawn through a stun.
    Each closes when its renderer draws through the helpers. The new Rootbound and Rootbinder start
    there (slices 2 and 5).
  - Projectiles. The harness empties them every tick, so a boss projectile that outlives a death
    start or a phase change goes unseen here, as does Colossus debris that can hit the player during
    the death. No slice of this plan closes it yet; it is named for the lead.
  - The Echo. The mirror presentation draws it, and MirrorHost has no committed phase. The
    Rootbinder: the environment layer draws it. Neither goes through the enemy renderers. The
    Rootbinder joins in slice 5, when it is rebuilt on the helpers.
  - Stage features owned outside the boss: the Warden's fracture warnings and the Source's void
    hazards.
  - What the helper-only check cannot see: `drawImage`, `Path2D` shapes, marks within 120 px of the
    body, and the boss tell skins (`drawBossTells`). The environment-drawn kinds also act as an
    exemption.
- Causes 1, 2, 5 and 6 (Bloom Wells, Regrowth links, the stage-object fade, always-on Wells) go away
  with the stage features themselves. There is nothing left to test for them on Verdant.

### 5.2 Tell weight

**The rule.** No boss draws more marks than the largest of the existing reference bosses.

**The test: `tests/unit/boss-tell-weight.test.ts`** (built in slice 1).
- It steps every boss as in 5.1 and counts its distinct marks: distinct pairs of (the move state, the
  shared helper called).
  - A windup and its strike are two states. A boss that runs parallel moves names each family's state
    ("dash:wind").
  - Each state is its own pair, so moves chained with no rest between them are each counted.
  - A mark ends with the state it began in (5.1), so each pair is a mark the player reads.
- Measured in slice 1: the Warden 4, the Colossus 9, Aldric 3 and the Source 2.
- **The cap is pinned:** 9, in `config/move-rules-baseline.json`, beside the reference list (Warden,
  Colossus, Aldric and Source).
  - The test fails unless the largest reference weight equals the cap. A reference that grows or
    shrinks shows up as a failure, and the cap changes in the gate file, with the lead's review.
  - Every other boss must stay at or under the cap.
- **Named gaps, each with the slice that closes it.**
  - The Echo is not measured: the mirror presentation draws it without the shared marks, so this
    harness would read 0. Slice 2 measures it through the mirror presentation, when the new Rootbound
    is first held to the cap. The cap is final from then.
    - **Slice 2:** still not measured. The mirror presentation calls no shared helper, so the pair count
      is 0 by construction; a real count needs the Echo's tells drawn through the helpers, which is Echo
      work this plan leaves alone. The cap stays 9, measured over the four references.
  - The Rootbinder is drawn by the environment layer. Slice 5 rebuilds it on the shared helpers and
    measures it.
- **Measured by.** The table it prints: boss, mark count and the cap.
  - The Rootbound and the White Hart start on the exemption list. Both read 0 under this harness,
    because their renderers call no shared helper. The new Rootbound is measured from slice 2 and must
    be at 4 or under when it leaves the list in the switch slice.
    - **Slice 2:** the new Rootbound is not exempt and measures 3 pairs in the harness fight: (rise,
      dangerColumn), (rise, drawPeril) and (swell, drawPeril). The harness never puts the player above
      it, so Canopy Vault's two pairs (vaultwind with dangerReticle and with drawPeril) don't show; with
      them it is 5. The "4 or under" above counts drawn marks (2 in Phase I); the harness also counts the
      peril diamond. The lead decides before the switch which the 4 means.
  - The White Hart leaves the list with Pale.
- **What it replaces.** `tests/unit/boss-tell-rules.test.ts` and its per-hit minimum lead go, with
  `boss-tells.ts` (see 3). There is no per-hit tell contract and no "untold hits" target.
  - The playtest tool's "no tell" column reads `bossTells`. The playtest-tool session
    (`local_84366e2f`) owns that column. Before the switch slice, I agree with it that the column goes
    or reads the windup states the way it does for the other bosses.

## 6. Slices

Each slice is one pull request on `codex/verdant-rebuild`'s successors, and each leaves main shippable.

**How Verdant stays out of production.** Until the switch slice, the new Rootbound and Rootbinder are
reachable only on the engineering channel: the Boss Test boss picker and Enemy Test, through one
feature id added to `SURFACE_CHANNEL` in `src/domain/surface-availability.ts`.
- The release build excludes them.
- The preview site serves the engineering build of the same main commit at `/dev/`
  (`.github/workflows/deploy-preview.yml`, the `tear-preview-dev-<sha>` artifact). So the owner can
  play each slice on preview while players keep today's Verdant.
- The switch slice merges only after the owner approves the new Verdant on preview.

**Where the new code lives while the old code serves players.**
- `src/gameplay/entities/enemy-types/rootbound-rebuild/` (the boss and its move table) and the new
  Rootbinder beside them.
- The switch slice deletes the old files and moves these to the old names, `rootbound.ts` and
  `rootbound-moves.ts`, so the folder and the temporary "rebuild" name are gone after it.
- The playtest tool reaches the new boss through one temporary boss id, `rootbound-rebuild`, on the
  engineering channel only. It is removed in the switch slice.

| Slice | What | Done when |
| --- | --- | --- |
| 0 | This plan | The lead approves it. |
| 1 | The two rules (5.1, 5.2) over every boss and enemy, and the shared `endMove()` in the enemy base | Both tests are green, with the exemption list holding only Rootbound, White Hart and Rimehound. `pnpm test:determinism` is green, or the ruleset steps if a boss zone now ends earlier in a released mode. |
| 2 | New Rootbound Phase I and Uproot, engineering channel only | Phase I's moves match 2.1. Playtest numbers against the four bosses are in the PR. Its marks count 2. The owner can play it at `/dev/`. |
| 3 | Phase II: Second Swing, Root Seam and its cut, Bramble Rows, Mend; and Last Bloom | Phase II pace meets 2.4. Seams and rows end on the phase tick and at death (5.1 green for it). |
| 4 | Phase III: Spring Surge, the Phase III cadence, and the death | All three phases meet 2.4. 0 blocking ticks. 4 marks. The lead asks the owner to play it on preview. |
| 5 | New Rootbinder, engineering channel only | Its moves match 2.2. `pnpm playtest enemies --enemy rootbinder` numbers sit beside the ranged enemy's in the PR. |
| 6 | **The switch**, after the owner approves the new Verdant on preview | Campaign, Endless and Gauntlet use the new Rootbound and Rootbinder. Every file in 3 marked "switch" is deleted. The `rebuild` folder is moved to the final names. The ruleset steps (4.1). The save test (4.3) is green. The Rootbound leaves both exemption lists. The waves are measured again. The approved background's guard still runs (3). Architecture and code-budget baselines shrink and never grow. `config/position.json` is updated. |
| 7 | Verdant leftovers: anything the switch could not delete because Pale still imports it moves to Pale's side, or stays listed for Pale's plan | Nothing in `src/` names a Verdant stage feature. The delete list's "Pale" rows are the only stage-feature code left. |

**Measured before and after, in the pull requests that change them:**
- slices 2-4 and 6: `pnpm playtest bosses` for the Rootbound against Aldric, the Colossus and the
  Echo;
- slice 6: frame cost on the Verdant stage, desktop only, because mobile is paused (owner,
  2026-11-19);
- slices 6 and 7: bytes removed.

## 7. The design check

1. **General case.**
   - A boss is a body with a move table and a phase list, read the way Aldric, the Colossus and the
     Echo are.
   - A stage takes part through the shared arena rules and the boss's own zones.
   - The two rules (5.1, 5.2) are the general version of the owner's complaints, and they hold for
     every boss and enemy, now and later.
   - Pale is the next instance, then any new biome.
2. **One owner.**
   - The Rootbound's numbers: one `CONFIG.rootbound` row and its move table.
   - The Rootbinder's numbers: its row and table.
   - Move visual lifetime: the enemy base's `endMove()`.
   - The mark cap: the reference list in `boss-tell-weight.test.ts`.
   - The release gate: `SURFACE_CHANNEL`.
   - The tick rate: the one value composition passes in. Today it is copied as a literal 120 in at
     least eight modules (`boss-attacks.ts:10`, `rootbinder-runtime.ts:10`, `bloom-well.ts:16`,
     `graft-anchor.ts:23`, `regrowth-link.ts:9`, `root-cage.ts:9`, `root-snare.ts:13`,
     `gauntlet-records.ts:15`). The new modules import it, and the Verdant copies go with their
     files.
3. **The next one.** A new move is a table row plus, at most, one routine for a new kind of motion.
   Pale's boss is a new body, a table and a phase list on the same pattern, with no framework of its
   own.
4. **Cause.**
   - **Lingering visuals:** the frozen-update path at death and stun, fixed once in the base. The
     stage-object causes go with the stage features. The check is 5.1.
   - **The tell overload:** a per-hit tell contract applied only to Verdant and Pale. It is removed,
     and 5.2 checks the result.
   - **"Slop":** a framework (stage features, the boss attack layer and runner, the tell contract)
     with one user each. It is deleted, not reused (3).
5. **Measured.**
   - Pace: 1.5 and 2.4.
   - Blocking: 1548 ticks today.
   - Marks: 16 today.
   - Bytes removed: 3. Frame cost: slice 6. CI time: no new suite, two unit tests.
6. **Removed.** Everything in 3, and the duplicated tick-rate literals in the deleted Verdant modules.

## Decisions this plan asks the lead for

- **D1. The Rootbound's body hurts on contact while it walks and winds up.**
  - This is how all three references are built, and the body is their main threat (14 of 18 killing
    hits).
  - It goes against `boss-body-contact.ts:1-11` and `tests/unit/boss-body-contact.test.ts`, which say
    no new boss may join the rows whose body hurts. That rule was written for today's Rootbound (ruleset
    v7).
  - I propose the switch slice replaces "may only shrink" with "every boss has a row". The spawn-inside
    problem that started it is fixed by the 360 px start gap.
- **D2. The ruleset step retires every stage's replays, not only Verdant's** (4.1). The lead tells the
  owner.
- **D3. The boss attack layer (`boss-attacks.ts`, `boss-attack-runner.ts`) is deleted with the old
  Rootbound** (3), not reused.
  - It has one user (`rootbound-moves.ts`, `rootbound.ts`), and the owner called the base it belongs to
    slop.
  - The new move table is a plain list of rows that the boss's own state machine reads, like Aldric's
    `CONFIG.aldric`.
- **D4. The two older Verdant plans and the Pale gameplay plan are superseded by this one.**
  - These are `TEAR_THE_VERDANT_SANCTUM_FULL_BIOME_PLAN_REVISION_3.md` (with its ledger) and
    `PALE_GAMEPLAY_REBUILD.md`. They move to `plans/completed/` in the switch slice.
  - They stay listed until then, because `scripts/check-docs.mjs` names them.

<a id="pale"></a>

## Pale

Pale comes after Verdant, on whatever Verdant proves out: the body-and-table pattern, the phase change
shape agreed in 2.3, the two rules in 5, and no stage features to start. A biome may later get one
stage feature, drawn only while it acts, once its boss and enemies play well. The White Hart and
Rimehound are rebuilt the same way as the Rootbound and Rootbinder, in a plan of their own written when
Verdant's switch slice has merged. Until then Pale's code stays untouched and Pale stays a Playground
preview, except where a Verdant deletion forces a shared file to move (listed in 3). The Pale boards'
fourth panels show Aurora Track bands only as a board note; the Pale background art doesn't depend on
tracks, so a Pale without tracks needs no art change.
