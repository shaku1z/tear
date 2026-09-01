# TC-4 — Rootbound repeated-poll regression

## Current disposition

TC-4 is green at local implementation commit
`ddc5a23f2b09249659dc62882410384927d4634d` on
`codex/tc4-rootbound-repeated-poll`, from baseline
`7bce1b56f7725bde9d05e92d7d665ec20d163143`.
The live current-game journey now proves Rootbound Phase II remains stable for
two production polls after the Mercy Graft is destroyed and before terminal
cleanup.

## Fail-first proof

The browser step was exercised against a temporary, uncommitted mutation that
allowed a destroyed or expired owner/type Graft to be reinstalled. The first
post-destruction poll failed with:

```text
TypeError: duplicate environment object ID: enemy:1:graft:mercy
```

The mutation was reversed before the implementation commit. The production
idempotency guard continues to return the existing terminal Graft by owner and
type rather than creating or mutating a replacement.

## Evidence contract

- The surgical State Forge fixture restores Rootbound in Phase II with an
  active Mercy Graft bound to the live boss owner and target.
- Destruction is followed by two bounded production `step` polls before any
  cleanup call.
- Each poll retains the exact three owner Graft IDs, exactly one Mercy Graft,
  and the Mercy Graft's original destroyed state, state tick, and recovery
  projection.
- The expected damage and destruction facts each occur exactly once. No
  replacement/create lifecycle fact, active Mercy effect projection, enemy
  defeat, or score change occurs during repeated polling.
- Terminal cleanup is invoked and asserted afterward as a separate transition
  to `expired` with `boss-terminal` ownership.

## Validation

- Two focused Vitest files passed all 25 Graft Anchor and Rootbound Phase-II
  tests.
- TypeScript project typecheck, browser JavaScript syntax, and `git diff
  --check` passed.
- A clean-commit `test-standalone` build recorded source revision
  `ddc5a23f2b09249659dc62882410384927d4634d` and fingerprint
  `fd9cbb18e770994cbb566c4e5ad37c5f4d7a280d6772642e08330886fbbbb470`.
- The selected current-game Class-A browser journey passed all 13 source-owned
  scenarios.

No full Rootbound campaign, endurance run, phase redesign, merge, push,
protected workflow, deployment, publication, wiki action, or C40 claim was
made.
