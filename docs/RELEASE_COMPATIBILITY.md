# Release compatibility

What a new build promises about data that an earlier release left in a player's browser, and the
fixtures that test it. The promise comes from [RELEASE_MATRIX.md](RELEASE_MATRIX.md): "Settings
and historical saves/replays migrate". This page states exactly what that covers today.

## The promise

A build may ship only if, given the browser storage an earlier supported release wrote, it:

1. **Loads the profile with its progress.** Shards, run count, coins earned and the set of modes
   played come through unchanged, whether the profile was written as the current envelope, an
   older envelope version, or the legacy `tear_profile` key.
2. **Keeps the audio settings.** Every volume and mute value is carried over.
3. **Keeps coins earned and spent** (`tear_meta`).
4. **Keeps best scores** (`tear_best_<mode>_<difficulty>`).
5. **Lists and opens every saved local replay** (`tear_vault_index` and `tear_vault_<id>`), with
   the same authoritative tick and state hash it was saved with.
6. **Reads every Ghost capsule intact** from the `tear-ghost-v3` database: manifest, every
   chunk, and the recorded build revision. Replay admission must answer `unavailable`: the
   shipped app registers no replay runtime, so a capsule is kept and listed but cannot be
   watched. It must not answer `rejected`, and it must not fail.

Not promised today:

- **Replaying a Ghost capsule from another build.** No build registers a replay runtime for an
  earlier build revision, so such capsules are kept and listed but cannot be watched. If that
  changes, the fixture's `admission` value changes with it, in a reviewed pull request.
- **Cloud records** (Firebase, CrazyGames, shared cloud). Those have their own contract tests
  under `tests/contract/` and are never exercised against live services.
- **Downgrades.** An older build reading data written by a newer one is not supported; envelopes
  reject unsupported future versions.
- **Developer-only storage** (test-build storage isolation, debug overlays).
- **Replay records** in the `tear-replays` database (version 1, one `records` store, from replay
  PR 5c-1). Each kept run's record is stored on this device, the newest 20 up to 25 MB in all, and
  nothing is uploaded. No screen lists them yet, so nothing is promised about them; the promise to
  list and open them starts with the release that lists them (replay PR 5c-2), whose fixture adds
  the database. Clearing the site's data removes them; nothing in the game deletes them before
  replay PR 8.

## The fixtures

Each folder under `tests/fixtures/releases/` is named `<date>-<commit>` and holds:

- `storage.json`: the build's `localStorage` and IndexedDB contents after a short scripted
  session, exported from that release's own production build;
- `expected.json`: the facts the test checks, taken from that export.

| Fixture | Build | What the session did |
| --- | --- | --- |
| `2026-08-30-9e7d6a70` | Previous release: production at tearblade.com from 2026-08-30 to 2026-11-13 | Fresh profile, one Endless run on Normal, run ended; one local replay and one Ghost capsule saved. |
| `2026-11-13-84761549` | Current release: production at tearblade.com since 2026-11-13 | The same session on that build; also unlocks an achievement, so the profile carries shards and a reward receipt. |

The test is `tests/contract/release-compatibility.test.ts`. It runs every fixture folder against
the current code with in-memory storage, so it needs no browser and runs in the normal unit and
contract suites.

## Adding a release

When a build is deployed to production, add its fixture in the same pull request that records
the deploy in `config/position/production.json`:

1. Build that exact commit (`pnpm build:standalone`) in a scratch worktree.
2. Serve `dist/standalone` locally and drive one scripted session: start an Endless run, play,
   let it end, and leave the replay saved. Export `localStorage` and every IndexedDB store as
   strings (binary values as base64). The export must contain no real account or provider data:
   use a fresh browser profile, no sign-in, and external hosts blocked.
3. Save the export as `storage.json`, write `expected.json` from it, and keep the folder under
   the `tests/fixtures/` size cap in `config/size-caps.json`.

Never delete a fixture for a release that players may still have data from. If a promise has to
change, change this page and the test in the same reviewed pull request.
