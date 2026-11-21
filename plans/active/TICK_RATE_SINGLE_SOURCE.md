# Tick rate: one definition

## Authority metadata

- **Owner:** Gameplay owner (a gameplay session)
- **Status:** Active
- **Closure condition:** Every "done when" line below holds and `pnpm check:functional` passes on the pull request.

## Why

The simulation runs 120 ticks a second, and that number is written as a literal in at least five places.
[docs/ENGINEERING_STANDARD.md](../../docs/ENGINEERING_STANDARD.md) names the tick rate as the example of a
value that must have one copy. Today a change to the rate would be made in one place and missed in the others.

Found on `main` on 2026-11-21 (`git grep "TICKS_PER_SECOND = "`):

- `src/tearbench/simulation-profile.ts` (`TEAR_SIMULATION_TICKS_PER_SECOND`)
- `src/replay/record.ts` (`REPLAY_TICKS_PER_SECOND`)
- `src/domain/gauntlet-records.ts` (`GAUNTLET_TICKS_PER_SECOND`)
- `src/gameplay/entities/boss-attacks.ts` (`BOSS_ATTACK_TICKS_PER_SECOND`)
- `src/app/library/ghost-theater-screen-adapter.ts` (a local `TICKS_PER_SECOND`)

## Failure modes (write these first)

1. The constants are joined but a sixth literal `120` (or `1 / 120`, or `8.33`) stays somewhere as a bare
   number; caught by a rule test that searches `src/` for tick-rate literals outside the one definition.
2. The one definition lands in a layer the others may not import (the domain layer may not import
   gameplay or tooling); caught by `pnpm check:architecture`.
3. Behaviour changes while "only moving a constant"; caught by `pnpm test:determinism` passing with no
   fixture change, and no bump of the ruleset version.

## Done when

- [ ] One exported tick-rate constant exists in the innermost layer that needs it, and
      `git grep -n "TICKS_PER_SECOND = " -- src` prints only that line and names derived from it.
- [ ] A unit test fails when a second definition of the rate is added under `src/`.
- [ ] `pnpm test:determinism` passes with the committed fixture unchanged.
- [ ] `.agents/skills/tear-combat-scenarios` names the one constant.

## Scope

- **Changes:** the five files above, the new definition, one rule test, the combat-scenarios skill.
- **Does not change:** the rate itself, replay formats, the ruleset version, any tuning value.

## Checks

- **While iterating:** `pnpm test:related <changed src files>`, `pnpm test:determinism`, `pnpm check:architecture`.
- **Before each pull request:** the gates from `.agents/skills/tear-change-gate`.
- **Could not run here:** nothing.

## Log

- 2026-11-21 Card written by the skills refresh (pull request 382). No code changed.
