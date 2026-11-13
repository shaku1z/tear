# Player wiki

The wiki at <https://wiki.tearblade.com> is built from this folder, from the same commit as the game.
There is no separate repository, no sync command and no data file to refresh: a page is wrong only if
the game or a hand-written note is wrong.

## Where each thing comes from

| What | Source |
| --- | --- |
| Stats, names, descriptions, costs, controls, arena layouts, lore | The game's exporter, `pnpm export:wiki` (`src/game-reference/wiki-data.ts`). It runs on the commit being built, so the facts cannot be older than the build. |
| Pictures of enemies and bosses | The game's own renderers, drawn in a headless browser (`wiki/media/figures.ts`). |
| Arena, weapon and boss-phase pictures, and the attacks each boss phase shows | Captured from the game's test build (`pnpm build:test:standalone`) by `wiki/generator/media.mjs`. |
| Advice | Hand-written, in `wiki/content/notes/<route>.md` (a "Tips" box under a generated page) and `wiki/content/guides/*.md` (guide pages). |
| Old URLs | `REDIRECTS` in `wiki/generator/build.mjs`; a test checks that none shadows a page and every target exists. |

Nothing generated is committed. The footer and `/version.json` name the game commit the site was built from.

## Commands

```bash
pnpm wiki:test     # a few seconds once the exporter output is cached
pnpm wiki:build    # build wiki/dist without game pictures
pnpm wiki:dev      # build, serve on http://localhost:4321, rebuild when wiki/ changes
pnpm wiki:build -- --media   # also generate the pictures (needs dist/test-standalone and Chromium)
```

The exporter output and the pictures are cached in `wiki/.cache/`, keyed by the commit and by any
uncommitted change outside `wiki/`. Delete that folder to force a full rebuild. With uncommitted game
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

## Page weight

HTML pages are under 120 KB each; CSS and JS under 30 KB together; the search index under 200 KB. Each
picture is under 40 KB and the whole site, pictures included, under 2 MB (`wiki/tests/wiki.test.mjs`).
Pictures are WebP, lazy-loaded, and none is used by more than one page.

## Deploying

The Worker config is `wiki/wrangler.jsonc` (Worker `tear-wiki`, preview `tear-wiki-preview`). The
manual workflow `.github/workflows/deploy-wiki.yml` builds `wiki/` from the chosen commit and publishes
it. See `wiki/ARCHIVE.md` and the pull request for what remains to be confirmed before it is enabled.
