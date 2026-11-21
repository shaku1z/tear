# Gate routing

`package.json` holds the scripts and `config/checks.json` holds what CI runs. This table only says where to
start. Run builds, browser tests and whole suites through `pnpm queue -- <command>`.

| Change | Start with | Add when relevant |
| --- | --- | --- |
| Any code or root config | `pnpm format`, then `pnpm check:quick` | `pnpm lint` (the whole tree; several minutes) when a lint rule or a shared type changed |
| TypeScript in `src/` | `pnpm typecheck`, `pnpm test:related <files>` | `pnpm check:architecture` and `pnpm check:code-budget` when files move, grow or import across layers |
| A new file under `src/` | `pnpm exec vitest run tests/unit/change-impact.test.mjs` | Route it in `src/tearbench/evidence-routes.json` or list it in `config/change-impact-defaults.json` ([docs/CHANGE_IMPACT.md](../../../../docs/CHANGE_IMPACT.md)) |
| A new package script or `scripts/` file | `git add` it, then `pnpm exec vitest run tests/unit/tool-catalogue.test.mjs` | The test sees tracked files only: an untracked script passes locally and fails in CI |
| Weapon, ability, enemy, boss, mode, simulation | The area's unit tests | `pnpm test:weapons`; `pnpm test:determinism`; `pnpm test:headless:current-gameplay-scenarios`; a browser check below when players can see it |
| Refactor that claims no behaviour change | `pnpm test:determinism` | It must pass without regenerating the fixture |
| Tutorial code or its imports | `pnpm exec vitest run tests/unit/tutorial-production-ghost.test.ts` | Refresh the tutorial gold when the output changed ([generated-files.md](generated-files.md)) |
| Screen, UI, input, layout | Renderer and controller unit tests | `pnpm build:test:standalone`, then `pnpm test:browser:journeys`, `pnpm test:browser:input` or `pnpm test:browser:responsive` |
| Saves, replay, identity, cloud | Envelope, round-trip and `tests/contract/` tests | `pnpm test:rules` for `firestore.rules` or the Firebase adapter; `pnpm exec vitest run tests/contract/release-compatibility.test.ts` for stored formats |
| Audio or music files | Audio unit tests; `pnpm check:music` | `pnpm test:browser:audio` on a test build |
| Game facts the wiki reads | `pnpm check:game-reference` | `pnpm wiki:test` |
| Standalone build, offline, update | `pnpm build:standalone` | `pnpm test:browser`, `pnpm test:pwa` |
| CrazyGames | `pnpm build:crazygames`, platform contract tests | `pnpm test:browser:platform`, `pnpm test:browser:crazygames-iframe`, `pnpm check:crazygames-package` |
| Bundling or dependencies | The affected build, `pnpm check:bundles` | `pnpm check:load-budgets`, `pnpm check:reproducible` |
| Cloudflare configuration | `pnpm build:standalone` | `pnpm check:cloudflare` (a dry run) |
| Architecture or code-budget rules | `pnpm test:architecture`, `pnpm test:code-budget` | These are gate files: the lead reviews them |
| Git hooks, guard, merge helper (`scripts/governance/`) | `pnpm exec vitest run tests/unit/governance-guard.test.mjs tests/unit/governance-merge-helper.test.mjs tests/unit/governance-setup.test.mjs` | Behaviour may only stay the same or get stricter |
| A workstream's state | Edit `config/position.json`, then `pnpm position:render` | `pnpm check:docs` fails on a stale or hand-edited `docs/POSITION.md` |
| Documents, plans, skills | `pnpm check:docs`, `pnpm test:docs`, `pnpm check:terminology` | `pnpm test:agent-skills` for anything under `.agents/skills` or `.claude/skills` |

Prettier owns formatting (`.prettierrc.json`; targets in `scripts/format.mjs`; exclusions in
`.prettierignore`). ESLint has no formatting rules. Fix a `format:check` failure by running `pnpm format`.

Touch and phone checks are parked while mobile is paused (`plans/MOBILE_LATER.md`): the required check runs
the desktop halves, and `pnpm check:mobile` runs the rest on demand.
