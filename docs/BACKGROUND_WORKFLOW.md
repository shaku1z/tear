# Background workflow

How to give any biome a painted background: what the source painting must be,
the package format, the `pnpm scene` command, what is checked automatically
and the order of work. One loader and renderer serve every biome. Adding a
biome's background means adding a package directory and one registry line;
everything specific to a biome is data in its package, never renderer code.

Verdant Sanctum is the worked example at the end. A placeholder package for the
Pale Traverse (a test fixture, never shipped) runs through the same command,
loader and checks to keep that true.

## Rules for every biome

1. **Source paintings are platform-free.** Scenery only: no platforms, no
   gameplay floor, no rings, actors or HUD.
2. **Platforms are a game layer.** The stage's platform material draws every
   platform and the floor from the real collision geometry, above the
   background and below actors, in every state (stable, stressed, warning,
   broken, reforming). A package only binds that material's surface texture and
   the contact shadows. Collision can change without repainting anything.
3. **The painting stays untouched.** Readability shading (bands and pools of
   colour) is package data, never written into the image files, so the owner
   can always compare against the original. At load the game shades its
   decoded copy of the covering layer at the same depth once, so shading costs
   nothing per frame.
4. **The stage keeps its own ink.** `theme.paper` is the stage's own background
   colour, so the HUD, the player and enemies keep the colours they have on that
   stage without art. A painting never turns a stage into the inverted look
   only the void stage uses.
5. **Scenery must not look standable.** A painted ledge, arch top or root near
   a real platform is pushed back with a shading pool and listed for the owner.
6. **No outlines, halos, shadows or plates on HUD text or actors.** Contrast
   comes from the background's values.

## What a source painting must meet

Give this brief to the artist or image tool, with the stage's platform layout
overlaid. It applies to every biome, including the Pale Traverse and any new
one. The figures assume dark ink, which every stage but the void uses.

- **Size.** 16:9, at least 2560 px wide (3200 px preferred, so 1440p and 4K
  screens are not upscaled). An extension to about 1.5x the width and 1.4x the
  height for wide and tall screens, by the same hand.
- **Platform-free.** No platforms, floor bank, rings, actors or text. Nothing
  that reads as a walkable ledge within 120 px (at 1600 px width) of a platform
  position.
- **Where bright and dark areas may fall.** In the HUD rows (the top 15% of the
  frame, across the centre third for the wave title and the left quarter for
  the status block): no deep shadow, dark trunks or night sky. Main light
  sources (sun, moon, sky openings) sit high and to one side, outside the HUD
  rows, and away from platform positions.
- **Value range, HUD band.** Relative luminance at least 0.2 (sRGB about 48%
  grey or lighter) behind the HUD rows.
- **Value range, play band** (15% to 89% of the height). The 10th percentile
  of relative luminance at least 0.11, which gives 3:1 against dark ink. Dark
  silhouettes are fine at the frame edges.
- **Below the floor.** The floor surface sits at 89% of the height; the game
  floor hides everything below it, so detail there is wasted.

A painting that misses these can still ship with shading. It then needs more
shading, and the shading softens the painting.

## Where things live

| Path | What |
| --- | --- |
| `src/presentation/scenes/scene-contract.ts` | The format (`ScenePackage`), its validator, camera and coverage maths. Self-contained so the command can load it. |
| `src/presentation/scenes/scene-renderer.ts` | Draws layers, shading, the platform texture and contact shadows; bakes shading at load. |
| `src/presentation/scenes/scene-library.ts` | Lazy loading, validation, fade-in, fallback to the procedural backdrop, release of stages a run has left, the surface texture for any platform material. |
| `src/presentation/scenes/scene-bitmap.ts` | Fetch and decode, then one copy into a canvas (see Runtime). |
| `src/presentation/scenes/scene-registry.ts` | `stageId -> () => import(package)`. One line per shipped package. |
| `src/presentation/platform-materials/` | The platform materials; each takes a `SurfaceTexture` from the package. |
| `src/presentation/assets/scenes/<stage>/` | A shipped package: `recipe.json` (how to build it) and the generated `scene.json`, `scene.ts` and AVIF images. |
| `tests/fixtures/scene-packages/<stage>/` | A package that never ships, built and checked exactly like a shipped one. |
| `scripts/scene.mjs`, `scripts/scene/` | The `pnpm scene` command. |
| `config/scene-budgets.json` | Each release build's share for all its scene art (see Size rule). |
| `tests/unit/scene-*.test.ts` | Format, library and per-package tests; `scene-packages.test.ts` checks every package present. |

