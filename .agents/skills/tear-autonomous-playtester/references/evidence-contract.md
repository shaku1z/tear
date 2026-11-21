# What each kind of evidence establishes

| Evidence | Establishes | Does not establish |
| --- | --- | --- |
| Unit or contract test | One rule or one stored format | That the pieces work together in a run |
| Property test | A rule over many generated inputs | Behaviour outside the generator's range |
| `pnpm test:determinism` | Scripted runs give the committed state hashes | That the behaviour is right, only that it did not change |
| TearBench scenario | Behaviour in a named start, with given actions and seed | A whole journey from menu to menu |
| `pnpm playtest` report | Measured outcomes for scripted players on fixed seeds | How the game feels to a person |
| Browser journey, input or responsive check | Real routes through built files for the cells it covers | Cells it does not cover (devices, viewports, real hardware) |
| The required check (`pnpm check`) | Every check in `config/checks.json` passed on that revision | Live-service health, performance on the release host |

## Reading a selection

`pnpm tearbench select` and `pnpm tearbench ci` write a selection with these fields:

- `routes`: the entries of `src/tearbench/evidence-routes.json` the changed files matched. `shared-runtime`
  is the fallback when a file matches none.
- `scenarios`: ids from `src/tearbench/canonical-scenarios.json`.
- `journeyCheckpoints`, `baseComparisons`, `interactionMatrices`: the browser journey, the comparison and
  the matrices each matched route names.

A selection is a list of what an area's evidence is. It is not a result until the commands it names have run.

## Comparing two builds

Use the same report, set, seed and scripted player on both, and name both revisions. Old run files are not
upgraded by hand to a newer format; play the run again.
