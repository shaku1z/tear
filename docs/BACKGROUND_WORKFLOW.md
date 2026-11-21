# Background workflow

How a biome gets its background. The game draws every stage background itself,
at load, from a stage art recipe: data that names a key light, an atmosphere,
colour ramps and layers of shared strokes. No image file ships for a stage. One
painter, one scene library and one renderer serve every biome; adding a biome's
background means adding a recipe and one registry line, never renderer code.

Verdant Sanctum and Pale Traverse are drawn stages
(`src/presentation/stage-art/recipes/`). A stage without a recipe keeps its
procedural backdrop.

## Rules for every biome

1. **A reference illustration is a target, never an asset.** The owner's
   illustration says what the stage should look like. The recipe is written to
   match it; the illustration itself is not shipped, traced or loaded.
2. **Platforms are a game layer, the same on every stage.** `Backdrop.platform`
   draws every platform and the floor from the real collision geometry, above
   the background and below actors: a plain body in the stage's `plat` colour
   with a light top edge and a contact shadow. A drawn stage gets no platform
   look of its own, and a recipe says nothing about platforms. Collision can
   change without repainting anything.
3. **The stage keeps its own ink.** The scene's paper is the stage's own
   background colour from `src/gameplay/stages.ts`, so the HUD, the player and
   enemies keep the colours they have on that stage without art. A recipe never
   turns a stage into the inverted look only the void stage uses.
4. **Scenery must not look standable.** A drawn ledge, arch top or root near a
   real platform is pushed back with haze and listed for the owner.
5. **No outlines, halos, shadows or plates on HUD text or actors.** Contrast
   comes from the background's values, and the readability floors below hold
   it.
6. **Everything specific to a biome is recipe data.** A new kind of form is a
   new stroke kind that any recipe can use; shared code never branches on a
   stage.

## Where things live

| Path | What |
| --- | --- |
| `src/presentation/stage-art/stage-art-contract.ts` | The recipe format (`StageArtRecipe`), every stroke kind and `STAGE_ART_LIMITS`. |
| `src/presentation/stage-art/stage-art-validate.ts` | Checks a recipe before it paints: ramps exist, colours parse, numbers in range, brushwork within the limits. |
| `src/presentation/stage-art/stage-art-painter.ts` | Paints a recipe into layer canvases in short slices and returns the scene layout. |
| `src/presentation/stage-art/strokes-*.ts`, `paint-kit.ts` | One routine per stroke kind, and the brush, ramp and noise helpers they share. |
| `src/presentation/stage-art/recipes/<stage>.ts`, `recipes/index.ts` | A stage's recipe, and the list of every recipe. |
| `src/presentation/stage-art/painted-stage.ts` | Binds a recipe to the stage's own paper. |
| `src/presentation/scenes/scene-registry.ts` | The ids of the drawn stages, each with a lazy loader. |
| `src/presentation/scenes/scene-library.ts` | When a stage paints, the fade-in, the fallback to the procedural backdrop, release of stages a run has left. |
| `src/presentation/stage-art/stage-art-live.ts` | Turns a recipe's water and motes into the tables drawn each frame; all their randomness is spent here, from the entry's seed. |
| `src/presentation/scenes/scene-renderer.ts` | Draws the layers with parallax. |
| `src/presentation/scenes/scene-live.ts` | Draws what moves over its layer each frame: water, motes, and parts that sway or breathe. |
| `src/presentation/scenes/scene-contract.ts` | The scene layout the renderer composes, and the camera maths (parallax, overscan, coverage). |
| `config/scene-viewports.json` | Every screen shape a covering layer must fill. |
| `config/stage-readability.json` | The readability zones and floors, the moments at which a moving stage is measured and the ceilings on how much it may move, and each drawn stage with the browser check that measures it. |
| `tests/unit/stage-art.test.ts`, `stage-land.test.ts`, `stage-live.test.ts`, `scene-library.test.ts`, `scene-contract.test.ts` | Recipe, painter, land strokes, live list, library and camera tests. |

## The recipe

