---
name: tear-save-cloud-contract
description: Change, migrate, review and test anything Tear stores or syncs. Use for settings, profile progress, coins and shards, cosmetics, identity and accounts, cloud saves, leaderboards, Firestore rules and replay formats across the standalone, Firebase, shared-cloud, CrazyGames and itch adapters, including malformed data and unavailable services.
---

# Tear save and cloud contract

Stored data outlives the build that wrote it. Protect it with versioned envelopes, pure migrations,
fixtures and adapter contract tests. Never use a live provider as a test harness.

## Workflow

1. Classify the data: setting, profile progress, replay, provider identity, cloud record, or
   device-specific state.
2. Read the envelope and adapter code under `src/persistence/`, `src/replay/` and `src/platform/` before
   designing the change.
3. Read what the build promises about earlier releases' data:
   [docs/RELEASE_COMPATIBILITY.md](../../../docs/RELEASE_COMPATIBILITY.md). A change that breaks a promise
   needs a migration, not a new promise.
4. Follow [references/envelope-workflow.md](references/envelope-workflow.md) for versions, validation,
   migrations and round trips.
5. Follow [references/adapter-matrix.md](references/adapter-matrix.md) for each adapter the change reaches.
6. Pick the cases from [references/invariants.md](references/invariants.md).
7. Add permanent tests with in-memory or fake services. A rule that must hold for every input (a round
   trip, idempotence) is a property test (`README.md`, "Property tests").
8. Choose checks with `tear-change-gate`. Note save, replay or cloud-format changes in the pull request's
   "Risks" section, as the template asks.

## Rules

- All stored and remote data is untrusted until validated.
- A schema change bumps that envelope's version. Migrations are pure; choosing between conflicting copies
  happens outside them (`src/persistence/conflicts.ts`).
- Unknown fields a supported version may carry survive a round trip. An unsupported future version is
  rejected without overwriting it.
- Portable progress stays separate from device settings.
- Merging converges, repeating an operation changes nothing more, and no merge order mints or loses coins,
  shards or rewards.
- A failed or missing service returns an explicit unavailable or error result, and local play continues.
- Players can have an old build on one target and a new one on another, sharing a cloud save. Say in the
  pull request when a change makes old and new builds disagree about stored data, so the targets are
  deployed together.
- Never write to Firebase, CrazyGames, shared cloud, leaderboards or any live service, and never deploy
  rules, change the console or handle keys. Those are the owner's steps (`plans/active/FIREBASE_REFRESH.md`).
- The repository is public. Commit no keys, account names or real player data; fixtures hold scripted
  sessions only.

## Report

Envelope and version changes, adapters affected, fixtures and tests added, which invariants are covered,
what an older build does with the new data, fallback behaviour, the commands and results, and any
migration or provider case that is still unproven.
