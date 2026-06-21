---
name: ui-design-review
description: Review canvas UI changes in the Tear game for Design System compliance — flag any UI that bypasses the UI.* component library or hardcodes values that exist as design tokens. Use when reviewing or writing render/draw UI code.
---

# Tear UI Design System Review

Audit canvas UI code (menus, HUD, overlays, cards, banners, screens) for compliance
with the Tear Design System (DS). The DS lives in `js/ui.js` and exposes the global
`UI` object: tokens under `UI.t.*` and drawing components as `UI.*` functions.

## GOLDEN RULE

**All UI is drawn through the `UI.*` design-system library.**

- Screens / HUD / overlays must **never** poke `ctx` directly to draw UI text or
  shapes. Every label, heading, button, panel, bar, chip, divider, and overlay
  goes through a `UI.*` component.
- Code must **never hardcode a value that exists as a token**. Font sizes, spacing,
  metrics, alphas, and colors all have canonical names under `UI.t.*` — use the
  token, not the literal.
- Foreground color is `UI.ink` (the game flips it light on dark biomes). UI code
  must not hardcode `"#000"` / `"#fff"` for foreground; let the components read
  `UI.ink`.

If a screen draws its own `ctx.fillText(...)`, sets `ctx.font = "20px ..."`, or
paints `"#999"` directly, that is a violation — even if it "looks fine."

## EXCEPTION — in-world rendering is game art, not UI

`renderWorld` (and anything it calls) draws the **game world**: enemies, the player,
particles, projectiles, blades, biome backgrounds, boss telegraphs, hit flashes,
damage numbers floating in world-space. This is **art**, not UI, and is **allowed**
to draw to `ctx` directly with whatever colors/shapes it needs.

The rule targets the **UI layer**: title screens, menus, the HUD, pause/death/win
overlays, the upgrade/abilities/variant cards, banners, and any screen header.
When in doubt: is it part of the diegetic world, or chrome layered on top? Chrome
must use the DS.

## REVIEW CHECKLIST / PROCEDURE

Run these greps against `js/game.js` (and any other file that renders UI; **not**
`js/ui.js` itself, which is the DS implementation). For each hit, decide whether
it's UI-layer (violation) or in-world art (allowed), then map it to the DS
replacement.

### 1. Raw text drawing — red flag
```
grep -nE "ctx\.(fillText|strokeText)\(" js/game.js
```
- In a screen/HUD/overlay → **violation**. Replace with:
  - body copy → `UI.text(ctx, str, x, y, size?, align?, alpha?)`
  - bold centred heading → `UI.title(ctx, str, x, y, size?)`
  - small coloured label/tag → `UI.tag(ctx, str, x, y, color?, align?, size?)`
  - standard screen title block → `UI.screenHeader(ctx, title, subtitle?, y?, big?)`
- In `renderWorld` (floating damage numbers etc.) → allowed.

### 2. Raw shapes forming UI surfaces — red flag
```
grep -nE "ctx\.(fillRect|strokeRect|rect)\(" js/game.js
```
- Forming a button, panel, card, chip, bar, divider, or overlay backdrop →
  **violation**. Replace with:
  - button → `UI.button(ctx, b, active)` where `b:{x,y,w,h,label,enabled?,size?}`
  - compact toggle/filter → `UI.chip(ctx, b, on)`
  - bordered surface → `UI.panel(ctx, x, y, w, h)`
  - interactive/hoverable surface → `UI.card(ctx, x, y, w, h, hovered)`
  - progress / HP / meter → `UI.bar(ctx, x, y, w, h, frac, fill?, line?)`
  - category accent strip → `UI.accentStrip(ctx, x, y, w, color, thick?)`
  - horizontal rule → `UI.divider(ctx, x, y, w, alpha?)`
  - full-screen dim behind an overlay → `UI.dim(ctx, w, h, a?)`
- A background fill or telegraph shape in `renderWorld` → allowed.

### 3. Literal font strings with magic sizes — red flag
```
grep -nE "ctx\.font\s*=" js/game.js
grep -nE "[0-9]+px" js/game.js
```
- Any `ctx.font = "20px ..."` / `"bold 40px ..."` in the UI layer → **violation**.
  Text should go through `UI.text` / `UI.title` / `UI.tag`, and the size argument
  should be a `UI.t.type.*` token, never a bare number.

### 4. Bare numeric font sizes passed to DS components — red flag
```
grep -nE "UI\.(text|title|tag)\([^)]*,\s*[0-9]+" js/game.js
```
- `UI.title(ctx, "GAME OVER", x, y, 40)` → use `UI.t.type.h1` instead of `40`.
- Map literals to tokens via `UI.t.type`:
  `{ wordmark:80, display:52, h1:40, h2:30, title:24, lead:20, body:16, label:14, caption:13, micro:11 }` (display = full-screen splash headers: PAUSED / VICTORY / stage banner)