| Field | Meaning |
| --- | --- |
| `stageId`, `seed` | The stage, and the seed all of the recipe's randomness comes from. The same recipe and seed always paint the same pixels. |
| `camera` | The camera range the art must survive: `playerShift`, `zoomMin`, `zoomMax`, `shake`. |
| `light`, `atmosphere` | The key light (position, reach, colours) and the haze colour and warmth; a stroke's `haze` is its depth into that atmosphere. |
| `ramps` | Named colour ramps, dark to light. Strokes name a ramp; they never carry their own colours for form. |
| `layers` | `{ id, depth, plane, scale, area?, strokes }`. Depth 1 moves with the world, below 1 is further away. `back` draws under platforms, `front` over them. A layer without `area` covers the camera at every required screen shape; the painter sizes it. `scale` is canvas pixels per world unit, at most 1. |
| `live` | Optional. What moves, as a list (next section). |
| `edge` | Colour past a covering layer's edge at very wide screens. |

Two stroke kinds draw land and sky for any stage (`strokes-land.ts`):

| Kind | What it draws | Main fields |
| --- | --- | --- |
| `ridge` | A ridgeline filled down to a base row: a mountain range, rolling ground or a treeline. Faces turned to the key light are lighter, and each pointed summit throws one shadowed face. | `crest`, `base`, `relief`, `span`, `sharp` (0 rolling to 1 pointed), `peaks` (named summits), `teeth` (fir tips) |
| `ribbon` | A curtain of light standing on a path, such as aurora: wide faint rays and narrow bright ones, brightest just above their feet. | `path` (each point's width is the curtain's height there), `ramp` (foot to top), `alpha`, `rays` per 100 px |

A front layer may only dress the floor body and below: the painter refuses one
that reaches above the floor surface at any camera the recipe allows, so a
front layer never hides anything that stands or flies in the arena.

## What moves

A recipe's `live` list is the stage's motion. Each entry names the `layer` it
belongs to and is drawn right after that layer, in the layer's coordinates, so
it takes that layer's depth and plane. There are three kinds:

| Kind | What it does | Main fields |
| --- | --- | --- |
| `water` | Redraws the rows of its layer between `top` and `bottom` each frame, each slid a little sideways on two wave trains, and lights short glints on the row tops. Rows are thin and nearly still at the far shore and taller and looser near the viewer. Start it below anything that stands in the water, so structures hold still and their reflections ripple. | `rows`, `reach` (far, near), `period`, `glints` |
| `motes` | Small specks that drift, wobble and twinkle inside an area. | `area`, `count`, `size`, `color`, `alpha`, `drift`, `wobble`, `period` |
| `part` | Strokes painted on their own canvas (`area`, `scale`, `strokes`, optional `blend: "lighter"`), drawn with a `sway` (the canvas leans from a pivot edge in slices, with a wave that travels across it), a `breathe` (its opacity moves between `low` and 1), or both. | `sway`, `breathe` |

Rules that hold for every kind:

- **Motion is a closed form of time.** Nothing is stored between frames; the
  frame's time comes from the simulation clock, so the stage stops when the
  game pauses. All randomness is spent when the stage paints, from the entry's
  `seed`.
- **A part without `breathe` is part of the picture.** It is painted right
  after its layer, so water painted later reflects it, and it is always drawn.
  Moving a stroke out of a layer into such a part leaves the still picture as
  it was.
- **Reduced motion and low graphics show the stage at rest.** Water and motes
  are not drawn, parts are drawn unmoved, and a breathing part is drawn at its
  `low` (not at all when `low` is 0). The browser check requires the stage to
  be one unchanging picture with reduced motion on.
- **Motion stays quiet.** `STAGE_ART_LIMITS.live` bounds every entry: how many
  entries, mote count, size, opacity and speed, glint count and opacity, how
  far water rows and swaying parts move, and a shortest period of 3 s. The
  browser check then measures the result (see "Checked for every drawn stage").
  A stage that moves too much is fixed in its recipe; a ceiling is never
  raised to pass.

## Runtime

