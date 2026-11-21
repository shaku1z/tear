---
name: tear-autonomous-playtester
description: Play Tear headless to measure it or to prove a behaviour, and read the result. Use for balance and difficulty questions, a gameplay change or defect that needs numbers before and after, comparing a branch with main, running or adding a TearBench scenario, and judging whether existing tests really establish a gameplay claim.
---

# Tear playtest evidence

Two tools play the real game without a person. They answer different questions; pick by the question.

| Question | Tool | Result |
| --- | --- | --- |
| How does the game play: clear rates, time to kill, damage taken, what never appears? | `pnpm playtest` | Tables. It never passes or fails. |
| Does this named situation still behave correctly? | `pnpm tearbench run <scenario id>` | `PASS` or `FAIL`, and a run file under `artifacts/tearbench/runs/` |
| Does this rule hold? | A unit or property test | See `tear-combat-scenarios` |

`pnpm playtest` is the direction of travel: [the playtest tool plan](../../../plans/active/PLAYTEST_TOOL_PLAN.md)
folds the TearBench scenarios into it. Until that lands, [docs/TEARBENCH.md](../../../docs/TEARBENCH.md)
describes what runs. Do not add new TearBench machinery.

## Measuring with `pnpm playtest`

1. Choose the report: `bosses`, `sweep`, `waves --stage <id>`, `runs`, `enemies` or `coverage`. The usage
   text at the top of `scripts/playtest.mjs` lists every option. Do not pass `--help`.
2. Fix the set: weapon, difficulty, seed and scripted player. The same set on the same code gives the same
   numbers.
3. For a change, compare on identical seeds: `pnpm playtest <report> <options> --compare <commit>` plays
   the same set on that commit's game and prints only the measures that differ.
4. Queue the big sets: `pnpm queue -- pnpm playtest runs`, and the same for `coverage` and a full `sweep`.
5. Put the numbers in the pull request under "Measured", with the set that produced them.

A scripted player is not a person. Report what it measured, and say plainly that feel, fairness and fun
still need a human playtest.

## Proving with TearBench

1. `pnpm tearbench list` prints the scenarios. `pnpm tearbench run <id>` builds the test build and plays
   one; `--seed` and `--repeat` vary it; `pnpm tearbench rerun --artifact <file>` replays a written run.
2. Eight scenarios also run without a browser: `pnpm test:headless:current-gameplay-scenarios`.
3. To add a scenario, follow "How to add one" in [docs/TEARBENCH.md](../../../docs/TEARBENCH.md).
4. `pnpm tearbench select --files-from <file>` lists the scenarios routed to a set of changed files
   ([docs/CHANGE_IMPACT.md](../../../docs/CHANGE_IMPACT.md)). No workflow depends on it and it selects
   nothing the required check does not already run, so use it to find an area's scenarios, not as proof.

## When behaviour diverges

1. Reproduce from the written run or the same seed. One run is the verdict; do not rerun hoping it passes.
2. Find the first tick where state differs, and separate it from what follows from it.
3. Shrink the reproduction while it still fails, then keep it as a permanent test through
   `tear-combat-scenarios`.
4. Say what owns the failure: the game, the scripted player, the test or its environment, or not yet known.

## Rules

- Evidence comes from the commands above on a named revision. Unrelated passing unit tests are not gameplay
  evidence.
- A headless result does not cover what only a browser shows (rendering, device input, lifecycle): run the
  browser check `tear-change-gate` routes to.
- These tools use the test build and the headless environment only. Never deploy, publish or contact a
  live service to gather evidence.
- Keep reports and run files outside the repository unless a test reads them.

## Report

Lead with pass, fail or incomplete. Name the command, the set (weapon, difficulty, seed, player), the
revisions compared, the first divergence if any, where the output is, and what was not run.
