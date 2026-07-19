# Deployment

Tear's canonical standalone host is **Cloudflare Workers Static Assets**. The checked-in source tree is never deployed directly: Vite generates a content-hashed standalone artifact in `dist/standalone`, and Wrangler uploads only that directory.

## Prerequisites

- Node.js 24 or newer
- pnpm 11.15.0 through Corepack
- A Cloudflare account authenticated with `pnpm wrangler login`, or CI credentials configured outside the repository

Install exactly the locked dependency graph:

```powershell
pnpm install --frozen-lockfile
```

## Validate locally

The complete release gate type-checks, lints, tests, builds both targets, and runs the generated standalone artifact in Chrome:

```powershell
pnpm check
```

For normal local development:

```powershell
pnpm dev
pnpm dev:crazygames
```

The dev server does not install a service worker. The CrazyGames dev target injects the SDK wrapper; its platform adapter remains capability-gated outside the portal.

## Preview the standalone artifact

```powershell
pnpm build:standalone
pnpm preview
```

The standalone artifact contains generated hashed JavaScript, fonts/icons, the web manifest, Cloudflare `_headers`, and the generated Workbox service worker. Cache keys derive from content; there is no manual version number to bump.

Validate Wrangler's upload without changing Cloudflare state:

```powershell
pnpm exec wrangler deploy --dry-run
```

The dry run must report `dist/standalone` as the assets directory. Source, tests, plans, repository metadata and the CrazyGames build must not appear in its upload.

## Deploy

```powershell
pnpm deploy
```

`pnpm deploy` runs the complete release gate before `wrangler deploy`. The Worker name, current compatibility date, observability and the generated-assets boundary live in `wrangler.jsonc`.

Production CI should run `pnpm install --frozen-lockfile` followed by `pnpm deploy`. Cloudflare API tokens belong in the CI secret store, never in this repository or Wrangler variables.

## Rollback

Cloudflare retains deployment versions. Roll back through the Cloudflare dashboard or the current Wrangler versions/deployments commands after confirming the desired version. A source rollback should still be made as a normal Git revert so the repository remains the canonical release history.

## Standalone data services

Firebase remains a standalone platform adapter for identity, leaderboards and shared replays. Its public web configuration is bundled only as non-secret client configuration; authorization continues to be enforced through Firebase Auth and Firestore rules. Cloudflare hosts the generated game files and does not replace those game services in this redesign.
