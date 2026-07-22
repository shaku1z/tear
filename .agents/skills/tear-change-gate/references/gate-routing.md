# Gate routing

Always confirm current scripts in `package.json`; this file explains selection, not a second command registry.

| Change surface | Start with | Add when relevant |
|---|---|---|
| TypeScript implementation or contracts | `pnpm typecheck`, targeted `pnpm exec vitest run <test-files>` | `pnpm lint`, `pnpm check:architecture` for boundary/module changes |
| Weapon, ability, enemy, boss, mode, simulation | Relevant unit/conformance tests | `pnpm test:weapons`; built feature or journey matrices when player-visible |
| Screen, UI, input, responsive behavior | Relevant renderer/controller unit tests | `pnpm build:standalone`, then the applicable journey, input, responsive, or cinematic browser script |
| Persistence, replay, identity, cloud | Relevant envelope, round-trip, and adapter contract tests | Browser platform or journey evidence when composition or user flow changes |
| Audio event, mixer, backend, TearScore | Relevant audio unit/contract tests | TearScore provenance gate for vendored inputs; standalone build and audio browser gate for lifecycle/routing changes |
| Standalone/PWA | Standalone build and applicable browser smoke | PWA gate for manifest, offline, or update behavior |
| CrazyGames | CrazyGames build and platform contracts | Platform browser, iframe, and package gates for SDK, lifecycle, paths, or artifact changes |
| Bundling or dependencies | Applicable build and bundle budget | Reproducibility and target packaging when output may change |
| Cloudflare configuration | Standalone build | Cloudflare dry-run gate |
| Release claim | Targeted checks may accelerate iteration | Always finish with `pnpm check` |

Browser gates consume built artifacts. Rebuild the affected target before trusting their results.

Use targeted Vitest paths for quick iteration. Run the broader named package scripts once a change crosses multiple contracts or shared composition.
