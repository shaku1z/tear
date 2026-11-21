# Pale Traverse gameplay rebuild

## Authority metadata

- **Owner:** Pale gameplay owner (verdant-gameplay session)
- **Status:** Active
- **Closure condition:** Every "done when" line below holds and `pnpm check:functional` passes from the final commit.

## Why

The owner's instruction for Verdant, and then Pale "the same way": rebuild every move and every
stage interaction from the ground up, no salvage, on the shared layer and definitions so the next
biome is content and not new machinery. Verdant is rebuilt (pull requests 278, 289, 291, 297, 306
and 316). Pale has not been touched: an audit on main `9a0d5367` found that its stage mechanic does
nothing, its boss gives no warning the game can check, and none of it uses the layers Verdant built.

For Pale's gameplay (the Aurora Tracks, the Rimehound, the Pale variants, the White Hart and the
waves) this plan replaces checkpoints C2 to C8 of
[TEAR_THE_PALE_TRAVERSE_FULL_BIOME_PLAN_REVISION_3.md](TEAR_THE_PALE_TRAVERSE_FULL_BIOME_PLAN_REVISION_3.md).
That plan's must-nots stay: no forced movement for someone standing still, no global ice, no
invulnerable or regenerating boss, no clone army, no charge from off screen, no cold meter, no loss
of sight. Publication is not part of this plan: Pale stays a Playground preview until the owner has
played it and says otherwise.

## What the audit found (main `9a0d5367`, 2026-11-20)

Code reading, arithmetic on the numbers in the code, and `pnpm playtest bosses --boss white-hart`.
"Worked out" means it follows from the numbers and was not watched in a running game.

**The stage mechanic does nothing.**

1. An Aurora Track acts on an actor whose centre is inside its box. Each of the three boxes starts
   below the top of the platform it sits on (`stage-environment-definitions.ts`: y 625 on the
   platform at 640, 495 on the one at 510, 240 on the one at 255). A standing player's centre is 25
   px above the platform top, so 10 px above the box; a Rimehound is 2 px above. No box reaches the
   floor. Only something falling through a box is touched.
2. Inside a track the player's top speed still does not change: the track adds to `vx` while the
   player holds that direction, and the player's own step clamps `vx` to top speed before moving
   (`player.ts`). What is left is a slightly faster start from a standstill (worked out).
3. The three tracks warn, wake and sleep on the same tick; the offset that staggers Bloom Wells is
   not read for tracks.
4. The push ignores whether an enemy is held or flies, and keeps two lists of who it moves.

**The White Hart.**

5. It reports no tells. Measured, four seeds, Normal, Sword, six scripted players: every hit on the
   player in every run is counted "no tell" (38 to 100 damage a phase), the boss is never exposed
   (0.0 s in every phase), and no player gets past Phase II.

   | Player | Result | Boss health left | Phase I taken (all untold) | Phase II taken (all untold) |
   | --- | --- | ---: | ---: | ---: |
   | scripted | defeated at 43.3 s | 55% | 51 | 49 |
   | avoids-tells | defeated at 43.8 s | 51% | 38 | 62 |
   | no-dodge | defeated at 50.1 s | 77% | 100 | |
   | still | defeated at 22.2 s | 98% | 100 | |
   | walker | defeated at 31.5 s | 100% | 100 | |

6. The four seeds give the same fight to the tick: the move order is a fixed loop of four a phase
   with no random source, no sense of range or height.
7. Backtrail Kick almost never hits: the Hart turns to face the player all through the windup and
   then tests behind itself, on one tick.
8. Fracture Step cannot reach a platform (its feet top out near y 631; the lowest fight platform is
   at 620), lands on the floor, and the platform cracks anyway (worked out).
9. Long leaps land short of their drawn arc: they ask for up to about 1890 px/s and the shared step
   clamps to 1200 (worked out).
