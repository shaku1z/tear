# Background workflow

How a stage gets a painted background: the package format, the `pnpm scene`
command and the order of work. One loader and renderer serve every stage;
adding a stage's painting means adding a package directory and one registry
line, never stage-specific renderer code.

## Rules for every stage

1. **Source plates are platform-free.** The painting contains scenery only: no
   platforms, no gameplay floor, no rings, actors or HUD.
2. **Platforms are a game layer.** The stage's platform material draws every
   platform and the floor from the real collision geometry, above the
   background and below actors, in every state (stable, stressed, warning,
   broken, reforming). A package only binds that material's texture and the
   contact shadows. Collision can change without repainting anything.
3. **The painting stays untouched.** Readability shading (bands and pools of
   colour) is package data drawn at runtime over the plate, never baked into
   its pixels, so the owner can always compare against the original.
4. **Scenery must not look standable.** A painted ledge, arch top or root near
   a real platform is pushed back with a shading pool and listed for the owner.
5. **No outlines, halos, shadows or plates on HUD text or actors.** Contrast
   comes from the background's values.

## Where things live

| Path | What |
| --- | --- |
| `src/presentation/scenes/scene-contract.ts` | The format (`ScenePackage`), its validator, camera and coverage maths. Self-contained so the command can load it. |
| `src/presentation/scenes/scene-renderer.ts` | Draws layers, shading, the platform texture and contact shadows. |
| `src/presentation/scenes/scene-library.ts` | Lazy loading, validation, decoding, fade-in, fallback to the procedural backdrop. |
| `src/presentation/scenes/scene-registry.ts` | `stageId -> () => import(package)`. One line per package. |
| `src/presentation/assets/scenes/<stage>/` | One package: `recipe.json` (how to build it) and the generated `scene.json`, `scene.ts` and WebP images. |
| `scripts/scene.mjs`, `scripts/scene/` | The `pnpm scene` command. |
| `tests/unit/scene-*.test.ts` | Format, library and per-package tests; `scene-packages.test.ts` checks every committed package. |

