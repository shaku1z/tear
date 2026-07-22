# Data and platform routes

## Persistence field

Choose settings, profile, or replay ownership. Update the versioned envelope, validation, pure migration, typed consumers, and adapter serialization. Add previous-version, malformed-input, current round-trip, and relevant cross-subsystem fixtures. Invoke `$tear-save-cloud-contract` for the full invariant workflow.

## Platform capability

Start at `src/platform/contracts.ts`. Extend the typed capability only when the behavior is genuinely host-provided. Implement each affected target adapter and composition root; return an explicit unavailable result where unsupported. Keep browser/portal globals and SDK types out of gameplay and screens.

Cover adapter contracts, initialization failure, lifecycle, identity/storage/cloud behavior, unavailable fallback, and applicable built-target browser evidence. Update `docs/RELEASE_MATRIX.md` when target expectations change.

Do not create a separate platform skill until Steam implementation begins. Until then, keep target-specific guidance here and in `$tear-change-gate`.
