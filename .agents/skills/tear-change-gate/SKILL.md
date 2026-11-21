---
name: tear-change-gate
description: Choose, run and read the checks a Tear change needs. Use after changing source, tests, content, UI, saves, audio, platform adapters, builds, tooling or docs; when a check fails locally or in CI; before opening or updating a pull request; and before saying a change or a release is ready.
---

# Tear change gate

The checks are defined once, in `config/checks.json`, and run by `scripts/run-checks.mjs`. `package.json`
and `config/tool-catalogue.json` name every other command with its side effects and usual time. This skill
says which to run when; it defines no check of its own.

## The levels

| Level | Command | When |
| --- | --- | --- |
| One file | `pnpm exec vitest run <test file>` or `pnpm test:related <changed src files>` | While iterating. A new test file must be in git's index first (`git add -N <file>`). |
| Format | `pnpm format` | Before every hand-off. It rewrites files. |
| Fast group | `pnpm check:quick` | Before pushing; the pre-push hook runs it too. Format, docs, terminology, repository guards, architecture, code budget, typecheck, lint of changed files. |
| Required check | CI's Validate workflow on the pull request | Always. It runs the `static`, `unit`, `build` and `browser` groups on the change merged with current `main`. |
| The same list locally | `pnpm check` (`pnpm check:functional` is the same command) | Rarely: it holds the machine for a long time. Prefer one group, `node scripts/run-checks.mjs <group>`, or let CI run it. |
| Docs only | `pnpm check:docs`, `pnpm test:docs`, `pnpm check:terminology` | A change to documents only. CI runs these plus `pnpm test:terminology` and `pnpm wiki:test` in place of the game checks. |

The `nightly`, `weekly` and `mobile` groups are outside the required check. A release candidate also needs
`pnpm check:performance` on the controlled release host
([docs/RELEASE_AUTHORITY.md](../../../docs/RELEASE_AUTHORITY.md)).

## Workflow

1. Read the diff and list the areas it touches.
2. Pick the matching rows of [references/gate-routing.md](references/gate-routing.md) and run their
   "start with" commands while iterating.
3. If the change touches a committed generated file or its inputs, follow
   [references/generated-files.md](references/generated-files.md) before building.
4. On a failure, read [references/failure-interpretation.md](references/failure-interpretation.md), find the
   rule the check protects, and fix the code or the test at its cause.
5. Before pushing: `pnpm format`, then `pnpm check:quick`.
6. Report in the pull request template's "Checks run here" and "Checks that could not run" sections:
   exact commands, their results, and the revision they ran on.

## Rules

- **One run is the verdict.** No retries in any form, and no re-running an unchanged tree hoping it passes.
  A failure followed by a pass is reported as a failure. A flaky test is fixed at its cause or deleted with
  a row in `docs/PITFALLS.md`; after three failed rounds on one flaky test, stop and bring in the lead.
- **Never weaken a gate.** No raised baseline, widened ignore list, skipped test or `// prettier-ignore` to
  get green. The architecture and code-budget baselines only shrink.
- **Heavy commands wait their turn.** Run a whole suite, a build or a browser test as
  `pnpm queue -- <command>`; every worktree shares the queue. `run-checks.mjs` groups other than `fast`
  join it themselves.
- **Browser tests read built files**, never the dev server. Most read `dist/test-standalone`
  (`pnpm build:test:standalone`); rebuild after changing source.
- **Evidence belongs to the revision it ran on.** After the source changes, rerun the affected command.
  A local pass never replaces the required CI check.
- **Gate files are reviewed.** A change to a file listed in `config/gate-files.json` is held by
  `pnpm merge:ready` until the lead clears it. Say so in the pull request.
- **Nothing here deploys.** `pnpm deploy` is a build plus a Wrangler dry run. Do not pass `--help` to a
  package script: pnpm runs the script.

Opening, updating and merging the pull request is covered by `tear-pull-request`.
