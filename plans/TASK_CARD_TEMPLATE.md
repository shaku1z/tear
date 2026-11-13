# Task card template

Copy this file to `plans/active/<SHORT_NAME>.md` for a task that takes more than one pull
request or more than one session. Write the failure modes and the "done when" lines before
any code or tests. Move the card to `plans/completed/` when every "done when" line holds,
and update `plans/README.md` and `config/position.json` in the same pull request. A new
active plan also needs its path in `CANONICAL_ACTIVE_PLAN_PATHS` in `scripts/check-docs.mjs`.

A one-pull-request change does not need a card: its pull request description is enough.

---

# <Task name>

## Authority metadata

- **Owner:** <role, for example "Verdant gameplay owner">
- **Status:** Active
- **Closure condition:** <one sentence: every "done when" line below holds, plus the gate that must pass>

## Why

<Two or three sentences: what is wrong or missing today, for whom, and the owner's words if
this came from the owner.>

## Failure modes (write these first)

What would make this look done while it is not? Each one names how you would catch it.

1. <Example: the stage loads but the boss never spawns on the second loop; caught by a
   deterministic scenario that runs two loops.>
2. <...>

## Done when

Each line is measurable: a command and its expected result, a number, or a named
observation by the owner. "Works" and "looks good" are not measurable.

- [ ] <Example: `pnpm exec vitest run tests/unit/verdant-boss.test.ts` passes and fails on `main`.>
- [ ] <Example: frame p95 under 8 ms in `pnpm test:browser:performance` on the Verdant stage.>
- [ ] <Example: the owner has played the stage and said it may ship.>

## Scope

- **Changes:** <folders and files this task may change>
- **Does not change:** <explicit non-goals, including files other sessions own>

## Checks

- **While iterating:** <targeted commands>
- **Before each pull request:** <the gates from `.agents/skills/tear-change-gate`>
- **Could not run here:** <anything that needs a device, the owner or a service, and who runs it>

## Log

Dated, one line each: what landed (pull request link) and what changed in the plan.

- <YYYY-MM-DD> <entry>
