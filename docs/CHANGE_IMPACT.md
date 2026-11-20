# Change impact

How changed files decide what runs: on a pull request, only whether the change is docs-only; in
an evidence selection, which scenarios and journeys run, and what happens to a file that no route
names. This page reports today's behaviour; it does not change it.

## What runs for a pull request

1. **Docs-only test.** The scope job of `.github/workflows/ci.yml` holds the one pattern of
   documentation paths. If every changed file matches it, CI skips the gameplay checks and runs
   `check:docs`, `test:docs`, `check:terminology`, `test:terminology` and `wiki:test` instead.
   The pattern there is the definition; this page does not repeat it.
2. **Full gate.** Otherwise CI runs the checks of `pnpm check:functional`. It does not depend on
   the evidence selection below.

## Evidence selection

No workflow runs it; `pnpm tearbench ci --files-from <file>` runs it by hand. Over the whole
history it selects nothing that a group of `config/checks.json` does not already run, except the
scripted-agent autonomy journey, which the weekly group runs. It matches each file against the prefixes in `src/tearbench/evidence-routes.json`
(`evidenceForDiff` in `scripts/tearbench.mjs`). A prefix ending in `/` or `-` matches by start;
anything else must equal the path. Every matched route contributes its scenarios, Graveyard
cases, journey checkpoint, interaction matrices and build targets.

## What happens to a path no route names

- If any changed file matches no route, or no file matches any route, the `shared-runtime`
  route is added. It brings seven scenarios (boot, movement, dash, cut, parry, wave clear,
  draft), the shared-runtime Graveyard history, the menu-to-menu journey and every interaction
  matrix.
- Nothing is reported. The selection artifact lists the routes chosen, but it does not say
  that a file fell through to the fallback.
- A pull request runs the `check:functional` checks whatever the routes say, so an unrouted file
  is not untested there. What a selection misses is the targeted evidence its area would choose: a change to an unrouted combat or replay file
  gets the generic seven scenarios, not that area's own scenarios.

On 2026-11-13, 893 of 2,156 tracked paths matched no route. Most are tests, tooling, assets and
configuration. The 67 under `src/` include files that carry gameplay or replay identity, for
example `src/gameplay/runtime/tear-combat-simulation.ts`,
`src/gameplay/runtime/authoritative-input.ts`, `src/replay/hash.ts`,
`src/replay/envelope.ts`, `src/entrypoints/standalone.ts` and the tutorial-gold modules under
`src/gameplay/training/`. Routing them is a TearBench decision for the route owners, not part of
this check.

## The completeness check

`config/change-impact-defaults.json` lists every tracked path that matches no route, in named
groups with a reason. `tests/unit/change-impact.test.mjs` fails when:

- a tracked path is neither routed nor listed (a new file has to be routed or declared);
- a listed entry matches no tracked file (a deleted file leaves no stale entry);
- a listed file now matches a route (the declaration is no longer needed);
- a `src/` entry is a folder or prefix rather than a single file;
- the `shared-runtime` fallback route no longer exists.

Outside `src/`, groups may name a folder (`tests/`, `scripts/`, `public/`), because those files
are covered by their own suites and by `check:functional`. Under `src/`, each file is listed by
name, so adding an unrouted source file is a visible line in review.

To clear an entry, add the file to the right route in `src/tearbench/evidence-routes.json` and
remove it from the defaults; the test then checks that it really routes.