- A stage paints only when a run needs it: one wave before the run reaches the
  stage (during the boss of the stage before, in the campaign), when the setup
  screen knows the run's first stage, or when the world first shows the stage
  if it got there another way. Nothing paints before the first frame, from the
  main menu, or for a stage the run has not come near. The menu's moving
  background draws every stage in turn and never paints one; it keeps the
  procedural look. Only `show` (the world is drawing the stage) and `prefetch`
  (the run reaches it next) in the scene library start a load.
- The painter and every recipe are one lazily imported chunk, so stage art
  adds nothing to the startup scripts and a new drawn stage adds no file to
  download or precache.
- Painting is sliced: the painter hands the thread back after at most 4 ms and
  runs one slice per frame, after the frame has drawn. The diagnostics gauge
  `stageArtSlices` counts slices, and the frame-time scenarios report how many
  ran inside their measured window (`stageArtSlicesInWindow`).
- Until a stage has painted, or if its recipe is refused, the procedural
  backdrop draws as before. The painted stage fades in over 0.6 s (instantly
  with reduced motion).
- On low graphics the layer canvases are 0.6 of full size per axis.
- Painted layers stay for two stages at most: the one on screen and the next.
  When a run moves to another biome the stage it left is released, and the main
  menu releases everything. Pausing into settings does not, so a run never
  returns to a coded background.
- Layers are canvases, which stay on the GPU, and draw with default image
  smoothing.

## Limits

`STAGE_ART_LIMITS` in `stage-art-contract.ts` bounds every recipe, so no recipe
can make a bake slow or a layer huge: the number of layers, strokes per layer,
the layer scale range and an estimate of brush operations for the whole recipe.
The validator refuses a recipe over a limit before anything paints. Raising a
limit is a reviewed decision, not a fix for a refused recipe: first lower the
brushwork.

## Checked for every drawn stage

- The recipe validates within the limits; the painter is deterministic and
  yields the thread (`tests/unit/stage-art.test.ts`).
- Every covering layer covers every required screen shape under the full camera
  range. Required shapes: 16:9 (1600x900, 1280x720), 16:10, 4:3, 5:4, 21:9
  (2560x1080, 3440x1440) and phone landscape (844x390, 932x419); wider screens
  fall back to the edge colour.
- The scene's paper is the stage's own background colour.
- Readability, in the built game: with the stage at rest (backdrop, platforms,
  front plane; no actors, no interface) the stage's ink
  reaches 3:1 on at least 90% of the interface title zone, 90% of the interface
  status zone and 75% of the play band (`config/stage-readability.json`,
  measured by `tests/stage-readability.js`). A unit test requires every
  registered stage to be listed there with its browser check.
- Motion, in the same check: the floors must hold at time 0 and at each of
  `motion.times`, and at each of those moments the share of play-band pixels
  that differ from time 0 by `motion.step` or more (on a 0 to 255 colour
  channel) and the mean difference must stay under `motion.maxChangedShare`
  and `motion.maxMeanChange`. With reduced motion on, every moment must equal
  time 0 pixel for pixel.
- The live list validates within its limits, compiles the same way every time
  and draws nothing that moves when the stage is still
  (`tests/unit/stage-live.test.ts`).
- The scene library loads, releases and falls back as described under Runtime
  (`tests/unit/scene-library.test.ts`).

## Drawing a background for a biome

1. **Reference (owner).** One approved picture of the stage: an illustration
   without platforms, actors or interface, or a composition board the owner
   picked. It stays outside the repository. The references so far:
   - Verdant Sanctum: the owner's illustration (`Tear-scene-sources/verdant-sanctum`).
   - Pale Traverse: board D of round 2, "lake under the ranges", picked by the
     owner on 2026-11-21 (`pale-r2-D-lake-ranges-board.png`). The board was
     painted by this painter from the recipe that is now the stage's own.
2. **Recipe.** Add `src/presentation/stage-art/recipes/<stage>.ts`: the camera
   range from the stage's real camera, the light, the atmosphere, ramps taken
   from the reference, then layers from far to near. Reuse stroke kinds; add a
   new kind (contract, one routine, one case in the painter, its cost in the
   validator) only for a form no existing kind can draw. Add a `live` list
   for what moves once the still picture is approved.
