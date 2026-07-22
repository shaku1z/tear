---
name: tear-feature-wiring
description: Author or revise Tear features through the redesigned typed modules, ports, definitions, controllers, presentation, and evidence. Use for a Tear weapon, enemy, boss, ability, mode, screen, audio event, persistence field, or platform capability, including reviewing incomplete feature integration.
---

# Tear Feature Wiring

Route feature work through Tear's live typed architecture. Let TypeScript, contracts, tests, browser matrices, and release gates prove wiring; do not reconstruct a registry from prose or shared globals.

## Workflow

1. Read `docs/ARCHITECTURE.md`, the relevant source contracts, and the matching section of `docs/FEATURE_INVENTORY.md`.
2. Classify the feature kind. Read only its progressive reference:
   - Weapon, enemy, boss, ability, or mode: [references/gameplay-content.md](references/gameplay-content.md)
   - Screen: [references/screens.md](references/screens.md)
   - Audio event: [references/audio-events.md](references/audio-events.md)
   - Persistence field or platform capability: [references/data-and-platform.md](references/data-and-platform.md)
3. Trace definition -> typed port/controller -> composition -> presentation/adapter. Keep dependencies pointing inward.
4. Add the smallest deterministic unit/contract/conformance evidence first. Add built-browser evidence when the feature is visible, interactive, lifecycle-sensitive, or target-specific.
5. Update `docs/FEATURE_INVENTORY.md` with the credible evidence that preserves the feature.
6. Use `$tear-change-gate` to run targeted checks, then the required release gate when applicable.
7. If the feature existed in the pre-redesign monolith, verify the ported behavior against oracle `ee5e931` with `$tear-oracle-parity` before claiming the feature is preserved.

## Rules

- Gameplay consumes typed ports, semantic actions, injected randomness, simulation time, and typed events—not DOM, SDK, audio, storage, or renderer state.
- Screens render immutable snapshots and dispatch semantic actions; they do not own gameplay, persistence, or platform coordination.
- Unsupported platform capabilities return explicit unavailable results and preserve a playable path.
- Treat definitions and live contracts as authoritative. Never copy a static registry or token inventory into this skill.
- Do not add a separate cache, boss, controller/mobile, wiki, audio, or TearScore workflow; route those concerns through the relevant feature kind and existing gates.

## Completion

Report the feature path, contracts touched, tests added or updated, browser evidence, inventory update, and commands run. Call out any unsupported target or evidence gap explicitly.
