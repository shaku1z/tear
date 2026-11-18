## What and why

<!-- What changes for players or developers, and why. Link the task card, plan or position area this serves. -->

## Design check

<!-- The design check from docs/ENGINEERING_STANDARD.md. Short answers are fine. "n/a" needs a reason, for example "n/a: docs only, no rule or content changed". -->

- **General case:** what is the general version of this, and where else does it (or will it) apply?
- **One owner:** which single module or data file owns this rule or content now?
- **The next one:** what does adding the second instance take?
- **Cause:** for a fix, the cause, which other places shared it, and the check that stops it returning.
- **Measured:** what numbers changed (time, bytes, frame cost, CI minutes), on which profile?
- **Removed:** what this deleted or replaced (duplicates, dead code, old paths).

## Checks run here

<!-- Exact commands and results, for example: `pnpm check:quick` passed; `pnpm exec vitest run tests/unit/x.test.ts` 12 passed. A command that ran zero tests is not a pass. -->

-

## Checks that could not run

<!-- Each check this change needs that was not run, and why (no browser, needs the owner, needs a device). Write "none" if every needed check ran. -->

-

## Risks

<!-- What could break, for whom, and how to roll it back. Note save, replay or cloud-format changes explicitly. -->

-

## Position

<!-- If this changes a workstream's state, say which area of config/position.json you updated. -->

<!--
Keep this description free of attribution lines: no co-author, sign-off or "generated with" trailers.
The owner-safe merge uses this text as the squash commit body, and the history guard rejects attribution.
-->
