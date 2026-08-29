# PT3-C8 — Pale campaign owner tuning

This record contains the design-owner choices used to make Pale's isolated
ten-wave block coherent. It is intentionally separate from the correctness
evidence in `PT3-C8_EVIDENCE.md`: passing tests proves that these values are
applied consistently, not that they are the final seven-stage balance.

## Active isolated values

- Pale retains its approved engineering curve: `2.08` base health, `1.44`
  base damage, `+6` enemies, and `+3` concurrent enemies. Local-wave health
  and damage continue to use the shared `+6%` and `+2%` ramps.
- `charger` joins the Pale pool at weight `0.65`, local wave 1. This is the
  existing family required for Rime Runner to occur naturally; no new family,
  roster, or selection path was introduced.
- Local-wave composition budgets are `3, 4, 5, 6, 7, 8, 9, 10, 11` for regular
  waves. Wave 10 is the White Hart boss and therefore has a zero regular-enemy
  budget.
- Pressure costs are: Rimehound `1`, Charger `1`, Armored `1`, Wraith `2`,
  Chimera `2`, and Anchor `3`. Ranged, Flyer, and Bomber remain zero-cost so a
  legal ordinary selection always remains after a costly family reaches its
  cap.
- Rimehound caps rise from `2` to `5`; Charger from `1` to `4`; Wraith from
  `0` to `3`; Anchor from `0` to `2`. Their first non-zero caps match their
  authored unlock waves. The limits bound simultaneous pack, route, immunity,
  and tether pressure without suppressing those identities later in the block.

## Explicitly provisional decisions

These values are source-owned for the Pale feature branch, but their
cross-stage balance is not finalized. C22 still owns:

- activation or retuning of the complete seven-stage curve;
- Echo and Source health, damage, count, and concurrency at their relocated
  depths;
- final economy, draft, healing, achievement, speedrun, profile, and replay
  migration decisions;
- joint Verdant/Pale promotion and public reference status.

No final music choice, publication, dispatch, deployment, or C40 certification
is implied by this tuning record.
