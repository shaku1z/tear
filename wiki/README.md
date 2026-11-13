# Player wiki

The wiki at <https://wiki.tearblade.com> is built from this folder, from the same commit as the game.
There is no separate repository, no sync command and no data file to refresh: a page is wrong only if
the game or a hand-written note is wrong.

## Where each thing comes from

| What | Source |
| --- | --- |
| Stats, names, descriptions, costs, controls, arena layouts, lore | The game's exporter, `pnpm export:wiki` (`src/game-reference/wiki-data.ts`). It runs on the commit being built, so the facts cannot be older than the build. |
| Pictures of enemies and bosses | The game's own renderers, drawn in a headless browser (`wiki/media/figures.ts`). Committed in `wiki/pictures/`. |
| Arena, weapon and boss-phase pictures, and the wind-ups each boss phase shows | Captured from the game's test build by `wiki/generator/media.mjs`. Committed in `wiki/pictures/`. |
| Advice | Hand-written, in `wiki/content/notes/<route>.md` (a "Tips" box under a generated page) and `wiki/content/guides/*.md` (guide pages). |
| Old URLs | `REDIRECTS` in `wiki/generator/build.mjs`; a test checks that none shadows a page and every target exists. |

Pages are never committed. Pictures are (see below). The footer and `/version.json` name the game commit the site was built from.

## Commands

```bash
pnpm wiki:test     # a few seconds once the exporter output is cached
pnpm wiki:build    # build wiki/dist (about a second once the exporter output is cached)
pnpm wiki:dev      # build, serve on http://localhost:4321, rebuild when wiki/ changes
pnpm build:test:standalone && pnpm wiki:media   # regenerate wiki/pictures (about 30 minutes; needs Chromium)
```

The exporter output is cached in `wiki/.cache/`, keyed by the commit and by any uncommitted change
outside `wiki/`. Delete that folder to force a full rebuild. With uncommitted game
changes the footer says "with local changes".

## Staying current

- A game change that alters a name, stat, cost or description appears on the next build. Nothing to do.
- A new weapon, upgrade, enemy, boss, stage, mode, achievement or shop item: the exporter's coverage
  check (`tests/unit/wiki-data.test.ts`, and `pnpm check:game-reference` in CI) fails until the export
  includes it, and `wiki/tests` fails if the site has no page or anchor for it. The fix is in the game's
  export, not in a wiki file.
- Preview content never appears: the exporter filters by the release surface policy.
- Retired and tooling-only names from `config/terminology-registry.json` cannot appear; a test fails
  if a page shows one.
- Advice goes stale only when a note names something that no longer exists; a note whose page is gone
  fails the build.

## Pictures

The pictures are generated from the game, then committed (about 340 KB), so a deploy needs no browser
and no test build and builds in a minute or two. `wiki/pictures/manifest.json` records a hash of the game
files that can change a picture (`INPUTS` in `wiki/generator/pictures.mjs`: the renderers, entity and boss
code, stage data, world presentation, config and the capture code). `pnpm wiki:test` fails when that hash
differs: run `pnpm build:test:standalone && pnpm wiki:media` and commit `wiki/pictures`. The check compares
source, not image bytes, so it does not depend on the picture being byte-identical across machines.

Boss wind-up times are measured by the same capture, so they are as old as the pictures. When boss
telegraphs exist as data in the boss definitions, the exporter should read the lead times from there
instead (they would then need the boss id, phase, attack id and telegraph seconds).

## Page weight

HTML pages are under 120 KB each; CSS and JS under 30 KB together; the search index under 200 KB. Each
picture is under 40 KB and the whole site, pictures included, under 2 MB (`wiki/tests/wiki.test.mjs`).
Pictures are WebP, lazy-loaded, and none is used by more than one page.

## Deploying

The Worker config is `wiki/wrangler.jsonc` (Worker `tear-wiki`, preview `tear-wiki-preview`). The
manual workflow `.github/workflows/deploy-wiki.yml` builds `wiki/` from the chosen commit and publishes
it. See `wiki/ARCHIVE.md` and the pull request for what remains to be confirmed before it is enabled.
