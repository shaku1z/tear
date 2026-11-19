# Gate routing

Always confirm current scripts in `package.json`; this file explains selection, not a second command registry.

| Change surface | Start with | Add when relevant |
|---|---|---|
| Any code or root config edit | `pnpm format` (Prettier, rewrites files) before handing off | `pnpm format:check` is part of `pnpm check:quick` and CI's `check:functional` (`static.format-check`) |
| TypeScript implementation or contracts | `pnpm typecheck`, targeted `pnpm exec vitest run <test-files>` | `pnpm lint`, `pnpm check:architecture` for boundary/module changes |
| Weapon, ability, enemy, boss, mode, simulation | Relevant unit/conformance tests | `pnpm test:weapons`; built feature or journey matrices when player-visible |
| Screen, UI, input, responsive behavior | Relevant renderer/controller unit tests | `pnpm build:standalone`, then the applicable journey, input, responsive, or cinematic browser script |
| Persistence, replay, identity, cloud | Relevant envelope, round-trip, and adapter contract tests | Browser platform or journey evidence when composition or user flow changes |
| Audio event, mixer, backend, TearScore | Relevant audio unit/contract tests | TearScore provenance gate for vendored inputs; standalone build and audio browser gate for lifecycle/routing changes |
| Standalone/PWA | Standalone build and applicable browser smoke | PWA gate for manifest, offline, or update behavior |
| CrazyGames | CrazyGames build and platform contracts | Platform browser, iframe, and package gates for SDK, lifecycle, paths, or artifact changes |
| Bundling or dependencies | Applicable build and bundle budget | Reproducibility and target packaging when output may change |
| Cloudflare configuration | Standalone build | Cloudflare dry-run gate |
| Git hooks, owner guard or merge helper (`scripts/governance/`) | `pnpm exec vitest run tests/unit/governance-guard.test.mjs tests/unit/governance-merge-helper.test.mjs tests/unit/governance-setup.test.mjs` (the guard cases also run against the shared skill copy when it exists and either copy changed since the last passing run, to prove they agree; `TEAR_GOVERNANCE_PARITY=1` forces it) | Never change these to make a commit pass; behaviour may only stay the same or get stricter |
| Release claim | Targeted checks may accelerate iteration | Always finish with `pnpm check` |

Browser gates consume built artifacts. Rebuild the affected target before trusting their results.

Formatting is owned by Prettier (`.prettierrc.json`; targets in `scripts/format.mjs`; exclusions such as JSON data, Markdown and generated files in `.prettierignore`). ESLint carries no formatting rules, so the two never disagree. A `format:check` failure is fixed by running `pnpm format`, never by editing `.prettierignore` or adding `// prettier-ignore` to pass.

Use targeted Vitest paths for quick iteration. Run the broader named package scripts once a change crosses multiple contracts or shared composition.
