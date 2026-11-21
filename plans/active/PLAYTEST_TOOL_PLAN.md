# Playtest tool plan

## Authority metadata

- **Owner:** Playtest tool owner
- **Status:** Active
- **Closure condition:** Every "done when" line of stages 1 to 6 holds, `pnpm check` passes from the final commit, and no file, command or document is still named TearBench.

Started 2026-11-16. This is the one planning document for the playtest tool. It is edited in
place as stages land; status lives in `config/position.json`.

## Why

Tear has a headless copy of the real game and a scripted player that can play it, built under
the names TearBench and `src/agents`. Around them sat about 150,000 lines that described,
scheduled and certified work and produced no result. Nothing measures the game: no clear
rates, time to kill, damage taken or difficulty curve. The owner's words: "It can do all the
tests those lanes were describing without the whole title for it… rework, plan, and overhaul
this to be better than what it is, less over-engineered, and actually provide results."

## Goal

One command, `pnpm playtest`, plays Tear headless with scripted players on fixed seeds and
writes a report a person can read. It answers questions about the game, compares two builds
on identical seeds, and supplies a small fixed set of checks for the required pull request
check. It has no tiers, certificates, ledgers or schedulers.

"Provides results" means each question below has a command that prints the answer.

| # | Question | Answered by | Stage |
| --- | --- | --- | --- |
| 1 | For each boss and phase: is it cleared, how fast, at what cost in health, how many hits land each way, how long is the boss open to attack? | `pnpm playtest bosses` | 1 |
| 2 | How do the bosses compare with each other on the same players and seeds (is the rebuilt Rootbound nearer Aldric and the White Hart)? | the same table, one row per boss and phase | 1 |
| 3 | Can a player who stands still, only walks, or never dodges survive something they should not? | simple players in every table | 1 |
| 4 | Does the same seed give the same numbers, and does replaying a run's recorded actions end in the same state? | built into every run; a run that differs fails | 1 |
| 5 | What is the time to kill for every enemy kind, alone and in authored groups? | `pnpm playtest enemies` | 2 |
| 6 | Where do full runs end, by mode, difficulty and weapon? How long is each wave and how much health does it cost? | `pnpm playtest runs` | 2 |
| 7 | How does difficulty rise across waves and biomes? | wave table and curve in the runs report | 2 |
| 8 | Did this change make anything easier, harder, slower or broken? | `--compare <commit>` on any report | 2 |
| 9 | Does every enemy, boss, boss phase, stage object and upgrade appear at least once? | coverage section of the report | 2 |
| 10 | Are the numbers about the game or about a weak player? | the stronger player, and a skill spread column | 3 |
| 11 | Does every attack hit only after a readable warning? Does anything happen that must never happen? | `pnpm playtest check` | 4 |
| 12 | Which playtest checks does this change need? | `pnpm playtest check --changed` | 4 |
| 13 | What does the player's play look like? | `pnpm playtest watch` | 6 |

## What was verified before planning (2026-11-16, main `29b6500b`)

Run through the production headless environment with `TearLiveHierarchicalPolicy("competent")`.

- **It plays.** Endless, Easy, Sword, seed 1: defeated on wave 5 after 9,015 ticks (75.1 s of
  game time), 211 damage taken, 21 kills. Time from spawn to death per kind: bull 5.3 s (7),
  brawler 7.3 s (5), rifleman 11.7 s (2), armored 22.5 s (2), charger 20.6 s (1). Upgrade
  choices are scored with `buildWatchChoiceScore`; without scores the player picks
  alphabetically and the same seed gives a different run.
- **It is fast.** 13 to 15 times real time on one core with other sessions running; an idle
  player ran at 43 times.
- **It is deterministic.** The same seed twice ended on the same tick with the same damage,
  including when the run was saved and restored six times on the way.
- **The game's own events are enough for most measures.** `run`, `wave`, `spawn` (with
  `variantId` and `bossId`), `death`, `loadout`, `projectile` (spawned, deflected, hit) and
  `environment` events arrive from `sourceTracks()`. Health, boss phase and boss health ratio
  come from the observation each tick.
- **Adventure.** Easy, Riftlock, seed 3: defeated on wave 7 after 108 s, 172 damage taken,
  40 kills across 11 enemy kinds. Adventure opens on the chapter page with the player locked;
  a run must skip it (about 900 application frames, as the scenario test does). Without the
  skip the scripted player pauses at tick 1,801 and then confirms on the pause screen until
  the tick limit, with no damage either way.
- **It cannot fight a boss.** Boss-only, Easy, seed 1 (the Rootbound comes first): in 120 s
  the scripted player took 0 damage with Sword and 10 with Riftlock and took nothing off the
  boss, which sat in `idle`. A player who stood still took 73 damage in 30 s, so the fight is
  live; the player never engages. The headless observation also carries no boss id or phase
  (`diagnostics.boss` is absent). Stage 1 fixes both, or its boss table is empty.