### 5. Hardcoded UI colors — red flag
```
grep -nE "#[0-9a-fA-F]{3,6}" js/game.js
```
- Greys for muted/disabled UI text — `"#999"`, `"#9a9a9a"`, `"#bbb"` → use
  `UI.t.color.muted` (`#9a9a9a`) or `UI.t.color.disabled` (`#bbb`).
- Black/white foreground in UI → should come from `UI.ink` via the component.
- Accent / danger / unique hexes → use `UI.t.color.accent`, `UI.t.color.danger`,
  `UI.t.color.unique` (getters that pull from `CONFIG.colors`).
- A color inside `renderWorld` for an enemy/particle/biome → allowed.

### 6. Magic spacing / metrics — red flag
Layout numbers that duplicate tokens (button height 48, button width 300, panel
padding 14, chip dims, bar height 14, gaps) should reference tokens:
- `UI.t.space = { xs:6, sm:10, md:16, lg:24, xl:40 }`
- `UI.t.metric = { btnH:48, btnW:300, btnGap:12, panelPad:14, chipH:28, chipW:96, barH:14 }`
- Alpha literals (`0.7`, `0.55`, `0.4`, …) → `UI.t.alpha = { full:1, soft:0.7, muted:0.55, faint:0.4, ghost:0.25 }`

## TOKEN + COMPONENT REFERENCE (canonical names)

### Tokens
- `UI.ink` — live foreground colour (flips light on dark biomes; components read it).
- `UI.t.type` = `{ wordmark:80, display:52, h1:40, h2:30, title:24, lead:20, body:16, label:14, caption:13, micro:11 }` (display = full-screen splash headers: PAUSED / VICTORY / stage banner)
- `UI.t.space` = `{ xs:6, sm:10, md:16, lg:24, xl:40 }`
- `UI.t.metric` = `{ btnH:48, btnW:300, btnGap:12, panelPad:14, chipH:28, chipW:96, barH:14 }`
- `UI.t.alpha` = `{ full:1, soft:0.7, muted:0.55, faint:0.4, ghost:0.25 }`
- `UI.t.color` = `{ paper:"#fff", muted:"#9a9a9a", disabled:"#bbb", accent, danger, unique }`
  (`accent` / `danger` / `unique` are getters pulling from `CONFIG.colors`)

### Components
- `UI.text(ctx, str, x, y, size?, align?, alpha?)` — body copy (size defaults to `type.body`)
- `UI.title(ctx, str, x, y, size?)` — bold centred heading (size defaults to `type.h1`)
- `UI.tag(ctx, str, x, y, color?, align?, size?)` — small coloured label/tag
- `UI.screenHeader(ctx, title, subtitle?, y?, big?)` — standard screen header; returns y below it
- `UI.button(ctx, b, active)` — `b:{x,y,w,h,label,enabled?,size?}`
- `UI.chip(ctx, b, on)` — compact toggle (filters)
- `UI.panel(ctx, x, y, w, h)` — bordered surface
- `UI.card(ctx, x, y, w, h, hovered)` — interactive panel with hover emphasis
- `UI.accentStrip(ctx, x, y, w, color, thick?)` — category accent strip
- `UI.divider(ctx, x, y, w, alpha?)`
- `UI.bar(ctx, x, y, w, h, frac, fill?, line?)` — progress / HP / meter
- `UI.dim(ctx, w, h, a?)` — overlay backdrop (fades to paper)
- `UI.scrollHint(ctx, x, y, canUp, canDown)`
- `UI.cursor(ctx, x, y)` ; `UI.pointIn(b, x, y)` ; `UI.font(size, bold)`

## HOW TO REPORT FINDINGS

For each violation, report a single line:

```
<file>:<line> — <what the code does> → use <DS replacement>
```

Examples:
```
js/game.js:842 — ctx.font="20px 'Courier New'"; ctx.fillText("PAUSED", ...) → UI.title(ctx, "PAUSED", x, y, UI.t.type.lead)
js/game.js:910 — ctx.fillStyle="#999" for the cooldown label → UI.text(..., UI.t.alpha.muted) or color UI.t.color.muted
js/game.js:1033 — ctx.fillRect drawing the HP bar → UI.bar(ctx, x, y, w, UI.t.metric.barH, frac)
js/game.js:1180 — UI.title(ctx,"GAME OVER",x,y,40) → pass UI.t.type.h1 instead of 40
```

Group by file, list line-ordered. If a hit is inside `renderWorld` (in-world art),
either omit it or mark it `OK (in-world art)` so the reader knows it was considered,
not missed. End with a one-line verdict: **PASS** (no UI-layer violations) or
**N violations** with the count.
