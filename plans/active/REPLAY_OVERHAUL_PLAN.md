# Replay overhaul plan

## Authority metadata

- **Owner:** Replay owner (replay-overhaul session)
- **Status:** Active
- **Closure condition:** Every "done when" line below holds, `src/ghost/` no longer exists, and `pnpm check:functional` passes from the final commit.

## Why

The owner said on 2026-11-13 that replays "need to be updated as well, in general", and on
2026-11-19 asked for the overhaul to start because other work depends on it: Shards cosmetics in
shared replays, seed races, a later "save clip" export, the playtest tool's stage 5 and the replay
lazy-load in pull request 206. Today the replay code is 118 modules and about 800,000 characters
across eight folders, built over Ghost Runs 2.0 and TearBench/Ghost3 C10 to C40, with themed names.
Players reach two separate replay systems that record the same run twice, store it in two places and
show it in three Profile tabs.

## What players have today (verified 2026-11-19 on main `92eddb5c`)

Static import analysis from both release entrypoints (dynamic imports followed, developer-only
modules and build-guarded imports cut off, as `scripts/release-developer-code.mjs` defines them),
plus reading the screens. Numbers are non-whitespace characters, as the module size rule counts them.

**Two recorders run on every run.**

1. **"Ghost 2"** (`src/replay/legacy-compat.ts`, `LegacyGhostEngine`): samples player, blade and
   enemy positions every 0.1 s into a visual recording. At the end of the run
   `gameplay/run/live-recording-controller.ts` stores it in `LegacyReplayVault` (localStorage keys
   `tear_vault_index` and `tear_vault_<id>`, 12 unpinned and 10 pinned), and when the score is
   accepted it publishes it to the cloud (`Cloud.publishReplay`: Firebase `replays` collection in
   500 KB chunks, or the CrazyGames leaderboard replay store) and links it to the leaderboard row.
   Watching it draws the sampled positions; nothing is re-simulated.
2. **"Ghost V3 capsules"** (`src/ghost/`, `app/replay/live-ghost-recording.ts`): records semantic
   actions, random streams, events, result hashes, State Setup keyframes and application frame
   clocks into an IndexedDB "Vault" (`tear-ghost-v3`, 256 MiB budget) through the streaming
   recorder of #286. Watching it ("Theater") re-simulates the run in a detached production world
   (`src/tearbench/production-replay-composition.ts`) and seeks from keyframes.

**What a player can open in a release build.**

| Where | What | System |
| --- | --- | --- |
| Profile > REPLAYS | Last runs: WATCH, PIN, SHARE (publish to the feed), delete | Ghost 2 |
| Profile > VAULT | Capsules: THEATER, SELECT/COMPARE (2 to 9 runs), DOWNLOAD file, REPAIR, IMPORT A REPLAY FILE | V3 |
| Profile > CAREER | Run history with 18 filters, notes, retention, WATCH, CHALLENGE, DOWNLOAD, CHASE | V3 (indexed by a 1 MB worker) |
| Theater | Play, pause, speed, seek, chapters, PRACTICE from here, recorded challenges, RUN DNA panel, finale companion | V3 |
| Leaderboards > GLOBAL / FEED | Watch the replay linked to a row; the published feed | Ghost 2 (cloud) |
| During a run | Chase: a recorded run's ghost alongside you | V3 (live reference worker) |
| Hidden (engineering surfaces) | Seed race, Boss Memory, Replay Editor (cut list, WebM clip export), linked-pair download | V3 |

The same run is therefore recorded twice, kept in two stores, and listed in three tabs.

## What the owner saw (defects the new design must fix)

The owner, 2026-11-19, in their words. Both are in Ghost 2, which is what Profile > REPLAYS, the
feed and leaderboard replays show today. The causes below were found in the code on `92eddb5c`.

### Defect 1: the replay shows the stage the run ended on, not the stage at that moment

> "it doesn't show the actual stage in the replay, it only show the last stage before the replay
> ended. for example if i did adventure and got to the crimson stage, the first second of the replay
> would still show crimson though it would be the grounds."

**Cause (frame data and playback):**

1. **The opening stage is never recorded.** `LiveRunStartController.start`
   (`gameplay/run/live-run-start-controller.ts`) loads the first stage in `finishWorldReset`
   (`app/run/run-start-host.ts:228`, `loadStage(0)`), and boss modes load the boss biome in
   `configureMode` (`run-start-host.ts:475`). Each load emits the stage event
   (`app/world/stage-controller.ts:79`, through `recordReplayStage` in `app/campaign/campaign-host.ts`).
   Both loads happen before `startRecording` (`live-run-start-controller.ts:75`). At that point
   Ghost 2 has no recording, so `this.rec?.stages.push` (`replay/legacy-compat.ts:243`) drops the event.
2. **Playback falls back to the end stage.** `LegacyGhostEngine.stageAt` (`legacy-compat.ts:606`)
   starts from `playback.d.stage`, the run summary's stage at the run's end
   (`gameplay/run/outcome-planner.ts:141`). It shows that stage until the first stage change it has
   a record of, so the first stage of an Adventure run is drawn as the stage the run ended on.
3. **Long runs lose earlier stages.** When a recording passes 9,000 samples (15 minutes at 10 Hz),
   `#trim` (`legacy-compat.ts:330`) drops the first quarter. It filters out the stage events before
   the cut and keeps no "stage at the cut" entry, so the fallback in cause 2 applies again.

**Fix in the new design:** the record has no stage track. The stage at any tick is the stage of the
re-simulated world at that tick. Watch reads it from the world, never from the summary or the end
state.

**Permanent check (fails on today's code):** `tests/unit/replay-shows-the-moment.test.ts`.

- It plays an Adventure run headless across at least two stage changes (and one Boss mode run,
  whose first stage is a boss biome).
- For ticks before, at and after each change, it asserts that the replay's stage equals the live
  run's stage at that tick.
- It runs one contract through two drivers: one for today's Ghost 2 playback and one for `watch`.
- The Ghost 2 driver fails today; the PR that adds the check pastes that failure. The driver is
  deleted with Ghost 2 in PR 8.
- The browser journey adds a check on the built game: open an Adventure replay, seek to 0:01, and
  read the replay bar's stage name.

### Defect 2: the replay draws a line, not the weapon, and throws are wrong

> "it doesn't show the actual weapon, just a line, throwing and whatnot is wonky in reply too, not
> truly supported. Overall, the replay could use a lot more"

**Cause (frame data and renderer):**

1. **Too little is recorded.** Ghost 2 records, every 0.1 s, only the player's position, facing and
   the blade tip's position (`legacy-compat.ts:309-314`). It keeps no weapon per frame (only a
   loadout list), no blade state (held, swinging, thrown, recalling, tethered, stuck), no swing
   angle and no abilities.
2. **A separate drawer.** `presentation/replay-world-frame.ts:104-124` draws the player as a 26 by
   48 translucent rectangle and the weapon as one glowing line from the chest to the sampled tip. It
   never calls the game's player, blade or weapon renderers.
3. **Straight-line in-betweens.** Between samples it moves in a straight line
   (`LegacyGhostEngine.pose`), so a thrown blade's arc, a recall and a tether pull show as a straight
   line that jumps every 0.1 s.
4. **Enemies and bosses are stand-ins.** They are puppets at sampled positions
   (`replay-puppet-factory.ts`), with an unknown boss drawn as the Warden. There are no attacks,
   tells, projectiles, stage objects, HUD or cinematics.