- **A player who stands still dies.** Endless, Easy, seed 2: dead in 15.3 s on wave 1, 100
  damage over 9 hits. No safe spot there; the tool will ask this of every situation.
- **Damage includes the killing blow.** The first probe read health before each decision and
  stopped after the last step, so it missed the hit that ended the run (88 instead of 100
  above, 209 instead of 211, 168 instead of 172). The figures here are read from the final
  observation.
- **The same numbers on a second machine.** Repeated on 2026-11-16 at main `33cfd81a` on a
  16-thread desktop: every run above ended on the same tick with the same damage, kills and
  time to kill per kind. Speed there, through vitest: 22 times real time for the scripted
  player in Endless, 29 in Adventure, 32 to 37 in a boss fight, 50 idle. Through Vite's
  module loader without vitest the same Endless run went 32 to 39 times, so the tool uses the
  loader. Starting a process (loading the modules) takes about 7.5 s.

Limits found, each handled in a stage below:

1. **No start at a chosen boss, phase, wave or stage.** `requireNaturalScenario` in
   `production-headless-environment.ts` refuses them; a boss-only run takes the shuffled
   roster. Of the 35 catalogue scenarios only 8 declare the headless backend; the other 27
   (every boss encounter, every Pale and Verdant stage scenario) run only in a browser test
   build. Stage 1 adds a chosen boss; stage 2 adds phase, wave and stage through the
   existing snapshot factories, which brings those 27 within reach of a headless run.
2. **Save and restore is slow.** Capture took 30 ms and restore 46 ms early in a run, rising
   to 112 ms and 136 ms by 72 s, because the checkpoint copies and hashes the whole action
   list. That is about ten forks a second: enough for "start at phase 2", too slow for
   lookahead. The faster desktop was no faster (37 and 55 ms at tick 1,200, 93 and 122 ms at
   tick 7,200): the list grows by about three actions a tick, so the cost grows with the
   length of the run, not with the machine. This is an open design problem for stage 3, which
   needs an in-memory fork under 5 ms or scopes lookahead down. Stage 1 does not solve it.
3. **Events after a restore are only the suffix.** A restored run reports no events from
   before the restore. The tool keeps its own running totals instead of re-reading the track.
4. **Nothing reports who damaged the player, or damage dealt per hit.** Health changes are
   visible; the source is not. Stage 1 reads the career recorder's counts (attacks, misses,
   damage) and attributes damage taken to the nearest attacking actor, marked as an estimate.
   A native damage event would make it exact; that is a game change and an owner decision.
5. **The scripted player is weak and has known rule gaps:** it jumps whenever anything is
   within 240 px, picks one target and ignores the rest, dodges on a speed threshold instead
   of an attack's warning, and has tactics for one weapon of five.

## Principles

Taken from how studios and research do automated playtesting, kept to what fits one machine:

- Seeded, deterministic runs, so one run per seed is a fact and any difference between two
  builds is real.
- Several players of different skill, not one. A fairness question needs a bad player; a
  balance question needs a good one; the spread between them says how much skill matters.
- Search over the real simulation (save, try, restore) is the honest way to a strong player.
  No learned models.
- Measure per encounter, from the game's own events, never from a copy of its rules.
- Regressions are found by comparing numbers between builds, not by filing cases.
- A layer that only describes, schedules, certifies or accounts for another layer is not built.

## Design

### Command

```text
pnpm playtest bosses  [--boss <id>] [--weapon <id>] [--difficulty <id>] [--seeds N] [--players a,b]
pnpm playtest enemies | runs | check | watch
        --compare <commit>     same situations and seeds on another commit; prints only what changed
        --json <path>          also write the report as JSON
        --jobs N               worker processes (default: cores minus 2, at most 6)
```

One script, `scripts/playtest.mjs`, loads the TypeScript through Vite's server-side module
loader, the way `scripts/tearbench.mjs` loads its modules today, not through vitest, which
cost about 40 % of the speed in the verification runs. A subcommand exists only
because it prints a different report. Long sweeps go through the machine slot limiter.

### Where the code lives

`src/playtest/`, a new layer in `config/architecture-layers.json` that may import the
headless game, the scripted player, gameplay, input, simulation, config and domain. Nothing
in the game imports it, and it is absent from release bundles (`pnpm check:bundles`).

| Module | Job |
| --- | --- |
| `situations.ts`, `situations.json` | What to play: mode, difficulty, weapon, boss, phase, wave, stage, tick limit. Data, one row each. |
| `players/` | The scripted player and the simple players behind one `decide(observation)` interface. |
| `play.ts` | Plays one situation with one player on one seed; returns the run's measures and its action list. |
| `measure.ts` | Turns events and per-tick observations into measures. The only place a measure is defined. |
| `report.ts` | Tables as Markdown, charts as text or SVG, and the same data as JSON. |
| `compare.ts` | Two reports in, the rows that differ out. |
| `checks.ts` | Never-happen checks and content-wide rules run over played situations. |

