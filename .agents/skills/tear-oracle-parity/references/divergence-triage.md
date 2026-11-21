# Classifying a difference

Classify before fixing. A line-level fix on a structural cause does not hold: early parity work restored
code text several times and the blade still felt wrong, because the causes were structural.

## Structural causes (check first when feel is involved)

- **Step model.** Blade springs, `lerp(…, k*dt)` and tip-speed hit gating depend on the time step. The
  simulation runs 120 ticks a second; any timing change rebalances weapons. Confirm the rate before
  touching a constant.
- **Sampling order and double consumption.** The oracle had exactly one reader of pointer movement. A
  second reader that consumes the movement first gives mushy aim. Recording for replays must observe, never
  sit in the input path.
- **State ownership.** Cursor and pointer-lock rules are in
  [docs/CURSOR_INPUT_CONTRACT.md](../../../../docs/CURSOR_INPUT_CONTRACT.md). One missed exit or flush gives
  a jumping reticle or a stuck cursor.
- **Latched or per-frame writes.** The oracle wrote aim overrides every frame. A value cached once takes
  over the player's blade until something clears it.
- **Scattered side effects.** The oracle did a side effect at one call site. List every oracle call site
  and show each has exactly one equivalent now.
- **Integration order.** Velocity then position, or position then velocity, feels different at the same
  constants. Compare the integrator, not only the numbers.
- **Frame-order anchors.** Reading the blade's hand anchor before or after the player step shifts aim by a
  frame of movement.

## Line-level causes

- A wrong constant.
- A wrong or missing design token.
- A missing string, label, empty state or column.
- A simplified layout: sections merged that the oracle kept apart, plain cards where it had rich entries.
- A dropped small interaction: hover lift, deal-in animation, key badges, scroll hints, entrance timing,
  hover moving focus.

## Outcomes

1. **Simplified by the redesign:** restore the behaviour exactly. This is the default.
2. **Missing feature:** restore it and add its evidence to `docs/FEATURE_INVENTORY.md`.
3. **Suspected oracle bug:** do not fix silently; show the oracle behaviour to the lead.
4. **Intentional difference:** it must be recorded in [docs/PARITY.md](../../../../docs/PARITY.md),
   "Intentional differences", or decided in a plan or [docs/DECISIONS.md](../../../../docs/DECISIONS.md).
   Otherwise it is not intentional.

What is still open is tracked in `plans/active/PARITY_RESTORATION_PLAN.md`, not here.
