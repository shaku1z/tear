# TearBench

TearBench is the scenario runner. It keeps a list of named situations in the game, each with the proof
that the game behaves correctly in it, and it runs them. It also works out which of those proofs a
change needs (`pnpm tearbench select`, `pnpm tearbench ci`); [CHANGE_IMPACT.md](CHANGE_IMPACT.md)
covers that part.

`pnpm playtest` is a different tool: it plays fights, waves and runs and prints measurements. It does
not pass or fail anything. TearBench passes or fails.

## What a scenario is

A scenario is one entry in `src/tearbench/canonical-scenarios.json`. There are 35. An entry says:

| Field | Meaning |
| --- | --- |
| `id`, `description` | The name used on the command line, and one sentence on what must hold. |
| `subject` | What the scenario is about: its kind (`gameplay` for most) and an id such as `movement`. |
| `start` | How the run opens: mode, difficulty, weapon, and for some a boss or a wave. |
| `backends` | Where it can run: `live` (the game in a browser, on the test build) and, for some, `headless` (the game without a browser). Eight run headless today. |
| `maxTicks` | The longest it may run, in simulation ticks (120 a second). |
| `testFiles` | The unit tests that cover the same behaviour. |
| `evidence` | The command that proves the scenario, and the task ids CI uses for it. |

A scenario is not the test itself. The checking is done by the command in `evidence` and by the files
in `testFiles`; the entry ties them to a name and a start.

## How to run one

```
pnpm tearbench list
pnpm tearbench run movement-jump
```

`list` prints every id with its description and changes nothing. `run` builds the test build
(`pnpm build:test:standalone`, a few minutes), plays the scenario on it in a browser, prints `PASS` or
`FAIL` and writes what it observed to `artifacts/tearbench/runs/<id>-<seed>.json`, which git ignores.
`--seed` and `--repeat` change the seed and the number of runs. `pnpm tearbench rerun --artifact <file>`
plays a written run again from its recorded actions.

Always start it through `pnpm`; the script refuses to run otherwise. Do not pass `--help`: pnpm 11
ignores it and runs the script.

To run the proof of a scenario directly, run its `evidence.command`, or its unit tests:
`pnpm exec vitest run <a file from testFiles>`.

## How to add one

1. Write the test first: a unit test, and for a `gameplay` subject a `case "<subject id>":` in
   `tests/browser-current-gameplay-scenarios.js`, which resets the game to each scenario and checks
   its subject. TearBench refuses a scenario whose browser proof has no case for its subject.
2. Add the entry to `src/tearbench/canonical-scenarios.json`, with the fields above. Copy the
   `evidence` block of a scenario that uses the same command.
3. Run `pnpm exec vitest run tests/unit/tearbench-current-game-authority.test.ts tests/unit/tearbench-invariants.test.ts`
   and `pnpm test:tearbench-selection`. They check the list against its contract and against the
   change-to-test routes.
4. Run the new scenario as above.

Read `.agents/skills/tear-combat-scenarios` before adding a combat or timing scenario.

## What is planned

[The playtest tool plan](../plans/active/PLAYTEST_TOOL_PLAN.md) folds these scenarios into
`pnpm playtest check` in its fourth stage. Until then this page describes what runs.
