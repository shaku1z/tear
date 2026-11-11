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

**Legibility floor.** A 1280×720 window scales the 1600×900 layout by 0.8, so `micro` (13) renders at 10.4 CSS px. Nothing a player must read is drawn below `micro`; screens pass tokens, never literal sizes below it. When bigger text no longer fits, change the layout (wrap, rebalance, reduce chrome) instead of shrinking the text. The touch density profile adds its bump on top of these values.

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
| `sheet` | 0.96 | Paper sheet surface, effectively solid so scene art never shows through text (was a hard-coded 0.70) |
| `rail` | 0.92 | Main-menu rail backing |
| `modalDim` | 0.9 | Modal dim (Rename) |

### Colour roles — `UI.t.color`
Semantic roles. `accent`, `danger`, and `unique` pull from `CONFIG.colors` so the system and the game palette never drift apart.

| Token | value | Use |
|---|---|---|
| `paper` | `"#fff"` | Background / overlay fade target |
| `muted` | `"#62646f"` | De-emphasised text / hairlines, 5.9:1 on paper (was `#9a9a9a`, 2.8:1) |
| `scrim` / `scrimInk` | `"#06070c"` / `"#f1eff9"` | Guaranteed-contrast modal pair (`UI.dim` with a light ink) |
| `rail` / `railInk` | `"#080a10"` / `"#f1eff9"` | Main-menu rail backing and its foreground (also every dark-surface ghost control) |
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
| `UI.dim` | `UI.dim(ctx, w, h, a?)` | Overlay backdrop; fades toward `paper` for dark ink and toward `scrim` for light ink, so the dim and the ink are always a contrasting pair |
| `UI.scrollHint` | `UI.scrollHint(ctx, x, y, canUp, canDown, align?)` | "▲ SCROLL ▼" affordance (sheet screens place it in the footer row via `pageFooter`) |
| `UI.fitText` | `UI.fitText(ctx, text, maxW, { size, floor?, maxLines?, ellipsis?, wrapFirst?, bold? })` | The one fitting rule (below); returns `{ size, lines, truncated, overflow }` |
| `UI.textBox` | `UI.textBox(ctx, text, x, y, maxW, opts?)` | Wrapped text in a box; `y` is the first baseline; **returns the height it used** so callers lay out below it |
| `UI.readable` | `UI.readable(color, ratio?)` | A palette hue darkened to 4.5:1 when drawn on paper (passes through on dark surfaces) |
| `UI.focusRing` | `UI.focusRing(ctx, box)` | Keyboard/controller focus ring outside a control (drawn by the button layer) |
| `UI.emptyState` | `UI.emptyState(ctx, glyph, line, cx, cy, detail?, width?)` | Designed empty / loading / offline state; returns the y for an optional CTA |
| `UI.cursor` | `UI.cursor(ctx, x, y)` | Pointer/cursor glyph |
| `UI.pointIn` | `UI.pointIn(b, x, y)` | Hit-test: is point `(x,y)` inside box `b`? |
| `UI.font` | `UI.font(size, bold)` | Build the canvas font string (used internally; prefer the components) |

### The fitting rule (buttons, chips, tabs, text boxes)

`src/presentation/ui-text-fit.ts` holds the single rule every component uses: **measure; if too wide, step the size down to a floor (normally `micro`); then wrap to two lines where the height allows; only then ellipsize**. A navigation label (rail, hero, tabs) is never ellipsized; the layout reports the overflow instead. Prose (`textBox`) wraps first and only shrinks when its line budget is exceeded. Selected controls never grow and strokes are inset, so no state draws outside its box.

### The page pattern (sheet screens)

`screen-primitives.ts` provides `page(context, { title, subtitle?, hue?, stat? })` for the header (with an optional right-aligned stat), `clipBody(context, top, bottom, draw)` to clip content to the body, and `pageFooter(context, { back?, canScrollUp?, canScrollDown? })` for BACK centred inside the sheet's footer row with the scroll hint to its right. `pageLayout(context)` exposes `left/right/contentWidth/bodyTop/bodyBottom/footerY`. Use these instead of hard-coding title, BACK or scroll-hint positions.

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
