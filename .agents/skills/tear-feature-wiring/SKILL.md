---
name: tear-feature-wiring
description: Add or change a Tear feature so it is wired through every layer it needs. Use for a weapon, ability, enemy, boss, boss move, stage, stage object, biome, mode, screen, audio event, saved field or platform capability, for planning such a change, and for reviewing a feature that is only partly wired.
---

# Tear feature wiring

A Tear feature is the first of many. Content is data that shared rules read; adding the next one is a data
entry plus at most one routine for a new kind of thing
([docs/ENGINEERING_STANDARD.md](../../../docs/ENGINEERING_STANDARD.md)). This skill names where each kind
starts and what "fully wired" means.

## Workflow

1. Answer the engineering standard's six design-check questions in the plan before writing code. They go
   in the pull request too.
2. Read [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md) for the layers, and the area's row in
   [docs/position/](../../../docs/position/README.md) and its plan under `plans/active/` for what is coming next.
3. Find how the existing instances of this kind are defined, and read only the matching reference:
   - weapon, ability, enemy, boss, stage, mode: [references/gameplay-content.md](references/gameplay-content.md)
   - screen: [references/screens.md](references/screens.md)
   - sound or music: [references/audio-events.md](references/audio-events.md)
   - saved field or platform capability: [references/data-and-platform.md](references/data-and-platform.md)
4. Trace definition, then rule or controller, then composition, then presentation or adapter.
   Dependencies point inward: entrypoints, app, gameplay, simulation and domain.
5. Add the test that fails without the change first (`tear-combat-scenarios` for gameplay). Add a browser
   check when players see or touch the feature.
6. Make it findable where its kind is listed:
   - a new file under `src/`: a route in `src/tearbench/evidence-routes.json` or a line in
     `config/change-impact-defaults.json`;
   - a new script: `config/tool-catalogue.json`;
   - a new top-level folder or config file: `docs/REPOSITORY_MAP.md`;
   - a name players see: `config/terminology-registry.json`;
   - a changed workstream state: the area's file under `config/position/`, then `pnpm position:render`;
   - a preserved feature: its entry in `docs/FEATURE_INVENTORY.md`.
7. If the change alters what a recorded run would do, bump the ruleset version (see `tear-change-gate`,
   `references/generated-files.md`).
8. Choose checks with `tear-change-gate`.

## Rules

- Rules code under `src/gameplay`, `src/simulation` and `src/domain` uses typed ports, semantic actions,
  the injected random source and simulation ticks. It never touches the DOM, an SDK, audio, storage or the
  renderer; it emits typed facts that outer layers react to.
- One definition of each rule, constant, colour, timing, name and format. Import it; when you find a second
  copy, remove it in the same change or name the follow-up.
- No branch in shared code keyed to one id. A special case is data on that item.
- Screens draw immutable snapshots and dispatch semantic actions. They own no gameplay, saving or platform
  work.
- A capability a platform lacks returns an explicit unavailable result and leaves the game playable.
- Plain names: no "lab", "foundry", "studio", "academy" or "forge".
- No speculative framework. Generalize where a second use is known or already exists.
- A feature that existed before the redesign is checked against the oracle with `tear-oracle-parity`
  before it is called preserved.

## Report

The path the feature takes through the layers, the design-check answers, tests added, browser checks run,
what was listed where, the commands and results, and any target or case not covered.
