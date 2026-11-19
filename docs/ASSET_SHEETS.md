# Asset reference sheets

`pnpm assets:sheets` draws everything the game draws into reference pictures: the player, each weapon, every
enemy and variant, every boss in each phase, stage objects, platforms and projectiles. People and agents use
them to look at the game's art without playing it, as references for art work, and as before pictures when a
design changes.

Tear has no sprite files. Everything is drawn by code, so the sheets are made by running the game and recording
what it draws. They cannot drift from the game, because nothing in the tool draws an asset itself.

## Running it

```
pnpm assets:sheets                        draw what changed since the last run (everything, the first time)
pnpm assets:sheets --all                  draw everything again
pnpm assets:sheets --only bosses          scenes whose id starts with this (bosses/rootbound, enemies/charger ...)
pnpm assets:sheets --watch                keep running; redraw what each edit changes
pnpm assets:sheets --list                 list every scene and whether its pictures are up to date
pnpm assets:sheets --verify               draw the chosen scenes twice and fail if any byte differs
pnpm assets:sheets --out <folder>         write somewhere else (must be outside the repository)
```

No build is needed. The command serves the repository with Vite and drives one page in headless Chrome, so it
needs Chrome or Playwright's Chromium. Output goes to the folder `asset-sheets` beside the main checkout, so
every worktree writes to the same place. Nothing is written into the repository and the pictures are never
committed. A first run of everything takes several minutes; a run after an edit takes seconds to a minute.

## What you get

```
asset-sheets/
  index.html                          every picture, grouped, with names, source files and states
  index.json                          the same as data (format tear-asset-sheets.v3)
  <category>/overview.png             every state of the category on one labelled 1x sheet
  <category>/<id>/sheet.svg           every state of one asset at true size, labelled
  <category>/<id>/<state>.svg         vector, sharp at any size
  <category>/<id>/<state>.png         1x, one pixel per game unit
  <category>/<id>/<state>@3x.png      drawn at 3x, not enlarged
```

`<id>` is the asset's id in the manifest (see "The manifest"), for example `bosses/boss_rootbound/`.

Categories: `player`, `weapons`, `enemies`, `bosses`, `stage-objects`, `platforms`, `projectiles`.
No picture has a background: no stage, no sky, no ground fill, and the sheets neither. 1x is the game's own
1600 by 900 view.

`index.json` lists for each asset its name, source files and states, and for each state its scene, tick, world
rectangle and files. A state whose SVG had to approximate something the canvas draws lists that under
`svgApproximations`. It also records each scene's fingerprint (see "Drawing only what changed").

The game has no pickups (rewards are menu cards) and no icon set (HUD and menu symbols are text), so there are
no sheets for them. The HUD is not covered yet.

## How a picture is made

Each scene is one run of the game's detached world, the same one replays use, with a fixed seed at 120 ticks a
second. A boss scene enters the fight through boss practice at the chosen phase. Practice only takes published
bosses, so an unpublished one (the White Hart today) is placed on its home stage by the same factory, placement
and encounter start, and reaches a later phase by health. An enemy scene places the enemy in front of a
stand-in player who never dies. Enemies and bosses choose moves by the player's distance, so the stand-in
takes turns standing near and far, every three seconds, and every range a move asks for comes up. Player and weapon scenes feed the player a fixed list of inputs.

A scene runs twice. The first run notes which looks are on screen at each tick: an enemy's state, a boss's
attack and its stage (tell, active, recover, punish), a stage object and its state, a kind of projectile. The
second run is identical, because the simulation is deterministic, and takes each picture part-way through the
first time that look appears. After the watched time the subject is hit once for a hurt picture, and enemies
and each boss's last phase are killed for four pictures of the death.

Frames are drawn by the game's replay frame path (`createBrowserGhostReplayPresentation` in
`src/app/replay/browser-ghost-replay-presentation.ts`) with layers left out: never the backdrop, only the environment
layer for a stage object, and so on. The picture is cropped to what was drawn.

The PNGs are drawn on a canvas. The SVGs are drawn by the same game code into a recording drawing context
(`scripts/asset-sheets/page/svg-context.ts`) that writes each canvas call as SVG: paths, arcs, transforms,
clips, gradients, shadows, alpha and the additive blend. It throws on any canvas call it does not know, so a new
drawing feature fails loudly instead of going missing.

No state is set by hand, so a pose the game cannot reach cannot appear. The cost is that a state a scene's run
never visits has no picture. For the Rootbound, whose moves are data, a run fails if any move of any phase was
not photographed. The other bosses keep their states in code, so their sheets show what one 40-second run per
phase visited; `index.json` says so.

