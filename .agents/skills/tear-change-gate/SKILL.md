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
6. Before claiming release readiness, require the existing full release gate for the final intended source. Coordinate that gate once: inspect any supplied evidence using [evidence-handoff.md](references/evidence-handoff.md) before scheduling execution. A protected functional `check` alone is not a full release result. If qualifying evidence is absent or invalid, the full `pnpm check` obligation remains; report a blocker when it cannot safely run.

## Evidence coordination

This skill owns skill-level gate coordination, not certification authority.
Specialists hand off their claims, evidence and gaps using the shared reference;
they do not independently launch the final full gate. Use `client-status` to inspect
the bound mission, then `ensure-client-task` for its missing registered task IDs,
as described in the shared reference. A reused task stops duplicate execution;
failed, stale, unsupported or occupied-lease results require resolution, not an
automatic retry. Keep unregistered obligations explicit. Only this skill
coordinates the final full gate; neither a client handoff nor a local receipt
is a protected certificate.

## Boundaries

- Never invoke `pnpm deploy`, `wrangler deploy`, publish, upload, or write to a live service unless the user explicitly requests that external action.
- Never substitute a hand-built check for a repository command.
- Never restore classic-script ordering, `?v=` reconciliation, global discovery, handwritten cache versions, or manual service-worker shell lists.
- Never claim that targeted checks equal the release gate.
- Preserve unrelated worktree changes and report which commands were run, skipped, failed, and passed.

## Reporting

Lead with the gate outcome. For a failure, name the invariant, the evidence that failed, the likely owning files, and the next smallest command. For success, distinguish targeted development confidence from full `pnpm check` release evidence.
