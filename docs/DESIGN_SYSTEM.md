# Tear Design System

## Overview

The design system is composed by `src/presentation/ui.ts` from focused modules such as `ui-foundation.ts`, `ui-ledger.ts`, `ui-menu.ts`, and `ui-chapter.ts`: a token layer (`UI.t`) plus canvas components (`UI.*`). Read [VISUAL_DESIGN_DIRECTION.md](./VISUAL_DESIGN_DIRECTION.md) first for the product-level visual and responsive contract.

## The Golden Rule

**Route repeated UI language through `UI`.** Two halves of the same rule:

- **Do not duplicate a shared component with raw canvas calls.** Screen-specific compositions may use canvas primitives, but typography must use the font tokens and repeated surfaces belong in `UI`.
- **Never hardcode a value that exists as a token.** Sizes, spacings, metrics, alphas, and colours all live in `UI.t`. Pull from there instead of typing `16`, `0.55`, or `"#000"`.

If you find yourself reaching for `ctx` to draw something new, stop and **add a component to `UI`** (see "Adding a new component" below) rather than inlining it.

## Token catalog — `UI.t`

### Type scale — `UI.t.type` (px)
Names describe **role**, not size, so screens stay consistent (every screen title is `h1`, every tagline `caption`).

The ordinary game interface preserves Tear's established **Courier New** identity. `UI.font`, `UI.text`, `UI.displayText`, `UI.title`, buttons, tabs, tags, cards, HUD labels, and the wordmark all use that core mono family; bold is hierarchy, not a family switch. **Barlow Condensed SemiBold** and **IBM Plex Mono** are explicit cinematic/chapter roles reached through `UI.displayFont` and `UI.bodyFont`. They must not silently replace the main game interface again.

| Token | px | Use |
|---|---|---|
| `wordmark` | 80 | The plain spaced "T E A R" logo only |
| `display` | 52 | Full-screen splash headers (PAUSED, VICTORY, DEFEATED, stage banner) |
| `h1` | 40 | Primary screen title (SHOP, ABILITIES, SELECT RUN, …) |
| `h2` | 30 | Secondary title / dialog heading |
| `title` | 24 | Section / card name |
| `lead` | 20 | Buttons, emphasised values |
| `body` | 16 | Standard copy (the minimum for paragraphs) |
| `label` | 15 | List rows, secondary copy |
| `caption` | 14 | Taglines, hints |
| `micro` | 13 | Tags, pips, fine print — **the legibility floor** |

**Legibility floor.** A 1280×720 window scales the 1600×900 layout by 0.8, so `micro` (13) renders at 10.4 CSS px. Nothing a player must read is drawn below `micro`; screens pass tokens, never literal sizes below it. When bigger text no longer fits, change the layout (wrap, rebalance, reduce chrome) instead of shrinking the text. On touch, the density profile (below) raises these values.

### Density — `src/presentation/ui-density.ts`

The table values are the authored (desktop) tokens. `UI.setDensity({ touch, cssPerLogicalPixel })` derives the live tokens from them with one rule for every size:

- **Desktop** keeps the authored values.
- **Touch** adds the comfortable touch bump (`micro` 16, `btnH` 60, …), then guarantees the physical floors from `src/domain/interface-accessibility.ts` at the live scale: every text role at least **11 CSS px** (`minTouchTextCssPx`) and every interactive metric (`btnH`, `chipH`, `settingsControlH`, `settingsStepperW`, `minTarget`) at least **44 CSS px** (`minTouchTargetCssPx`). Above the floor the type ramp keeps half of its authored steps, so hierarchy survives. A 1180×820 tablet resolves to the plain touch profile; an 844×390 phone (0.43 CSS px per logical px) to **compact**: `micro` 26, `btnH` 102.
- `UI.density = { touch, compact }` tells a screen which composition to use. Compact means phone landscape: fewer columns, scrolling panels, actions in the footer row. The canvas keeps its single 1600×900 logical frame; there is no zoom or crop.
- **Adoption is per screen.** The render pipeline calls `UI.useCompactLayout(ready, phoneOnly)` every frame from each screen's `density` in the screen catalog (`src/domain/screen-catalog.ts`): `"compact"`, `"phone"` or `"touch"`. Compact screens get the compact floors on every touch screen: the HUD and touch controls, pause, confirm-quit, continue, draft, reserve, tier-up, defeat and victory, the main menu, run select and settings. Phone screens (shop, codex, profile, achievements, leaderboards, the Playground menu and its ABILITIES tab) get them **only at phone density**, so a tablet keeps exactly the plain touch profile and the desktop composition there; at phone density they draw the compact page below on the wide compact sheet (`UI.density.wideSheet`). Touch screens keep the plain touch profile until their composition adopts it.