3. **Register.** The recipe in `recipes/index.ts`, the stage id in
   `scene-registry.ts`, and the stage with its
   browser check in `config/stage-readability.json`.
4. **Readability.** Run the stage's browser check on a test build
   (`pnpm build:test:standalone`). Below a floor, change values in the recipe
   (haze, ramp choice, where dark forms sit); never lower a floor.
5. **Compare (owner).** Show the owner the drawn stage beside the reference at
   desktop size, with the value structure of both. The owner's eye decides.
6. **Measure.** Bake time at full and low graphics and at reduced CPU speed,
   and the frame-time scenarios, in the pull request.

## Where the work stands and what is next

Written 2026-11-21 so that someone with only the repository can continue.

| Stage (`src/gameplay/stages.ts`) | Background |
| --- | --- |
| `verdant-sanctum` | Drawn from a recipe, with a `live` list. Owner approved. |
| `pale-traverse` | Drawn from a recipe, with a `live` list. Owner picked the composition (board D, round 2). |
| `grounds`, `undercroft`, `crimson-fields`, `voidspire` | Procedural backdrop (`src/presentation/backdrop.ts`). Not drawn yet. |
| `tear` | The void stage. Has its own inverted look and is not part of this work. |

Next, in this order unless the owner says otherwise:

1. **Ask the owner which stage comes next, and whether the remaining stages
   get drawn backgrounds at all.** The owner said on 2026-11-21 that the other
   stages' platforms look right as they are; nothing has been decided about
   their backgrounds. Campaign order (`grounds`, `undercroft`,
   `crimson-fields`, `voidspire`) is the default.
2. **Composition boards before any pull request.** For Pale the owner had no
   illustration, so two or three candidate recipes were painted by this
   painter (`paintStageArt` with the stage's real platforms drawn on top) at
   rest, at two later moments and with reduced motion, and shown to the owner
   with the measured readability and motion figures. The owner picks one or
   asks for a mix; the pick is recorded under step 1 of "Drawing a background
   for a biome". The board harness was a scratch script and is not in the
   repository: bundle a small entry that imports the painter, a candidate
   recipe and `scene-renderer`, and run it in a headless browser.
3. **One pull request per stage**: the recipe in `recipes/`, its line in
   `recipes/index.ts`, the stage id in `scene-registry.ts`, the stage and its
   browser check in `config/stage-readability.json`, and a new stroke kind only
   for a form no existing kind draws. `ridge` (hills, ranges, treelines) and
   `ribbon` already exist for the open-sky stages.
4. **A `live` list** once the still picture is approved, measured against the
   motion ceilings.

Open points left by the work so far:

- Verdant's play band reads at 75.8% against its 75% floor since the platforms
  became plain. A change that darkens the stage is fixed in the recipe.
- `src/gameplay/training/arena-rules.ts` still names `verdant-rootstone` and
  `pale-ice` as boss arena materials. Nothing draws those names; the arenas
  take the shared arena look. The Verdant and Pale gameplay rebuilds remove
  them (`plans/active/VERDANT_PALE_REBUILD.md`).
- No road, track or field art is drawn on any stage: stage features were
  removed by the gameplay rebuild, and a biome may later get at most one.
- Frame-time scenarios have been run for Verdant only, and one Nightly
  performance run for the drawn stages is still owed.
- Phone sizes are not measured (`plans/MOBILE_LATER.md`); mobile is paused.

## History

Verdant Sanctum first shipped as an image package: the owner's painting cut
into AVIF layers by a `pnpm scene` command, with a manifest format, encoded and
decoded size budgets, and readability shading drawn over the untouched
painting. The owner asked for the stage to be drawn like every other stage
instead, so the game now paints it from a recipe, and the image format, its
command, its budgets and its checks were removed.

Verdant and Pale then had platform materials of their own (rootstone and ice)
with a painted surface strip from the recipe. The owner found them too detailed
beside every other stage, so both were removed and all stages share one
platform look.
