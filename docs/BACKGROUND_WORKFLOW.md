# Background workflow

How a biome gets its background. The game draws every stage background itself,
at load, from a stage art recipe: data that names a key light, an atmosphere,
colour ramps and layers of shared strokes. No image file ships for a stage. One
painter, one scene library and one renderer serve every biome; adding a biome's
background means adding a recipe and one registry line, never renderer code.

Verdant Sanctum is the first drawn stage
(`src/presentation/stage-art/recipes/verdant-sanctum.ts`). A stage without a
recipe keeps its procedural backdrop.

## Rules for every biome

1. **A reference illustration is a target, never an asset.** The owner's
   illustration says what the stage should look like. The recipe is written to
   match it; the illustration itself is not shipped, traced or loaded.
2. **Platforms are a game layer.** The stage's platform material draws every
   platform and the floor from the real collision geometry, above the
   background and below actors, in every state (stable, stressed, warning,
   broken, reforming). The recipe only supplies that material's surface strip
   and the contact shadows. Collision can change without repainting anything.
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
| `src/presentation/stage-art/recipes/<stage>.ts` | A stage's recipe. |
| `src/presentation/stage-art/painted-stage.ts` | Binds a recipe to the stage's own paper and platform material. |
| `src/presentation/scenes/scene-registry.ts` | `stageId -> lazy loader`. One line per drawn stage. |
| `src/presentation/scenes/scene-library.ts` | When a stage paints, the fade-in, the fallback to the procedural backdrop, release of stages a run has left, the surface texture for any platform material. |
| `src/presentation/stage-art/stage-art-live.ts` | Turns a recipe's water and motes into the tables drawn each frame; all their randomness is spent here, from the entry's seed. |
| `src/presentation/scenes/scene-renderer.ts` | Draws the layers with parallax, the platform texture and contact shadows. |
| `src/presentation/scenes/scene-live.ts` | Draws what moves over its layer each frame: water, motes, and parts that sway or breathe. |
| `src/presentation/scenes/scene-contract.ts` | The scene layout the renderer composes, and the camera maths (parallax, overscan, coverage). |
| `src/presentation/platform-materials/` | The platform materials; each takes a `SurfaceTexture` from the painted stage. |
| `config/scene-viewports.json` | Every screen shape a covering layer must fill. |
| `config/stage-readability.json` | The readability zones and floors, the moments at which a moving stage is measured and the ceilings on how much it may move, and each drawn stage with the browser check that measures it. |
| `tests/unit/stage-art.test.ts`, `stage-live.test.ts`, `scene-library.test.ts`, `scene-contract.test.ts` | Recipe, painter, live list, library and camera tests. |

## The recipe

| Field | Meaning |
| --- | --- |
| `stageId`, `seed` | The stage, and the seed all of the recipe's randomness comes from. The same recipe and seed always paint the same pixels. |
| `camera` | The camera range the art must survive: `playerShift`, `zoomMin`, `zoomMax`, `shake`. |
| `light`, `atmosphere` | The key light (position, reach, colours) and the haze colour and warmth; a stroke's `haze` is its depth into that atmosphere. |
| `ramps` | Named colour ramps, dark to light. Strokes name a ramp; they never carry their own colours for form. |
| `layers` | `{ id, depth, plane, scale, area?, strokes }`. Depth 1 moves with the world, below 1 is further away. `back` draws under platforms, `front` over them. A layer without `area` covers the camera at every required screen shape; the painter sizes it. `scale` is canvas pixels per world unit, at most 1. |
| `live` | Optional. What moves, as a list (next section). |
| `surface` | The platform surface strip (lit edge at the top, repeated along x), the fill below it and the contact shadow. |
| `edge` | Colour past a covering layer's edge at very wide screens. |

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
- The painter and each recipe are separate lazily imported chunks, so stage art
  adds nothing to the startup scripts.
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
- The scene's paper is the stage's own background colour and its platform
  material is the stage's own.
- Readability, in the built game: with the stage at rest (backdrop, platform
  shadows, platforms, front plane; no actors, no interface) the stage's ink
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

1. **Reference (owner).** One approved illustration of the stage without
   platforms, actors or interface. It stays outside the repository.
2. **Recipe.** Add `src/presentation/stage-art/recipes/<stage>.ts`: the camera
   range from the stage's real camera, the light, the atmosphere, ramps taken
   from the reference, then layers from far to near. Reuse stroke kinds; add a
   new kind (contract, one routine, one case in the painter, its cost in the
   validator) only for a form no existing kind can draw. Add a `live` list
   for what moves once the still picture is approved.
3. **Register.** One line in `scene-registry.ts`, and the stage with its
   browser check in `config/stage-readability.json`.
4. **Readability.** Run the stage's browser check on a test build
   (`pnpm build:test:standalone`). Below a floor, change values in the recipe
   (haze, ramp choice, where dark forms sit); never lower a floor.
5. **Compare (owner).** Show the owner the drawn stage beside the reference at
   desktop size, with the value structure of both. The owner's eye decides.
6. **Measure.** Bake time at full and low graphics and at reduced CPU speed,
   and the frame-time scenarios, in the pull request.

## History

Verdant Sanctum first shipped as an image package: the owner's painting cut
into AVIF layers by a `pnpm scene` command, with a manifest format, encoded and
decoded size budgets, and readability shading drawn over the untouched
painting. The owner asked for the stage to be drawn like every other stage
instead, so the game now paints it from a recipe, and the image format, its
command, its budgets and its checks were removed.
