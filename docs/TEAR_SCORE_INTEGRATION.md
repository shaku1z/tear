# Music in the game

Music is recorded stems, authored and built in the separate `tear-music`
repository and published into this one. The game plays them with its own Web
Audio player; there is no vendored music engine and no Tone.js.

## What ships

- `public/audio/music.json`: the one music index. It holds the station catalog,
  the routing rules (which song plays for each biome, boss and scene) and every
  cue's manifest. `tear-music` generates it; never edit it by hand.
- `public/audio/cues/<id>/`: one folder per song, holding `cue.json` (the same
  manifest), `opus/` (the web encode, 96 kb/s), `opus-crazygames/` (the
  CrazyGames encode, provisionally 64 kb/s) and an optional boss intro.
- `public/audio/stingers/`: short one-shots (boss arrival, victory, TEARING).

`scripts/audio-profile.mjs` runs during each build. The CrazyGames build moves
`opus-crazygames/` over `opus/`; every other build drops the mirror. Each build
carries exactly one encode.

## How it plays

`src/entrypoints/bootstrap.ts` installs `DeferredStemBackend`
(`src/audio/install-stem-cue.ts`) without any network request, so music never
blocks the first frame. After first paint, or when audio is first initialized if
that comes sooner, it fetches `music.json` and builds `BiomeStemBackend`. The
first menu cue starts as soon as the layers audible at its opening tier have
arrived. The remaining layers join in phase and fade in over one bar.

`BiomeStemBackend` (`src/audio/stems/`) works in three steps:

1. It routes each game snapshot to a cue with `resolveMusicRoute`.
2. It maps the snapshot to an intensity tier from 0 to 4 with `tierFromSnapshot`.
3. It crossfades layer gains with `planTierGains`, optionally adjusted by a
   `StemMixPreset`.

A boss or terminal scene with no rule of its own inherits its biome's gameplay
song. A stage with no song at all plays the index's `defaultWorkId`.

If `music.json` cannot be loaded, initialization fails and `AudioSystem` falls
back to its built-in synthesized music. It never runs two music backends or
creates a second `AudioContext`.

## Changing the music

1. Follow `docs/ADD_A_SONG.md` in `tear-music`: add or edit the song there,
   build and verify.
2. Publish it here with `node tools/music.mjs publish --game <this worktree>`.
3. In this repository, run `pnpm check:music`, the music unit tests and
   `pnpm test:browser:audio`.
4. Include the CrazyGames build size in the pull request.

`pnpm check:music` fails when any of these is true:

- a cue is missing a file;
- the index and the cue folders disagree;
- a CrazyGames mirror is incomplete;
- a cue exceeds its byte budget;
- a file is unreferenced;
- a shipped file carries a source-tool tag or a contact address.

## MUSIC covers

A stage's songs and collections on the MUSIC screen show its painting when
`src/presentation/assets/music-covers/covers.json` has a row for that stage,
and its hue bands otherwise. That manifest is the only list: it carries the
sizes, the encoding, the byte limit and, per stage, where the painting came
from. To add or replace a stage's painting:

```bash
pnpm music:cover add <stageId> <painting.png> --description "<what it shows>" --licence "<who owns it and on what terms>"
```

The tool encodes every listed size and writes the row; the painting itself
stays outside the repository. `tests/unit/music-covers.test.ts` then checks
that the files match the row byte for byte, the row names a real stage and the
total stays under the limit. No code changes for a new cover.