### Players

| Player | What it does | What it answers |
| --- | --- | --- |
| `scripted` | Today's rule-based player | Baseline; what an average player sees |
| `strong` | The scripted player with fixed rules, per-weapon tactics and bounded lookahead | Balance: the numbers reflect the game |
| `still` | No input | Safe spots; does every situation threaten the player |
| `walker` | Walks across the arena and jumps every four seconds, never attacks | Boss pressure (the measure in `boss-pressure-report.test.ts`) |
| `no-dodge` | Attacks, never dashes or jumps | Is avoidance needed; do warnings matter |
| `one-attack` | Repeats one attack | Is one move enough |

### Measures

Per run, per wave and per enemy kind: cleared or not, ticks, damage taken, hits taken,
lowest health, kills, time from spawn to death, hits landed, attacks and misses, parries and
deflects, upgrades taken, and where the player died.

Per boss phase, agreed with the Verdant gameplay work, which uses the report to judge the
rebuilt bosses:

| Column | Source |
| --- | --- |
| Cleared, time to kill, lowest boss health reached | `death` event, boss health ratio |
| Damage and hits on the player, parries landed | health per tick, `projectile` deflect events |
| Boss travel in px/s | boss position per tick |
| Exposed seconds | ticks where any tell from `bossTells(boss)` has `stage === "exposed"` |
| Longest stretch with no attack | ticks with no warning or active tell |
| Shortest warning before a damaging hit | first `warning` tell to the hit; timed for bosses with no attack table |
| Moves used, with counts | `attackId` on the tells; a move that never comes up shows as zero |
| Health healed | rises in boss health ratio |

`bossTells` (`src/gameplay/entities/boss-tells.ts`) covers every boss. Attack tables with
declared `timing {tell, active, recover, punish}` (`boss-attacks.ts`) exist for the Rootbound
only, on a branch not yet on main; bosses without a table report 0 exposed seconds, which is
the honest number until they move onto that layer. The tool reads tells and tables and never
matches state names.

### Report

Markdown to the terminal and to `artifacts/playtest/<name>.md` (untracked), JSON beside it.
One table per question, sorted worst first, with seeds listed so any row can be replayed.
Curves (difficulty by wave) are text bars in the terminal and SVG in the file.

### Comparison

`--compare <commit>` extracts that commit's `src/` into `artifacts/playtest/base-<sha>/` with
`git archive`, loads its game through the same loader (dependencies resolve from the
worktree, no second install and no junction), plays the same situations and seeds with the
current tool, and prints rows whose numbers differ. If the lockfile differs between the two
commits it says so and stops.

### Speed

Headless, one process per core through `--jobs`, up to 6. The required check runs a fixed
set sized for under 30 s on a GitHub runner. Full sweeps run on demand on a local machine;
there is no nightly job, because Actions minutes are metered.

- **Tick limits.** The `still`, `walker` and `no-dodge` players play at most 60 s per boss
  phase: they measure the boss's pressure, not the kill. Only `scripted` (and later
  `strong`) plays to 120 s.
- **Budget.** A full sweep finishes in under 5 minutes on 6 jobs. If it does not, seeds are
  cut before bosses, and the report header says what was cut.
- **Machine slots.** One sweep takes one slot of the machine's heavy-command limiter
  (`heavy-gate.mjs`), however many worker processes it starts. Two sweeps never run at once.

### What the replay overhaul can rely on

- The headless game's `reset`, `step`, `policyObservation`, `captureCheckpoint` and
  `restoreCheckpoint` keep their behaviour; this plan adds starts and a faster fork beside
  them and changes none of them.
- Every playtest run is a scenario, a seed and an action list, and replaying that list
  reproduces the final state hash. The tool checks this on every run, so a replay defect
  shows up as a failed playtest with a seed.
- This plan does not restructure the replay world or the codecs. The replay overhaul moves
  them out of `src/tearbench`: the detached world to `src/app/world/detached/` and the
  snapshot codecs to `src/gameplay/snapshot/` (agreed between the two sessions on
  2026-11-20). `src/playtest` imports both; neither ever imports `src/playtest`.
  `playtest -> gameplay` is an allowed edge today. `playtest -> app` is not: it becomes a
  rule in `config/architecture-layers.json` in the pull request that first needs it, and
  until stage 5 moves the headless environment the same edge starts in `src/tearbench`.

## Reused, moved, deleted

Nothing that works is rebuilt.

