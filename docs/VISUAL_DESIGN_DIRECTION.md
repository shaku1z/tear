# Tear visual direction

## Outcome

Tear's interface is a kinetic field manual laid over a living combat diorama. It should feel authored for the game rather than borrowed from a generic web dashboard: condensed, decisive, editorial, and built from the same slash, momentum, hierarchy, and restraint as the combat.

The interface must remain immediately usable on a 16:9 browser canvas, an ultrawide standalone window, a 4:3 embed, and a small landscape touch device. The world may bleed into unused aspect-ratio space; functional composition may not. No platform build receives a separate visual implementation.

## Visual principles

1. **The blade makes the grid.** Rules, spines, slashes, registration marks, and hard rectangular cuts establish hierarchy. Decoration must reinforce direction or grouping.
2. **The world remains alive.** Menu and library screens retain the attract scene beneath controlled ink or paper washes. Surfaces provide legibility without erasing place.
3. **One loud decision at a time.** Accent fills identify the primary action, live selection, rarity, or state. They are not general-purpose decoration.
4. **Information has rank.** Display type carries names and decisions; mono type carries descriptions, values, metadata, and telemetry. Size alone is not hierarchy.
5. **Density is composed, not shrunk.** Long catalogues flow, clip, scroll, truncate, or re-group. Text and hit targets never become microscopic to make content fit.
6. **Motion communicates state.** Entry sweeps, hover travel, purchase flashes, selection changes, and progression reveals show cause and focus. Reduced-motion mode preserves the state change without travel.

## Type system

- **Barlow Condensed SemiBold:** wordmark, screen titles, action labels, tabs, section labels, badges, card names, outcome statements, and short emphatic values.
- **IBM Plex Mono Regular:** descriptions, lore, hints, timestamps, scores, settings notes, and supporting copy.
- **IBM Plex Mono Medium:** compact data requiring stronger contrast where Barlow would imply an action.
- Courier New and Arial Narrow remain fallbacks only. A renderer must not select either directly.
- One-line content near controls must be measured and ellipsized. Narrative content wraps within an explicit column width.

## Responsive composition

The authored safe composition remains 1600×900. `screenRectangle` is the true physical viewport expressed in logical coordinates and includes aspect-ratio overscan.

- World layers, ambient scenery, full-screen clears, dims, washes, vignettes, transitions, and the menu's dark rail field paint through `screenRectangle` or the shared overscan contract.
- Titles, buttons, cards, HUD telemetry, and pointer targets remain inside the authored safe composition.
- Ultrawide windows reveal more world but never reveal an unpainted strip or shift the interaction rail.
- 4:3 windows reveal vertical bleed without cropping the safe composition.
- Touch portrait is an explicit orientation gate; touch landscape uses the same composition with a density increase and safe-area insets.
- DOM overlays use the bundled body family and stay subordinate to canvas UI.

## Shared surface grammar

- **Field sheet:** translucent paper over the live attract world, signature-color top edge, hairline boundary, restrained shadow, and registration marks.
- **Card:** solid readable body, hard border, optional identity edge, compact metadata line, measured description, and one clear state zone.
- **Section:** condensed uppercase label, colored identity, count where useful, and a hairline that reserves separation before content.
- **Primary action:** solid cyan or screen hue, dark label, clear action glyph, and an optional mono consequence line.
- **Secondary action:** paper/ink surface with hover wash, focus travel, and a left identity spine where the action belongs to a category.
- **Danger action:** danger hue only when the next action is destructive or run-ending.

## Screen map

### Main menu

- The left rail owns identity and navigation; its dark wash reaches the physical edge at every aspect ratio.
- The live attract world remains legible to the right.
- The wordmark uses Barlow and the cyan slash; player identity and currency form one compact status card.
- PLAY remains the unique filled action.
- A small run dossier mirrors the selected mode, difficulty, and current field so the empty side has an intentional informational anchor without becoming a dashboard.

### Run setup