Source images are not in the repository. They live in a sources folder
(`C:\Users\realm\Desktop\game\Tear-scene-sources\<stage>\` by default) and
`recipe.json` pins each by SHA-256; a build refuses a file whose hash differs.
A generated source has no file: its generator settings are pinned instead.

## The package

`scene.json` (format `tear-scene-package`, version 1):

| Field | Meaning |
| --- | --- |
| `world` | The logical arena (1600x900, floor surface at y 800). Must equal the game's. |
| `camera` | The camera range the art must survive: `playerShift`, `zoomMin`, `zoomMax`, `shake`. |
| `layers` | `{ id, image, rect, depth, plane, opacity, covers }`. `rect` in world px; depth 1 moves with the world, below 1 is further away. `back` draws under platforms, `front` over them but never above the floor surface. One back layer must `covers` the screen. |
| `shading` | `{ id, kind, rect, depth, color, opacity, feather }`. A `band` is solid from its top and fades over its last `feather` px (behind the HUD row); a `pool` is a soft ellipse (a local wash). A shade at the depth of a covering back layer is applied to that layer's decoded copy at load; any other shade draws each frame. |
| `motion` | What moves, as data; see Motion. Optional: a package without it is a still painting. |
| `platforms` | `{ material, texture, scale, fill, shadow }`. `material` must equal the stage's `platformMaterialId`. `texture` is a surface strip (lit edge at the top) anchored to each surface top and repeated along x from world x = 0; `fill` covers the floor below it. `shadow` is the soft shade each standing platform casts on the background. |
| `edge` | Colour past a covering layer's edge at very wide screens, and its feather. |
| `theme.paper` | The colour the HUD and actors take their ink from: the stage's own `bg` from `src/gameplay/stages.ts`. |
| `sources`, `images` | Provenance (origin, licence, SHA-256; tool and exact prompt for image-tool output) and each image's size, bytes, SHA-256 and sources. |
| `encodedBudget` | Bytes the package's image files may total (see Size rule). |
| `decodedBudget` | Decoded bytes (width x height x 4, summed) the package may use, counting the canvas each moving part is redrawn into. An image is at most 4096 px per edge. |

### Motion

Everything that moves is an entry in `motion`, drawn by the shared renderer
from that entry alone. Nothing in the renderer names a stage, so a second biome
gets the same motion by writing the same data.

| Kind | Fields | What it draws |
| --- | --- | --- |
| `water` | `layer`, `mask`, `rect`, `rows`, `far`, `slide`, `swell`, `waves`, `period`, `glints { count, color, opacity, length, drift }` | The paint of `layer` under `mask` is redrawn in `rows` horizontal rows. Each row is read from a little to the side (`slide`, world px at the near edge) and from a slightly taller or shorter band (`swell`), on two wave trains running opposite ways, so the painted surface and the reflections painted in it ripple. Rows are thin and move little at the far edge and grow towards the near edge by `far` (far size as a share of near size), which is what makes the motion follow the painted perspective. `waves` is the number of crests between the far and near edge and `period` the seconds one takes to pass. `glints` are short bright strokes that fade in and out and drift. |

- **The mask.** `mask` names a package image whose alpha is 1 on water and 0 on
  anything standing in it. Paint outside the mask never moves, so an arch in
  the pool stays still while its reflection ripples. The recipe cuts the mask
  from a pinned source and stores it at a quarter of the painting's size; the
  build sets `rect` to the area it was cut from.
- **Cost.** A moving part is redrawn into its own canvas 30 times a second and
  that canvas is drawn over its layer every frame, so a frame pays for one
  image draw. The canvas is the size of the paint it moves and counts against
  `decodedBudget`.
- **Reduced motion and low graphics** both show the still painting: no moving
  part is drawn or redrawn.
- **Time** is the game's simulation clock, so water stops when the game is
  paused and slows with it.

### Runtime

- A package loads only when a run needs it: one wave before the run reaches the
  stage (during the boss of the stage before, in the campaign), or when the
  world first shows the stage if it got there another way. Nothing loads before
  the first frame, from a menu, or for a stage the run has not come near. The
  menu's moving background draws every stage in turn and never fetches art; it
  keeps the procedural look. Only `show` (the world is drawing the stage) and
  `prefetch` (the run reaches it next) in the scene library start a download,
  and `pnpm check:load-budgets` measures what a new player downloads before
  playing, on both release builds.
- Until a package has decoded, or if it fails (a browser without AVIF, a failed
  download), the procedural backdrop draws as before. The painting fades in
  over 0.6 s (instantly with reduced motion).
- Decoded layers stay for two stages at most: the one on screen and the next.
  When a run moves to another biome the stage it left is released, and the main
  menu releases everything. Pausing into settings does not, so a run never
  returns to a coded background.
- Each image is decoded, then copied into a canvas once. Chrome keeps a bitmap
  decoded from a file off the GPU and re-uploads it on every frame that draws
  it. On Verdant that cost about 50 ms a frame; with the copy, Verdant measures
  the same as without art.
- Layers draw with default image smoothing. "High" smoothing cost a frame or
  more per large layer for no visible gain at the game's scale.

## Size rule

Every package meets this rule and the checks enforce it, so a new biome cannot
grow a release build or its memory use unnoticed. The limits were sized from
Verdant Sanctum with modest headroom.

| Rule | Limit | Checked by |
| --- | --- | --- |
| Format | AVIF only, quality 62, full-resolution colour. No second copy in another format; a browser that cannot decode AVIF keeps the stage's coded background. | The format (file names), `pnpm scene build` |
| Encoded size of one scene | The package's `encodedBudget`, at most 600,000 bytes (Verdant: 539,325). | The format |
| Decoded size of one scene | The package's `decodedBudget`, at most 24 MiB (Verdant: 21.65 MiB). | The format |
| All scene art in one release build | The build's share in `config/scene-budgets.json`: 3,000,000 bytes for each build. | `pnpm scene validate`, the unit tests, every build (`scripts/build-target.mjs`) |
| Resolution | At most 2.5 image pixels per world unit, the most the game's canvas can show. | The format |
| No unused alpha | An image stores an alpha plane only if some pixel is see-through. Colour under fully transparent pixels is cleared. | `pnpm scene build`, `pnpm scene validate` |
| Flat or soft layers | A layer of 16 KiB or more that is 0.985 alike to its own half-size copy must be stored at half size (a `resize` step) or drawn in code. Haze, washes and gradients are `shading` entries, drawn by code, never pixels. | `pnpm scene validate` |
| Nothing painted twice | Paint that nearer layers cover for every camera the package allows is never seen. The build softens it to a blur, which costs almost nothing to store. | `pnpm scene build`, `pnpm scene validate` |
| When it loads | Never before the first run starts, never from a menu: one wave before the run reaches the stage, with the coded background showing until the painting has decoded. Scene art adds 0 bytes to what a new player downloads before playing. | `pnpm check:load-budgets`, `tests/unit/scene-library.test.ts` |
| Memory | Decoded layers are held for the stage on screen and the next one only, and released on the main menu. | `tests/unit/scene-library.test.ts` |

`pnpm scene validate` prints each figure next to its limit. Raising a limit or a
build's share is a reviewed decision, not a fix for a failing check: first lower
the bytes (fewer or smaller layers, more shading in code).

**Quality.** Quality 62 measured the same against the lossless Verdant layers as
the earlier WebP at quality 84 (structural similarity 0.976) at 73% of the bytes.
A recipe output may set its own `quality`. Before lowering it, show the owner
side-by-side crops of the lossless layer and the candidate at game resolution
and at 2x; a quality the owner can tell from the source is too low.

**What the storefronts measure.** CrazyGames limits the initial download to
50 MB, and to 20 MB for the mobile homepage, measured from the start of loading
to the first gameplay-start event when its SDK is integrated (Tear integrates
it); the whole package may be 250 MB and 1,500 files
([technical requirements](https://docs.crazygames.com/requirements/technical/),
[requirements overview](https://docs.crazygames.com/requirements/intro/), read
2026-11-16). A painting fetched when its stage nears is outside the initial
download, which is why scene art must never load earlier.

## `pnpm scene`

| Command | What it does |
| --- | --- |
| `pnpm scene list` | Every package, shipped and fixture, and whether it validates. |
| `pnpm scene validate [stage]` | Manifest, files, hashes, registry line (shipped packages), the size rule (each figure next to its limit, and each release build's share) and coverage of every required screen shape. Exit 1 on a problem. |
| `pnpm scene coverage [stage]` | Coverage of each covering layer under the full camera range, with the shortfall per side. |
| `pnpm scene build <stage> [--sources <dir>]` | Runs `recipe.json`: checks source hashes, softens paint no camera can show, encodes every image as AVIF, writes `scene.json` and `scene.ts`, then validates. A recipe of generated sources needs no `--sources`. |
| `pnpm scene contrast <stage> [--platforms ...] [--with v.json] [--out dir]` | WCAG contrast at rest of the theme ink, both inks, enemy red and Verdant's telegraph gold over the HUD title, HUD status, HUD band and play band; `--out` writes a map of pixels below 3:1. |
| `pnpm scene sheet <stage> --out <dir> [--platforms ...] [--with v.json]` | Composite with every screen frame, the arena at rest, each image over a checkerboard, and the coverage table. |
| `pnpm scene preview <stage> --out <dir>` | Captures in the real game from `dist/test-standalone` (run `pnpm build:test:standalone` first) at every screen shape and records a looping WebP. Shipped packages only. Options: `--wave` (a wave on that stage), `--frames`, `--dpr`, `--viewports`, `--reduced`, `--low`. |

`--platforms` takes the stage's collision rectangles as `x,y,w,h;x,y,w,h`.
`--with` tries a variation without rebuilding: a JSON file with any of
`theme`, `shading` and `offset` (`[dx, dy]` for the back layers). Write `--out`
outside the repository. Required screen shapes: 16:9 (1600x900, 1280x720),
16:10, 4:3, 5:4, 21:9 (2560x1080, 3440x1440) and phone landscape (844x390,
932x419); 32:9 may fall back to the edge colour.

## Recipe steps

| Step | Purpose |
| --- | --- |
| `load` | Start from a source (a pinned file, or generated settings), optionally placed `at` an offset. |
| `mask` | Build a mask: canvas, fill, `place` another source (threshold, invert), rectangles, blur, `clipAbove`. |
| `inpaint-blur` | Fill masked areas from a normalised blur, keeping original pixels where confidence is low. |
| `alpha` | Use a mask as alpha. |
| `crop`, `crop-alpha` | Crop to a rectangle or to the alpha bounds; placement is tracked so layers stay registered. |
| `flat` | Set every pixel to one colour and keep the alpha: a mask image, whose alpha is all that is read. |
| `tileable` | Cross-fade the ends so a strip repeats horizontally. |
| `resize` | Lanczos resize; the layer keeps its world size, only pixel density changes. |

A source with `origin: "procedural"` and a `generate` entry is drawn by the
build: `{ width, height, stops: [[position 0..1, colour], ...], ridges: [{ y,
amplitude, period, phase, color }] }`, a vertical gradient with optional ridge
silhouettes. Its `sha256` pins the settings; the build prints the expected
hash when they change. There is deliberately no colour-grading step: a painting
stays as painted.

## Checked for every package

`tests/unit/scene-packages.test.ts` runs these over every package present,
shipped or fixture. Nothing in it names a biome:

- The manifest validates; files, sizes and hashes match; sources are pinned
  with provenance.
- The size rule: the scene's encoded and decoded budgets, no unused alpha, no
  oversized soft layer, nothing painted twice (`scene-size-rule.test.ts` covers
  the rule's own code and each release build's share).
- Every covering layer covers every required screen shape under the full camera
  range.
- The world equals the game's, and `platforms.material` is the stage's own
  platform material, with its texture in the package.
- `theme.paper` is the stage's own background colour (no ink inversion).
- At rest with the stage's platforms, the stage's ink reaches 3:1 on at least
  90% of the HUD title, 90% of the HUD status and 75% of the play band.
- The package loads through the game's scene library, draws its back and front
  planes, and textures a real platform of the stage.
- Every moving part names a layer and a mask the package has, lies inside its
  layer, and fits the decoded budget with its canvas counted
  (`scene-motion.test.ts` covers the drawing).
- Shipped packages are exactly the registered ones; fixtures are never
  registered.

## Making a background for a biome

Steps marked **owner** or **image tool** cannot be done by a script. Nothing in
this workflow calls a paid image service; whoever runs an image tool records
the tool and the exact prompt in the recipe's source entry.

1. **Painting (owner).** One approved painting meeting the brief above.
2. **Extension (image tool).** Input: the painting centred on a canvas about
   1.5x wider and 1.4x taller. Prompt: "Extend this painting outward in the
   same style and lighting. Keep the centre region exactly unchanged. Add only
   subordinate scenery at the edges: no new focal landmarks, no ledges or
   platforms, no characters, text or UI." Accept when the centre differs from
   the painting by less than 2/255 on average and `pnpm scene coverage` passes.
3. **Framing mask (image tool or by hand, optional).** A mask of near framing
   (trunks, hanging foliage, rock) to place at a nearer depth. Accept when the
   layers sheet shows no halo and no painted checkerboard.
4. **Surface strip (image tool).** A seamless strip in the painting's palette
   for the stage's platform material: lit edge in the top 10%, darkening
   downward, no end caps. Accept when the arena sheet shows no seam.
5. **Recipe (script).** Copy a package's `recipe.json` as a start, pin the
   files, describe each output, set `theme.paper` to the stage's `bg`, the
   platform material to the stage's own, and the camera range from the stage's
   real camera, then `pnpm scene build`.
6. **Readability (script, then owner).** `pnpm scene contrast` with the stage's
   platforms. Below the floors in "Checked for every package", add `shading`
   (try variants with `--with`), then show the owner the untouched painting and
   the shaded version side by side.
7. **Register and test (script).** Add the registry line, then `pnpm scene
   validate` and `pnpm exec vitest run tests/unit/scene-packages.test.ts
   tests/unit/scene-size-rule.test.ts`. If the package is over a limit, lower
   its bytes; do not raise the limit.
8. **In the game (script, then owner).** `pnpm build:test:standalone`, then
   `pnpm scene preview`. The owner reviews the captures and the loop.

To try the pipeline on a biome before its painting exists, build a placeholder
from generated sources under `tests/fixtures/scene-packages/` (see the Pale
Traverse fixture). It is checked like a shipped package but never ships.

## Worked example: Verdant Sanctum

- Sources: the owner's painting and its platform-free plate (lossless; the
  owner's later WebP is a lossy copy of the same image), the extension, the
  framing mask and the moss-stone strip, each with its recorded prompt.
- Layers: the far plate (depth 0.85, covering), three framing pieces (depth
  1.08) and two root corners in front of the floor.
- Platforms: `verdant-rootstone` with the moss-stone strip and contact
  shadows; the arches standing in the water sit behind a haze pool.
- Ink: dark, Verdant's own (`theme.paper` `#dff2d6`). An earlier draft used a
  dark paper, which played Verdant inverted like the void; the owner rejected
  that, and the ink rule above came from it.
- Shading: a light haze band behind the HUD row (`#e6f2df` at 0.5) and a light
  centre wash (0.35). At rest dark ink then reaches 3:1 on 100% of the HUD
  title, 98% of the HUD status and 95% of the HUD band. The play band is at 83%
  without platforms and 78% with them; the misses are the near-black framing
  trunks at the sides. Untouched, the HUD status corner reaches only 7%,
  because the painting has dark trunks there, against the brief.
- Size: 7 AVIF images, 539,325 bytes encoded, 21.65 MiB decoded. The first
  version was 910,940 bytes of WebP: AVIF at the same measured fidelity saved
  27%, and softening the 42% of the far plate that the framing trunks and roots
  always cover saved another 18%. Frame cost equal to the stage without art.

## Second package: the Pale Traverse placeholder

`tests/fixtures/scene-packages/pale-traverse/` is a generated plate in Pale's
palette (sky gradient, two snow ridges) and an ice surface strip for the
`pale-ice` material, about 2 KB. It builds without a sources folder, covers
every screen shape, passes the contrast floors with Pale's own ink and loads
through the game's scene library. It is not registered, so the game keeps
Pale's procedural backdrop until an owner-approved painting replaces it under
`src/presentation/assets/scenes/pale-traverse/`.

## History

The format replaces an earlier Verdant-only experiment (a test-build scene with
a hard-coded validator and a mesh water effect costing 5 to 8 ms per frame),
removed in the same change. Lessons carried over: inspect real alpha, not RGB;
pin sizes and hashes; budget decoded bytes; test coverage under the whole
camera range; judge motion in a normal-speed clip, not by changed pixels.
