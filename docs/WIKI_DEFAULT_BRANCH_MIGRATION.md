# Wiki `master` to `main` migration procedure

This is the G1 procedure definition, not authorization to deploy the wiki.
Execution remains locked behind the later wiki integration gate.

## Recorded starting state

- Repository: `shaku1z/tear-wiki`.
- Canonical remote `master`: `b57efdaa8774d889555f4708edbe5b1cc6d3ab17`.
- Public service: Cloudflare Worker `tear-wiki`, not Cloudflare Pages.
- Production version: `b72b4f0e-5ae0-4439-9b74-cca7d3fd8d1c`.
- Worker compatibility date/flag: `2026-07-28` and
  `global_fetch_strictly_public`.
- Custom domain: `wiki.tearblade.com` routes to service `tear-wiki`,
  environment `production`, zone `c60d44fb00d5f6a0bf497ef656aeef15`.
- Worker tag: `44fc17ada5584668a117415e6e71c61d`.
- The repository `master` branch has no tracked Wrangler configuration or
  Cloudflare Astro adapter. The failed PR #1 contains those files, while the
  live version has no Git SHA/message/tag attribution. Therefore the deployed
  source commit is **not proven** and PR #1 must not be merged as-is.
- `CLOUDFLARE_PAGES.md` and the GitHub homepage URL describe retired Vercel or
  nonexistent Pages hosting and are not operational truth.

## Preconditions

1. Preserve G0 bundles/tags and export the current wiki rules, default branch,
   Worker version, domain record, and workflow definitions.
2. Make a clean branch from remote `master`, never from the seven-commit-behind
   historical local checkout.
3. Replace legacy `js/` scraping with generated data from the current `src/`
   architecture and validate all canonical Final Five pages.
4. Build an attributed non-production `tear-wiki` Worker preview from the
   reviewed source. Do not route `wiki.tearblade.com` to it.
5. Change synchronization from direct default-branch pushes to reviewed bot
   pull requests carrying the exact deployed game SHA.
6. Add a wiki Validate workflow and require its real check context.

## Branch migration sequence

1. Create `main` at the exact reviewed descendant of remote `master`.
2. Push `main` without changing the GitHub default branch or Cloudflare route.
3. Open and validate a pull request whose base is `main`; prove normal and bot
   PR flows work under the intended ruleset.
4. Protect `main`: pull requests and current wiki validation required; force
   push and deletion blocked; no routine administrator bypass.
5. Update workflow branch filters, checkout/push targets, documentation, and
   repository homepage metadata from `master` to `main` in one reviewed slice.
6. Change the GitHub default branch to `main`.
7. Re-read every open PR base and automation target. Retarget only reviewed
   modern work; keep unsafe PR #1 marked **DO NOT MERGE**.
8. Configure the `tear-wiki` Worker publisher to consume the validated `main`
   artifact. Keep the existing Worker name and custom-domain record unchanged.
9. Rehearse the exact source/artifact against a separate preview Worker and
   verify its embedded game SHA before any production change.
10. Preserve `master` with an archive tag. Deletion is a later gated cleanup;
    it is not part of the default-branch switch.

## Production invariants

- `wiki.tearblade.com` must continue routing to Worker `tear-wiki` throughout
  the branch migration.
- No Pages project is created as a side effect.
- No source is deployed from PR #1, a dirty worktree, or a stale checkout.
- A wiki production deploy occurs only after the game production workflow
  dispatches the exact deployed game SHA.
- The public wiki must expose that game SHA and its own Git SHA before the
  migration can be called complete.
