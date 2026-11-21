# Committed files that are generated or versioned

Each of these is checked against its inputs. Regenerate only for the reason given, and commit the result
in the same pull request as the change that caused it.

| File | Regenerate or edit when | How | Authority |
| --- | --- | --- | --- |
| `tests/fixtures/canonical-hash-stream.json` | A gameplay change that is meant to alter simulation results. Never for a refactor. | Bash: `TEAR_HASH_STREAM_WRITE=1 pnpm test:determinism`. PowerShell: set `$env:TEAR_HASH_STREAM_WRITE = "1"`, run `pnpm test:determinism`, then remove the variable. | [docs/ARCHITECTURE.md](../../../../docs/ARCHITECTURE.md), "Code budget and refactor safety nets" |
| `src/gameplay/run/ruleset-version.ts` | A change alters what a recorded run would do (a fight, a wave, a stage object, a rule). Bump once, in the first pull request that changes behaviour. | Raise the `vN` of `CURRENT_RULESET_VERSION`, say what changed in the comment above it, and keep the previous value as a named constant for old replays, as the file already does. | The file's own comment; [docs/HOW_TO_ADD_A_BIOME.md](../../../../docs/HOW_TO_ADD_A_BIOME.md), "Evidence" |
| `src/gameplay/training/tutorial-gold-reference-data.json`, `tests/fixtures/tutorial-gold-reference-proof.json`, `src/gameplay/training/tutorial-gold-binding.json` | Tutorial code changed and no longer produces the committed gold. A build then refuses with "Tutorial gold references are stale". | Bash: `TEAR_TUTORIAL_GOLD_WRITE=1 pnpm exec vitest run tests/unit/tutorial-production-ghost.test.ts`. Commit all three together. | `AGENTS.md`, "Known traps" |
| The pages under `docs/position/` | A file under `config/position/` changed. | `pnpm position:render` | `AGENTS.md`, "Repository map" |
| `config/architecture-baseline.json`, `config/code-budget-baseline.json` | A module moved or shrank. | `node scripts/check-source-architecture.mjs --update` and `node scripts/check-code-budget.mjs --update`, with `--move <old>=<new>` for a rename. They only lower. | [docs/ARCHITECTURE.md](../../../../docs/ARCHITECTURE.md) |
| `public/audio/music.json` and the cue folders beside it | Never by hand. The music repository generates them. | Out of scope for a game task unless the owner names the music repository. | [docs/TEAR_SCORE_INTEGRATION.md](../../../../docs/TEAR_SCORE_INTEGRATION.md) |

Pinned seeds live with the test or scenario that uses them. A changed seed is a changed test: say why in
the pull request.
