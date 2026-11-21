# Deployment

Tear's canonical standalone host is **Cloudflare Workers Static Assets**. The checked-in source tree is never deployed directly: Vite generates a content-hashed standalone artifact in `dist/standalone`, and Wrangler uploads only that directory.

## Prerequisites

- Node.js 24 or newer
- pnpm 11.15.0 through Corepack
- No Cloudflare login for local work: the Wrangler dry run below needs none. Publishing credentials are GitHub Actions secrets used only by the deploy workflows, which run in the protected `Production` and `Preview` environments.

Install exactly the locked dependency graph:

```powershell
pnpm install --frozen-lockfile
```

## Validate locally

The complete release gate type-checks, lints, tests, builds both targets, and runs the generated standalone artifact in Chrome:

```powershell
pnpm check
```

It runs once for the final release candidate. Every pull request is validated in CI by `pnpm check:functional`, which is the same gate without the controlled-host performance test. See `docs/RELEASE_AUTHORITY.md`.

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
pnpm check:cloudflare
```

This same dry run is part of `pnpm check` and `pnpm check:functional`. It must report `dist/standalone` as the assets directory. Source, tests, plans, repository metadata and the CrazyGames build must not appear in its upload.

## Deploy

No local command publishes the game. `pnpm deploy` and `pnpm deploy:dry-run` only build `dist/standalone` and run the Wrangler dry run above. pnpm runs the `deploy` script even when you add `--help`.

The only publisher is the protected GitHub Actions workflow, described fully in `docs/RELEASE_AUTHORITY.md`:

1. Merge the change into protected `main` through a pull request.
2. Wait for the `Validate` run on that `main` commit to succeed. It uploads the built targets as `tear-release-targets-<sha>`, kept for 14 days.
3. Optionally run `Rehearse Cloudflare Release` with that Validate run ID. It publishes the same artifact to the separate `tear-preview` Worker, served at https://preview.tearblade.com (see Domains below).
4. Run `Deploy Cloudflare Production` with the Validate run ID and approve the protected `Production` environment. The workflow verifies and publishes the stored artifact; it does not rebuild.

The Worker name, current compatibility date, observability and the generated-assets boundary live in `wrangler.jsonc`. Cloudflare API tokens belong in GitHub Actions secrets, never in this repository or Wrangler variables.

## Domains

Each Worker is served from its own custom domain, attached to the Worker in the Cloudflare dashboard, not by the Wrangler configuration: the `tear` Worker at tearblade.com and the `tear-preview` Worker at https://preview.tearblade.com. Neither `wrangler.jsonc` nor `wrangler.preview.jsonc` has routes, and both set `workers_dev` to `false` (the preview also sets `preview_urls` to `false`), so the Worker's default Cloudflare subdomain and per-version preview addresses, which carry the account name, serve nothing. A test in `tests/unit/ci-workflow.test.mjs` pins that and fails on any tracked text that holds such an address.

Why no routes: with `workers_dev` off and a route in the configuration, Wrangler lists the zone's routes (`GET /zones/<zone>/workers/routes`) before every deploy. The preview token cannot read them, so every preview deploy after the first failed there (Rehearse Cloudflare Release run 44913103522, "No access to the specified resource"; the first deploy, run 44893747001, skipped the check because the default subdomain was still on). Attaching the domain once and leaving it out of the configuration needs no extra token permission.

If a domain is ever detached: in the Cloudflare dashboard open Workers & Pages, the Worker (`tear` or `tear-preview`), Settings, Domains & Routes, Add, Custom domain, and enter the host name. Nothing else changes; the next deploy keeps it.

## Rollback

Cloudflare retains deployment versions. Roll back through the Cloudflare dashboard or the current Wrangler versions/deployments commands after confirming the desired version. A source rollback should still be made as a normal Git revert so the repository remains the canonical release history.

## Standalone data services

Firebase remains a standalone platform adapter for identity, leaderboards and shared replays. Its public web configuration is bundled only as non-secret client configuration; authorization continues to be enforced through Firebase Auth and Firestore rules. Cloudflare hosts the generated game files and does not replace those game services in this redesign.
