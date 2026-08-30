# VS3-C15 Verdant wave and curve evidence

## Claim

Verdant campaign pressure is owned by the existing wave planner and one
StageId-keyed curve. Local waves retain the established ramp, support/control
selection is bounded, Rootbinder overlap is capped, environment objects remain
outside living-enemy ownership, and production difficulty/economy/progression
rules remain authoritative through Rootbound at wave 40.

This is engineering evidence, not final seven-stage balance or publication
authority. The complete seven-stage table is an inactive prototype pending Pale.

- Completion source: `c019a42efc246e35827dd4014f2ccaac6fe3e794`
- Focused aggregate: 16 files / 104 tests passed.
- Standalone artifact: `ba40e08c7ccb9a7dad54dcb5c029aac135fb0020329674f210d0c2072bca1e47`
- Additional gates: typecheck, full lint, architecture, documentation, artifact
  layout, and browser progression journeys passed.

## Code-correctness evidence

- Current campaign base pressure no longer compounds array position.
- Verdant uses 1.82 HP, 1.34 damage, +5 queued enemies, and +2 concurrent
  enemies before the unchanged local-wave/difficulty multipliers.
- Verdant control budgets are 0/3/4/5/5/6/7/8/9/0; Rootbinders are capped at
  one through local wave 6 and two through local wave 9.
- Local waves 1-9 remain regular waves with exact source-pool unlocks. Local
  wave 10/global wave 40 is the Rootbound boss queue.
- Two Root links plus all three Grafts do not change the live-enemy cap of 8.
- Easy, Normal, Hard, Extreme, and One-Hit use production difficulty owners.
- Production score, coin, healing, draft/tier, and upgrade synthesis remain
  lawful through wave 40.
- Exact reachable State Forge entries cover waves 31, 35, and 39 with matching
  early/middle/late composition constraints; the C15 evidence route selects
  wave/draft scenarios and the browser progression journey.

Relevant sources include `src/gameplay/run/campaign-stage-curve.ts`,
`src/gameplay/run/composition-budget.ts`, `src/gameplay/run/wave-planner.ts`,
`src/gameplay/run/spawn-scheduler.ts`, and the `verdant-wave-*` unit suites.

## Balance-owner decisions still open

- The StageId values and Verdant control budgets are test seeds, not accepted
  release tuning; playtest distributions and failure causes remain required.
- Pale is absent from live StageId and campaign authorities. Its 2.08/1.44/+6/+3
  slot is recorded only in the inactive seven-stage prototype.
- Relocated Voidspire and Tear values are not active. Their projected reductions
  in count/concurrency and changes in damage require joint seven-stage evidence.
- Echo and Source implementations were not retuned. Their time-to-kill and
  encounter duration must be measured after atomic Pale integration.
- No seven-stage completion, C40 certification, merge, publication, or deployment
  claim is made by this checkpoint.

## Reproduction and artifact policy

Run the VS3-C15 minimum proof recorded in the Revision 3 plan and machine ledger.
Raw selections, browser output, screenshots, and receipts belong under
`artifacts/tearbench/checkpoints/verdant-sanctum/VS3-C15/` or the established
generated/receipt paths and remain ignored. This report, the plan, and the ledger
are the smallest durable evidence set.