### Spacing — `UI.t.space` (px)
Vertical rhythm and paddings.

| Token | px |
|---|---|
| `xs` | 6 |
| `sm` | 10 |
| `md` | 16 |
| `lg` | 24 |
| `xl` | 40 |

### Component metrics — `UI.t.metric` (px)

| Token | px | Use |
|---|---|---|
| `btnH` | 48 | Standard button height |
| `btnW` | 300 | Standard button width |
| `btnGap` | 12 | Gap between stacked buttons |
| `panelPad` | 14 | Inner padding for panels/cards |
| `chipH` | 28 | Chip height |
| `chipW` | 96 | Chip width |
| `barH` | 14 | Progress/HP bar height |
| `focusRing` / `focusGap` | 2 / 3 | Keyboard/controller focus ring stroke and gap outside the control |
| `minTarget` | 32 | Smallest interactive control; touch raises it to the 44 CSS px floor |
| `hudBarW` / `hudPad` | 320 / 10 | HUD health bar width and HUD group padding |
| `railFadeW` / `railFadeMid` | 800 / 0.56 | Main-menu rail fade: its width from the screen's left edge for the desktop rail, and where its mid stop sits |
| `hudAbilityRows` | 4 | Abilities listed on the HUD before it collapses to "N ABILITIES · PAUSE: ARSENAL" (the full list is on the pause screen) |
| `pageTitleY` | 92 | Page title baseline (the shared page pattern) |
| `pageBodyTop` | 156 | First body y under a page header |
| `backW` | 220 | Width of the footer BACK control |

### Alpha roles — `UI.t.alpha`
Opacity for de-emphasised text and for the content surfaces. Text roles are measured on their real surface (the solid sheet and the dark rail): `muted` (secondary) stays at or above 4.5:1 and `faint` (tertiary) at or above 3:1.

| Token | value | Use |
|---|---|---|
| `full` | 1 | Primary text |
| `soft` | 0.78 | Slightly secondary (was 0.7) |
| `muted` | 0.66 | De-emphasised, still 4.5:1 or better (was 0.55) |
| `faint` | 0.52 | Hints, 3:1 or better (was 0.4) |
| `ghost` | 0.25 | Barely-there / placeholder (never for text a player must read) |
| `sheet` | 1 | Paper sheet surface, solid so scene art never shows through text (was 0.96, which let demo ledges show as faint bars) |
| `overlay` | 1 | The one scrim every run overlay sits on (pause, results, draft, reserve, tier-up, revive, quit confirm, playground menus). The frame draws it (`renderOverlayBackdrop` in `src/presentation/render-pipeline.ts`); screens never dim themselves |
| `rail` / `railMid` | 0.90 / 0.60 | Main-menu rail fade: opacity at the screen edge and at the mid stop (then clear at `railFadeW`) |
| `railControl` | 0.42 | Each dark-surface ghost control's own dark fill (rail rows, replay controls), so its label holds ≥ 4.5:1 over the open scene without a solid slab |
| `modalDim` | 0.9 | Modal dim (Rename) |

### Colour roles — `UI.t.color`
Semantic roles. `accent`, `danger`, and `unique` pull from `CONFIG.colors` so the system and the game palette never drift apart.