A picture is cropped to everything its layers drew, so a look that draws across the arena (a Bloom Well's light,
a ranged enemy's aim line, a blade's trail) gives a wide picture. That is what the game draws, not a fault of
the crop.

## Drawing only what changed

Every scene names the files that draw its subject. Its fingerprint is a hash of those files and everything
they import, the stage objects and projectiles the scene photographed last time, the tool itself and the
scene's definition. A run draws only the scenes whose fingerprint changed and keeps every other picture from
the last run; a scene that left the catalogue has its pictures removed. So after changing an enemy's drawing
code, `pnpm assets:sheets` redraws that enemy (and anything else that imports the changed file) and nothing
else. `--watch` does the same on every save, which suits working on a design with the sheet open.

When two scenes show the same state of an asset (a boss's phase 1 scene that reaches phase 2), the scene
earlier in the manifest keeps it, so a partial run keeps the same pictures as a full one.

A scene that fails is reported and left out; the run goes on, and the next run tries it again.

## The manifest

`config/asset-manifest.json` lists every asset the game draws, one row each. It is the one asset contract:
the sheets write `<category>/<id>/`, and Shards items name their art by the same ids.

```json
{ "id": "enemy_rootbinder", "category": "enemies", "subject": "rootbinder",
  "sources": ["src/presentation/environment/rootbinder-presentation.ts"], "allies": ["charger", "charger"] }
```

- `id`: the asset id, matching `idPattern` (`^[a-z0-9_]{1,64}$`, the Shards id format) and unique across the
  manifest. An enemy's variants get derived ids (`enemy_charger_briar_stalker`) and need no row.
- `category`: one of the manifest's `categories`. A category names its stager (how its scenes are staged), the
  seconds a scene watches, its default drawing files and a sentence for the index. A category whose stager is
  `null` (stage objects, projectiles) has no scenes; its assets are pictured when another scene shows them.
- `subject`: the registry entry the row draws (enemy id, boss id, weapon id, stage id, stage object kind,
  projectile family).
- Optional: `sources` (drawing files added to the category's), `name` (when the registry has no display
  name), `allies` (enemies placed beside a support so its link shows), `seconds`, `budget`.

`scripts/asset-sheets/manifest.ts` reads and validates it. Each category has a registry there, and the validator
reports, row by row: a registry entry with no row, a row that draws nothing the game has, a repeated or
malformed id, an unknown category, stager or ally, and a bad budget. The command refuses to start on any of
them, and `tests/unit/asset-sheets.test.ts` fails on them.

`budget` holds the largest SVG, 1x PNG and 3x PNG a picture may be, and the largest the whole output may be; a
row can raise or lower its own. After writing, the command checks every file against its budget, that every PNG
is RGBA, and that the output is within the total, and fails the run on any breach. The page also refuses a
picture with no transparent pixel, which is what a drawn background looks like. A run prints what it measured,
and `index.json` keeps it under `bytes`.

## Adding something

- **The next enemy, boss, weapon, stage, stage object kind or projectile family**: one row. Until it has one,
  the validator names it. A new variant needs nothing.
- **A changed design**: nothing. The next run sees the changed drawing code and redraws that asset.
- **A new kind of thing**, for example Shards cosmetics once they are drawn in game: a category row, its
  registry line in `manifest.ts`, and a stager in `page/stagers.ts` with its kind in `STAGER_KINDS` (for a
  cosmetic, the player wearing the item; the header of `stagers.ts` describes a stager). Then one row per
  cosmetic, whose id is the one its Shards item names.

## Same commit, same bytes

Seeds are fixed and the page owns every clock, so two runs of one commit on one machine give the same bytes.
`--verify` checks that. Chrome draws every canvas on the CPU (`--disable-gpu`): otherwise, late in a long run,
it moves large canvases between the GPU and software drawing, which anti-alias differently. Different machines
or Chrome versions can differ in anti-aliasing and in the label text on the overview sheets.

## Files

| File | What it is |
| --- | --- |
| `config/asset-manifest.json` | Every asset, one row each; categories and budgets |
| `scripts/asset-sheets/manifest.ts` | Reads and validates the manifest; turns its rows into scenes |
| `scripts/asset-sheets.mjs` | The command: starts Vite and Chrome, picks scenes, writes pictures, sheets and the index |
| `scripts/asset-sheets/fingerprint.mjs` | The fingerprint of each scene's drawing code |
| `scripts/asset-sheets/output.mjs` | Merging with the last run, the per-asset sheets, the index, the budget check |
| `scripts/asset-sheets/page/` | The page: stagers, capture, the SVG drawing context, the overview sheet |
| `tests/unit/asset-sheets.test.ts` | The manifest against the registries, and the validator |
| `tests/unit/asset-sheets-svg.test.ts` | The SVG drawing context |
