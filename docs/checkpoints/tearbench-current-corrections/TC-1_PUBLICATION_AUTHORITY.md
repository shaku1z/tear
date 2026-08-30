# TC-1 — Publication authority

## Current disposition

TC-1 implementation is green and in review on
`codex/tc1-publication-authority` (baseline `1bc797bce8cab0fde420eea4a9e8519dc7aae9c7`);
the exact implementation commit is intentionally recorded only after it exists.
The tracked policy and typed source agree on seven authored stages, six
published stages in order, 60 published waves, and `pale-traverse` as the sole
Playground preview.

The historical Revision 3 plan and ledger boundary statements remain intact.
Their explicit current overlays route release and reference decisions to
`config/campaign-publication-boundary.json` and
`src/gameplay/stages.ts`; no historical checkpoint evidence was rewritten.

## Authority contract

- `config/campaign-publication-boundary.json` is the tracked publication input:
  `status=public`, ruleset
  `tear-rules-six-biome-verdant-r3-pale-preview-v1`, active stages
  `grounds → undercroft → crimson-fields → verdant-sanctum → voidspire → tear`,
  and preview `pale-traverse`.
- `src/gameplay/stages.ts` cross-checks the boundary against the seven authored
  `STAGE_IDS`, derives availability and campaign order from it, and throws on
  dropped/reordered stages, Pale publication, unknown IDs, non-public status, or
  ruleset drift.
- `scripts/release-preflight.mjs` continues to reject non-public policy status.
  `scripts/publish-game-reference-artifact.mjs` now validates manifest stages
  against the same tracked policy before writing an artifact.

## Fail-first evidence

The focused contract tests cover exact order/count, Pale exclusion, and the
obsolete engineering/joint-publication policy. The typed source test covers
the seven-stage authored view versus the six-stage published view and the
Playground-only Pale availability. Release preflight and game-reference tests
cover their protected-input and artifact boundaries, including policy
consumption.

Focused evidence on the final reviewed working-tree state:

- two Vitest files / five publication and content-availability tests passed;
- three Node test files / 15 campaign, preflight, and game-reference tests passed;
- TypeScript project typecheck passed;
- documentation authority check and all 13 documentation tests passed;
- terminology check and all 11 terminology tests passed.

No deployment, publication, wiki dispatch, merge, or C40 claim is made here.
