---
name: tear-change-gate
description: Select, run, and explain the smallest relevant canonical Tear repository gates. Use after changing Tear source, tests, content, UI, persistence, audio, platform adapters, packaging, PWA, Cloudflare, or release configuration; when diagnosing a failing Tear gate; and before making a release-readiness claim.
---

# Tear Change Gate

Use Tear's existing `package.json`, tests, scripts, and CI as the authority. Orchestrate them; never recreate their validation logic.

## Workflow

1. Read `package.json`, `docs/ARCHITECTURE.md`, and the changed-file diff before choosing commands.
2. Classify the change by affected subsystem and release surface.
3. Read [references/gate-routing.md](references/gate-routing.md) and run the smallest checks that can disprove the change during development.
4. If a gate fails, read [references/failure-interpretation.md](references/failure-interpretation.md), identify the owning contract, and fix the product or test evidence rather than weakening the gate.
5. Re-run the failed gate, then any directly downstream gate.
6. Before claiming release readiness, require `pnpm check` from the final intended commit/worktree state.

## Boundaries

- Never invoke `pnpm deploy`, `wrangler deploy`, publish, upload, or write to a live service unless the user explicitly requests that external action.
- Never substitute a hand-built check for a repository command.
- Never restore classic-script ordering, `?v=` reconciliation, global discovery, handwritten cache versions, or manual service-worker shell lists.
- Never claim that targeted checks equal the release gate.
- Preserve unrelated worktree changes and report which commands were run, skipped, failed, and passed.

## Reporting

Lead with the gate outcome. For a failure, name the invariant, the evidence that failed, the likely owning files, and the next smallest command. For success, distinguish targeted development confidence from full `pnpm check` release evidence.
