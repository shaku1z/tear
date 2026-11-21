# What must always hold

Pick the cases the change touches. Rules that hold for every input belong in a property test.

## Reading and migrating

- Parse, validate or migrate, serialize, parse again: supported information is preserved.
- Migrating or loading and saving a second time changes nothing more.
- A malformed record gives a typed safe failure or a default, never partly trusted state.
- A future version is rejected without overwriting it.
- Supported unknown fields survive a current-envelope round trip.
- Data an earlier release wrote still loads
  ([docs/RELEASE_COMPATIBILITY.md](../../../../docs/RELEASE_COMPATIBILITY.md)).

## Merging and the economy

- Repeating the same pull, push or merge does not mint or lose coins, shards or rewards.
- The choice between conflicting copies is deterministic and made outside migrations.
- Progress, purchases, achievements, cosmetics and best records do not go backwards unless the rule says so.
- Spending cannot exceed what was earned, in any merge order or after any retry.
- One-time rewards and migrations run at most once.

## Identity and services

- Provider initialization can be repeated safely.
- A failed or missing identity, cloud or leaderboard service leaves local play working.
- An account change does not overwrite unrelated local progress or loop a prompt.
- Listener, network, quota, corrupt-data and SDK failures stay isolated and visible.

## Replays

- Actions and their origin data survive JSON and adapter round trips.
- The same seed and actions verify the same at every supported render rate.
- A replay names the ruleset version it was recorded under; a replay from another ruleset is not claimed
  to verify.
- Missing or corrupt remote replay data fails safely, with bounded reads.