10. Phases can be skipped and the boss can die through a phase: no clamp at a phase line.
11. Ghost Tracks' one true route and two false ones are 27 px apart with a 52 px reach: one band.
12. Hushed Crossing's lower route runs the Hart under the floor (worked out).
13. A weak parry of Last Crossing shows "PARRIED" and changes nothing; a stun in mid-route drops the
    Hart and then snaps it back.
14. Its body deals contact damage through its own hit test, outside the shared body-contact rule.
15. It has the first boss's health, 2500. Colossus has 3700, Aldric 4300; Pale is stage five.
16. Its stage objects are removed by hand when a fourth is asked for, with no fade, and objects of
    an earlier phase are found by text inside their id.

**The Rimehound.**

17. It ignores stun: a hammer break does nothing to it.
18. A player on any platform can never be pounced (the windup needs the player within 130 px of
    height, hounds cannot climb, the lowest platform is 160 px up).
19. The right to attack goes to the first ready hound in spawn order whether or not it can reach, so
    one hound out of reach can stop the pack (worked out).
20. Every ending of a pounce (wall, edge, landing, being hit) is the same 0.22 s skid; a miss costs
    nothing. "Seeks the tracks" does not exist.
21. `tests/unit/wave-opening-grace.test.ts` lists the Rimehound without authorising its pack, so it
    proves nothing for it.

**The stage's waves and variants.**

22. Pale's curve and composition have no reader outside tests; there is no wave script; ranged,
    flyer and bomber have no cost in the composition.
23. The five Pale variants cannot be met anywhere outside an engineering restore.

**The shape of the code.**

24. Nothing in Pale is on the boss move table and its one runner, the shared tell renderer, the tell
    skin, the "who a field moves" row or the stage-object lifetime rule. All three Pale renderers
    draw their own warnings in their own colours.
25. Shared code names Pale things one by one: the pack step runs in the shared enemy step for every
    stage; the canonical state, the run start host and the replay composition list the Hart's and
    the hound's private fields by kind.
26. `docs/HOW_TO_ADD_A_BIOME.md` tells the reader to copy the shape of Pale.

The full audit, with file and line for each item, is in the lead's session notes
(`pale-gameplay-audit.md`); it is not a repository file.

## What gets built

Each slice is one pull request from main. Numbers named here are starting values; each slice sets
them from playtest tool measurements and says so.

### Slice 1: the road (Aurora Tracks)

An Aurora Track is a road of light lying on a surface. Travelling with it is faster than the player
can otherwise go; standing on it, crossing it or going against it changes nothing.

- **Where it is:** a track names a surface (a platform of the stage, or a stretch of floor) and its
  box is derived from that surface, so a track cannot sit off its platform and follows it on every
  screen shape. One rule in the stage environment definitions, for any stage.
- **What it does:** while an actor on it travels its way, the actor's top speed is raised (starting
  value: half as much again) through the one place that owns top speed (the player's `moveBoost`;
  an enemy's speed), and the raise fades over a short carry after leaving. Blade damage already
  grows with how fast the blade moves, so a run along the road is a harder cut: that is the road's
  question for the blade.
- **Who it moves:** one data row like `BLOOM_WELL_LIFT.targets` (player, light enemy, heavy enemy,
  boss, thrown blade), read through the shared `fieldEnemyClass`; held and flying enemies are left
  alone. The eight booleans and the second list go.
- **When:** tracks alternate through `offsetTicks`, read for every recurring field.
- **Lifetime and drawing:** the shared lifetime rule ends them; a presentation facts module feeds
  the drawing, which uses the shared tell layer for the warning before a track wakes.
- **Shared layer gained:** "a field attached to a surface" and "a field that raises top speed for
  travel in its direction" as definitions the next biome can use.

### Slice 2: the Rimehound

A pack hunter that uses the road: it runs the tracks to get beside the player and pounces from
speed.

- One tuning table, in `CONFIG`, in seconds.
- Stun, the opening grace and being held are honoured like every other enemy (and the grace test
  really exercises it).
- The pack's turn goes to a hound that can reach; a hound that cannot gives the turn up.
- The pounce reaches a player on the lower platforms, with a tell drawn by the shared tell layer
  and a lead time at or above the shared minimum.
- A missed pounce is a long skid in which the hound takes more damage; a pounce met by the blade is
  the same punish. A hit pounce recovers fast.
- It seeks an awake track that leads toward its flank position.
- The pack step becomes a stage enemy hook, not a call in the shared enemy step.

### Slice 3: the boss layer learns routes

Additions to `boss-attacks.ts` and the runner that any boss may use, each with its own tests and
with the Rootbound's fight unchanged (`pnpm test:determinism` and the Verdant replay parity check
stay green):

