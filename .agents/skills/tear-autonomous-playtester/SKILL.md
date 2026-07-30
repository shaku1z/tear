---
name: tear-autonomous-playtester
description: Select, run, interpret, minimize, and report credible Tear gameplay evidence with TearBench. Use for gameplay changes or defects, deterministic scenarios, State Forge states, Graveyard regressions, autonomous journeys, branch comparisons, CI evidence selection, and release certification; also use when deciding whether tests actually establish gameplay behavior.
---

# Tear Autonomous Playtester

Use the repository CLI and canonical gates as the authority. Do not equate unrelated unit tests with gameplay evidence.

## Workflow

1. Read `package.json`, `docs/ARCHITECTURE.md`, and the relevant diff.
2. Put changed file paths in a newline-delimited file and run:

   ```text
   pnpm tearbench select --files-from <path> --artifact artifacts/tearbench/evidence-selection.json
   ```

3. Inspect the selection. It must name deterministic scenarios, Graveyard cases, a journey checkpoint, a base comparison, and affected interaction matrices.
4. Run the focused evidence:

   ```text
   pnpm tearbench ci --files-from <path>
   ```

5. For a single scenario, use `pnpm tearbench run <scenario-id> --seed <seed>`. Preserve its JSON artifact. Use `pnpm tearbench rerun --artifact <path>` before minimization or attribution.
6. If behavior diverges, establish the first material tick, minimize only with repeated reproduction, retain the minimal child in the Graveyard, and report product, policy, infrastructure, or inconclusive ownership.
7. If the change affects browser-visible behavior, run the selected journey and relevant browser/input/platform matrix. A headless or unit result cannot substitute for this.
8. Before release-readiness claims, run `pnpm check` from the final intended worktree. Require the preservation corpus and release certificate inputs as well.

Read [references/evidence-contract.md](references/evidence-contract.md) when interpreting selection fields, choosing observation classes, or writing the final report.

## Guardrails

- Treat semantic actions, fixed ticks, named RNG streams, and versioned state/event contracts as authoritative.
- Keep Class A introspective, Class B physical-action/structured-observation, and Class C pixel-only evidence labels explicit.
- Never claim Class C autonomy without its actual certification artifact.
- Preserve Ghost V1/V2 degradation labels and unsupported historical-runtime verdicts.
- Never mutate production state through TearBench; use the test-only composition root.
- Never deploy, publish, upload, or contact a live service as part of evidence gathering.

## Report

Lead with pass, fail, or incomplete. Name:

- scenario and seed;
- observation class;
- first material divergence, if any;
- selected Graveyard and base-comparison evidence;
- journey and interaction matrices actually run;
- artifact paths;
- commands that failed, passed, or were intentionally not run.