| Token | value | Use |
|---|---|---|
| `paper` | `"#fff"` | Background / overlay fade target |
| `muted` | `"#62646f"` | De-emphasised text / hairlines, 5.9:1 on paper (was `#9a9a9a`, 2.8:1) |
| `scrim` / `scrimInk` | `"#06070c"` / `"#f1eff9"` | Guaranteed-contrast modal pair (`UI.dim` with a light ink) |
| `rail` / `railInk` | `"#06070c"` / `"#f1eff9"` | Main-menu rail fade colour and its foreground (also every dark-surface ghost control's fill and label) |
| `disabled` | `"#bbb"` | Disabled controls |
| `accent` | from `CONFIG.colors` | Highlight / positive cue |
| `danger` | from `CONFIG.colors` | Warning / hostile cue |
| `unique` | from `CONFIG.colors` | Special / rare cue |

> The live foreground colour is **`UI.ink`** (not a `UI.t.color` entry) — see Theming.

## Component catalog — `UI.*`

Optional args are marked `?`. All draw to the passed `ctx`.

| Component | Signature | When to use |
|---|---|---|
| `UI.text` | `UI.text(ctx, str, x, y, size?, align?, alpha?)` | Body / inline copy (`size` defaults `type.body`) |
| `UI.displayText` | `UI.displayText(ctx, str, x, y, size?, align?, alpha?)` | Bold core-interface name/value with explicit alignment |
| `UI.wordmark` | `UI.wordmark(ctx, x, y, time, reducedMotion?)` | Original spaced TEAR lockup with its brief periodic blade sweep |
| `UI.title` | `UI.title(ctx, str, x, y, size?)` | Bold centred heading (`size` defaults `type.h1`) |
| `UI.tag` | `UI.tag(ctx, str, x, y, color?, align?, size?)` | Small coloured label/tag (defaults `type.micro`) |
| `UI.screenHeader` | `UI.screenHeader(ctx, title, subtitle?, y?, big?)` | Title + muted tagline at top of a screen; **returns the y below it** |
| `UI.button` | `UI.button(ctx, b, active)` | Primary action; `b:{x,y,w,h,label,enabled?,size?}`, `active` = hover\|focus\|selected |
| `UI.chip` | `UI.chip(ctx, b, on)` | Compact toggle (filter chips, segmented controls) |
| `UI.panel` | `UI.panel(ctx, x, y, w, h)` | Bordered surface |
| `UI.card` | `UI.card(ctx, x, y, w, h, hovered)` | Interactive panel with hover emphasis |
| `UI.accentStrip` | `UI.accentStrip(ctx, x, y, w, color, thick?)` | Coloured top strip (category cue) |
| `UI.divider` | `UI.divider(ctx, x, y, w, alpha?)` | Hairline separator |
| `UI.bar` | `UI.bar(ctx, x, y, w, h, frac, fill?, line?)` | Progress / HP / meter (`frac` 0–1) |
| `UI.dim` | `UI.dim(ctx, w, h, a?)` | Overlay backdrop; fades toward `paper` for dark ink and toward `scrim` for light ink, so the dim and the ink are always a contrasting pair. Run overlays get it from the frame at `alpha.overlay` |
| `UI.scrollHint` | `UI.scrollHint(ctx, x, y, canUp, canDown, align?)` | "▲ SCROLL ▼" affordance (sheet screens place it in the footer row via `pageFooter`) |
| `UI.fitText` | `UI.fitText(ctx, text, maxW, { size, floor?, maxLines?, ellipsis?, wrapFirst?, bold? })` | The one fitting rule (below); returns `{ size, lines, truncated, overflow }` |
| `UI.textBox` | `UI.textBox(ctx, text, x, y, maxW, opts?)` | Wrapped text in a box; `y` is the first baseline; **returns the height it used** so callers lay out below it |
| `UI.readable` | `UI.readable(color, ratio?)` | A palette hue darkened to 4.5:1 when drawn on paper (passes through on dark surfaces) |
| `UI.focusRing` | `UI.focusRing(ctx, box)` | Keyboard/controller focus ring outside a control (drawn by the button layer) |
| `UI.sheetFooter` | `UI.sheetFooter()` | The sheet's footer row `{ y, h, backX }`: single owner of the BACK row geometry (used by `pageLayout` and the toast) |
| `UI.keycap` | `UI.keycap(ctx, key, x, y)` | Bordered key cap sized from `type.micro`; returns its width (`UI.keycapSize(ctx, key)` measures it) |
| `UI.finalReward` | `UI.finalReward(ctx, { …, actions? })` | Campaign reward panel; with `actions: true` it reserves a footer row and returns `actionsY`, so buttons always sit inside the panel |
| `UI.emptyState` | `UI.emptyState(ctx, glyph, line, cx, cy, detail?, width?)` | Designed empty / loading / offline state; returns the y for an optional CTA |
| `UI.cursor` | `UI.cursor(ctx, x, y)` | Pointer/cursor glyph |
| `UI.pointIn` | `UI.pointIn(b, x, y)` | Hit-test: is point `(x,y)` inside box `b`? |
| `UI.font` | `UI.font(size, bold)` | Build the canvas font string (used internally; prefer the components) |

### The fitting rule (buttons, chips, tabs, text boxes)

`src/presentation/ui-text-fit.ts` holds the single rule every component uses: **measure; if too wide, step the size down to a floor (normally `micro`); then wrap to two lines where the height allows; only then ellipsize**. A navigation label (rail, hero, tabs) is never ellipsized; the layout reports the overflow instead. Prose (`textBox`) wraps first and only shrinks when its line budget is exceeded. Selected controls never grow and strokes are inset, so no state draws outside its box.

### The page pattern (sheet screens)

`screen-primitives.ts` provides `page(context, { title, subtitle?, hue?, stat? })` for the header (with an optional right-aligned stat), `clipBody(context, top, bottom, draw)` to clip content to the body, and `pageFooter(context, { back?, canScrollUp?, canScrollDown? })` for BACK centred inside the sheet's footer row with the scroll hint to its right. `pageLayout(context)` exposes `left/right/contentWidth/bodyTop/bodyBottom/footerY`. Use these instead of hard-coding title, BACK or scroll-hint positions.

### The compact page (phone landscape)

At phone density the library and shop screens and the playground menus switch to one shared composition, `createCompactPage` in `screens/compact-page.ts`, instead of shrinking their desktop layout: `header` (title at the left with its accent rule, then the screen's tabs in the same row when every label's longest word fits, otherwise in a second row; an optional right-aligned stat or view chip), `toolbar` (filter chips in as few rows as keep each label's longest word inside its chip), a body that `scroll`s by pixels through measured blocks (`section`, `prose`, `grid` rows, `empty` states, `replayRow`s, flowing `actions`), and `footer` (BACK centred, the scroll hint at the right). The page owns its scroll extent: it measures its blocks, clamps the shared scroll and writes it back through `context.setScroll`, so the app adapters leave the scroll to it at compact density. A control is enqueued only while it is fully inside the scrolled body, every control is at least `metric.minTarget` tall, and every text role comes from the live tokens, so nothing is drawn below the touch floor. `tests/unit/compact-phone-layouts.test.ts` renders each screen at 844×390 and 667×375 with the real UI and proves the floor, the targets, the safe frame, that nothing overlaps, and that every action stays reachable by scrolling.

### The overlay pattern (run overlays)

Pause, confirm-quit, continue, defeat, victory, draft, reserve and tier-up share `overlayLayout` / `overlayHeader(context, { title, subtitle?, hue?, reveal? })` and `actionRow` from `screen-primitives.ts`: a `display` title under the safe top, an accent rule, subtitle lines, a body from `bodyTop` to `bodyBottom`, and a footer action row at `footerY`. All of it derives from the live tokens and safe insets, so a title cannot clip at any density. Panels (arsenal, run progress, run log) live in `run-overlay-panels.ts` and scroll inside their rect.

Draft, reserve and tier-up keep the established card composition on desktop and tablet (`CLASSIC` in `draft-reserve-tierup.ts`): a display title at 122 with its accent rule, the instruction line(s) under it, and one centred row of tall cards (322 × 384, or 300 × 384 for four) for a draft or reserve, or rows of four 300 × 262 cards for tier-up that scroll by pixels. A card reads top to bottom: accent strip, tag (badge · category) with the key badge 1–4 at the top right whenever a keyboard or mouse owns input, the name fitted to width, an accent rule, tier pips, a centred description that wraps inside the card at the live body (or label) size, then the confirmation hint and ownership. Cards deal in from below and lift and scale on hover. A single tier-up row grows taller when the live type needs it, so no description is cut. Only the compact density (a phone in landscape) switches to the overlay pattern above, with a deck sized from its copy.

### HUD and in-run surfaces

- HUD groups anchor to the **visible screen rectangle plus safe insets** (`hudFrame`), not to the 16:9 frame, so ultrawide and 4:3 windows keep the HUD in the corners. Vitals sit top-left, wave and stats top-centre, the multiplier in a fixed slot under them, the boss header under that (`bossHudTop`), with the boss phase banner below the header.
- The HUD never reads smaller than it does in a 1280×720 window (`minDesktopHudTextCssPx`, the authored `micro` at 0.8 scale): in a smaller desktop window such as 1024×768 `hudType` lifts the whole HUD ramp (vitals, run group, boss header, banners, the lesson card and playground help) by one factor; at 1280×720 and above, and on touch, it is the live ramp unchanged.
- The HUD is **plain text directly on the scene**: no backing plate, box, outline, halo or shadow behind it. Legibility comes from the per-biome ink alone (`UI.ink`, set each frame from the stage background's luminance: near-black on the light biomes, light on the dark Tear stage), values at full opacity and secondary labels at `alpha.soft`. Bars keep their own frame and fill; the boss bar keeps its dark cinematic frame. Wave and stage banners, the first-touch coaching, the tutorial lesson card and coach marks follow the same rule. Coach marks (`src/presentation/coach/coach-marks.ts`, drawn by `world.coachMarks`) are data: text, device-worded keys from `src/domain/prompt-vocabulary.ts`, an anchor and a lifetime; a pure solver places each one clear of the player, the HUD groups, the touch controls and other marks. If a biome's HUD band reads poorly, fix that biome's ink selection, never add decoration behind the text.

### Main-menu rail

The rail sits on a soft dark fade from the screen's left edge into the scene, not on a solid panel: `color.rail` at `alpha.rail` at the edge, `alpha.railMid` at `metric.railFadeMid`, clear at `metric.railFadeW`. On an ultrawide window the fade starts at the true left edge, where the rail is anchored, and keeps the same falloff relative to the rail; a wider (two-column touch) rail stretches it. Each rail control carries its own dark fill (`alpha.railControl`) under its light glass wash and hairline, which keeps labels at ≥ 10:1 and sublines at ≥ 4.5:1 over the brightest attract biomes.

The live scene never shows through a screen's content. A sheet is solid (`alpha.sheet`), and run overlays sit on the frame's solid scrim (`alpha.overlay`). The open main menu has no sheet, so the demo keeps its play layer (ledges, fighters, shots and effects) out of the padded area the screen's controls covered on the last frame (`controlsKeepOut` in `src/presentation/demo-keep-out.ts`). Its sky and backdrop still show behind the rail fade. Any open screen added later gets the same keep-out from its own controls.
- The HUD is drawn only while playing; run overlays carry their own summary.
- Announcements (stage and wave banners) share one band under the HUD lane, never over the spawn floor; the wave banner waits while the stage banner shows.
- On-screen touch controls come from `src/input/touch-control-layout.ts`, the single owner of their geometry: input hit-tests exactly the circles the renderer draws, anchored to the real screen edges and safe area and sized in CSS pixels.
- Achievement toasts have one placement per context (`hud` in a run, below the touch pause control; `corner` bottom-right on menus and overlays; `sheet-footer` left of BACK on sheet screens), are at most 360 wide, and are queued one at a time by the controller. While a cinematic or a boss arrival card owns the screen, the queue waits: nothing is shown, marked seen or timed until it ends.

### Adventure chapter presentation contract

A chapter intro is the living biome writing its own title card. It follows the HUD rule (plain text on the scene in the biome ink), never a panel, plate, box, outline or halo. The geometry is `src/presentation/chapter-layout.ts` (pure, shared by the renderer and its test); the components are `UI.chapterHeader`, `UI.loreFragment`, `UI.chapterPrompt` and `UI.biomeReveal`; the beats come from `src/gameplay/campaign/chapter-controller.ts`; tokens are `t.chapter`, `t.chapterType` and the `chapter*` alpha roles.

- **Clear field.** The text block lives in the upper sky on the stage's `chapterArt.composition` side: the numeral label at `chapter.labelY`, the Barlow Condensed title (`chapterType.title`, wraps to two lines, then steps down to `titleFloor`), a short accent rule, an optional tracked page caption and the IBM Plex Mono lore column (`bodyColW`, about 50 characters a line, at most `bodyMaxLines` lines; a longer page steps the body down to `bodyFloor`, never below 16). `tests/unit/chapter-presentation-contract.test.ts` proves that every page each stage shows (prologue, the fallen boss's relic page, the stage pages and the biome reveal) stays above that stage's platforms. A stage whose sky on one side holds a high platform composes on the other side (Verdant is left for that reason).
- **Atmosphere, not a surface.** Behind the text the sky thickens in its own colour (`chapterWash` with the stage `bg`): an elliptical haze densest in the upper corner on the text side (`alpha.chapterHaze`, `hazeCore`, `hazeReach`, `hazeDepth`) that clears well before the arena floor and the far side. It quiets backdrop props without reading as a shape. It never paints below `chapter.floorY`, so the floor band never shows a seam. Only the finale epilogue, already on the dark cinematic field, uses the main-menu rail's dark fade instead.
- **Ink.** Title and lore use the biome ink (`chapter.skyInk` on the light skies, `color.cinemaInk` on the Tear); the numeral label and rule use the stage accent darkened (or lifted) to 4.5:1 against the sky; the caption reads at `alpha.chapterCaption` and the intro line at `alpha.chapterLine`.
- **Prompt.** One device-worded prompt (`cinematicPromptForDevice`) in the floor band under the arena (`chapter.promptY`), at `chapterType.prompt` (14) and `alpha.chapterPrompt`, inked against the floor colour. It appears only once a page's words are all shown, so it never promises a press that only completes a reveal. While a skip hold charges, an accent hairline grows under it.
- **Beats and reading contract.** ENTER (the header breathes in, `motion.chapterIn`) → pages → EXIT (the lore softens, the header stays) → REVEAL (the title crossfades into the biome name, the intro line settles, the haze retreats to `revealRest`) → READY (the HUD returns, the name and the last of the haze dissolve, then control). Each page holds for its reading dwell (`chapterPageDwell`: words at 220 wpm plus a settle, never under 3.2 s) and then plays on by itself; a confirm advances it sooner once it is fully shown. Full shows every page; Brief shows one (the prologue's hook, the fallen boss's relic, or the stage's first page) at the same dwell. Hold to skip jumps to the REVEAL, which keeps its own pace (`skipScale: 1`).
- **Hand-off.** No enemy exists until the chapter completes: the first wave stays prepared until then (`activate-prepared-wave` on completion). The HUD returns on READY, before control; the wave banner raised by that activation is not repeated over the HUD's own WAVE line; the DOM controls hint and achievement toasts wait for the cinematic to end.
- **Touch.** Every chapter role rises to the touch text floor (11 CSS px) at the live scale, and the column widens to keep about 46 characters a line.
- Boss arrival cards keep every line inside their letterbox bars (`bossIntro*` metrics: name and epithet in the lower bar, a spoken opening line in the upper bar) and hide the HUD while they play.

### Usage examples

```js
// Screen title + tagline; reuse the returned y to lay out below it
let y = UI.screenHeader(ctx, "SHOP", "Spend your shards", 60);

// A centred heading
UI.title(ctx, "SHOP", W / 2, y, UI.t.type.h1);

// Body copy, right-aligned, de-emphasised
UI.text(ctx, "Owned", x, y, UI.t.type.label, "right", UI.t.alpha.muted);

// A button (b carries its own geometry + label)
const b = { x: W / 2 - UI.t.metric.btnW / 2, y, w: UI.t.metric.btnW, h: UI.t.metric.btnH, label: "BUY" };
UI.button(ctx, b, UI.pointIn(b, mouseX, mouseY));

// HP meter at 60%
UI.bar(ctx, x, y, w, UI.t.metric.barH, 0.6, UI.t.color.danger);

// Dim the screen behind a modal
UI.dim(ctx, W, H, UI.t.alpha.faint);
```

## Theming

`UI.ink` is the **live foreground colour**. The game flips it to a light tone on dark biomes so UI stays readable against the backdrop. Components read `UI.ink` for their primary fill instead of a fixed colour — which is exactly why **you must not hardcode black** (or any literal foreground colour). Use the component (which already reads `UI.ink`) or, in a new component, read `UI.ink` yourself. Background/fade colour is `UI.t.color.paper`.

## Adding a new component

When nothing in the catalog fits, don't inline at the call site — extend the system:

1. **Add a method to `UI`** in `src/presentation/ui.ts`, alongside the existing components, following the `(ctx, …)` signature shape.
2. **Pull every geometry, colour, and alpha from `UI.t`** (and use `UI.ink` for the foreground). No magic numbers, no literal colours.
3. **Use it from the screen.** The call site should now read as one `UI.yourComponent(ctx, …)` call with no stray `ctx` styling around it.

This keeps the token layer authoritative and every screen consistent and theme-safe.
