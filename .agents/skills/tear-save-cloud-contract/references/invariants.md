# Persistence invariants

Select the cases implicated by the change.

## Serialization and migration

- Parse -> validate/migrate -> serialize -> parse preserves supported information.
- Repeating migration or load/save does not change the result again.
- Malformed records produce a typed safe failure/default, not partial trusted state.
- Future versions are rejected without destructive overwrite.
- Supported unknown extension fields survive a current-envelope round trip.

## Merge and economy

- Repeating the same pull/push/merge does not mint or lose currency or rewards.
- Conflict choice is deterministic and kept outside pure migrations.
- Monotonic progress, purchases, achievements, and best records do not regress unless the contract explicitly permits it.
- Spent currency cannot exceed earned/available currency through merge order or retries.
- One-time rewards and retrofits execute at most once.

## Identity and services

- Provider initialization is idempotent.
- Failed or unavailable identity/cloud/leaderboard services retain a playable local path.
- Account transitions do not overwrite unrelated local progress or loop prompts.
- Listener, network, quota, corrupt-data, and SDK failures remain isolated and observable.

## Replays

- Semantic action/provenance data survives JSON and adapter round trips.
- Identical seed/action streams retain verification behavior across supported render rates.
- Legacy recordings migrate without inventing unsupported determinism claims.
- Missing/corrupt remote replay data fails safely and with bounded reads.
