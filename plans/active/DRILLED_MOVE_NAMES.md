# Drilled move names from one source

## Authority metadata

- **Owner:** Training and Playground experience owner (training-ux)
- **Status:** Active
- **Closure condition:** Every "done when" line below holds and `pnpm check:functional` passes from the final commit.

## Why

Three places name the moves that the weapon drills train, each by hand:

- **The drill steps:** `TUTORIAL_WEAPON_ANNEXES` in `src/gameplay/training/tutorial-weapon-annexes.ts`. Each step lists the effect ids it recognises, such as `reversal`, `launch`/`updraft`, `wheelCut`/`wheelReturn` and `razorRoundHit`, beside prose instructions.
- **The teaching lines:** `WEAPON_TEACHING` in `src/gameplay/training/training-exercises.ts`, one hand-written line per weapon ("Sword: reverse back through a target, then launch it."), shown while a weapon drill runs.
- **The WEAPONS tab help** in Drills. Before #203 it was a hand-written list. #203 made it generic ("Choose a weapon to try its own moves.") because nothing names the drilled moves. The lead accepted that line until this task lands.

The weapon definitions (`src/gameplay/weapons.ts`) have `name` and `mechanics`. But `mechanics` lists signature moves (for the Sword: Reversal and Threadcut), not the drilled ones (the Sword drill trains reversal, then launch), so a line built from `mechanics` would name the wrong moves. The weapons already emit mechanic ids at hit time (`mechanic: "reversal"`, `"wheelCut"`, `"wheelReturn"`), and the drill steps match on those ids. So the one source is a table of display names keyed by those ids, owned by the weapon definition.

## Failure modes (write these first)

1. **A drill step names an effect id that has no display name.** The help or teaching line shows a raw id or a blank. Caught by a unit test: every annex effect id resolves to a name on its weapon.
2. **A display name is added for an id the weapon never emits.** The help names a move that cannot happen. Caught by a test that each named id is one the weapon emits, or one the annex's evidence handling recognises. Which of the two is the right reference is confirmed against `tutorial-weapon-annexes` before the test is written.
3. **A built line silently changes the tutorial gold or drill behaviour.** Caught by the build's tutorial gold check (output unchanged) and the existing annex tests. Only copy may change.
4. **The help grows too long for the phone** (five weapons with two moves each). Caught by the phone contract test (`compact-phone-layouts`: every Drills tab, no text off the frame or cut).
5. **A second hand copy survives**, for example a `WEAPON_TEACHING` line that restates move names. Caught in review: a search for each move name under `src/gameplay/training` finds only the source table.

## Done when

- [ ] Each weapon definition has one table from the move ids its drill uses to their display names (for example `moves: { reversal: "Reversal", launch: "Launch" }`). The types allow an annex step to list only ids from its weapon's table.
- [ ] The WEAPONS help in `src/gameplay/training/practice-tabs.ts` is built from the annexes and that table: the weapon's `name` plus the names of the moves its steps train.
- [ ] `WEAPON_TEACHING` no longer holds per-weapon move prose. Its line is either built from the same table, or removed where the drill step's own instruction already says it. Its `controls` stay where they are or move to the annex row.
- [ ] A unit test for the annexes covers failure modes 1 and 2, and it fails without the table.
- [ ] The build's tutorial gold check reports the gold output unchanged.
- [ ] Desktop and 844x390 Drills WEAPONS captures show the built line, with nothing cut.

## Scope

- **Changes:** `src/gameplay/weapons.ts` (the names table only), `src/gameplay/training/tutorial-weapon-annexes.ts`, `src/gameplay/training/training-exercises.ts`, `src/gameplay/training/practice-tabs.ts`, and their unit tests.
- **Does not change:** weapon behaviour, damage or timing (no combat-rule change); the annex evidence rules; the Boss Test, Enemy Test and Rootbound files; any instruction prose, except where it restates a name the table now owns.

## Checks

- **While iterating:** the annex, training-exercises and screen-renderers unit tests; `pnpm test:weapons`, because the change touches `weapons.ts`.
- **Before each pull request:** `pnpm check:quick`; `pnpm build:test:standalone` (tutorial gold); `pnpm test:browser:journeys`. Heavy commands go through `node C:\Users\realm\Desktop\game\heavy-gate.mjs -- <command>`, and the whole unit suite is left to CI.
- **Could not run here:** none expected.

## Log

- 2026-11-18 Card written after the lead accepted #203's generic WEAPONS help and asked for this follow-up; placed in `plans/active` because it spans pull requests.