- Mode, difficulty, and weapon remain three clearly titled columns.
- Every option uses a stable description slot; weapon identity is never lost to truncation.
- Bounties or boss test form a separate stakes band above the primary BEGIN RUN action.

### Shop

- Permanent upgrades are an armory ledger, not one undifferentiated list.
- VITALITY and BLADE flow independently in the left column; TEMPO and FORTUNE flow independently in the right.
- Category positions derive from actual item counts. Counts appear on category rules.
- Every row separates glyph, name/level, current effect, tier pips, and purchase state.
- Descriptions ellipsize before the pips/price zone and never collide with them.
- Purchase affordability, maximum level, owned state, and the balance tween remain visually distinct.

### Codex and ability library

- Tabs switch whole bodies; filter chips narrow a body; these must not share identical styling.
- Ability cards expose category/type before prose, with tier evolution as a small ordered sequence.
- Bestiary cards reserve preview space and counterplay copy.
- Guide content stays split between controls and trick-system literacy.

### Draft, reserve, and tier-up

- These are consequential gameplay overlays, not menu pages: the world stays visible under a true-viewport dim.
- Card color communicates ability family; badge, category, title, tier path, copy, ownership, and confirmation hint form a fixed reading order.
- Expanded drafts scroll by complete card rows. Touch confirms in two stages.

### Pause and results

- Pause separates action rail, current arsenal, and run progression.
- Arsenal sorts special evolutions before category abilities and retains category color, tier/stack state, and live description.
- Defeat separates rewards/actions, run log, and progression. Victory prioritizes outcome and next action.
- Campaign completion uses the cinematic dark reward surface and paints through overscan.

### Profile, achievements, leaderboards, replays

- Profile begins with a passport identity band, then separates bests, stats, journey, and replay custody.
- Achievements distinguish daily progress from permanent mastery.
- Leaderboards distinguish filters, podium, player position, and replay action.
- Replay controls form a transport bar; optional run information is a separate dark inspector.

### Settings and rename

- Settings preserve tab, section, row label/note, and control hierarchy.
- Master, music, sound effects, and interface volume remain independent and explain their mix relationship.
- Rename remains a focused modal with clear validation, length state, and contextual return.

### Playground and HUD

- Playground groups spawn, boss, arena/weapon, modifier, action, and ability-lab controls rather than presenting one control wall.
- HUD stays inside safe composition and device insets while the world bleeds outward.
- Health, boss state, wave, score, multiplier, weapon state, and transient alerts each keep one visual authority.

## Motion and accessibility

- Hover/focus movement is short and directional; activation feedback is immediate.
- Purchase and reward flashes never obscure labels.
- Reduced motion removes travel, parallax, and stagger while retaining fades, focus outlines, and final state.
- High contrast must preserve semantic colors with stronger value separation, not add more colors.
- Keyboard/controller focus and pointer hover use the same visual state. Hidden or clipped controls are not focusable.

## Performance and platform rules

- Canvas primitives and bundled fonts are shared across standalone and CrazyGames outputs.
- No screen-specific image payload is required for core usability.
- Decorative work is bounded: fixed line counts, reused gradients, no per-frame DOM layout, and no new nondeterministic gameplay state.
- Font loading is awaited and asserted in the responsive browser matrix.
- The canonical browser matrix includes 16:9, the reported 2048×1041 ultrawide shape, 4:3 HiDPI, touch landscape, and touch portrait.

## Review evidence

Each substantial UI change is reviewed at minimum on:

1. main menu at 1600×900 and 2048×1041;
2. shop or another dense two-column catalogue;
3. setup or settings with many interactive rows;
4. draft/pause over live world rendering;
5. one small landscape touch viewport;
6. the portrait orientation gate;
7. keyboard/controller focus and reduced-motion behavior.

Pixel snapshots are supporting craft evidence, not brittle golden tests. Permanent tests assert geometry, true-viewport coverage contracts, font readiness, action semantics, scroll boundaries, and the absence of browser errors.