1. Movement along a route of several points, the route itself being the tell.
2. A leap to a named place, not only to the target, checked for reach when the table is built.
3. A hit that is a volley of shots the blade can turn back.
4. A push given to the player by a hit.
5. A move that only a strong parry answers.
6. One true route among false ones, chosen with the random source, with a minimum distance between
   them so the choice is real.

### Slices 4 to 6: the White Hart, one phase each

A new boss file that is one table of moves on the runner, as the Rootbound is. The old state
machine is deleted in the slice that replaces its last phase. For every phase: `tells()`,
`movePose()` and `practicePhaseEntry()`; a clamp at each phase line and a death lock; a
transformation between phases; the body-contact row and `body` hits in place of its own hit test;
a punish window after each big move and after a parry; health set from measurement against the
other bosses. The fight uses the stage's own platforms.

- **Phase I, the chase:** the run, the leap, the volley, and a kick that hits what is behind it.
- **Phase II, the false roads:** routes drawn before they are run, true and false far enough apart
  to choose between, a wake the player can ride.
- **Phase III, the storm:** a leap that reaches the platform it cracks, the long routes with an
  answer a person can give (not four windows of a tenth of a second), and a last crossing whose
  parry does something.

Each phase slice says which old moves were kept in name, which were cut and why.

### Slice 7: the stage's waves

