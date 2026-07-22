# Divergence Triage

Classify before fixing. Line-level fixes on systemic causes waste phases — four textual restore commits still left the blade feeling wrong because the causes were structural.

## Systemic families (check these first when "feel" is implicated)

- **dt / step model.** Oracle ran its tuned regime (blade springs, `lerp(…, k*dt)`, tip-speed hit gating are dt-sensitive). Redesign parity restored 120 Hz fixed step in `src/app/live-frame-runtime.ts`; any timing change silently rebalances weapons and whip feel. Verify sim rate before touching constants.
- **Sampling order / double consumption.** Oracle had exactly one pointer-delta sampler (`_updateAim`). Redesign once added a pre-sim `sampleAim` for replay recording that consumed deltas first — classic "mushy aim". Ghost/replay taping must be passive observers, never in the authoritative input path.
- **State ownership.** Cursor: oracle policy is `data-imode` body attribute + ink arrow drawn on every non-playing screen, nothing extra while playing; `Input.allowLock = (state === "playing")` set every frame; `exitPointerLock()` on every transition out of play; `consumeDelta()` flush on re-lock. A single missed exit/flush = reticle jump or stuck cursor.
- **Latching vs per-frame writes.** Oracle wrote aim overrides explicitly each frame (attract/mirror); lazy `??=` latching hijacks the player blade until cleared. Watch for redesign code converting per-frame writes into cached state.
- **Adapter scattering.** Oracle side effects lived at one call site; the redesign spread them across screen adapters/harnesses. When restoring, enumerate every oracle call site and prove each has exactly one redesign equivalent.
- **Integration order.** Velocity-then-position vs position-then-velocity changes feel at identical constants. Diff the integrator, not just the numbers.
- **Frame-order anchors.** e.g. blade hand anchor read pre- vs post-player-step shifts aim by one frame of movement every frame.

## Line-level families

- Wrong constant (config field, spring k, sensitivity, resist values like boss tether counter-pull 0.18/0.12).
- Wrong or missing UI.t token value.
- Missing string/label/empty-state/column ("Keep fighting to make progress.", RUN LOG WAVE/TIME/KILLS/PEAK).
- Simplified layout (merged sections the oracle kept separate; plain cards where the oracle had rich entries — e.g. codex BESTIARY stat chips, playground two-column geometry).
- Dropped micro-interaction (hover lift/scale, deal-in animation, keybind badges, scroll hints, tier pips, entrance timing, pointer-hover-moves-focus in every input mode).

## Triage outcomes

1. **Lazy simplification** → restore verbatim behavior (the default; source of truth wins).
2. **Missing feature** → restore, and add it to `docs/FEATURE_INVENTORY.md` evidence.
3. **Suspected oracle bug** → do not fix silently; present the oracle behavior and ask the user.
4. **Blessed architectural divergence** → cite where the user blessed it; otherwise it isn't blessed.

## Known open surfaces (verify current status in the parity plan before starting)

Codex BESTIARY rich entries; playground bespoke two-column geometry; menu/setup/settings pixel verification; Phase 4 player/enemy/boss trace conformance (note `AuthoritativeStepController` is unused in live play — replay verification may need rework); Phase 5 golden tests + `docs/PARITY.md`.