Source images are not in the repository. They live in a sources folder
(`C:\Users\realm\Desktop\game\Tear-scene-sources\<stage>\` by default) and
`recipe.json` pins each by SHA-256; a build refuses a file whose hash differs.

## The package

`scene.json` (format `tear-scene-package`, version 1):

| Field | Meaning |
| --- | --- |
| `world` | The logical arena (1600x900, floor surface at y 800). Must equal the game's. |
| `camera` | The camera range the art must survive: `playerShift`, `zoomMin`, `zoomMax`, `shake`. |
| `layers` | `{ id, image, rect, depth, plane, opacity, covers }`. `rect` in world px; depth 1 moves with the world, below 1 is further away. `back` draws under platforms, `front` over them but never above the floor surface. One back layer must `covers` the screen. |
| `shading` | `{ id, kind, rect, depth, color, opacity, feather }`. A `band` is solid from its top and fades over its last `feather` px (behind the HUD row); a `pool` is a soft ellipse (a local wash). |
| `platforms` | `{ material, texture, scale, fill, shadow }`. `material` must equal the stage's `platformMaterialId`. `texture` is a surface strip (lit edge at the top) anchored to each surface top and repeated along x from world x = 0; `fill` covers the floor below it. `shadow` is the soft shade each standing platform casts on the background. |
| `edge` | Colour past a covering layer's edge at very wide screens, and its feather. |
| `theme.paper` | The colour the HUD and actors take their ink from: below 0.5 luminance gives light ink. |
| `sources`, `images` | Provenance (origin, licence, SHA-256; tool and exact prompt for image-tool output) and each image's size, bytes, SHA-256 and sources. |
| `decodedBudget` | Decoded bytes (width x height x 4, summed) the package may use. Files are capped at 2 MiB and 4096 px per edge. |

At runtime the package loads the first time its stage draws. Until it has
decoded, or if it fails, the procedural backdrop draws as before. The plate
fades in over 0.6 s (instantly with reduced motion).

## `pnpm scene`

| Command | What it does |
| --- | --- |
| `pnpm scene list` | Packages and whether they validate. |
| `pnpm scene validate [stage]` | Manifest, files, sizes, hashes, registry line, budgets and coverage of every required screen shape. Exit 1 on a problem. |
| `pnpm scene coverage [stage]` | Coverage of each covering layer under the full camera range, with the shortfall per side. |
| `pnpm scene build <stage> --sources <dir>` | Runs `recipe.json`: checks source hashes, regenerates images, `scene.json` and `scene.ts`, then validates. |
| `pnpm scene contrast <stage> [--platforms ...] [--with v.json] [--out dir]` | WCAG contrast at rest of the theme ink, both inks, enemy red and telegraph gold over the HUD title, HUD status, HUD band and play band; `--out` writes a map of pixels below 3:1. |
| `pnpm scene sheet <stage> --out <dir> [--platforms ...] [--with v.json]` | Composite with every screen frame, the arena at rest, each image over a checkerboard, and the coverage table. |
| `pnpm scene preview <stage> --out <dir>` | Captures in the real game from `dist/test-standalone` (run `pnpm build:test:standalone` first) at every screen shape and records a looping WebP. Options: `--wave`, `--frames`, `--dpr`, `--viewports`, `--reduced`, `--low`. |

`--platforms` takes the stage's collision rectangles as `x,y,w,h;x,y,w,h`.
`--with` tries a variation without rebuilding: a JSON file with any of
`theme`, `shading` and `offset` (`[dx, dy]` for the back layers). Write `--out`
outside the repository. Required screen shapes: 16:9 (1600x900, 1280x720),
16:10, 4:3, 5:4, 21:9 (2560x1080, 3440x1440) and phone landscape (844x390,
932x419); 32:9 may fall back to the edge colour.

## Recipe steps

| Step | Purpose |
| --- | --- |
| `load` | Start from a source, optionally placed `at` an offset. |
| `mask` | Build a mask: canvas, fill, `place` another source (threshold, invert), rectangles, blur, `clipAbove`. |
| `inpaint-blur` | Fill masked areas from a normalised blur, keeping original pixels where confidence is low. |
| `alpha` | Use a mask as alpha. |
| `crop`, `crop-alpha` | Crop to a rectangle or to the alpha bounds; placement is tracked so layers stay registered. |
| `tileable` | Cross-fade the ends so a strip repeats horizontally. |
| `resize` | Lanczos resize. |

There is deliberately no colour-grading step: the painting stays as painted.

## Making a stage background

Steps marked **owner** or **image tool** cannot be done by a script. Nothing in
this workflow calls a paid image service; whoever runs an image tool records
the tool and the exact prompt in the recipe's source entry.

1. **Painting (owner).** One approved painting at about 16:9, platform-free,
   meeting the plate brief below.
2. **Extension (image tool).** Input: the painting centred on a canvas about
   1.5x wider and 1.4x taller. Prompt: "Extend this painting outward in the
   same style and lighting. Keep the centre region exactly unchanged. Add only
   subordinate scenery at the edges: no new focal landmarks, no ledges or
   platforms, no characters, text or UI." Accept when the centre differs from
   the painting by less than 2/255 on average and `pnpm scene coverage` passes.
3. **Framing mask (image tool or by hand).** A mask of near framing (trunks,
   hanging foliage) to place at a nearer depth. Accept when the layers sheet
   shows no halo and no painted checkerboard.
4. **Surface strip (image tool).** A seamless strip in the painting's palette
   for the platform material: lit edge in the top 10%, darkening downward, no
   end caps. Accept when the arena sheet shows no seam.
5. **Recipe (script).** Pin the files, describe each output, set the camera
   range from the stage's real camera, then `pnpm scene build`.
6. **Readability (script, then owner).** `pnpm scene contrast` with the stage's
   platforms. If the theme ink falls below 3:1 on more than 10% of the HUD title
   or play band, add `shading` (try variants with `--with`), then show the owner
   the untouched painting with each ink and the shaded version side by side.
7. **Register and test (script).** Add the registry line, then `pnpm scene
   validate` and `pnpm exec vitest run tests/unit/scene-packages.test.ts`.
8. **In the game (script, then owner).** `pnpm build:test:standalone`, then
   `pnpm scene preview`. The owner reviews the captures and the loop.

### Plate brief (owner action, every biome)

Give this to the artist or image tool with the stage layout overlaid:

- 16:9, at least 2560 px wide (3200 px preferred, so 1440p and 4K screens are
  not upscaled); an extension to about 1.5x width and 1.4x height for wide and
  tall screens, by the same hand.
- No platforms, floor bank, rings, actors or text; scenery only. Nothing that
  reads as a walkable ledge within 120 px (at 1600 px width) of a platform
  position.
- **Keep the HUD rows calm:** in the top 15% of the frame, across the centre
  third (the wave title) and the left quarter (status), no sun, sky opening,
  bright mist or light shafts. Relative luminance at most 0.24 there (sRGB
  about 53% grey or darker) so light ink reaches 3:1.
- **Keep the play space mid-dark:** between 15% and 89% of the height, median
  relative luminance at most 0.12 and the 90th percentile at most 0.24.
  Bright accents (sun, water glints, blossoms) are fine in small areas away
  from platform positions.
- The floor surface sits at 89% of the height; everything below it is hidden
  by the game floor, so detail there is wasted.
- Lighting direction and the main light source should sit high and to one
  side, outside the HUD rows.

## Verdant Sanctum, the first package

- Sources: the owner's painting and its platform-free plate (lossless; the
  owner's later WebP is a lossy copy of the same image), the extension, the
  framing mask and the moss-stone strip, each with its recorded prompt.
- Layers: the far plate (depth 0.85, covering), three framing pieces (depth
  1.08) and two root corners in front of the floor.
- Platforms: `verdant-rootstone` with the moss-stone strip and contact
  shadows; the arches standing in the water sit behind a haze pool.
- Shading: a band behind the HUD row (0.6) and a light centre wash (0.22). At
  rest the light ink then reaches 3:1 on 93% of the HUD title, 100% of the HUD
  status and 81% of the play band. The painting's sun sits behind the wave
  title, which is why the band is needed; a recomposed plate meeting the brief
  above would remove it.

## History

The format replaces an earlier Verdant-only experiment (a test-build scene with
a hard-coded validator and a mesh water effect costing 5 to 8 ms per frame),
removed in the same change. Lessons carried over: inspect real alpha, not RGB;
pin sizes and hashes; budget decoded bytes; test coverage under the whole
camera range; judge motion in a normal-speed clip, not by changed pixels.
