# Reading a failed check

First rule out a stale build: a browser check that fails right after a source change usually ran old files
in `dist/`. Then find the rule the check protects. Check ids are the ones in `config/checks.json`.

| Failing check | What it protects | Look at |
| --- | --- | --- |
| `architecture`, `typecheck`, `lint` | Layer direction, typed ports, no type escapes, no browser globals in rules code | [docs/ARCHITECTURE.md](../../../../docs/ARCHITECTURE.md); `node scripts/check-source-architecture.mjs --explain <file>` |
| `code-budget` | File size, line length, function size | Split along a real responsibility; never raise the baseline |
| `repository-guards` | Every script catalogued, every `src/` file routed, the workflow matching `config/checks.json` | `config/tool-catalogue.json`, `config/change-impact-defaults.json` |
| Unit and contract tests | A definition table, a deterministic rule, a state transition, a stored format or an adapter contract | Fix the code; change an assertion only when the intended rule changed |
| `pnpm test:determinism` | The same inputs give the same state hashes | The first diverging stream and tick it names. Regenerate only for an intended gameplay change |
| A build refusing with "Tutorial gold references are stale" | The tutorial still produces its committed gold | [generated-files.md](generated-files.md) |
| `release-free-of-test-code`, `release-has-no-engineering-surfaces` | Release builds carry no test hooks or engineering screens | `README.md`, "Release builds and engineering builds" |
| Browser journeys, input, responsive | Real routes through built files | Console and page errors, screen transitions, input routing. Never bypass a production action to pass |
| `bundle-budgets`, `load-budgets`, `reproducible-*` | Size, load time, byte-stable builds | [docs/PERFORMANCE_BUDGETS.md](../../../../docs/PERFORMANCE_BUDGETS.md) |
| `music` | Shipped cues match the music index | [docs/TEAR_SCORE_INTEGRATION.md](../../../../docs/TEAR_SCORE_INTEGRATION.md) |
| `platform-*`, `crazygames-*` | Capability fallbacks, SDK lifecycle, package contents | `CRAZYGAMES.md`, [docs/RELEASE_MATRIX.md](../../../../docs/RELEASE_MATRIX.md) |
| `offline`, `cloudflare-dry-run` | Offline start, safe update, an upload holding only the standalone build | `DEPLOYMENT.md` |

A check that fails in CI and passes locally was judged on the change merged with current `main`: take
`main` in with `git merge origin/main` and run it again. Known traps and the guard behind each are in
[docs/PITFALLS.md](../../../../docs/PITFALLS.md).

Report the first failing check and say which later ones did not run.
