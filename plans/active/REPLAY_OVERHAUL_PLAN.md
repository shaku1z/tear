# Replay overhaul plan

## Authority metadata

- **Owner:** Replay owner (replay-overhaul session)
- **Status:** Active
- **Closure condition:** Every "done when" line below holds, `src/ghost/` no longer exists, and `pnpm check:functional` passes from the final commit.

## Where this stands (hand-over; keep current with every pull request)

Written so that someone with only this repository can continue. The decision log at the end has the history.

- **Merged:** PRs 1, 2, 2b, 3, 4, 5a (#361: `src/replay/record.ts`, `recorder.ts`, `verify.ts`, the round-trip check), 5b-1 (#372, ruleset v21: one seed type, one start record and one run start for live play and detached worlds), the engineering-only boss rule (#386), 5b-2 (#388, picks as actions), 5b-3a (#391, the frame clock) and 5b-3b (#396, the live tap and its browser evidence).
  - **#386:** `ENGINEERING_ONLY_BOSS_IDS` (`src/gameplay/run/boss-definitions.ts`, read from `stageOf`) lists the bosses only engineering surfaces reach. Replay admission refuses them, and the replay content hash (`REPLAY_CONTENT_HASH`, `src/gameplay/snapshot/codec-ids.ts`) leaves them out. `src/gameplay/run/ruleset-version.ts` says when to step: a change to what an admitted replay contains or how it plays; a change confined to an engineering-only boss needs none. The switch slice that makes a rebuild the real boss removes `stageOf` and steps.
  - **#388:** a held screen holds a detached world: `stepDetachedWorld` (`src/app/world/detached/detached-step.ts`) routes the tick's actions, then returns the last result without advancing unless the screen is `playing`, as live play does. Reward decisions are actions: `rewardDecisionAction` (`src/app/world/detached/action-routing.ts`) maps a `RewardDecision` to its GameAction by choice id, and `routeLiveTearBenchAction` maps it back. Correction to its description: `RewardRuntime`'s `beforeDecision` hook runs only for seed-race and beat-this-run runs, so it is not the seam for every pick; 5b-3b adds `observeDecision`, which sees every decision that changes the reward.
  - **#391:** the record's one frame-clock exception: `ReplayRun.frames` holds the application frames that play a scene (a cinematic or a chapter page) after the last simulated tick, each `{ tick, seconds, confirm }` with `seconds` at most 0.1 and `confirm` the scene's one `SceneConfirm` type. Verify plays a tick's frames before the next tick and never makes one up. The format stays version 3: no record has been published.
    `stepDetachedWorld(session, actions, frames)` plays the frames; `detachedSceneFrames` gives a headless world one frame per tick while a scene plays. Proof: `tests/unit/replay-frame-clock.test.ts` (a chapter skipped by a held confirm verifies, and differs without its frames or with the hold moved).
    Cinematics PR 8 ends the exception.
  - **#396:** `src/app/replay/live-replay-tap.ts` is the tap the game runtime feeds from the live seams (the resolved run start, before the world initializes; scene frames; reward decisions through `observeDecision`; sealed actions; stepped ticks), through one slot (`live-replay-tap-slot.ts`, type-only, so startup carries none of the recorder). `tests/browser-replay-live-verify.js` is in the `browser` gate group (`config/checks.json`), so every pull request proves that a live run verifies.
- **Merged: PR 5c-1, the production recorder and its store (#398), and the replay clock (#402).**
  - `src/app/replay/live-replay-production.ts` fills the tap slot for every run, alongside the V3 recorder until PR 8. Its code is a lazy module (`liveReplayRecorder`, a row in `src/app/shell/deferred-modules.ts`, fetched ahead on an idle menu). A run that starts before it has loaded is not recorded and is counted (`notLoaded`); run start never waits for it. A tap that throws is removed for the rest of the run and counted.
  - A record ends at the run's real end: its outcome (a defeat or a final win; a campaign stage win is not an outcome, so one record holds every stage played) or the player quitting (`src/app/run/live-run-abandonment.ts`) or restarting (`src/app/run/run-start-host.ts`). A run that ends inside a tick (a death or a win) ends its record once that tick is simulated, so the record ends on the tick the run ended in; `tests/unit/replay-run-ends.test.ts` lists every place the live game ends a run and verifies each kind of ending. One rule, `keepsReplayRecord`, says whether it is kept: a plain start is kept, campaign included; practice, beat-this-run, seed-race and assisted runs are recorded but not kept (a seed race's start is the race's shared draft and headstart, which the record does not hold until PR 8).
  - Kept records go to `src/replay/record-store.ts`: the `tear-replays` IndexedDB database, version 1, one `records` store, the newest 20 up to 25 MB. A quota error, a blocked open or any IndexedDB error turns recording off for that run and is counted; it never fails the run. Records stay on this device; the statistics switch does not govern them.
  - The browser test adds a cold leg (a run started straight after boot) and stores each warm leg's record, reads it back from the store and verifies that copy.
- **Merged: PR 5c-2, watch a kept run (#403), run ends (#404) and the test-build cloud guard (#405).**
  - WATCH (the results screen and Profile > REPLAYS) finds the run's kept record by its seed (`src/app/replay/kept-record-lookup.ts`) and opens it on the replay screen. `src/app/replay/record-watch-session.ts` re-simulates the record in the detached world (`startRecordWorld`, `src/app/replay/record-world.ts`, which verify starts runs with too) and draws it through the replay screen's frame builder, so the stage, weapon, projectiles and bosses at a tick are play's own. A run with no kept record plays in Ghost 2 as before.
  - Ghost 2 got the stage fix only: a recording starts with the stage it starts in, playback no longer starts from the end stage, and a trim keeps the stage at its cut (`tests/unit/replay-visual-stage.test.ts`).
  - #404: a run that ends inside a tick (a death or a win) ends its record once that tick is simulated, and a restarted run ends its record as a quit.
  - #405: a test build or the dev server gets the offline cloud (`cloudFactoryForBuild`, `src/platform/offline-cloud.ts`), so a replay session's test run never reaches a production leaderboard. The one entry that did on 2026-11-22 is the owner's to remove.
- **Merged: plan and guards (#406)** (this card's order and the name guards; see "The order from here").
- **Merged: One Replays (#407)**, the visible fold. Players see one REPLAYS list in Profile (filters ALL, BESTS, PINNED; WATCH, PIN, SHARE, DOWNLOAD and DELETE on each run; IMPORT A REPLAY FILE), and the replay screen says REPLAY from every WATCH.
  - The list is `src/app/replay/replay-list.ts` (rows) and `replay-list-controller.ts` (actions). Rows come from the `tear-replays` index, which now carries each record's list row and pin (`src/replay/record-store.ts`: `pin`, `remove`, ten pins at most, eviction drops the oldest unpinned run first). An index written before rows existed is filled once by reading each record.
  - Ghost 2 recordings with no kept record of the same seed are listed as "Recorded before this update" and play through the old player until PR 8. A kept run keeps its Ghost 2 copy's id: SHARE publishes that copy (the feed plays only Ghost 2 until PR 8), and PIN and DELETE act on both. V3 capsules are not listed; they stay on the device until PR 8 removes them.
  - DOWNLOAD saves the record as JSON (`tear-replay-<date>-<seed>.json`); IMPORT reads one through `readReplayRecord` and stores it.
  - Removed: the VAULT and CAREER tabs, their screens, controllers, the career writer and worker, the V3 cold restore and their tests and browser checks. The V3 vault's own import path (`capsule-paired-archive.ts`, `capsule-import-plan.ts`) and the career store that vault upkeep reads pins from stay until PR 8. The chase controls have no entry point left; PR 9 removes them.
  - Left for PR 6 (done there): telling the player when the store dropped a run to make room.
- **Merged: summary time (#408)** (step 3 of "The order from here"). `summary.time` is seconds to the millisecond, written by the live run end (`replayRunTotals`) and by every re-simulation (`canonicalReplayTotals`) through `canonicalRunTime` and `replaySummaryTime` in `src/gameplay/runtime/canonical-state.ts`. Before it, every real kept run failed verify on its summary (float seconds against whole milliseconds); the browser checks never saw it because the test inspector ended runs with the canonical totals. `tests/browser-replay-file-round-trip.js` keeps a live One-Hit run through the game's own death, verifies it as stored, and takes it through DOWNLOAD, DELETE and IMPORT.
- **Merged: cinematic skip (#409)** (step 4). The divergence came from the test hooks, not from play: the Watch Agent's `skipCinematics` asked the director to skip (`requestSkip`), which no recorded input holds, so the live chapter ended at tick 398 and the re-simulation played it in full (equal through tick 368, different at 412). A player's skip is a held confirm, which the record holds. The hooks now skip the same way (Enter held once the scene's input has armed, `src/app/engineering/test-build-runtime-hooks.ts`), and `tests/unit/replay-scene-changes.test.ts` lists every scene change outside the director with how its record holds it. The live-verify browser check skips with the hooks and ends its campaign run by QUIT.
- **Merged: status timers in the hash (#410)** (step 5, ruleset v25). The canonical state holds each actor's status effects, named once per actor in `ENEMY_STATUS_FIELDS` and `PLAYER_STATUS_FIELDS` (`src/gameplay/runtime/canonical-state.ts`): what a weapon, an ability, an enemy or the stage put on it that its position, speed and health do not show. Live play and the detached world project enemies through one function (`src/app/world/canonical-enemy-projection.ts`); the detached world had its own copy. `tests/unit/replay-status-checkpoint.test.ts` re-simulates a clean record with one enemy given a burn that does no damage: it is caught at the next checkpoint (before, the run verified to its end). The hash stream, the two headless terminal fixtures and the tutorial gold are regenerated; records kept under v24 are refused with the ruleset's reason.
- **Open: the seek cache (PR 7a, `codex/replay-watch`).** Players see seeking back in a watched run take about a tenth of a second instead of one to two and a half seconds.
  - Watch keeps world checkpoints in memory while it re-simulates (`src/app/replay/record-seek-cache.ts`): one every 480 ticks, at most 64; at the limit the spacing doubles and the checkpoints off the new grid go, so a run of any length keeps evenly spaced ones. A seek back, or a seek forward past a held checkpoint, starts the world at the nearest one at or before the target.
  - If a checkpoint cannot be taken or restored, the cache turns off for that watch with a console warning and watch re-simulates from the seed, as before.
  - Restoring a mid-run checkpoint needed two fixes in the detached world: dash contacts that name enemies decode after the enemies exist, and the detached world reports no stage banner (its wave banner timer is restored separately). Checkpoints in a built game carry that build's identity.
  - Measured in Chrome on a real 14,002-tick Endless run (test build, main against the branch): back to half 1,245 to 195 ms, back to a tenth 255 to 113 ms, back to 85% 2,358 to 124 ms, dragging back in 1% steps p50 1,760 to 92 ms; forward from a tenth to 90% 2,170 to 65 ms. Open 85 to 70 ms. The first pass to the end takes 3.7 s instead of 3.2 s: 29 checkpoints, 18 ms each (p50; max 29 ms), about 90 KB of snapshot each (2.6 MB in all).
  - Not in this step (decision log, 2026-11-23): `watch.ts`, the merged screen and frame modules, `browser-replay-matches-live` and the renderer-import rule (PR 7b).
- **Merged: the store (PR 6, #411).** Players see the REPLAYS list hold up to 300 runs, and say when the store removed older unpinned runs to make room ("2 older runs were removed to make room. PIN a run to keep it.").
  - A record is kept as the gzip bytes of its JSON (`src/replay/encoding.ts`), and an entry's `bytes` is what is stored. A record kept as JSON text before this reads back the same way, so nothing is rewritten; a browser without `CompressionStream` keeps the text. Reading stops past 100 MB decoded.
  - The caps are 300 records and 25 MB (was 20). The store keeps a count of what its caps dropped beside the index (`dropped`); the list takes it, and so clears it, when it opens (`takeDropped`).
  - Measured in Chrome on the store as built, with a real 40-second Endless record (546,547 bytes of JSON, stored as 44,401): with 300 records, open 0.2 ms, list 0.7 ms (an index of about 100 KB), read 3.7 ms, add 10 ms (p95 13), an add that evicts 16 ms. Main with 20 records: add 3.8 ms, list 0.3 ms, read 3.8 ms. Chrome already compresses large values on disk (main's 20 records of 10.9 MB used 1.6 MB of the origin), so on Chrome the gain is mostly in what the caps count; 300 records used 13.6 MB.
  - Not in this step (decision log, 2026-11-23): the V3 vault modules in the table below stay until PR 8, and no storage port.
- **Then: one watch (PR 7b).**
- **Agreed with Shards (for PR 10):**
  - `ReplayLook.cosmetics` is the domain `Loadout`, filled at run start with `loadoutOf(COSMETIC_CATALOG, PROFILE.cosmetics())`.
  - `readLook` caps the entry count at the number of catalog slots.
  - The viewer's calm setting wins.
  - No cosmetics in the feed or leaderboard summaries.
  - Shards makes the wardrobe hold one style per owner before PR 9 (race) needs two wearers.
- **Rules that apply to every step:**
  - Each step that changes gameplay identity takes the next free ruleset number when it merges.
  - A test's first run is its verdict, and the PR records it.
  - No Firebase rules deploys; that is the owner's step.
  - Mobile is paused.

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
   `#trim` (`legacy-compat.ts:328`) drops the first quarter. It filters out the stage events before
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
| `src/replay/race.ts` | replay | A recorded run alongside a live one (the seed race, same seed only, decision 6); built only on `record` and `watch` |
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

- As built (PR 7a): watch takes the snapshots in memory while it re-simulates a kept run and drops
  them when the run closes; nothing is stored. The two bullets below are the earlier design, kept in
  case long runs make the first pass too slow (decision log, 2026-11-23).
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

- **Profile shows a notice once** (decision 3): "Replays saved before this update can't be played
  in this version. You can download them first. Nothing else in your save is touched." It has two
  buttons, DOWNLOAD ALL and CONTINUE.
  - Only CONTINUE deletes the old local stores: the Ghost 2 localStorage keys and the `tear-ghost-v3`
    IndexedDB database.
  - The Ghost 2 keys share the localStorage quota with the player's save, so leaving them costs the
    save room.
  - Leaving the notice without pressing CONTINUE deletes nothing, and the notice appears again next
    time.
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
| `application-frame-events.ts` | players; 15 src, 3 tests | delete with its last consumer (PRs 6 to 9) | Application frame clocks for the finale, challenges and clips; the record keeps actions at ticks only |
| `authoritative-receipt.ts` | players; 13, 6 | merge into `record.ts`; goes with its last consumer (PRs 6 to 9) | A state hash beside a keyframe is a checkpoint hash |
| `boss-memory-origin.ts` | hidden; 8, 1 | delete (PR 1) | Boss Memory, an unfinished engineering feature |
| `boss-memory.ts` | hidden; 5, 1 | delete (PR 1) | Same |
| `browser-capsule-vault.ts` | players; 5, 2 | merge into `store.ts` and `app/replay/replay-library.ts` (PR 6) | Browser facade over list, read, repair, verify, seek, fork |
| `browser-cold-restore.ts` | players; 2, 3 | merge into `store.ts` import (PR 6) | IMPORT A REPLAY FILE becomes one validated add |
| `browser-finale-companion.ts` | players; 2, 0 | delete (PR 2) | The record runs to the end of the run, finale included |
| `browser-recorded-challenge.ts` | players; 3, 1 | delete (PR 2) | Recorded challenges (decision 2) |
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
| `career-archive-store.ts` | players; 3, 2 | delete (PR 8) | CAREER folds into the one Replays list (decision 1) |
| `career-archive-worker.ts` | worker entry (1,008 KB bundle); 0, 0 | delete (PR 8) | The list reads `summary` from records; no worker |
| `career-archive.ts` | players; 7, 3 | delete (PR 8) | 18 filters, views, notes, retention over a second index |
| `cold-restore-job.ts` | players; 6, 4 | delete (PR 6) | Resumable restore jobs for a single-file import |
| `cold-restore.ts` | players; 3, 3 | delete (PR 6) | Same |
| `corrupt-capsule-records.ts` | players; 3, 0 | delete (PR 2b) | Repair records; damaged records are shown, not repaired |
| `finale-companion.ts` | players; 11, 2 | delete (PR 2) | See `browser-finale-companion.ts` |
| `finale-playback.ts` | players; 2, 1 | delete (PR 2) | Same |
| `fork-origin.ts` | players; 11, 1 | merge into `app/replay/practice-launch.ts` (PR 7) | Practice origin; the permits go |
| `ghost-doctor.ts` | players; 4, 0 | delete (PR 2b) | REPAIR (decision 2) |
| `index.ts` | tests only; 0, 16 | delete (PR 1) | Barrel that only tests import |
| `indexeddb-vault-backend.ts` | players; 12, 3 | move to `persistence/indexeddb-chunk-storage.ts` (PR 6) | Generic keyed-chunk storage; the database name of the new store is new (see the switch) |
| `live-causal-events.ts` | players; 6, 7 | merge into `recorder.ts` (PR 5) | Gameplay facts become marks |
| `live-ghost-reference-data.ts` | players; 6, 4 | merge into `race.ts` (PR 9) | The ghost alongside a live run |
| `live-ghost-reference-worker.ts` | worker entry; 0, 0 | merge into the one replay worker (PR 9) | Same |
| `live-ghost-reference.ts` | worker; 1, 1 | merge into `race.ts` (PR 9) | Same |
| `live-recorder.ts` | players; 6, 7 | merge into `recorder.ts` (PR 5) | One recorder |
| `player-experiences.ts` | players; 3, 0 | delete (PR 2) | Challenge kinds, attempt proofs, Run DNA, "nemesis grammar" |
| `preservation-corpus.ts` | dev; 1, 1 | delete (PR 1) | Fixture prover for capsule boundaries; the round-trip test's old-format corpus replaces it |
| `production-replay-comparison.ts` | players; 2, 1 | delete (PR 2) | COMPARE 2 to 9 runs (decision 2) |
| `production-replay-session.ts` | players; 10, 4 | merge into `watch.ts` (PR 7) | Opens a verified record for playback |
| `production-replay-verification.ts` | players; 8, 3 | rename to `replay/verify.ts` (PR 5) | Re-simulate and compare |
| `recorded-challenge.ts` | players; 5, 2 | delete (PR 2) | Recorded challenges |
| `recording-profiles.ts` | players; 5, 0 | delete (PR 5) | Four profiles become one constant set in the record (live play uses `coaching`) |
| `replay-admission.ts` | players; 21, 11 | merge into `record.ts` (header) and `verify.ts` (ruleset and build check); goes with its last consumer (PRs 6 to 9) | 26,698 characters of run context, fingerprints, random state and opening permits |
| `replay-cut-list.ts` | hidden; 3, 1 | merge into clip export as one tick range (PR 7) | The Replay Editor's cut list |
| `replay-world.ts` | players; 15, 4 | merge into `watch.ts` (world port) (PR 7) | World, session and practice types |
| `run-dna-theater.ts` | players; 2, 3 | delete (PR 8) | The RUN DNA panel went in PR 2; CAREER still reads the projection until it folds into the list |
| `seed-race-contract.ts` | hidden (seed race); 9, 4 | move to `gameplay/run/` (PR 3), because the codec validation reads it; merge into `record.ts` (race declaration in `run.start`) and `race.ts` (PR 9) | Seed race stays |
| `seed-race-decisions.ts` | hidden; 5, 2 | merge into `race.ts` (PR 9) | Same |
| `streaming-recorder.ts` | players; 4, 7 | merge into `recorder.ts` (PR 5) | Keep its chunk-commit order (#286) |
| `theater-open-result.ts` | players; 5, 2 | merge into `watch.ts` (open result and refusal reasons) (PR 7) | Plain refusal reasons stay |
| `theater.ts` | players; 3, 0 | delete (PR 2); its transport state goes to `watch.ts` (PR 7) | Lenses, trajectory diffs, event alignment exist for COMPARE |
| `truth-kernel.ts` | players; 10, 4 | delete with its last consumer (PRs 6 to 9); any constant still read moves to `record.ts` | "Trident" precedence, quality cards, profile negotiation |
| `vault-maintenance.ts` | players; 2, 0 | merge budget and retention into `store.ts`; delete repair upkeep (PR 6) | Quota, index rebuild, verified reads |

### `src/replay/` (5 modules, 39,739 characters)

| Module | Users | Disposition | Reason |
| --- | --- | --- | --- |
| `envelope.ts` | players; 7, 6 | keep until Ghost 2 goes (PR 8); `record.ts` owns the format id from PR 5a | The Ghost 2 packet (`visual-replay.ts`) still uses it |
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
| `browser-replay-clip-export.ts` | hidden; 2, 0 | rename to `clip-export.ts`, rewire to `watch.frameAt` (PR 7) | Kept engineering-only so "save clip" later is UI only (decision 5) |
| `browser-replay-clip-webm.ts` | hidden; 1, 1 | rename to `webm-writer.ts` (PR 7) | Generic, tested WebM writer |
| `ghost-challenge-composition.ts` | players; 1, 0 | delete (PR 2) | Recorded challenges |
| `ghost-challenge-controller.ts` | players; 1, 1 | delete (PR 2) | Same |
| `ghost-chase-composition.ts` | players; 1, 2 | merge into `race-composition.ts` (PR 9) | One race feature on the same seed; chase on a different seed is dropped (decision 6) |
| `ghost-comparison-screen-adapter.ts` | players; 1, 0 | delete (PR 2) | COMPARE |
| `ghost-finale-companion.ts` | players; 2, 1 | delete (PR 2) | Finale companion |
| `ghost-finale-screen-adapter.ts` | players; 1, 1 | delete (PR 2) | Same |
| `ghost-frame-recording.ts` | players; 3, 3 | delete (PR 5) | Application frame recording |
| `ghost-opening-capture.ts` | players; 1, 2 | merge into `live-recording.ts` (PR 5) | The record starts at the run's start |
| `ghost-practice-launch.ts` | players; 6, 1 | rename to `practice-launch.ts` (PR 7) | Practice from here stays |
| `ghost-practice-session-state.ts` | players; 9, 1 | rename to `practice-session.ts` (PR 7) | Keeps practice runs unranked and unsaved |
| `ghost-recording-session-state.ts` | players; 6, 3 | merge into `live-recording.ts` (PR 5) | One recording session owner |
| `ghost-reference-controller.ts` | players; 1, 2 | merge into `race-composition.ts` (PR 9) | Same as chase |
| `ghost-run-dna-recording.ts` | players; 1, 1 | delete (PR 8) | Run DNA; CAREER reads it until PR 8 |
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
| `production-combat-phases.ts`, `production-combat-simulation.ts`, `production-wave-reward-runtime.ts`, `production-run-outcome-runtime.ts`, `production-finale-runtime.ts`, `particle-presentation-state.ts`, `live-runtime-snapshots.ts` | players (through the replay world) | move to `app/world/detached/` (PR 4) | The runtimes the detached world builds; the PR lists the exact set from the import graph |
| `state-codecs.ts` | players; 17, 6 | move to `gameplay/snapshot/state-codec.ts` (PR 3) | Snapshots for the seek cache, practice, State Setup and playtest |
| `environment-codec.ts` | players; 8, 10 | move to `gameplay/snapshot/environment-codec.ts` (PR 3) | Same |
| `detached-world-hydrator.ts` | players; 4, 1 | move to `app/world/detached/world-hydrator.ts` (PR 4) | It restores presentation state (particles, HUD, tutorial), which `gameplay` may not import |
| `reward-codec-hydrator.ts` | players; 2, 2 | move to `app/world/detached/reward-hydrator.ts` (PR 4) | Same |
| `live-codec-validation.ts` | players; 1, 1 | move to `gameplay/snapshot/validation.ts` (PR 3); its one `ghost` import (seed race state) moves to `gameplay/run/` with `seed-race-contract.ts` | Same |
| `arena-slot-references.ts`, `source-void-history-references.ts` | players (through the codecs) | move to `gameplay/snapshot/` (PR 3) | Part of the codec import cycle |
| `particle-presentation-checkpoint.ts`, `ui-presentation-checkpoint.ts` | players (through the codecs) | move to `gameplay/snapshot/particle-checkpoint.ts` and `ui-checkpoint.ts` (PR 3) | The codec validation parses them; the particle shapes move with them and `presentation/particles.ts` imports them, so there is one definition |
| `contracts.ts` (the snapshot part) | players; 37 | `TearSnapshotV1`, its provenance, lineage and hash types and the environment observation move to `gameplay/snapshot/snapshot-contract.ts` (PR 3), with no re-export | The rest of `contracts.ts` is TearBench's own |
| `registries.ts` (the codec ids and `createStableRegistry`) | players | the codec ids go to `gameplay/snapshot/codec-ids.ts` and `createStableRegistry` to `domain/stable-registry.ts` (PR 3); the environment State Setup factory ids go to `gameplay/snapshot/environment-codec.ts` | The other registries stay and build on `createStableRegistry` |
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

## The order from here (the lead, 2026-11-22)

**The decision.** The owner found five names for one thing: Profile had REPLAYS (Ghost 2 recordings),
VAULT (V3 capsules, played in THEATER) and CAREER (a "career archive" with ten lists), playback was
"THEATER" or "WATCH" depending on the way in, and the code said Ghost 2, Ghost V3, capsule, vault,
theater, passport, career and Run DNA. Every PR so far fixed plumbing and none removed a screen,
because the visible fold was PR 8. From now on:

- **One word: Replay.** Every place a player sees says REPLAY or REPLAYS.
- **One list: Profile > REPLAYS.** Every kept run on this device, newest first, one row each (mode,
  stage reached, score, time, date, weapon), with ALL, BESTS and PINNED filters and the row actions
  WATCH, SHARE, DOWNLOAD, PIN and DELETE; IMPORT A REPLAY FILE sits on the list. VAULT and CAREER go;
  Profile keeps BESTS and STATS.
- **One player: the replay screen.** WATCH from the results screen, Profile > REPLAYS, a leaderboard
  row and the feed opens the same screen, headed REPLAY. Older recordings that cannot re-simulate play
  there through the old path, labelled "Recorded before this update", until PR 8 removes them.
- **One store: `tear-replays`.** Older recordings are listed through it or shown read-only; a player
  never sees two lists.
- **Race:** CHASE BEST and RACE THIS REFERENCE leave with CAREER; the race comes back as one WATCH-side
  action in PR 9.

**The order** (one PR at a time; it replaces the old PR 6, 7, 8 order):

1. **Plan and guards** (this card, the terminology and containment guards, the one-name rules in
   `AGENTS.md` and `docs/ENGINEERING_STANDARD.md`).
   **Players see:** nothing changes in the game.
2. **One Replays** (the visible part of the old PR 8): the list, its filters and row actions, the
   replay screen's REPLAY header, WATCH from every way in, VAULT and CAREER removed with the screens,
   controllers and stores only they use, `tear-replays` the only list source. It closes the
   `REPLAY-ONE-LIST` allowlist entries in `config/terminology-registry.json`. Picture card from a real
   preview build: the list, the replay screen and a leaderboard WATCH.
   **Players see:** one REPLAYS list in Profile and one replay screen from everywhere; VAULT, CAREER
   and THEATER are gone.
3. **Summary time** (found taking the One Replays pictures, 2026-11-23): the live run end wrote
   `summary.time` as the run's float seconds and verify derived it from the canonical state's whole
   milliseconds, so every real kept run failed verify on its summary. One unit now: seconds to the
   millisecond, through `canonicalRunTime` and `replaySummaryTime` (`src/gameplay/runtime/canonical-state.ts`).
   With it, the browser check One Replays dropped comes back for the new record: a live One-Hit run the
   game keeps, read back as stored, DOWNLOAD, DELETE and IMPORT, verified before and after
   (`tests/browser-replay-file-round-trip.js`). It never reads the run's totals from the canonical state.
   **Players see:** nothing; their kept runs now verify.
4. **Cinematic skip and every ending:** a campaign run started with cinematics skipped and ended by QUIT
   differs at the checkpoint on tick 480 (seed 731213, easy, sword). Find the first divergence and add a
   rule test over cinematic skip and every way a run ends. The skip was the test hooks' own, not a
   player's, so this is a test-tooling fault: the hooks now skip with a held confirm.
   **Players see:** nothing; a player's skip was always recorded. The browser checks now hold the skip as
   players make it.
5. **Status timers in the hash:** burn and the other status timers join the canonical hash, with a
   ruleset step, a gold refresh and a test that a burn-only difference is caught at the next checkpoint.
   **Players see:** nothing; a replay that would drift on a status effect is refused instead of shown wrong.
6. **PR 6, one store** (below), with the list's index, budget and eviction rule.
   **Players see:** the list opens at once with hundreds of runs; when the store drops an old unpinned
   run to stay in budget, the list says so.
7. **PR 7, one watch** (below), with the seek cache and its budgets.
   **Players see:** WATCH opens fast on long runs, and seeking backwards is quick.
8. **PR 8, Ghost 2 and V3 removed** (below, without the list, which moved to One Replays). It closes
   the `REPLAY-GHOST-REMOVAL` allowlist entries.
   **Players see:** the one-time notice about recordings made before this update (DOWNLOAD ALL, then
   CONTINUE); afterwards only re-simulated replays.
9. **PR 9, race on watch** (below).
   **Players see:** RACE on the replay screen, against a run on the same seed.
10. **PR 10, Shards looks in the record and the docs** (below). It closes the `REPLAY-DOCS` allowlist
   entries.
   **Players see:** a watched replay shows the cosmetics the runner wore.

**The guards.** `pnpm check:terminology` refuses the `replay` term's old names (its
`deprecatedCopyAliases`) in player text and current docs. Today's uses are allowlisted file by file,
each entry expiring at `REPLAY-ONE-LIST`, `REPLAY-GHOST-REMOVAL` or `REPLAY-DOCS`, the step above
that removes them. `pnpm check:containment` counts vault, theater, capsule, passport, v2 and v3 in
code and paths against today's baseline, which only goes down. The rules (one thing, one name, one
screen, one store; no version number in a product, module or store name; every plan PR says what
players see) are in `AGENTS.md` and `docs/ENGINEERING_STANDARD.md`.

## The quality bar (every remaining replay PR)

The owner, 2026-11-22: effective, efficient, scalable, organized, no slop, no one-off fixes. Each PR
body shows the numbers.

- **One module, one public face.** Replay code lives in `src/replay/` (record, store, share, verify,
  watch) and `src/app/replay/` (screens and wiring), each with one index that other code imports.
  `config/architecture-roles.json` names them so `pnpm check:architecture` refuses a reach-around.
  After One Replays nothing outside imports a Ghost 2 or V3 module; the inventory says when each goes.
  Each PR reports characters removed against characters added, and removal wins overall.
- **Watching scales with run length.** A bounded in-memory seek cache (a snapshot every N ticks, N and
  the memory cap measured and written here) keeps a backward seek to at most N ticks. Measured on a
  20-minute run on the test build: WATCH to first frame, the worst seek, steady frame time at 1x and
  the fastest speed, and memory. The budgets go here and into a browser check that fails over them.
- **The list scales with the number of runs.** List rows come from an index of summary fields (never
  the action log), the list draws only visible rows, and the store has one budget and eviction rule
  (pinned and shared runs kept, the oldest unpinned go first), with the player told when a run was
  dropped. Tested with 500 runs.
- **One way to do each thing.** One record type, one store, one file and share format, one watch path,
  one verify. No second path "for now" without the named PR that deletes it.
- **Correct by rule, not by case.** Property tests: any recorded run round-trips (record, store, file,
  import, verify and watch give the same hashes), and any `look` change leaves every hash unchanged.
  A rule test over every content definition (weapons, projectiles, bosses, stages) checks that watch
  draws it from play's own state, so new content needs no replay change.
- **No slop.** No dead options, unused exports, narrating comments, flags nobody sets or themed names.
  Each new file has an evidence route. The code-budget numbers go down.
- **Players see:** every PR says what changes for a player, or that nothing does.

## Pull request sequence

The sections below are the original sequence. "The order from here" above sets the order and moves
the list out of PR 8; each section keeps its design answers.

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

### PR 2: remove the replay extras (decision 2)

COMPARE, recorded challenges, the Theater's RUN DNA panel, the finale companion, `theater.ts` and
`player-experiences.ts`. The Theater keeps play, pause, speed, seek, chapters and practice. The Run
DNA calculation and recording stay until PR 8, because CAREER reads them. REPAIR goes in PR 2b.

- **General case:** Theater features beyond watching that the five goals do not need.
- **One owner:** The Theater screen adapter keeps the remaining controls; nothing new.
- **The next one:** Not applicable: deletion only.
- **Cause:** Each C-checkpoint added a projection over the capsule instead of using watch.
- **Measured:** Characters, files and tests deleted; replay chunk bytes before and after.
- **Removed:** About 20 modules (about 150,000 characters) and their tests.

### PR 2b: remove REPAIR (decision 2)

The REPAIR action, the repair-copy writer in the vault, `ghost-doctor.ts` and
`corrupt-capsule-records.ts`. A damaged record is shown as damaged (CAN'T PLAY); deleting it
arrives with PR 6's store, which lists such a record as delete only. The health scan and index
rebuild move into `vault-maintenance.ts` until PR 6's store replaces them. Split from PR 2
because it reaches into vault maintenance and custody, not the Theater.

### PR 3: move the snapshot codecs to `src/gameplay/snapshot/` (no behaviour change)

- **General case:** World state to data and back, shared by the seek cache, practice, State Setup and the playtest tool.
- **One owner:** `src/gameplay/snapshot/`.
- **The next one:** A new stage object's state is one codec entry, as today.
- **Cause:** The codecs grew inside TearBench although players need them.
- **Measured:** `pnpm test:determinism` green; architecture baseline edge count before and after.
- **Removed:** Eight `src/tearbench` files leave (the four codec files, the two reference files and the two checkpoint parsers), with the snapshot part of `contracts.ts` and the codec ids; `seed-race-contract.ts` leaves `src/ghost`. The two hydrators wait for PR 4, because they restore presentation state.

### PR 4: move the detached world to `src/app/world/detached/` (no behaviour change)

- **General case:** One detached production world for watch, verify, race and the playtest headless environment.
- **One owner:** `src/app/world/detached/` beside `createLiveWorldComposition`, in the `app.world-construction-owners` role.
- **The next one:** A new consumer of a detached world calls the same constructor.
- **Cause:** The replay world was built as TearBench research code and players came to depend on it.
- **Measured:** `pnpm test:determinism` green; code budget not raised; the layer allowlist went from 32 to 18 edges: the ten `tearbench -> app` edges and the four `ghost -> tearbench` edges that reached the moved modules are gone. The ten `ghost -> tearbench` edges left (to `contracts`, `validation`, `registries` and `gameplay-causal-events`) and the 7-file ghost cycle go with `src/ghost` in PRs 5 to 8.
- **Removed:** Thirteen `src/tearbench` files leave. Twelve form the detached world and move to `src/app/world/detached/`: the composition, world factory, combat phases and simulation, wave reward, run outcome and finale runtimes, particle state, action routing, application frame and the two hydrators. `live-state-snapshot.ts` moves to `gameplay/snapshot/live-restore.ts`. The capture half of `live-runtime-snapshots.ts` goes to `gameplay/snapshot/live-capture.ts`, `ENTITY_KIND_REGISTRY` to `codec-ids.ts`, and `ProductionReplayBootstrap` to `snapshot-contract.ts`. TearBench's tutorial gold generator and parity matrix reach the world through the `replayEngine` slot, as the ghost replay code does.
- **Edges (the lead, 2026-11-20):** `src/app/world/detached/` is its own layer, so the one new edge is `playtest -> detached world`, not `playtest -> app`. `tearbench -> app` is never allowed, nothing in `src/app` imports `src/playtest`, and the baseline only shrinks.
- **The `playtest -> tearbench` allowance (the lead, 2026-11-20):** it goes once no playtest file imports TearBench. PR 4 stays with the replay modules and lists in its description exactly which `playtest -> tearbench` imports remain after it; playtest-tool owns those in its rebuild, and whichever pull request moves the last one removes the allowance from `config/architecture-layers.json`.

### PR 5: one record (`record.ts`, `recorder.ts`, `verify.ts`) and the round-trip check

The live sidecar records the new record into the existing Vault; Theater opens it. Capsules from
before this PR are refused as "recorded before this update".

- **General case:** One record type for every replay, file, upload and race.
- **One owner:** `src/replay/record.ts`, with the guard test that no other module declares a replay format id or version.
- **The next one:** A new field is one line in `record.ts` and one migration step if it changes the version.
- **Cause:** The capsule contract, truth kernel, admission context, receipts and envelope each described part of a replay.
- **Measured:** Record bytes per minute of play on the determinism corpus, against V3 capsule bytes for the same runs; live recording frame cost (p95, desktop).
- **Removed:** `capsule-contract`, `recording-profiles`, `live-recorder`, `streaming-recorder`, `live-causal-events`, `ghost-frame-recording`, the recording session state and their tests (PR 5c). `envelope`, `replay-admission`, `authoritative-receipt`, `application-frame-events` and `truth-kernel` go with their last consumer (PRs 6 to 9; see the inventory).

PR 5 lands in three pull requests (the replay owner, 2026-11-21). A seed and actions record cannot replay a live run until the live run starts the way the detached world does, so the parity work is its own step:

- **5a, the record and verify (pure addition, no live change).** `src/replay/record.ts` (the record type, `readReplayRecord`, the summary counter), `recorder.ts` (actions at ticks, a checkpoint hash every 120 ticks, the result), `verify.ts` (re-simulate from the seed on a world port and compare every checkpoint, the result and the summary) and `app/replay/detached-replay-world.ts` (that port over the detached world). `app/world/detached/detached-step.ts` is the one way a detached world steps a tick without a recorded frame clock. The round-trip check runs over the determinism corpus; `tests/unit/replay-record.test.ts` holds the malformed corpus, the old-format refusals and the format guard. Measured: the record as plain JSON is about 387 KB for an 18-second corpus run (about 1.3 MB a minute, because the scripted policy sends a move and an aim every tick); the stored encoding is PR 6's and reports its bytes against this. V3 capsule bytes for the same runs were not measured: the headless runs have no V3 capsule.
- **5b, live start parity.** The live run records and the detached world replays the same start: the run seed as the record's seed, the meta progression and opening content as start choices, reward picks and rerolls as actions at ticks, and the cinematic and boss-intro frame clock recorded as the one exception until the cinematics overhaul makes those scenes stop nothing. A browser test records a live run (a draft, a boss intro and a chapter) and verifies it from its seed. It lands as three pull requests, each on main before the next starts (the lead, 2026-11-21):
  - **5b-1, one start.** One seed type (`runSeed`, a 32-bit integer above zero; `scenarioRunSeed` is the one text-to-seed conversion, for scenarios and old snapshots), the start choices as one record (`RunStartChoices`, now with the run's cinematics setting and the chapters the session has played), one start for live play and detached worlds (`createRunStartWorldPort` driven by `LiveRunStartController`; `startDetachedRun` feeds it the recorded choices) and one stage load with its environment (`run-stage.ts`). `tests/unit/run-start-parity.test.ts` starts the live host on a used detached world and a fresh detached world from the recorded choices, and compares them at the start and on every tick after it.
  - **5b-2, picks as actions.** Draft, reserve and tier-up picks and rerolls become GameActions the UI dispatches, so a record holds them at their ticks. The Settings row for Cinematics says, during a run, that a change applies from the next run (a run keeps the setting it started with, since 5b-1). A paused screen holds a detached or headless world as it holds live play (playtest-tool measured 600 paused ticks costing the player 33 health); the parity test pauses for a number of ticks and compares, and playtest-tool is told when it lands.
  - **5b-3, the frame clock.** The named frame-clock exception (director, cinema, ritual and chapter frames, and the boss intro until cinematics' intro-clock slice merges; it ends with cinematics PR 8) with its test, and browser evidence that a live run verifies from its seed alone, with no keyframes.
- **5c, the live recorder.** Two pull requests, each on main before the next (the lead, 2026-11-21):
  - **5c-1, record and keep.** Production fills the tap slot behind a lazily loaded slot (a deferred-modules row, fetched ahead on an idle menu; the bundle-budget build check fails if it lands in a startup chunk). Kept runs go to their own database, `tear-replays` (version 1, one `records` store, opened by `src/replay/record-store.ts`), capped at the newest 20 records and 25 MB; it is the store PR 6 builds on, so PR 6 changes the encoding inside it and needs neither a second database nor a migration out. V3 keeps recording in parallel until PR 8, and the PR measures frame time p95 with both recorders on against main. No player-visible change.
  - **5c-2, list and watch.** VAULT lists the stored records, the Theater opens them, and V3 capsules show "Recorded before this update". Picture card from a real preview build.
  - **Moved to PR 8:** the seed race moves to the record (its start, the shared draft and headstart, becomes part of the record's start, so races are kept), V3 recording stops, the V3 recorder modules are deleted, and the HUD checkpoint parser (`gameplay/snapshot/ui-checkpoint.ts`) moves to the HUD's owner. The parser move waits for V3: until then the V3 capture code keeps `gameplay/snapshot` in startup anyway.

### PR 6: one store (`store.ts`, `indexeddb-chunk-storage.ts`, `share.ts` file encoding)

**Players see:** the REPLAYS list opens at once with hundreds of runs, and says when an old unpinned run was dropped to stay in budget.

Builds on the `tear-replays` database from 5c-1: PR 6 changes the encoding inside it and needs no second database and no migration out.

- **General case:** One device store and one file format for every record.
- **One owner:** `src/replay/store.ts`; storage is a generic persistence adapter.
- **The next one:** Another device storage (a native shell) implements the storage port.
- **Cause:** Vault, career store, cold-restore jobs, import plans, protection and archives each kept part of storage.
- **Measured:** Store open time with 50 records, add and read time, file size; desktop browser numbers.
- **Removed:** About 14 modules (vault, backend, protection, import plan, cold restore and jobs, archives, maintenance repair).

### PR 7: one watch (`watch.ts`, `replay-screen.ts`, `replay-frame.ts`)

**Players see:** WATCH opens fast on long runs, and seeking backwards is quick.

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

### PR 8: one Replays list and share; Ghost 2 removed (decisions 1 and 3)

**Players see:** the one-time notice about recordings made before this update (DOWNLOAD ALL, then
CONTINUE); afterwards only re-simulated replays.

The one REPLAYS tab itself (WATCH, PIN, SHARE, DOWNLOAD, DELETE, IMPORT A REPLAY FILE) moved ahead
to One Replays ("The order from here"); PR 8 removes what it left behind. Publishing, the feed and leaderboard links use `share.ts`. Ghost 2 recording
and playback go, with the one-time notice and the old-store cleanup. From 5c (the lead, 2026-11-21): the seed race moves to the record, V3 recording stops and the V3 recorder modules are deleted, and the HUD checkpoint parser moves to the HUD's owner. This is the PR that fixes the
owner's two defects for players: REPLAYS and leaderboard replays now open in `watch`. The Ghost 2
driver of `replay-shows-the-moment.test.ts` goes with Ghost 2.

- **General case:** One list and one share path for every replay.
- **One owner:** `app/library/replay-library-controller.ts` for the list, `src/replay/share.ts` for sharing.
- **The next one:** A new list action is one row action; a new sharing target implements the cloud port.
- **Cause:** Ghost 2 kept recording after V3 replaced it.
- **Measured:** localStorage bytes freed on a profile with 22 Ghost 2 replays; startup and replay chunk bytes; the career worker's 1,008 KB gone from precache.
- **Removed:** `legacy-compat`, `visual-replay`, the career archive and its worker, the vault library controller and their tests.

### PR 9: race on watch (same seed only, decision 6)

**Players see:** RACE on the replay screen, against a run on the same seed.

- **General case:** A recorded run alongside a live run.
- **One owner:** `src/replay/race.ts`; the racer's music pick always plays in a race.
- **The next one:** A new race rule is data in the race declaration.
- **Cause:** Live ghost reference, chase and seed race were three compositions over one idea.
- **Measured:** Live frame cost with a race ghost (p95, desktop); worker CPU time per second.
- **Removed:** About 10 modules (reference data, worker, controller, chase, seed race contract and decisions).

### PR 10: Shards cosmetics in the record, names and documents

**Players see:** a watched replay shows the cosmetics the runner wore.

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
| 8 | green | round-trip plus share encode and decode, old-format refusals | journey adds publish to the local provider, feed and a leaderboard link, the one-time notice (DOWNLOAD ALL saves a file, leaving keeps the old stores, CONTINUE deletes them), and the stage name at 0:01 of an Adventure replay; `browser-replay-matches-live.js` on the REPLAYS tab and a leaderboard replay | localStorage freed, precache bytes |
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

- **Deploy the Firestore rules fix.** Today `replays/{id}/chunks/{n}` lets any signed-in user
  create or update the chunks of any replay, and anonymous sign-in makes that anyone. The legacy
  `ghosts/{board}` is open the same way. The separate rules PR fixes both in `firestore.rules`;
  deploying it is the owner's step.
- **Old cloud replays:** Ghost 2 documents in Firebase `replays` and CrazyGames replay ids stay where
  they are; whether to delete them is the owner's call (storage cost, privacy).
- **CrazyGames replay size:** the SDK's `publishReplay` size limit for the new record is not known
  here; it needs CrazyGames' documentation or support.
- **Leaderboards and rulesets:** with action records, a ruleset bump retires every leaderboard
  replay. Whether boards reset per ruleset (seasons) is a product decision outside this plan.
- **Server verification:** leaderboard replays are not verified by a server; this plan lets a
  client verify a replay and show it, but does not add a service.

## Decisions (the lead, 2026-11-19, under the owner's delegation)

The lead decided these under the owner's delegation and the plain-names and remove-the-over-built
standard. Decisions 1, 2, 3 and 6 are on the ledger so the owner can overrule them; an overrule
changes only the PR that carries that decision.

1. **One Replays tab.** REPLAYS, VAULT and CAREER become one REPLAYS tab. CAREER's filters, notes
   and worker go (PR 8).
2. **Theater extras go.** COMPARE, recorded challenges, RUN DNA, the finale companion and REPAIR are
   removed from release (PR 2). Practice from a replay stays.
3. **Old replays at the switch are deleted only after the player agrees.** The one-time notice says,
   in plain words, what is going (replays saved before this update), why (this version can't play
   them), and that nothing else in the save is touched. It offers DOWNLOAD ALL first, and deletes
   only after the player presses CONTINUE (PR 8).
4. **PR 206 lands first** if it can go green soon. Otherwise it is split, and its replay slot moves
   into PR 4. This plan never touches 206's branch.
5. **The WebM clip writer is kept**, hidden, and rewired to watch (PR 7).
6. **One race feature, on the same seed only.** Chase on a different seed is dropped: a ghost from
   another world isn't a race. This is reversible if the owner asks (PR 9).

**Moves agreed with the playtest tool:** `src/app/world/detached/` and `src/gameplay/snapshot/` are
accepted, provided `pnpm check:architecture --explain` accepts the edges and the layer allowlist does
not grow. The exact edges are agreed with the playtest-tool session before PR 3.

**Security, separate from this sequence:** a small pull request changes only `firestore.rules`.
Chunk writes are allowed only for the parent replay's `ownerUid`, and the legacy `ghosts/{board}`
writes are closed. Deploying the rules is the owner's step.

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
5. **The switch silently loses a player's replays.** Caught by the browser journey on a profile
   seeded with Ghost 2 and V3 records. It checks that the one-time notice appears, that DOWNLOAD ALL
   saves a file, that leaving the notice keeps the old stores, and that only CONTINUE deletes them.
   The old-format refusal fixtures cover imported files.
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
- [ ] Every PR description answers the design check, says what players see, and passes `pnpm merge:ready`.
- [ ] A player finds every kept run in one place, Profile > REPLAYS, and every WATCH opens the same replay screen.
- [ ] `config/terminology-registry.json` has no allowlist entry for the `replay` term outside history, and `pnpm check:terminology` and `pnpm check:containment` fail on a new old replay name.

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
- 2026-11-19 The lead said go. Their six decisions are recorded, and the separate Firestore rules PR was added.
- 2026-11-19 Added the owner's two defects (the stage at each moment; the real weapon and throws) with their causes, the parity table and the live-drawing rule.
- 2026-11-20 PR 1 (`codex/replay-hidden-features`): Boss Memory, the linked-pair download, the preservation corpus and both barrels removed. Importing an existing linked file stays until PR 6. PR 4's layer shape agreed with the lead: playtest-tool's headless move lands first; the narrowest `playtest -> app/world/detached` edge; `tearbench -> app` never; the baseline only shrinks.
- 2026-11-20 PR 2 (`codex/replay-extras`): COMPARE, recorded challenges (and CAREER's CHALLENGE), the Theater's RUN DNA panel and the finale companion removed; practice from a replay stays. The Run DNA calculation and recording stay until PR 8 because CAREER reads them. REPAIR split into PR 2b because it reaches into vault maintenance and custody. A linked file still imports both members, but its companion no longer opens. The architecture baseline went from 44 to 37 edges.
- 2026-11-20 PR 2b (`codex/replay-repair`): REPAIR removed, with the repair-copy writer, `ghost-doctor.ts` and `corrupt-capsule-records.ts`. The health scan and index rebuild moved into `vault-maintenance.ts`. A damaged capsule shows CAN'T PLAY; deleting it waits for PR 6, because the Vault has no delete today.
- 2026-11-20 PR 3 (`codex/replay-snapshot`): the snapshot codecs, the snapshot contract, the codec and factory ids, the checkpoint parsers and `seed-race-contract.ts` moved to `src/gameplay/snapshot/` and `src/gameplay/run/`, as agreed with the lead and playtest-tool. The two hydrators move in PR 4. The layer allowlist went from 37 to 32 edges.
- 2026-11-20 PR 4 (`codex/replay-detached-world`): the detached world moved to `src/app/world/detached/`, its own `detached-world` layer, so the one new edge is `playtest -> detached-world`. No `tearbench -> app` or `ghost -> app` edge; the layer allowlist went from 32 to 18 edges. The remaining ghost cycle (7 files) goes with `src/ghost` in PRs 5 to 8.
- 2026-11-21 PR 5 split into 5a (record, recorder and verify over the detached world, and the round-trip check), 5b (live start parity) and 5c (the live recorder behind a lazy slot). `envelope.ts` stays with Ghost 2 until PR 8; `replay-admission`, `authoritative-receipt`, `application-frame-events` and `truth-kernel` go with their last consumer. 5a: every stream of the determinism corpus records, reads back and verifies from its seed, and each checkpoint equals the pinned determinism hash.
- 2026-11-21 PR 5b-1 (`codex/replay-live-start`): one seed type, one start record, one run start and one stage load for live play and detached worlds; the eleven start differences in the start map are closed, each named in the pull request. A run keeps the cinematics setting it started with, so changing it mid-run applies from the next run. The determinism corpus names the boss each boss stream fights, because the shared start draws Boss Rush order as live play does; every stream's play facts are unchanged and its hashes are regenerated. Tutorial gold is regenerated: its lessons' inputs, actions and final counters are unchanged, only the start state and hashes.
- 2026-11-21 PR 5c split into 5c-1 (production recorder and its store) and 5c-2 (VAULT and the Theater on the record), each on main before the next (the lead). The old third part (seed race on the record, V3 recording off, V3 recorder modules deleted) and the HUD parser move go into PR 8. Records get their own database, `tear-replays` version 1, which PR 6 builds on. 5c-1 keeps plain-start runs, campaign included (the lead: one record across stage wins, ended at a defeat, the final win or a quit); seed races are recorded but not kept until the record holds their start in PR 8. For 5c-2: V3 keeps recording until PR 8, so a V3 row is labelled "Recorded before this update" only when its recorded date is before this build, never because it is a V3 row.
- 2026-11-22 The replay clock (#402): the scheduler counts only ticks it simulates, and the live and detached hosts share one padded contact test. 5c-2 (`codex/replay-viewer`): WATCH opens a kept run on the replay screen, re-simulated; Ghost 2 keeps only its stage fix; VAULT listing moves to PR 8; status timers enter the hash after 5c-2 (the lead).
- 2026-11-23 Plan and guards (`codex/replay-plan-guards`): the lead's 2026-11-22 decision (one name, one list, one player, one store) and the new order, with One Replays before PR 6 and a "Players see:" line for every step; the quality bar; the `replay` term in the terminology registry with file-by-file allowlists that expire at the step removing each name; vault, theater, capsule, passport, v2 and v3 in containment with today's counts; the one-name rules in `AGENTS.md` and `docs/ENGINEERING_STANDARD.md`.
- 2026-11-23 The store (`codex/replay-store`, PR 6): the encoding changes inside `tear-replays` (gzip, about 12 times smaller as the caps count it), the caps go to 300 records and 25 MB, and the list says what the caps dropped. Two parts of PR 6 as first written wait: (1) the V3 vault modules in the table below (`capsule-vault.ts`, its backend, reader, protection, import plan, cold restore, archives and maintenance) are each still reached from V3 recording, the Theater or the feed's capsule path, so they leave with V3 in PR 8 rather than being renamed into the store first; (2) no storage port: the store takes an `IDBFactory`, tests give it a hand fake, and a second storage would be the first reason to add one. The file format (DOWNLOAD and IMPORT) stays plain JSON.
- 2026-11-23 Status timers (`codex/replay-status-timers`, ruleset v25): statuses are what something else put on an actor and that its position, speed and health do not show (enemies: bleed, burn, mark, slow, stun, shield, seam, break, drive, bound, sever, rooted; the player: i-frames, shield, root, slow, void slow, hazard). Moves, cooldowns and other inner timers of an actor's own behaviour stay out: they show in what it does within ticks. A status is one name in its actor's list, and the enemy rows have one projection for live and replay.
- 2026-11-23 Cinematic skip (`codex/replay-cinematic-skip`): the step-4 divergence was the test hooks' skip, which asked the director directly and so was in no record. The hooks skip with a held confirm, like a player; a rule test lists every scene change outside the director and how its record holds it, and only engineering tools may ask the director to skip.
- 2026-11-23 PR 7 split into 7a (the seek cache, `codex/replay-watch`) and 7b (`watch.ts`, the replay screen and frame merges, `browser-replay-matches-live`, the renderer-import rule). 7a builds checkpoints in memory while watching instead of capturing them during live play and storing them beside the record: a kept run re-simulates to the end in a few seconds, so a stored cache would cost store space and a build-tag rule for little gain. A stored or worker-built cache comes back only if long runs make the first pass too slow.
- 2026-11-23 Summary time (`codex/replay-summary-time`), from the lead after One Replays: the two faults found taking its pictures go before the status timers, summary time first. `summary.time` is seconds to the millisecond, written by the live run end and by verify through the same two functions; the dropped browser round trip comes back over a kept live run.
