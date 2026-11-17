# Uploading Tear to itch.io

The itch.io build is a release target like the others: its definition is in
[`config/build-targets.json`](../config/build-targets.json) (`itch`), it builds to `dist/itch` and
packages as `artifacts/packages/tear-itch.zip`. It has relative URLs, no service worker, no portal
SDK, no accounts, and keeps saves in the browser (local storage). Nothing here uploads anything:
the owner runs the push.

## Build the package

```bash
pnpm package:itch
```

This builds `dist/itch`, then `scripts/package-itch.mjs` checks the build against the target's
limits and writes the ZIP. The checks are the ones itch.io applies to an HTML5 upload: `index.html`
at the ZIP root, at most 1,000 files, paths of at most 240 characters, no file over 200 MB, no
leading `/`, no source maps or repository files, no standalone PWA files. The ZIP is deterministic
(sorted names, fixed timestamps), so the same build always gives the same bytes. The size ceiling
is the same as CrazyGames' (about 20.5 MiB), well under itch.io's 500 MB.

## Push with butler

The owner's `butler` (the one used for OFFSLCT, `.local/tools/butler/butler.exe` in that project,
already logged in) pushes a directory or ZIP to a channel. Use an HTML5 channel on the Tear project
page and the build's version as `--userversion`:

```bash
butler push dist/itch <itch-user>/<tear-project>:html5 --userversion <version> --dry-run
butler push dist/itch <itch-user>/<tear-project>:html5 --userversion <version>
```

Run the `--dry-run` first. `dist/itch` and the ZIP hold the same files; pushing the directory lets
butler send patches for later versions. If butler is not an option, upload
`artifacts/packages/tear-itch.zip` by hand on the project's Edit game page (Kind of project: HTML,
tick "This file will be played in the browser").

## One-time page settings (owner)

- Kind of project: HTML. Embed options: a viewport of 1600 x 900 (the game's logical size, 16:9),
  "Mobile friendly" on if phones should work, "Fullscreen button" on (the game's own FULLSCREEN
  control also works here; itch.io does not forbid one).
- Leave SharedArrayBuffer off: the game does not use it.
- Click-to-play is the itch.io default; leave it.

## Why this target exists

The standalone build registers a service worker and uses Firebase; neither belongs in an itch.io
iframe. The `itch` entry point (`src/entrypoints/itch.ts`) composes the game with local saves only,
and the build fails if any platform module of another target (CrazyGames, Firebase) enters the
bundle.