| Part (today's path) | Disposition |
| --- | --- |
| `tearbench/production-headless-environment.ts`, `production-headless-scenario.ts`, `production-policy-observation.ts`, `production-boss-practice-start.ts` | Reused as is from stage 1; moved to `src/playtest/headless/` on 2026-11-20, ahead of the replay overhaul's world move |
| `tearbench/headless.ts` | Reused as is; moved to `src/playtest/headless/` in stage 5 |
| `tearbench/production-world-factory.ts`, `production-combat-phases.ts`, `production-wave-reward-runtime.ts` | Reused as is from stage 1. Moved by the replay overhaul (its fourth pull request) to `src/app/world/detached/`, not by this plan: players' replays reach them, and release code cannot import `src/playtest` |
| `agents/scripted-policy*.ts`, `hierarchical-policy-adapter.ts`, `watch-build-choice.ts`, `tearbench/scripted-agent-hierarchy.ts` | Reused from stage 1; become `src/playtest/players/scripted*.ts` in stage 5 |
| `tearbench/canonical-scenarios.json` (35 scenarios, 8 headless today) | Become rows in `situations.json` in stage 4; the browser-only ones run headless where stage 2's starts allow, and stay browser tests where a browser is the point |
| `tearbench/invariants.ts` | Becomes the never-happen half of `checks.ts` in stage 4 |
| Weapon parity (`current-headless-weapon-parity.test.ts`) | Becomes the replay check in stage 4 |
| State Forge codecs and factories | Reused in stage 2 for phase, wave and stage starts. The codecs are moved by the replay overhaul (its third pull request) to `src/gameplay/snapshot/`; the factories that only the tool uses are renamed "snapshots" in stage 5 |
| Browser bridge (`tearbench/browser/`, `live-runtime-*`) | Reused for `watch` in stage 6; 43 browser tests keep using it |
| Change-to-test routes (`evidence-routes.json`) | Reduced to a path-to-situations map for `check --changed` in stage 4 |
| Tutorial driver (`tutorial-course-driver.ts`, `tutorial-gold-generation.ts`) | Stays; moves beside the tutorial code in stage 5. Every build depends on it |
| Replay world and codecs used by shipped ghosts (`production-replay-composition.ts`, state and environment codecs, hydrators) | Not touched here; move with the replay overhaul, to the two homes above |
| `tests/unit/canonical-hash-stream.test.ts` (`pnpm test:determinism`) | Stays as it is |
| `tests/unit/boss-pressure-report.test.ts` | Stays with the Verdant gameplay work; its measures become report columns |
| Trained AI, training screens, certificates, receipts, canary, leases, Graveyard, bisection, minimisation, requirements, checkpoint commands | Deleted by the removal work (pull request 138, then its next one), not by this plan |
| `scripts/tearbench*.mjs`, `task-registry.json`, `runner.ts`, `registries.ts`, `tearsdl.ts`, what is left of `src/agents` | Retired in stage 5 once nothing calls them |

## Required check

`config/checks.json` and `scripts/run-checks.mjs` are on main. Stage 4 adds one row to the
`unit` group and removes the rows it replaces:

| Today | Becomes | Expected time |
| --- | --- | --- |
| `test:headless:current-gameplay-scenarios`, `test:headless:current-weapon-parity`, the scenario and invariant unit files | `pnpm playtest check` (fixed set: the folded scenarios, one short run per weapon with its replay check, one boss per biome, never-happen checks) | under 30 s |
| TearBench evidence selection test | deleted with the selection code | 0 |

`pnpm test:determinism` and the content-wide rule tests stay as separate rows. The exact row
and its `seconds` are agreed with the CI work before the pull request opens.

## Skills

`tear-autonomous-playtester` becomes "run `pnpm playtest`, read the report, compare with
main", about 25 lines. `tear-combat-scenarios` becomes "add a row to `situations.json` and a
check, or a unit test when one module is the contract", about 25 lines. Both lose every
mention of receipts, classes, Graveyard and certification. Stage 6.

## Failure modes

1. The report prints numbers that are wrong. Caught by a test that plays three short
   situations and compares each measure with values counted by hand from the event list.
2. The tool is not reproducible. Caught by a test that plays the fixed set twice, once with
   one job and once with four, and requires byte-identical JSON.
3. Comparison misses a real change. Caught by a test that compares against a build with one
   enemy's health doubled and requires that enemy's time to kill to be flagged.
4. The numbers measure the player. Caught by reporting every table for at least two players
   and by stage 3's bar for the strong player.
5. It grows back into ceremony. Caught by review against the principles, and by the line
   counts in the before and after table.
6. It changes the game. Caught by `pnpm test:determinism` passing without a new fixture and
   the tutorial reference output staying byte-identical.

## Stages

Each stage is one pull request from current `origin/main` unless noted.

### Stage 1: measurement core and the boss report (after pull request 138 merges)

`src/playtest/` with `play`, `measure`, `report`, the `scripted`, `still`, `walker` and
`no-dodge` players, and a chosen-boss start in the headless environment. Imports the kept
TearBench and agent modules without editing them, except the one start check.

Requirements from the verification runs:
- Damage taken is read from the observation after every step, including the last, so the
  killing blow counts.
- A run that ends, or reaches its tick limit, on a screen other than play is reported as
  broken, never as survived. Adventure runs skip the chapter page first.
- Every player takes upgrade choices by the same scored rule (`buildWatchChoiceScore`), so a
  difference between players is never a difference between builds.

Built first (2026-11-17, the lead's cut of this stage to one small pull request): a chosen boss in a
headless boss-only run; `src/playtest/` with the boss view, the `scripted` and `avoids-tells` players,
the fight measurement and the report; `pnpm playtest bosses`. A phase is reached by play. The fight
loop advances application frames while a phase-change cinematic holds the simulation; without that a
headless fight stops for ever at the first phase change.

Built second (2026-11-17): `--phase 2,3` starts a fight at a chosen phase through the game's own
Playground boss practice. The tutorial's boss selection and the phase-practice runtime bring the boss
there by its own transitions; nothing edits health. The game offers this with Sword on Normal only and
for the campaign roster, which leaves out the White Hart. The Playground restores a defeated player;
the fight counts that as the defeat and stops. The scripted player now counts damage to an enemy as
progress, because in a fight that scores nothing its watchdog took the fight for a softlock and paused.

Built third (2026-11-19): the `cuts-objects` player and the "to cut" lines. The headless observation now
carries what the stage holds (the same projection the browser's scripted player gets), so a fight counts,
per phase and by name, what was planted for a weapon to cut, how long it stood and what the player cut:
Grafts, Root Cage walls, Regrowth roots, and any later kind with no edit. The `cuts-objects` player is the
tell-avoiding player with one addition: it picks the nearest standing object, walks under it, jumps and
swings, and leaves one it has not damaged in 6 seconds. A fight at a chosen phase now gets its whole time
limit; the time the game takes to bring the boss there used to be taken out of it.

Built fourth (2026-11-19): the `no-dodge` player (the scripted player without its dash and its jump) and the
`still` player (no input during play). Both measure what a boss does to them, so a fight of theirs stops, as
a time limit with the reason, once a phase has been played for 60 seconds.

Built fifth (2026-11-19): the `walker` player (keeps walking, turns round at whatever stops it, jumps every
four seconds, never attacks; it stops after 60 seconds of a phase like the other two pressure players) and
the "boss px/s" column: how far the boss moved sideways each second of the phase.

Built sixth (2026-11-19): the sweep and the summary. `pnpm playtest sweep` plays every boss with every weapon
on Easy and Normal with all six players and prints one summary table per boss and difficulty; a row is a phase
and a player, pooled over weapons and seeds: fights that cleared the phase of those that reached it, the middle
clear time, damage and hits taken and hits landed per fight, the share of damage nothing warned of, boss
movement and the share of time the boss was open. `--difficulty` takes a list, and "hits landed" is a new
per-phase measure. Many fights are shared between worker processes of the same command (`--jobs`, up to 6);
the result is the same fights in the same order as on one process, which a test holds.

Measured on 2026-11-19 on 6 jobs, on a machine other sessions were also using: four seeds are 1,680 fights and
took 498 s, over the budget. By the budget rule the default sweep plays seeds 1 and 2 (840 fights, 251 s)
and says in its first line that seeds 3 and 4 were left out; `--seed 1,2,3,4` plays them. The fights play at
about 15 times real time a process, and 1,680 fights are 12.6 hours of game time, so four seeds do not fit
5 minutes on 6 jobs at this speed. What would fit them: Colossus, Aldric and the White Hart give the same fight
on every seed with these players, and `cuts-objects` plays the same fight as `avoids-tells` wherever the stage
holds nothing to cut; a sweep that played each distinct fight once would be about a third shorter. Not built.

Built seventh (2026-11-20): the tests of the failure modes, which close the stage.

- Failure mode 1 (wrong numbers): `tests/unit/playtest-hand-count.test.ts` plays three short fights, gives the
  game the same actions again, writes down every tick from the game's own actors and counts ticks, damage and
  hits taken, damage dealt, hits landed and boss movement from that list; the table must agree. It fails on a
  planted error in the movement and in the damage dealt.
- Failure mode 2 (not reproducible): `tests/unit/playtest-sweep.test.ts` plays a set whole and in three shares
  and requires the same fights in the same order, and `playtest-bosses` requires the same table for the same
  seed. The command on one job and on four gave byte-identical JSON twice by hand (24 fights, then 4). That
  comparison is not a unit test: it costs about 80 s, nearly all of it five loads of the game. It belongs in
  stage 4's `playtest check`, which loads the game once for the fixed set.
- Failure mode 6 (changes the game): `pnpm test:determinism` passes (16 tests) and no playtest pull request
  touched a fixture or the tutorial reference output.

Done when:
- [x] `pnpm playtest sweep` prints, for every boss, per phase and per player: clear rate, time to kill, damage and hits taken, hits landed, boss movement, share of time open; 5 weapons, Easy and Normal, in under 5 minutes on 6 jobs. Seeds were cut from 4 to 2 to hold the 5 minutes (see "Built sixth").
- [x] The three tests of failure modes 1, 2 and 6 pass. For mode 2 the one-job against four-jobs comparison of the command was made by hand and waits for stage 4 to become a check (see "Built seventh").
- [x] The Rootbound's rows are sent to the Verdant gameplay work and the lead, beside Aldric's and the White Hart's (2026-11-20, `playtest-sweep-rootbound-rows.md` in the sessions' shared notes).
- [x] Catalogue, change-impact, repository-map and layer entries exist; `pnpm check:quick` passes.

### Stage 2: situations as data, comparison, enemies and full runs

`situations.json`; phase, wave and stage starts through the snapshot factories; `enemies`
and `runs` reports; coverage; `--compare`.

Built first (2026-11-20, brought forward for `pnpm playtest waves`): a headless start on a chosen wave.
A scenario's `start.wave` (with `start.stage` to name the Adventure stage it belongs to) places the run
just before that wave and lets the game's own wave planner start it, so the stage, its story chapter and
the wave's enemies are the game's, for every stage from one path. It is marked `surgical-valid` and gives
no checkpoint; a later wave is refused in modes whose waves the planner does not number (boss-only, the
Gauntlet). `src/playtest/headless/chapter.ts` skips the chapter the way a player does. The player
arrives with no upgrades unless the environment is given a build: then the game's draft is rolled once for
each wave before and the build picks one upgrade from each, applied as a pick in a run is. Limit, stated in
every report that uses it: tier-ups and anything bought are not part of a build. Test:
`tests/unit/playtest-wave-start.test.ts`.

Built second (2026-11-20): `pnpm playtest waves --stage <id>`, the measures the Verdant gameplay work asked for.
Each wave of the stage before its boss is opened directly and played on fixed seeds; a row per wave gives how
many runs cleared it, the game's own clear time (its wave log), the opening grace, the enemies as they arrived
and how many had affixes, damage taken by source, snares marked, caught and cut and the time held, ally roots
grown and cut, uproots, and each Rootbinder's time to kill and whether it died planted. `--show runs` adds a
line for every run with where the player fell and the arrival order; `--json` writes everything. Roots and
snares are read by the shared names of the parts (`root-link`, `root-snare`, `rootPhase`), so another enemy or
stage that uses them is counted with no edit. Damage by source is attributed, as for bosses: the game does not
record what hit the player, so it goes to the owner of a shot on the player, else an enemy touching the
player, else "unmarked". Verdant, sword, Normal, three seeds, two players: 54 waves in 71 s on five
jobs. Tests: `tests/unit/playtest-waves.test.ts`.

Built third (2026-11-20): `pnpm playtest runs`, whole runs from wave 1 in the Adventure, Endless and the
Gauntlet, on the production headless path with no copied game logic: the scripted player drafts from what the
game offers after each wave and skips each story chapter as a player does. Per mode and difficulty it prints a
row per weapon (runs won, the wave runs ended in, run time, upgrades held) and a row per wave over every weapon
and seed (runs that reached it, runs that cleared it, the game's own clear time, health lost, health coming in
and going out). The default set is 3 modes, Easy, Normal and Hard, 5 weapons and seeds 1 to 3: 135 runs in
76 s on six jobs. What three seeds can show: the wave a weapon's runs usually end in, to within a wave
or two, and which waves cost the most health. What they cannot: a difference of one wave between two weapons,
or a clear rate for a wave that one or two runs reached. And every number is the scripted player's: it shows
how far that player gets, not how far a person gets, until stage 3's stronger player. Tests:
`tests/unit/playtest-runs.test.ts`.

Built fourth (2026-11-20): `pnpm playtest enemies`, each enemy kind alone against the player. A meeting is in
the Playground, the game's own empty arena, and the enemies are put in play by the game's own spawner, so there
is no copied spawn logic and a new enemy kind appears with no edit. It prints a row per kind: how the meetings
end (cleared, player fell, stalled, time limit), time to clear, the enemies' health and the share left
standing, health lost and what it is lost to. The default set is every enemy the published game has, 1 and 3
of a kind, Sword on Normal, seeds 1 to 3: 72 meetings in 61 s on four jobs. Its limits: the enemies are at
wave 1 strength and the player has no upgrades, so the rows compare the kinds with each other and are not
what a kind costs late in a run; and "in authored groups" (question 5) is answered by `pnpm playtest waves`,
which plays the groups the game's wave planner makes, not by this report. "Stalled" is a meeting the scripted
player gave up after 15 seconds in which no health changed on either side. Tests:
`tests/unit/playtest-enemies.test.ts`.

Built fifth (2026-11-20): `pnpm playtest coverage`. It plays the four reports, each as its own run of the
command (bosses twice: from Phase I, and from Phases II and III through the game's boss practice; waves over
every Adventure stage on seed 1), and compares what they brought into play with the game's own lists: published
enemies, enemy affixes, bosses, boss phases and upgrades (an upgrade appears when a draft offers it). The game
keeps no list of stage objects, so that line says what appeared and cannot say what is missing. 315 fights,
waves, runs and meetings; 897 s through the queue on a loaded machine. The first list has three entries, each
a gap in what was played and not in the game, reported to the lead:
- White Hart Phase III: the White Hart is not in the game's boss practice, so its fights start at Phase I and
  no scripted player gets past Phase II in 180 s.
- Air Superiority and Bloodrite: never offered in these drafts. Drafts repeat on a seed, so the set holds few
  different drafts; both are offered on seeds 2 to 6 of a deep Verdant wave (checked by hand).

Building it found a fault in `pnpm playtest waves`: every wave of the Grounds after its first was reported as
broken ("the stage's story chapter did not end"). The Grounds shows no chapter there, and the wave start read
"no chapter" as "chapter not over". `chapterHolds` in `headless/chapter.ts` now answers that question for the
waves and the runs. Tests: `tests/unit/playtest-coverage.test.ts`, and a Grounds wave in
`tests/unit/playtest-waves.test.ts`.

Built sixth (2026-11-20): `--compare <commit>` on every report. The commit's `src`, `config` and the JSON
under `public` are extracted once into `artifacts/playtest/base-<sha>/` with `git archive`; this checkout's
`src/playtest` is laid over its own, so both builds are played by the same tool; the same set is played on it
as its own run of the command, and `compare.ts` prints, per situation, each measure that differs. The game is
deterministic, so any difference is the build's; there is no threshold. It prints only what changed unless
`--show` asks for the tables. It stops, by name, on a commit that does not exist and on one that lists a
package at another version than this checkout (packages added since do not matter). Its limit: the tool of today has to load on the game of that commit, so a commit from before a change
to what `src/playtest` imports fails to load and says so; it is for a branch against main and for recent
history. Checked by hand: `enemies --compare HEAD` prints "nothing changed"; Verdant waves 32 and 35 against
the commit before the wave change of pull request 316 print both situations as changed, with the affixes that
went. Tests: `tests/unit/playtest-compare.test.ts` (failure mode 3: one enemy's health doubled, its time to
kill flagged and nothing else).

Built seventh (2026-11-21): the headless player decides from the live game's own observation. Headless runs
ended at waves 5 to 8 where the same scripted player in the browser reached wave 60. The cause was not a
revive (the standalone game has no continue screen: it is the rewarded-advert continue, and there are no
adverts). The headless player was given a second, poorer observation: no walls, no enemy attack states, and
enemy names that were list positions and moved when an enemy died. The scripted player turns off a wall only
when it is told where the walls are, so a Riftlock player backed into the left wall and stayed. Now
`headless/production-policy-observation.ts` hands the headless world to the live projection
(`projectLiveTearObservation`), so there is one observation for both, with the game's own enemy ids. Measured
on the easy Adventure with Riftlock, seeds "117" and "1" to "5": headless runs ended at waves 5 to 8 before,
and at 60 (won), 10, 8, 9, 60 (won) and 18 after; the browser player on the same six runs ended at 60, 60, 18,
9, 60 and 10. The two do not match run for run (one known difference is the pause below), but they spread
the same. Three things came with it. A run that beat the last boss
sat in the closing scene to its time limit: `skipFinale` in `headless/chapter.ts` holds confirm through it, as
a player does, to the win screen. With real attack states the player gives way to an enemy winding up, and it
would not go to a target standing at a wall; `MovementModule` in `src/agents/scripted-policy.ts` now lets it
approach one (this is also the browser player's rule). And the recorded scripted fights in
`tests/fixtures/canonical-hash-stream.json` change, because the player decides differently; the game's rules
do not. Not fixed, not this tool's code: the headless world keeps stepping while a screen pauses the game
(600 paused ticks cost the player 33 health), and `--seed` is hashed, so headless seed "117" is the browser's
seed 1714819488. Tests: `tests/unit/scripted-player-walls.test.ts`, `tests/unit/playtest-finale.test.ts`.

Done when:
- [ ] Every boss phase, every wave of each biome and every enemy kind is a row that starts directly, in under 1 s each.
- [x] `pnpm playtest runs` reports where runs end and per-wave time and health cost for 3 modes, 3 difficulties and 5 weapons.
- [x] The coverage section lists content that never appeared; the list is empty or each entry is reported to the lead.
- [x] `--compare` passes the test of failure mode 3 and prints no rows for a commit compared with itself.

### Stage 3: a stronger player

Rule fixes first (jump discipline, threat from all nearby actors, dodging on warnings read
from the boss attack definitions, tactics per weapon), then lookahead: at a decision point,
fork the simulation, try a few candidate action sequences for a short horizon, keep the one
that loses least health and deals most damage. Needs an in-memory fork under 5 ms.

Done when:
- [ ] `strong` clears Easy Adventure with every weapon on at least 3 of 4 seeds and reaches every boss on Normal; measured by `pnpm playtest runs`.
- [ ] A skill spread column (strong against scripted) is in every table.
- [ ] `strong` runs at 3 times real time or better; if the fork cannot be made fast enough, lookahead is limited to boss situations and the plan says so here.

### Stage 4: checks, and the row for the required check (after the removal work's next pull request)

Fold the 35 catalogue scenarios, the never-happen checks, weapon replay parity and the content-wide
rules into `pnpm playtest check`; `--changed`; hand the fixed set to the CI work.

Done when:
- [ ] `pnpm playtest check` runs every folded scenario and rule and fails on a planted violation of each rule.
- [ ] The fixed set runs in under 30 s on a GitHub runner and is one row in `config/checks.json`; the rows it replaces are gone.
- [ ] The total of recorded `seconds` in `config/checks.json` is lower than before.

### Stage 5: absorb and retire (after stage 4 and in step with the replay overhaul)

Move the headless game and players under `src/playtest/`, rename State Forge to snapshots,
delete `scripts/tearbench*.mjs`, the task registry and what is left of `src/agents`.

The last `playtest -> tearbench` imports are this stage's to move (lead, 2026-11-20). The replay overhaul's
third and fourth pull requests take the replay side (the snapshot contract and codecs, the world factory, the
composition, the wave reward runtime and the combat simulation). What `src/playtest` still imports from
`src/tearbench` after them, measured on main `c0270eff`: `contracts` (the scenario, observation and causal event
types), `simulation-profile`, `validation`, `observation-identity`, `live-observation-actors`,
`live-observation-projectiles`, `headless`, `gameplay-causal-events` and `production-replay-bootstrap-check`,
which stays with the headless environment. They move into `src/playtest` with whatever only they use. The pull
request that moves the last one also removes the `playtest -> tearbench` allowance from
`config/architecture-layers.json`. The order is agreed with the replay overhaul first, so the two do not edit
the same imports at the same time: these moves start after its fourth pull request is on main.

Done when:
- [ ] `src/playtest` imports nothing from `src/tearbench`, and `config/architecture-layers.json` no longer allows it.
- [ ] `git grep -i tearbench` finds nothing outside `plans/completed/` and the replay code that waits for the replay overhaul.
- [ ] Architecture and code-budget baselines are lower than before, never higher.
- [ ] `pnpm check` passes.

### Stage 6: watch mode, skills, documents

Done when:
- [ ] `pnpm playtest watch <situation>` shows the chosen player playing in a browser through the existing bridge.
- [ ] Both skills are rewritten and `pnpm test:agent-skills` passes.
- [ ] The before and after table (lines, files, tests, commands, check time, questions answerable) is in this plan and sent to the lead.

## Risks and open questions

- **Fork speed** decides how strong the player can get at sweep speed (limit 2 above). Open
  for stage 3: the checkpoint cost grows with the action list, so a faster machine does not
  help.
- **Boss attack definitions** are on the Verdant gameplay branch, not on main. Stage 1's
  boss columns that read tells need that branch merged, or they ship one pull request later.
- **Phase starts must be the real fight.** The Rootbound limits one hit to one phase
  threshold, and it and the White Hart need their environment runtime for Phases II and III,
  so phase starts go through the snapshot factories' per-boss states, not through a health edit.
- **The scripted player's weakness** makes stage 1 clear rates low for hard bosses. Stage 1
  reports the walker's pressure numbers and partial progress (lowest boss health reached)
  so the table is useful before stage 3.
- **Paths move under this plan** while the removal work deletes around them. Agreed split
  (2026-11-16): the removal work deletes and does not rename or move anything this tool
  imports; this plan does the renames and moves, including State Forge to snapshots.
- **The old command is still used by two guards:** `tests/tearbench-evidence-selection.test.mjs`
  and the change-impact test call `tearbench select`. Stage 4 replaces both before stage 5
  deletes the command.
- **Comparison across a dependency change** is refused, not approximated.

Decisions that are the owner's:

1. A native gameplay event for damage (who hit whom, for how much). It makes damage
   attribution exact and would serve the career recorder and replays too, but it adds to the
   event contract that replay formats read.
2. What counts as a regression worth failing a pull request: any change in the fixed set's
   numbers, or only a change beyond a margin.
3. The bar for the strong player in stage 3, if "clears Easy Adventure with every weapon" is
   not the bar wanted.