- Pale's curve and composition read by the planner, with a cost for every enemy in the pool.
- A wave script for Pale in the same table Verdant uses (`waves` on the stage's curve): each wave
  that introduces an enemy or a variant lists it.
- The Pale variants reachable in Pale's own waves, each checked against the stage mechanic.
- Measured with `pnpm playtest waves --stage pale-traverse` on 24 seeds, beside Verdant and
  Voidspire. Today the command refuses Pale ("no Adventure stage"), because Pale is a preview
  stage; the slice makes the tool open a preview stage by name, agreed with the playtest tool
  session, without publishing it.

### Slice 8: what is left over

- Shared code stops naming Pale things by kind where a definition can carry it (canonical state,
  run start host, replay composition); the Verdant ones go the same way if the same change does it.
- `docs/HOW_TO_ADD_A_BIOME.md` describes the rebuilt Pale; unused values named in the audit are
  gone.

### With the stage drawing session

Agreed on 2026-11-20 with the session drawing Pale (`verdant-drawn`), which starts after pull
request 305 and the owner's reference illustration:

- Platform collision in `stages.ts` does not change without the lead.
- One picture serves the stage and the boss fight, and the fight uses the stage's own six
  platforms (the separate White Hart set in `arena-rules.ts` goes, in the first White Hart slice).
- The roads, their arrows and their warnings are drawn by the gameplay presentation layer on top
  of the picture. The readability check measures the picture without them, so the road's contrast
  against the picture is checked in slice 1, and the road colours go to the drawing session.
- The picture keeps these bands calm (no glints, streaks or motes, nothing that reads as a road or
  a ledge). They are the starting roads of slice 1, each from its surface up 70 px:

  | Road | Surface | Direction | Band (x, y, w, h) |
  | --- | --- | --- | --- |
  | floor | the floor, y 800 | east | 200, 730, 1200, 70 |
  | crossing | platform 560, 510, w 480 | west | 560, 440, 480, 70 |
  | low west | platform 140, 640, w 400 | east | 140, 570, 400, 70 |

  A change to this list goes to the drawing session before it lands.

## Failure modes (write these first)

1. The road is rebuilt and still touches nobody. Caught by a test that stands a player and each
   ground enemy on every track surface of every stage and requires each to be inside its track.
2. The road raises a number and the player goes no faster. Caught by a test that measures distance
   covered in one second on and off an awake track, through the production player step.
3. The Hart moves onto the table and keeps a private schedule or hit test beside it. Caught by the
   boss tell rules test (the Hart leaves its `STATE_READ_RECORD` row) and the body-contact test.
4. A route move warns and then goes somewhere else. Caught by a test that compares every route
   move's tell with the path the boss then takes, on 300 seeds.
5. The layer additions change the Rootbound. Caught by `pnpm test:determinism` and
   `browser-verdant-replay-parity`.
6. The fight is fair on paper and nobody can win it, or anyone can. Caught by the playtest tool's
   table per slice; a person playing is still the last word and is the owner's.
7. A slice passes with the old code still running beside the new. Each slice's pull request lists
   what it deleted.

## Done when

- [ ] A player and every ground enemy standing on a track surface is inside that track, on every
      stage that has tracks (`tests/unit/aurora-track-surface.test.ts`, fails on main).
- [ ] A player running with an awake track covers at least 1.3 times the distance of one running
      beside it in one second, and exactly the same distance standing, crossing or against it.
- [ ] `pnpm playtest bosses --boss white-hart` prints no "limited tell data" line, 0 damage counted
      "no tell" for the avoids-tells player, an exposed time above 0 in every phase, and reaches
      Phase III with the scripted player on at least half of 12 seeds.
- [ ] `tests/unit/boss-tell-rules.test.ts` has no `white-hart` row in `STATE_READ_RECORD`, and
      `white-hart.ts` imports its moves from one table built by `buildBossAttackTable`.
- [ ] A stunned Rimehound does not move or attack; a pack with its first hound out of reach still
      attacks; a player on the 640 platforms can be pounced (unit tests, each failing on main).
- [ ] `pnpm playtest waves --stage pale-traverse` on 24 seeds: each listed enemy appears in its
      wave on every seed, and Pale's clear rate lies between Verdant's and Voidspire's for the
      scripted player or the pull request says why not.
- [ ] No file under `src/` outside Pale's own modules and definition tables tests `=== "white-hart"`
      or `=== "rimehound"` for behaviour.
- [ ] The owner has played the road, the Rimehound and each phase of the Hart.

## Scope

- **Changes:** `src/gameplay/environment` (Aurora and the shared field rules), `src/gameplay/entities`
  (the boss move layer, the Rimehound, the White Hart), `src/gameplay/run` (Pale's curve, composition
  and waves), `src/gameplay/variants.ts` (Pale rows), the Pale renderers and presentation facts under
  `src/presentation`, their tests, `docs/HOW_TO_ADD_A_BIOME.md`, `config/position/pale-traverse.json`.
- **Does not change:** platform collision in `src/gameplay/stages.ts` (without the lead), the
  painted backgrounds (the stage drawing session), the publication boundary (the owner), anything
  for phones or touch (mobile is paused; follow-ups go to `plans/MOBILE_LATER.md`), the music and
  wiki repositories.

## Checks

- **While iterating:** the unit tests of the slice, `pnpm test:related <changed files>`,
  `pnpm playtest bosses --boss white-hart`, `pnpm playtest waves --stage pale-traverse`.
- **Before each pull request:** `pnpm format`, `pnpm typecheck`, `pnpm check:quick`,
  `pnpm test:determinism`, `pnpm test:weapons`, then the test build with browser smoke, the release
  Adventure journey, the gameplay scenarios and browser performance, each run once.
- **Could not run here:** a person playing; the owner does.

## Log

- 2026-11-20 Audit and this plan.