The V3 Theater is closer. It re-simulates the run and draws through the live `world-frame.ts` with
the real `player.draw` and `blade.draw`. But it builds the frame input in its own 321-line copy
(`app/replay/browser-ghost-replay-presentation.ts`), beside the live builder
(`app/world/world-presentation-adapters.ts`), and that copy draws no HUD and no enemy status
(`drawStatus: () => undefined`).

**Fix in the new design:**

- Watch re-simulates the run, so the blade's real state (throw, recall, tether, stuck) and every
  ability are in the world at each tick.
- It draws that world through the live drawing code (the rule below).

**Permanent check (fails on today's code):** `tests/browser-replay-matches-live.js`, run on
`pnpm build:test:standalone`.

- It plays one short scripted segment per weapon that throws, recalls and tethers the blade and
  uses the weapon's ability, and captures the canvas at fixed ticks.
- It then watches the replay of that run and captures the same ticks.
- Each pair must match within a small pixel tolerance. The replay bar's area is excluded, and
  presentation randomness is seeded the same way on both sides.
- It runs against the REPLAYS tab's player (Ghost 2 today), where it fails on the first weapon, and
  against `watch` from PR 7.

## Parity with live play

**One rule: a replay draws through the live drawing code, never a separate copy.**

- Watch gives the detached world to the same frame builder the live game uses
  (`createLiveWorldPresentationAdapters`, `app/world/world-presentation-adapters.ts`), HUD included.
- Anything live play draws, a replay draws.
- An architecture rule enforces it: modules under `src/replay/`, `src/app/replay/` and the replay
  presentation modules may not import the world, player, blade, enemy, boss, environment or HUD
  renderers directly, only that one builder.
- `tests/browser-replay-matches-live.js` checks the result.

| What live play shows | Ghost 2 today (REPLAYS, feed, leaderboards) | V3 Theater today | After the overhaul |
| --- | --- | --- | --- |
| The stage and biome at each moment | Wrong at the start and after a trim (defect 1) | From the world | From the world (PR 7, PR 8) |
| Stage changes and transitions | A swap at a recorded time | Yes | Yes |
| Stage objects (Bloom Wells, Root Links, Grafts, Aurora Tracks) | None | Yes (environment layer) | Yes |
| The player figure | A rectangle | Real | Real, with the recorded Shards cosmetics (PR 10) |
| The weapon and blade: swing, throw, recall, tether, stuck | A line to a sampled tip (defect 2) | Real | Real (PR 7) |
| Abilities | A few recorded effect events | Real, from the simulation | Real |
| Enemies and their attacks | Puppets at sampled positions, no attacks | Real | Real, with status |
| Bosses: moves, tells, phases | A puppet (unknown bosses drawn as the Warden) | Real | Real |
| Projectiles | None | Yes | Yes |
| Effects and particles | A few recorded events | Real | Real |
| HUD: health, multiplier, wave, score | None | None | The live HUD under the replay bar (PR 7) |
| Cinematics, boss intros, story chapters, the finale | None | Partly (the finale through the companion) | Yes, as actions in the record (failure mode 2) |
| Camera | Fixed framing | Reconstructed player-follow | The live camera |
| Music | None | None (the detached world has no music director) | The recorded pick for the watched stage; in a race the racer's own pick (PR 7) |
| Sound effects | None | None | Not in this plan: a named follow-up after PR 7 |

Everything in the table reaches parity in this plan except sound effects, which are listed as the
one gap.

## Goal

One plain replay system that does five things well:

1. **Record** a run.
2. **Store** it on the player's device.
3. **Watch** it: play, pause, speed, seek.
4. **Share** it: a file, the published feed, and the replay linked to a leaderboard row.
5. **Give other features a stable record:** seed races (the player's own music pick wins in a race),
   Shards cosmetics shown in a shared replay (the recorded player's cosmetics, presentation only,
   never part of the simulation), a later "save clip" export (not built here; the record and watch
   must support it), and the playtest tool's stage 5 (`plans/active/PLAYTEST_TOOL_PLAN.md`, "What the
   replay overhaul can rely on" and "Reused, moved, deleted").

## Target shape

### One record, one version, one owner

`src/replay/record.ts` is the only place that says what a replay contains. Every other module
(store, share, watch, verify, race, the cloud summary, the file format, the list rows) reads the
type and the version from it. A unit test fails when any other `src` module declares a replay format
id or version (the check that keeps a second copy from returning).

```ts
// src/replay/record.ts (shape, not final code)
export const REPLAY_FORMAT = "tear-replay";   // the id src/replay/envelope.ts already uses
export const REPLAY_VERSION = 3;               // v1 and v2 were the semantic envelope

export interface ReplayRecord {
  readonly format: typeof REPLAY_FORMAT;
  readonly version: typeof REPLAY_VERSION;
  /** What the simulation needs; verify and watch read only this part. */
  readonly run: {
    readonly ruleset: string;                  // CURRENT_RULESET_VERSION when recorded
    readonly build: ReplayBuild;               // build id and the code fingerprint verify checks
    readonly seed: string;
    readonly mode: RunMode; readonly difficulty: RunDifficulty;
    readonly weapon: WeaponId; readonly start: RunStartChoices;   // loadout, meta levels, race declaration
    readonly actions: readonly ReplayAction[]; // { tick, seq, action: GameAction }, story and confirm presses included
    readonly checkpoints: readonly { tick: number; hash: string }[]; // state hash every CHECKPOINT_TICKS
    readonly result: { tick: number; hash: string; outcome: "victory" | "defeat" | "quit" };
  };
  /** What a list row and the seek bar show without re-simulating. Derived at record time; verify re-derives and compares. */
  readonly summary: { score: number; wave: number; time: number; kills: number; marks: readonly ReplayMark[] };
  /** Presentation only: never read by the simulation, never part of a hash. */
  readonly look: {
    readonly playerName: string;
    readonly cosmetics: Readonly<Record<string, string>>; // Shards slot id to cosmetic id; unknown ids draw the default
    readonly music: string | null;                         // the recorder's music pick
    readonly recordedAt: string;                           // wall-clock date, display only
  };
}
```

Decisions behind the shape:

- **Actions, a seed and hashes; no keyframes, random tracks or frame clocks in the record.** The
  production world is deterministic from seed and actions (`pnpm test:determinism` proves it every
  60 ticks). Keyframes are a seek cache, not part of the record (see "Watch"). This keeps a shared
  replay small, keeps the snapshot codecs out of the saved format, and removes the V3 tracks
  `rng`, `keyframes`, `presentation` and the application frame clock.
- **Everything a run does is an action at a tick.** Story pauses, cinematic confirms and the finale
  are semantic actions with a sequence number at the tick where the simulation stopped, so the
  record runs to the run's real end and the separate "finale companion" is not needed. This is the
  riskiest assumption; failure mode 2 covers it.
- **`look` is split from `run` by type.** `verify` and the world builder take `ReplayRecord["run"]`
  only, so the compiler stops cosmetics, names or music from reaching the simulation; a test changes
  every `look` field and checks the verify result and every hash are unchanged.
- **One fixed recording.** The four V3 recording profiles (`compact-public`, `coaching`,
  `forensic-qa`, `cinematic`) become one constant set in `record.ts`.

### Modules

`src/ghost/` is deleted. What remains is plainly named and in its layer:

| Module | Layer | Job |
| --- | --- | --- |
| `src/replay/record.ts` | replay (pure) | The record type, version, validation of untrusted data, migrations between format versions |
| `src/replay/recorder.ts` | replay | Builds a record while a run plays: actions, checkpoint hashes, marks, result. Streams chunks to the store (the chunked commits of #286) |
| `src/replay/store.ts` | replay | The device store over a storage port: list, read, add, pin, delete, keep within budget, import and export a file. A record whose chunk fails its checksum is listed as damaged (delete only) |
| `src/replay/watch.ts` | replay | Playback over a world port: play, pause, speed, seek, step, chapter jump, the frame at a tick; owns the seek cache |
| `src/replay/verify.ts` | replay | Re-simulates a record and compares every checkpoint and the result; names the first tick that differs |
| `src/replay/share.ts` | replay | One text encoding for the file, the feed and the leaderboard link; the published summary |
| `src/replay/race.ts` | replay | A recorded run alongside a live one (seed race, and chase if kept); built only on `record` and `watch` |
| `src/replay/encoding.ts` | replay | Chunk encoding and compression (from `capsule-codec.ts`), used by store and share |
| `src/persistence/indexeddb-chunk-storage.ts` | persistence | A generic IndexedDB adapter for keyed chunks (from `indexeddb-vault-backend.ts`); no replay types |
| `src/gameplay/snapshot/` | gameplay | World state to data and back (the State Setup codecs and hydrators, renamed "snapshots" as the playtest plan says); used by the seek cache, practice from here, State Setup and the playtest tool's phase starts |
| `src/app/world/detached/` | app | The one detached production world (from `production-replay-composition.ts`, `production-world-factory.ts` and the runtimes they build); implements watch's world port; the playtest headless environment wraps it |
| `src/app/replay/` | app | Composition only: `live-recording.ts`, `replay-screen.ts`, `replay-library.ts`, `race-composition.ts`, `practice-launch.ts`, one worker entry, and clip export (engineering-only, see below) |
| `src/presentation/replay-frame.ts`, `screens/replay.ts` | presentation | Hand the watched world to the live frame builder (it draws nothing itself); the replay bar and the one Replays list |

### Watch and the seek cache

Headless re-simulation runs at 12 to 44 times real time (playtest tool, 2026-11-16), so seeking
ten minutes into a run from its start would take 14 to 50 seconds. Watch therefore keeps a **seek
cache**: world snapshots every few seconds of run time.

- For the player's own runs the recorder captures them during live play (as V3 does today) and
  stores them beside the record, tagged with the build. They are never shared.
- For an imported, published or leaderboard replay, a background verify pass in the replay worker
  builds them on first open; the seek bar shows how far it is ready, and playback starts at once.
- A cache whose build tag differs is discarded and rebuilt; it is never migrated.
- Practice from here launches a live, unranked run from the snapshot at the cursor.
- "Save clip" later needs only `watch.frameAt(tick)` at a fixed frame rate and the WebM writer; no
  wall clock enters a frame. The clip PR is not in this plan.

### Layers

`config/architecture-layers.json` loses the `ghost` layer. `replay` keeps its edges (gameplay,
input, simulation, domain; type-only config) and defines the storage and world ports; `app`
implements them. This removes the 16-file import cycle (15 `ghost` files and
`tearbench/production-replay-composition.ts`) and the `ghost -> tearbench` edges in
`config/architecture-baseline.json`.

## Stored and published replays when the format or ruleset changes

### The policy (recommended)

1. **A replay plays only under the ruleset it was recorded with.** This is today's rule
   (`gameplay/run/ruleset-version.ts`), and the only honest one for an action record: a ruleset step
   changes the simulation, so an older record would play out differently. Keeping old rules code to
   play old replays is not possible at Tear's pace.
2. **A record from a retired ruleset is kept, not deleted.** Its row still shows date, mode,
   difficulty, weapon, score, wave, time and outcome from `summary`, with DOWNLOAD and DELETE. WATCH,
   race and practice are replaced by one line in the words the ruleset table already has: "Recorded
   before <the first change it missed>". When the store needs space, unpinned retired records go
   first.
3. **A format version change migrates on read.** One pure migration per version step, with
   fixtures for the previous version and for malformed records, as `docs/ARCHITECTURE.md` requires.
   A step is kept only while a playable record can still be in that version: once every ruleset
   that could have written it is retired, the step is deleted in the same pull request that bumps the
   ruleset, and such records fall under rule 2.
4. **Published and leaderboard replays follow the same rules.** A leaderboard row whose replay is
   from a retired ruleset shows the same line in place of WATCH. Nothing in the cloud is rewritten.

### What the player sees at the switch to the new record (pull request 8)

Neither old format can become a new record: a Ghost 2 recording has no reliable action stream (live
play leaves its action capture off), and V3 capsules were written under rulesets that will be
retired before most players see the switch. So there is no converter.

- **Profile shows one line once:** "Replays saved before this update can't be played in this
  version." The next launch deletes the old local stores: the Ghost 2 localStorage keys (they share
  the localStorage quota with the player's save, so leaving them costs the save room) and the
  `tear-ghost-v3` IndexedDB database. This needs the lead's and the owner's yes (question 3).
- **Imported old files** (`tearghost-capsule` archives) are recognized by their format id only and
  refused with "This replay file is from an earlier version of Tear."
- **Old published replays** (Firebase `replays` documents and CrazyGames replay ids that hold Ghost 2
  recordings) are recognized by their format and shown as "Recorded with an earlier version" on the
  feed and leaderboard rows. Deleting them from the cloud is an owner item.

## Inventory and disposition

Columns: **Users** is where it is reached from: *players* (in a release build and openable),
*hidden* (in the release bundle but behind an engineering surface), *dev* (not in a release build),
with the count of `src` importers and test files that import it. The target column names the PR
(numbers from "Pull request sequence").

### `src/ghost/` (54 modules, 395,747 characters): all go

| Module | Users | Disposition | Reason |
| --- | --- | --- | --- |
| `application-frame-events.ts` | players; 15 src, 3 tests | delete (PR 5) | Application frame clocks for the finale, challenges and clips; the record keeps actions at ticks only |
| `authoritative-receipt.ts` | players; 13, 6 | merge into `record.ts` (PR 5) | A state hash beside a keyframe is a checkpoint hash |
| `boss-memory-origin.ts` | hidden; 8, 1 | delete (PR 1) | Boss Memory, an unfinished engineering feature |
| `boss-memory.ts` | hidden; 5, 1 | delete (PR 1) | Same |
| `browser-capsule-vault.ts` | players; 5, 2 | merge into `store.ts` and `app/replay/replay-library.ts` (PR 6) | Browser facade over list, read, repair, verify, seek, fork |
| `browser-cold-restore.ts` | players; 2, 3 | merge into `store.ts` import (PR 6) | IMPORT A REPLAY FILE becomes one validated add |
| `browser-finale-companion.ts` | players; 2, 0 | delete (PR 2) | The record runs to the end of the run, finale included |
| `browser-recorded-challenge.ts` | players; 3, 1 | delete (PR 2) | Recorded challenges (question 2) |
| `capsule-archive.ts` | players; 8, 5 | merge into `share.ts` (PR 6) | The file is the same text as the cloud upload |
| `capsule-codec.ts` | players; 6, 4 | rename to `replay/encoding.ts` (PR 6) | Chunk encoding and compression; generic and tested |
| `capsule-contract.ts` | players; 4, 0 | merge into `record.ts` (PR 5) | Manifest and track grammar; one record type replaces it |
| `capsule-encoder-worker.ts` | worker entry; 0, 0 | delete (PR 6) if encoding inline costs under 1 ms per chunk, measured | A worker for small chunks |
| `capsule-import-plan.ts` | players; 6, 0 | merge into `store.ts` (PR 6) | Guarded and forensic import plans; import is validate then add |
| `capsule-paired-archive.ts` | players; 5, 1 | delete (PR 6); its download surface goes in PR 1 | Linked-pair files (hidden surface); the import path still reads it until the store replaces it |
| `capsule-protection.ts` | players; 8, 1 | delete (PR 6) | Source guard bytes; one IndexedDB transaction per write suffices |
| `capsule-reader.ts` | players; 31, 21 | merge into `store.ts` (read) and `record.ts` (validate) (PR 6) | After #206 it is also the one place that waits for the engine; that wait moves to `watch.open` |
| `capsule-replay-envelope.ts` | players; 15, 5 | merge into `watch.ts` (PR 7) | Maps a capsule to the replay world and preflights keyframes |
| `capsule-vault-backend.ts` | players; 11, 5 | merge into `store.ts` (port and memory storage for tests) (PR 6) | Backend types, stores, retired key prefixes |
| `capsule-vault.ts` | players; 28, 18 | rename to `replay/store.ts` (PR 6) | The base of the store: index, budget, chunked commits (#286) |
| `career-archive-store.ts` | players; 3, 2 | delete (PR 8) | CAREER folds into the one Replays list (question 1) |
| `career-archive-worker.ts` | worker entry (1,008 KB bundle); 0, 0 | delete (PR 8) | The list reads `summary` from records; no worker |
| `career-archive.ts` | players; 7, 3 | delete (PR 8) | 18 filters, views, notes, retention over a second index |
| `cold-restore-job.ts` | players; 6, 4 | delete (PR 6) | Resumable restore jobs for a single-file import |
| `cold-restore.ts` | players; 3, 3 | delete (PR 6) | Same |
| `corrupt-capsule-records.ts` | players; 3, 0 | delete (PR 2) | Repair records; damaged records are shown, not repaired |
| `finale-companion.ts` | players; 11, 2 | delete (PR 2) | See `browser-finale-companion.ts` |
| `finale-playback.ts` | players; 2, 1 | delete (PR 2) | Same |
| `fork-origin.ts` | players; 11, 1 | merge into `app/replay/practice-launch.ts` (PR 7) | Practice origin; the permits go |
| `ghost-doctor.ts` | players; 4, 0 | delete (PR 2) | REPAIR (question 2) |
| `index.ts` | tests only; 0, 16 | delete (PR 1) | Barrel that only tests import |
| `indexeddb-vault-backend.ts` | players; 12, 3 | move to `persistence/indexeddb-chunk-storage.ts` (PR 6) | Generic keyed-chunk storage; the database name of the new store is new (see the switch) |
| `live-causal-events.ts` | players; 6, 7 | merge into `recorder.ts` (PR 5) | Gameplay facts become marks |
| `live-ghost-reference-data.ts` | players; 6, 4 | merge into `race.ts` (PR 9) | The ghost alongside a live run |
| `live-ghost-reference-worker.ts` | worker entry; 0, 0 | merge into the one replay worker (PR 9) | Same |
| `live-ghost-reference.ts` | worker; 1, 1 | merge into `race.ts` (PR 9) | Same |
| `live-recorder.ts` | players; 6, 7 | merge into `recorder.ts` (PR 5) | One recorder |
| `player-experiences.ts` | players; 3, 0 | delete (PR 2) | Challenge kinds, attempt proofs, Run DNA, "nemesis grammar" |
| `preservation-corpus.ts` | dev; 1, 1 | delete (PR 1) | Fixture prover for capsule boundaries; the round-trip test's old-format corpus replaces it |
| `production-replay-comparison.ts` | players; 2, 1 | delete (PR 2) | COMPARE 2 to 9 runs (question 2) |
| `production-replay-session.ts` | players; 10, 4 | merge into `watch.ts` (PR 7) | Opens a verified record for playback |
| `production-replay-verification.ts` | players; 8, 3 | rename to `replay/verify.ts` (PR 5) | Re-simulate and compare |
| `recorded-challenge.ts` | players; 5, 2 | delete (PR 2) | Recorded challenges |
| `recording-profiles.ts` | players; 5, 0 | delete (PR 5) | Four profiles become one constant set in the record (live play uses `coaching`) |
| `replay-admission.ts` | players; 21, 11 | merge into `record.ts` (header) and `verify.ts` (ruleset and build check) (PR 5) | 26,698 characters of run context, fingerprints, random state and opening permits |
| `replay-cut-list.ts` | hidden; 3, 1 | merge into clip export as one tick range (PR 7) | The Replay Editor's cut list |
| `replay-world.ts` | players; 15, 4 | merge into `watch.ts` (world port) (PR 7) | World, session and practice types |
| `run-dna-theater.ts` | players; 2, 3 | delete (PR 2) | RUN DNA panel (question 2) |
| `seed-race-contract.ts` | hidden (seed race); 9, 4 | merge into `record.ts` (race declaration in `run.start`) and `race.ts` (PR 9) | Seed race stays |
| `seed-race-decisions.ts` | hidden; 5, 2 | merge into `race.ts` (PR 9) | Same |
| `streaming-recorder.ts` | players; 4, 7 | merge into `recorder.ts` (PR 5) | Keep its chunk-commit order (#286) |
| `theater-open-result.ts` | players; 5, 2 | merge into `watch.ts` (open result and refusal reasons) (PR 7) | Plain refusal reasons stay |
| `theater.ts` | players; 3, 0 | delete (PR 2); its transport state goes to `watch.ts` (PR 7) | Lenses, trajectory diffs, event alignment exist for COMPARE |
| `truth-kernel.ts` | players; 10, 4 | delete (PR 5); any constant still read moves to `record.ts` | "Trident" precedence, quality cards, profile negotiation |
| `vault-maintenance.ts` | players; 2, 0 | merge budget and retention into `store.ts`; delete repair upkeep (PR 6) | Quota, index rebuild, verified reads |

### `src/replay/` (5 modules, 39,739 characters)

| Module | Users | Disposition | Reason |
| --- | --- | --- | --- |
| `envelope.ts` | players; 7, 6 | merge into `record.ts` (PR 5) | Its format id `tear-replay` and version line continue as v3 |
| `index.ts` | none; 0, 0 | delete (PR 1) | Unused barrel |
| `legacy-compat.ts` | players; 3, 5 | delete (PR 8) | Ghost 2: `LegacyGhostEngine` and `LegacyReplayVault` (the REPLAYS tab and published replays) |
| `legacy-compat-validation.ts` | players; 1, 0 | delete (PR 8) | Same |
| `visual-replay.ts` | players; 4, 2 | delete (PR 8) | The Ghost 2 visual recording |

### `src/app/replay/` (28 modules, 124,887 characters)

| Module | Users | Disposition | Reason |
| --- | --- | --- | --- |
| `browser-boss-memory.ts` | hidden; 2, 0 | delete (PR 1) | Boss Memory |
| `browser-ghost-career-search.ts` | players; 3, 0 | delete (PR 8) | CAREER filters |
| `browser-ghost-career.ts` | players; 1, 1 | delete (PR 8) | CAREER metadata |
| `browser-ghost-replay-presentation.ts` | players; 1, 2 | merge into `replay-screen.ts` and `presentation/replay-frame.ts` (PR 7) | Draws a verified frame |
| `browser-live-ghost-reference.ts` | players; 1, 2 | merge into `race-composition.ts` (PR 9) | Chase and race |
| `browser-replay-clip-export.ts` | hidden; 2, 0 | rename to `clip-export.ts`, rewire to `watch.frameAt` (PR 7) | Kept engineering-only so "save clip" later is UI only (question 5) |
| `browser-replay-clip-webm.ts` | hidden; 1, 1 | rename to `webm-writer.ts` (PR 7) | Generic, tested WebM writer |
| `ghost-challenge-composition.ts` | players; 1, 0 | delete (PR 2) | Recorded challenges |
| `ghost-challenge-controller.ts` | players; 1, 1 | delete (PR 2) | Same |
| `ghost-chase-composition.ts` | players; 1, 2 | merge into `race-composition.ts` (PR 9) | One ghost-alongside feature |
| `ghost-comparison-screen-adapter.ts` | players; 1, 0 | delete (PR 2) | COMPARE |
| `ghost-finale-companion.ts` | players; 2, 1 | delete (PR 2) | Finale companion |
| `ghost-finale-screen-adapter.ts` | players; 1, 1 | delete (PR 2) | Same |
| `ghost-frame-recording.ts` | players; 3, 3 | delete (PR 5) | Application frame recording |
| `ghost-opening-capture.ts` | players; 1, 2 | merge into `live-recording.ts` (PR 5) | The record starts at the run's start |
| `ghost-practice-launch.ts` | players; 6, 1 | rename to `practice-launch.ts` (PR 7) | Practice from here stays |
| `ghost-practice-session-state.ts` | players; 9, 1 | rename to `practice-session.ts` (PR 7) | Keeps practice runs unranked and unsaved |
| `ghost-recording-session-state.ts` | players; 6, 3 | merge into `live-recording.ts` (PR 5) | One recording session owner |
| `ghost-reference-controller.ts` | players; 1, 2 | merge into `race-composition.ts` (PR 9) | Same as chase |
| `ghost-run-dna-recording.ts` | players; 1, 1 | delete (PR 2) | Run DNA |
| `ghost-worker-urls.ts` | players; 1, 0 | rename to `replay-worker-url.ts` (PR 9) | One replay worker |
| `live-ghost-capture.ts` | players; 3, 0 | merge into `live-recording.ts` (PR 5) | Checkpoint hashes and the own-run seek cache |
| `live-ghost-chase.ts` | players; 5, 0 | merge into `race-composition.ts` (PR 9) | Same as chase |
| `live-ghost-practice-challenge.ts` | players; 2, 0 | merge practice part into `practice-launch.ts`, delete challenge part (PR 2, PR 7) | Same |
| `live-ghost-recording.ts` | players; 6, 0 | rename to `live-recording.ts` (PR 5) | The one live recording sidecar |
| `replay-screen-adapter.ts` | players; 2, 1 | rename to `replay-screen.ts`, shrink (PR 7) | The replay screen over `watch` |
| `replay-screen-adapter-runtime.ts` | players; 1, 0 | merge into `replay-screen.ts` (PR 7) | Ghost 2 playback half goes in PR 8 |
| `seed-race-composition.ts` | hidden; 1, 1 | merge into `race-composition.ts` (PR 9) | Seed race stays |

### `src/app/library/` replay parts (8 modules, 71,323 characters)

| Module | Users | Disposition | Reason |
| --- | --- | --- | --- |
| `browser-ghost-archive-files.ts` | players; 3, 3 | rename to `replay-files.ts` (PR 6) | Browser file save and pick |
| `ghost-career-controller.ts` | players; 4, 1 | delete (PR 8) | CAREER |
| `ghost-theater-screen-adapter.ts` | players; 2, 1 | merge watch controls into `app/replay/replay-screen.ts`, delete the rest (PR 7) | 17,123 characters, most for COMPARE, challenges and Run DNA |
| `ghost-vault-library-controller.ts` | players; 5, 3 | merge into `replay-library-controller.ts` (PR 8) | One list |
| `library-screen-adapters.ts`, `library-screen-adapters-runtime.ts` | players | keep, shrink the replay parts (PR 8) | They also serve Bestiary, Leaderboards and Profile |
| `replay-library-controller.ts` | players; 1, 3 | keep: the one Replays list controller (PR 8) | Already plain |
| `replay-transport-controller.ts` | players; 4, 1 | merge into `watch.ts` (PR 7) | Transport belongs to watch |

### Replay parts of `src/tearbench/` (moved, not rebuilt)

Release builds reach 30 `src/tearbench` files, almost all through the replay world. These move out
in step with the playtest plan (coordination 3).

| Module | Users | Disposition | Reason |
| --- | --- | --- | --- |
| `production-replay-composition.ts` | players; 13, 24 | move to `app/world/detached/replay-composition.ts` (PR 4) | 34,925 characters, over the size rule; split along its real seams in the move PR only if the code budget needs it |
| `production-world-factory.ts` | players; 11, 16 | move to `app/world/detached/world-factory.ts` (PR 4) | Already in the `app.world-construction-owners` role |
| `production-combat-phases.ts`, `production-combat-simulation.ts`, `production-wave-reward-runtime.ts`, `production-run-outcome-runtime.ts`, `production-finale-runtime.ts`, `particle-presentation-checkpoint.ts`, `particle-presentation-state.ts`, `ui-presentation-checkpoint.ts`, `live-runtime-snapshots.ts` | players (through the replay world) | move to `app/world/detached/` (PR 4) | The runtimes the detached world builds; the PR lists the exact set from the import graph |
| `state-codecs.ts` | players; 17, 6 | move to `gameplay/snapshot/state-codec.ts` (PR 3) | Snapshots for the seek cache, practice, State Setup and playtest |
| `environment-codec.ts` | players; 8, 10 | move to `gameplay/snapshot/environment-codec.ts` (PR 3) | Same |
| `detached-world-hydrator.ts` | players; 4, 1 | move to `gameplay/snapshot/world-hydrator.ts` (PR 3) | Same |
| `reward-codec-hydrator.ts` | players; 2, 2 | move to `gameplay/snapshot/reward-hydrator.ts` (PR 3) | Same |
| `live-codec-validation.ts` | players; 1, 1 | move to `gameplay/snapshot/validation.ts` (PR 3); its one `ghost` import (seed race state) is passed in | Same |
| `authored-environment-codec-validation.ts` | players; 3, 3 | move to `gameplay/snapshot/authored-environment-validation.ts` (PR 3) | Same |
| `production-replay-bootstrap-check.ts` | dev; 1, 0 | stays with the headless environment (playtest stage 5) | Checks headless checkpoints, not player replays |
| `progression-replay.ts` | players (State Setup); 4, 0 | stays with State Setup (playtest-tool's rename) | Replays a progression ledger, not a run |

### Presentation (10 modules, 47,429 characters)

| Module | Users | Disposition | Reason |
| --- | --- | --- | --- |
| `replay-puppet-factory.ts`, `replay-world-frame.ts`, `world/production-replay-frame.ts` | players | merge into `presentation/replay-frame.ts` (PR 7) | One way to draw a watch frame |
| `replay-snapshots.ts` | players; 3, 2 | keep (PR 8 adds the retired-ruleset row) | List and bar view models |
| `replay-thumbnail.ts` | players; 1, 0 | keep | Row thumbnails |
| `screens/leaderboards-replays.ts` | players; 2, 0 | rename the replay-bar half to `screens/replay.ts` (PR 7) | It draws the replay screen's bar |
| `screens/career-archive.ts` | players; 1, 0 | delete (PR 8) | CAREER |
| `world/live-ghost-reference.ts` | players; 1, 2 | rename to `world/race-ghost.ts` (PR 9) | Draws the ghost alongside |
| `tutorial-ghost.ts`, `tutorial-gold-ghost.ts` | players (tutorial) | not part of this plan | Tutorial gold coaching, owned by training-ux; every build checks its gold |

### Elsewhere

| Module | Disposition |
| --- | --- |
| `gameplay/run/live-recording-controller.ts` | keep: stores, submits, publishes and links the new record (PR 8) |
| `gameplay/run/ghost-assistance.ts` | rename to `assisted-run.ts` (PR 9): a run with a ghost alongside is unranked |
| `app/engineering/ghost-v3-browser-test-options.ts` | delete with the V3 recorder (PR 5) |
| `platform/cloud.ts`, `firebase-cloud.ts`, `crazygames.ts`, `platform-shared-cloud.ts` | keep the transport (an opaque JSON string, so no Firestore rules change is needed for the new format); `submitGhost`/`loadGhost` become `share` calls (PR 8) |
| `domain/surface-availability.ts` | `feature:boss-memory` and `feature:linked-pair-download` go (PR 1); `feature:seed-race` and `feature:replay-editor` stay |
| Tests: 51 unit files (12,292 lines) and 18 browser files (3,201 lines) | each PR deletes the tests of what it deletes; the new suite is `replay-record`, `replay-store`, `replay-watch`, `replay-verify`, `replay-share`, `replay-race`, `replay-round-trip` and one `browser-replay-journey.js` |
| Docs | `docs/FEATURE_INVENTORY.md` replay entries rewritten (PR 10); `docs/ghost3/**` and checkpoint docs stay as history (immutable per the terminology registry) |

**Target size:** the replay system outside the moved world and snapshots and the tutorial gold
modules (about 677,000 characters in 106 modules today) under 200,000 characters. Each PR reports its count.

## Pull request sequence

Each PR is small, leaves the game working, and says what it deleted. Order is by dependency.
"Deletes more than it adds" holds for every PR except PR 5, which adds the record core and its
round-trip check (it still deletes the V3 recorder modules it replaces).

### PR 0: this plan (docs only)

- **General case:** Every replay feature (record, store, watch, share, race, practice, clip) built on one record and one world.
- **One owner:** This plan; after it, `src/replay/record.ts` owns the record.
- **The next one:** A new replay consumer reads `ReplayRecord` and uses `watch` or `verify`; no new store, format or world.
- **Cause:** Two programs each added a replay system and neither removed the other; the record format was never one module.
- **Measured:** Inventory measured from the import graph: 118 modules, about 800,000 characters, 30 TearBench files in release.
- **Removed:** Nothing yet (plan only).

### PR 1: remove the hidden replay features

Boss Memory, the linked-pair download, the preservation corpus, the
unused barrels (`src/ghost/index.ts`, `src/replay/index.ts`) and their tests and surfaces.

- **General case:** Engineering-only features that no player can open and nothing else needs.
- **One owner:** `domain/surface-availability.ts` loses the two surfaces; nothing new is added.
- **The next one:** Not applicable: deletion only.
- **Cause:** Unfinished features were hidden instead of finished or removed.
- **Measured:** Characters and files deleted; release bundle bytes before and after (`check-bundle-budget`).
- **Removed:** About 6 modules and their tests.

### PR 2: remove the replay extras (after the owner's yes, question 2)

COMPARE, recorded challenges, RUN DNA, the finale companion, REPAIR (Doctor, corrupt-capsule
records, repair upkeep), `theater.ts` and `player-experiences.ts`. The Theater keeps play, pause,
speed, seek, chapters and practice.

- **General case:** Theater features beyond watching that the five goals do not need.
- **One owner:** The Theater screen adapter keeps the remaining controls; nothing new.
- **The next one:** Not applicable: deletion only.
- **Cause:** Each C-checkpoint added a projection over the capsule instead of using watch.
- **Measured:** Characters, files and tests deleted; replay chunk bytes before and after.
- **Removed:** About 20 modules (about 150,000 characters) and their tests.

### PR 3: move the snapshot codecs to `src/gameplay/snapshot/` (no behaviour change)

- **General case:** World state to data and back, shared by the seek cache, practice, State Setup and the playtest tool.
- **One owner:** `src/gameplay/snapshot/`.
- **The next one:** A new stage object's state is one codec entry, as today.
- **Cause:** The codecs grew inside TearBench although players need them.
- **Measured:** `pnpm test:determinism` green; architecture baseline edge count before and after.
- **Removed:** Six `src/tearbench` files leave; `tearbench` edges into them go.

### PR 4: move the detached world to `src/app/world/detached/` (no behaviour change)

- **General case:** One detached production world for watch, verify, race and the playtest headless environment.
- **One owner:** `src/app/world/detached/` beside `createLiveWorldComposition`, in the `app.world-construction-owners` role.
- **The next one:** A new consumer of a detached world calls the same constructor.
- **Cause:** The replay world was built as TearBench research code and players came to depend on it.
- **Measured:** `pnpm test:determinism` green; the 16-file cycle and the `ghost -> tearbench` edges removed from the baseline; code budget not raised.
- **Removed:** About 13 `src/tearbench` files leave; the recorded cycle is gone.

### PR 5: one record (`record.ts`, `recorder.ts`, `verify.ts`) and the round-trip check

The live sidecar records the new record into the existing Vault; Theater opens it. Capsules from
before this PR are refused as "recorded before this update".

- **General case:** One record type for every replay, file, upload and race.
- **One owner:** `src/replay/record.ts`, with the guard test that no other module declares a replay format id or version.
- **The next one:** A new field is one line in `record.ts` and one migration step if it changes the version.
- **Cause:** The capsule contract, truth kernel, admission context, receipts and envelope each described part of a replay.
- **Measured:** Record bytes per minute of play on the determinism corpus, against V3 capsule bytes for the same runs; live recording frame cost (p95, desktop).
- **Removed:** `capsule-contract`, `truth-kernel`, `recording-profiles`, `replay-admission`, `authoritative-receipt`, `live-recorder`, `streaming-recorder`, `live-causal-events`, `application-frame-events`, `envelope`, `ghost-frame-recording`, the recording session state and their tests.

### PR 6: one store (`store.ts`, `indexeddb-chunk-storage.ts`, `share.ts` file encoding)

- **General case:** One device store and one file format for every record.
- **One owner:** `src/replay/store.ts`; storage is a generic persistence adapter.
- **The next one:** Another device storage (a native shell) implements the storage port.
- **Cause:** Vault, career store, cold-restore jobs, import plans, protection and archives each kept part of storage.
- **Measured:** Store open time with 50 records, add and read time, file size; desktop browser numbers.
- **Removed:** About 14 modules (vault, backend, protection, import plan, cold restore and jobs, archives, maintenance repair).

### PR 7: one watch (`watch.ts`, `replay-screen.ts`, `replay-frame.ts`)

Play, pause, speed, seek, chapter jump and practice over the detached world, with the seek cache.
Clip export rewired to `watch.frameAt` and still engineering-only.

- Frames are drawn by the live frame builder, HUD included, per the parity rule.
- The Theater's copy of the frame input (`browser-ghost-replay-presentation.ts`) is deleted.
- Adds `tests/browser-replay-matches-live.js` and the `watch` driver of
  `replay-shows-the-moment.test.ts`. Each is run on main first and the failure pasted into the PR.
- Adds the architecture rule against direct renderer imports.

- **General case:** One playback for own, imported, published and leaderboard replays, and later clips.
- **One owner:** `src/replay/watch.ts`.
- **The next one:** A new control is one transport command; a new draw layer is one entry in `replay-frame.ts`.
- **Cause:** Session, replay world, Theater transport, envelope mapping and three frame drawers each owned part of playback, and two of the drawers copied or replaced the live drawing code (defects 1 and 2).
- **Measured:** Open to first frame, seek time near and far, replay frame cost (p95), desktop.
- **Removed:** About 12 modules (session, replay world, transport, puppet factory, frame drawers, theater adapter, cut list).

### PR 8: one Replays list and share; Ghost 2 removed (after questions 1 and 3)

Profile REPLAYS, VAULT and CAREER become one REPLAYS tab (WATCH, PIN, SHARE, DOWNLOAD, DELETE,
IMPORT A REPLAY FILE). Publishing, the feed and leaderboard links use `share.ts`. Ghost 2 recording
and playback go, with the one-time notice and the old-store cleanup. This is the PR that fixes the
owner's two defects for players: REPLAYS and leaderboard replays now open in `watch`. The Ghost 2
driver of `replay-shows-the-moment.test.ts` goes with Ghost 2.

- **General case:** One list and one share path for every replay.
- **One owner:** `app/library/replay-library-controller.ts` for the list, `src/replay/share.ts` for sharing.
- **The next one:** A new list action is one row action; a new sharing target implements the cloud port.
- **Cause:** Ghost 2 kept recording after V3 replaced it.
- **Measured:** localStorage bytes freed on a profile with 22 Ghost 2 replays; startup and replay chunk bytes; the career worker's 1,008 KB gone from precache.
- **Removed:** `legacy-compat`, `visual-replay`, the career archive and its worker, the vault library controller and their tests.

### PR 9: race on watch (seed race, and chase if kept)

- **General case:** A recorded run alongside a live run.
- **One owner:** `src/replay/race.ts`; the racer's music pick always plays in a race.
- **The next one:** A new race rule is data in the race declaration.
- **Cause:** Live ghost reference, chase and seed race were three compositions over one idea.
- **Measured:** Live frame cost with a race ghost (p95, desktop); worker CPU time per second.
- **Removed:** About 10 modules (reference data, worker, controller, chase, seed race contract and decisions).

### PR 10: Shards cosmetics in the record, names and documents

Fills `look.cosmetics` from the Shards equip state once its catalogue ids exist, draws them in
watch, rewrites `docs/FEATURE_INVENTORY.md` and `docs/ARCHITECTURE.md` replay text, updates the
position file and moves this card to `plans/completed/`.

- **General case:** Presentation data a record carries for any cosmetic slot.
- **One owner:** `record.ts` (`look`), drawn by `presentation/replay-frame.ts`.
- **The next one:** A new cosmetic slot is a Shards catalogue row; the record needs no change.
- **Cause:** Not a fix.
- **Measured:** Record bytes added by `look`; a test that changing `look` leaves every hash unchanged.
- **Removed:** The last `ghost` names in code and current docs.

## Evidence per pull request

| PR | Determinism (`pnpm test:determinism`) | Round-trip check | Browser replay journey on a built `dist/` | Other |
| --- | --- | --- | --- | --- |
| 1, 2 | green (no behaviour change in play) | the existing replay tests that remain | `tests/browser-ghost-vault-library.js` on `pnpm build:test:standalone` | bundle budget |
| 3, 4 | green (pure moves) | `production-replay-composition`, `ghost-production-replay-world`, `replay-codecs.property` tests | same | architecture and code-budget baselines lower |
| 5 | green | **new** `tests/unit/replay-round-trip.test.ts` | same, opening a new record | record bytes, live frame cost |
| 6 | green | round-trip through the memory and IndexedDB storage | **new** `tests/browser-replay-journey.js` (record a short run, list, watch, download, import) | store timings |
| 7 | green | round-trip plus a seek test at near and far ticks; `replay-shows-the-moment` (watch driver) | journey adds pause, speed, seek, chapter, practice; **new** `browser-replay-matches-live.js` (its failure on main pasted) | open and seek times, frame p95 |
| 8 | green | round-trip plus share encode and decode, old-format refusals | journey adds publish to the local provider, feed and a leaderboard link, the one-time notice, and the stage name at 0:01 of an Adventure replay; `browser-replay-matches-live.js` on the REPLAYS tab and a leaderboard replay | localStorage freed, precache bytes |
| 9 | green | round-trip of a raced run | journey adds a race against a saved replay | live frame p95 with a ghost |
| 10 | green | round-trip with `look` changed: hashes equal | journey shows a cosmetic in a watched replay | `pnpm check:docs`, terminology |

**The round-trip check** (`tests/unit/replay-round-trip.test.ts`, from PR 5): for every stream of
the determinism corpus (every weapon, endless and boss), play it headless, record it, encode it,
store it (memory storage), read it back, decode it and verify it; the result and every checkpoint
hash must equal the live run's. A fixture corpus of malformed records, records from a retired
ruleset and old `tearghost-capsule` files must each be refused with its plain message, never throw.
The playtest tool's own check (every playtest run replays to its final hash) uses the same `verify`.

Every PR also runs `pnpm format`, `pnpm typecheck`, `pnpm check:quick`, the targeted unit tests for
the modules it touches, and CI's `pnpm check:functional`. Heavy commands go through
`pnpm queue -- <command>`. A test's first run is its verdict.

## Coordination

1. **PR 206 (perf-platforms, replay engine on first use).** It is open, conflicting with main, and
   failing unit tests. Its general parts (`domain/lazy-module.ts`, `app/shell/deferred-modules.ts`,
   the chunk rule, the "lazy code kept out of startup" build check) are not replay-specific; its
   replay parts (the branded `GhostReadCapsule`, six modules that call `replayEngine.loaded()`, three
   worker entries) touch files this plan deletes. **Recommendation:** 206 lands first, before PR 3,
   and this plan builds on its loader: PR 4's detached world is the lazily loaded engine, and PR 7
   moves the one wait into `watch.open`. If 206 cannot be green within a few days, split it: the
   general parts land, and its replay slot is absorbed into PR 4. I do not edit 206's branch.
2. **PR 284 (the last plain-object guard sites)** merged on 2026-11-19 while this plan was written. It changed
   `replay-library-controller.ts`, `replay-screen-adapter-runtime.ts`, `ghost-assistance.ts` and four of
   the codec files PR 3 moves; the plan's PRs start from main after it.
3. **Playtest tool stage 5.** Its "Reused, moved, deleted" table moves
   `production-world-factory.ts`, `production-combat-phases.ts` and `production-wave-reward-runtime.ts`
   into `src/playtest/headless/`. Release builds reach those through the replay world, and release
   code may not import `src/playtest/` (`release.developer-only`). **Proposal:** they move to
   `src/app/world/detached/` in PR 4, and `src/playtest/headless/` keeps only the headless
   environment (reset, step, observation, checkpoints) on top of it, which needs one allowed edge
   from `playtest` to that folder. The snapshot codecs go to `src/gameplay/snapshot/` in PR 3, which is
   the "snapshots" rename their plan names. I will agree the exact edges with the playtest-tool
   session before PR 3.
4. **PR 294 (State Setup verbs)** touches `app/replay/ghost-frame-recording.ts` and the C40
   ghost-seek browser tests; PR 5 deletes that module. PR 5 starts after 294 merges.
5. **remove-overbuilt** is deleting TearBench parts and renaming C40 items; before PR 1 I check its
   open branch for overlap with `src/ghost` and the ghost browser tests.
6. **Ruleset bumps** (Verdant work bumps the ruleset often) retire every saved replay each time
   (policy rule 2). That is expected and needs no coordination, but the owner should know it.

## Owner items (cloud and product; not done by this plan)

- **Firestore rules:** `replays/{id}/chunks/{n}` allows any signed-in user to create or update the
  chunks of any replay (`firestore.rules`), so a published or leaderboard replay can be overwritten
  by someone else. The fix is to limit chunk writes to the parent's `ownerUid`. Firebase rules are
  the owner's.
- **Old cloud replays:** Ghost 2 documents in Firebase `replays` and CrazyGames replay ids stay where
  they are; whether to delete them is the owner's call (storage cost, privacy).
- **CrazyGames replay size:** the SDK's `publishReplay` size limit for the new record is not known
  here; it needs CrazyGames' documentation or support.
- **Leaderboards and rulesets:** with action records, a ruleset bump retires every leaderboard
  replay. Whether boards reset per ruleset (seasons) is a product decision outside this plan.
- **Server verification:** leaderboard replays are not verified by a server; this plan lets a
  client verify a replay and show it, but does not add a service.

## Questions for the lead

1. **One Replays tab.** May REPLAYS, VAULT and CAREER become one REPLAYS tab, dropping CAREER's 18
   filters, notes and its 1 MB worker? (Owner product call; recommended.)
2. **Theater extras.** May COMPARE, recorded challenges, RUN DNA, the finale companion and REPAIR be
   removed from release (PR 2)? Practice from here stays. (Owner product call; recommended.)
3. **Old replays at the switch.** May PR 8 delete the old local replay stores after the one-time
   notice, rather than leave them unread? (Recommended: they take the save's localStorage room.)
4. **PR 206 order.** Land 206 first (recommended), or split it?
5. **Clip export.** Keep the WebM writer and exporter, rewired and hidden, for the later "save clip"
   (recommended), or delete them and rebuild later?
6. **Chase.** Chase (a ghost of your best alongside, released today) and seed race (same seed,
   hidden) become one race feature. Does chase on a different seed stay, or does every race use the
   recorded seed?

## Failure modes (written first)

1. **A record replays differently from the live run** (an input that never became an action, a
   random draw outside the seeded source, an unordered event). Caught by the round-trip check over
   every weapon and mode in the determinism corpus, which names the first differing checkpoint.
2. **Story pauses, cinematic confirms or the finale run on application frames, not ticks**, so the
   action record cannot reproduce them. Caught by a round-trip stream through a Campaign wave that
   ends in a story and through the finale; if it fails, PR 5 records those inputs as actions with
   sequence numbers before it removes the frame clock.
3. **Cosmetics, names or music leak into the simulation.** Caught by the type split and the test that
   changes every `look` field and keeps every hash.
4. **Seeking is unusably slow on a long run.** Caught by the browser journey timing a far seek on a
   ten-minute run, with the number in PR 7.
5. **The switch silently loses a player's replays.** Caught by the browser journey checking the
   one-time notice on a profile seeded with Ghost 2 and V3 records, and by the old-format refusal
   fixtures.
6. **A deleted module was still needed by something players use.** Caught by the release import
   graph (no `src/ghost` import left), `pnpm check:architecture`, and the browser journeys.
7. **The move PRs change behaviour.** Caught by `pnpm test:determinism` and the tutorial gold check
   on every build.
8. **A second replay format creeps back.** Caught by the guard test that only `record.ts` declares a
   replay format id or version.
9. **The replay shows a stage, weapon or effect the run did not have at that moment** (the owner's
   defects). Caught by `replay-shows-the-moment.test.ts` and `browser-replay-matches-live.js`.
10. **A replay drawer drifts from the live one.** Caught by the architecture rule that replay modules
    import only the live frame builder, and by the match-live journey.

## Done when

- [ ] `src/ghost/` does not exist and `config/architecture-layers.json` has no `ghost` layer.
- [ ] `git grep -n "tear_vault_\|tear-ghost-v3"` finds only the one-time cleanup in `store.ts` and its test.
- [ ] `pnpm exec vitest run tests/unit/replay-round-trip.test.ts` passes and fails on a planted one-action change.
- [ ] `pnpm test:determinism` passes on the final commit.
- [ ] `pnpm exec vitest run tests/unit/replay-shows-the-moment.test.ts` passes, and its recorded run on main failed (owner defect 1).
- [ ] `node tests/browser-replay-matches-live.js` passes for all five weapons, with a throw, a recall, a tether and an ability each, from the REPLAYS tab and a leaderboard replay, and its recorded run on main failed (owner defect 2).
- [ ] `pnpm check:architecture` passes the rule that no module under `src/replay/`, `src/app/replay/` or the replay presentation modules imports a renderer other than the live frame builder.
- [ ] The owner has watched a replay of an Adventure run that changed stage, and said the stage, the weapon and the throws are right.
- [ ] `node tests/browser-replay-journey.js` passes on `pnpm build:test:standalone`: record, list, watch, pause, speed, seek, practice, download, import, publish to the local provider, leaderboard link, race.
- [ ] The architecture baseline has no `ghost` edges and no replay import cycle; the code budget and architecture baselines are lower than on `92eddb5c`.
- [ ] The replay system outside `app/world/detached/` and `gameplay/snapshot/` is under 200,000 characters (about 677,000 today), counted the code budget's way.
- [ ] The playtest-tool session confirms stage 5 can use `app/world/detached/`, `gameplay/snapshot/` and `replay/verify.ts`.
- [ ] Every PR description answers the design check and passes `pnpm merge:ready`.

## Scope

- **Changes:** `src/ghost/`, `src/replay/`, `src/app/replay/`, the replay parts of `src/app/library/`,
  the replay world and snapshot codecs in `src/tearbench/`, the replay presentation modules listed
  above, `src/persistence/` (one new adapter), the replay surfaces in `domain/surface-availability.ts`,
  their tests, `config/architecture-*.json`, `config/code-budget-baseline.json`, the tool catalogue,
  evidence routes and docs that name these files.
- **Does not change:** gameplay rules, the ruleset, mobile or touch, Firebase rules or any cloud
  service, credentials, Cloudflare, CrazyGames or itch configuration, the tutorial gold system,
  PR 206's branch, and files another session is changing until the lead clears them.

## Checks

- **While iterating:** `pnpm exec vitest run tests/unit/<replay test>.test.ts`, `pnpm test:related <files>`, `pnpm test:determinism`.
- **Before each pull request:** `pnpm format`, `pnpm typecheck`, `pnpm check:quick`, `pnpm check:architecture`, `pnpm check:code-budget`, the round-trip check, the browser journey on a built test target (through `pnpm queue --`), per `.agents/skills/tear-change-gate`.
- **Could not run here:** a real CrazyGames publish (needs the portal), a real Firebase publish against production (owner), phone measurements (mobile paused).

## Log

- 2026-11-19 Plan written from main `92eddb5c`; draft PR opened for the lead's review. No code until the lead says go.
- 2026-11-19 Added the owner's two defects (the stage at each moment; the real weapon and throws) with their causes, the parity table and the live-drawing rule.
