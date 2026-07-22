---
name: tear-save-cloud-contract
description: Implement, migrate, review, and test Tear settings, profile, currency, identity, cloud-save, leaderboard, and replay persistence across standalone, Firebase, shared-cloud, and CrazyGames adapters. Use when changing versioned envelopes, persisted fields, migrations, merge/conflict behavior, account flows, replay formats, adapter storage, malformed-data handling, or unavailable-service fallbacks.
---

# Tear Save Cloud Contract

Protect versioned persistence envelopes and adapter behavior using Tear's existing pure migrations, fixtures, contract tests, and platform ports. Never use a live provider as a test harness.

## Workflow

1. Classify the data as settings, portable profile/progression, replay, provider identity, cloud record, or machine-specific state.
2. Read the relevant envelope and adapter code under `src/persistence`, `src/replay`, and `src/platform` before designing the change.
3. Follow [references/envelope-workflow.md](references/envelope-workflow.md) for versioning, validation, migration, malformed inputs, round trips, and replay compatibility.
4. Follow [references/adapter-matrix.md](references/adapter-matrix.md) for standalone, Firebase, shared-cloud, or CrazyGames behavior.
5. Use [references/invariants.md](references/invariants.md) to select merge, idempotence, currency, identity, corruption, quota, and unavailable-service cases.
6. Add permanent unit/contract fixtures with in-memory or fake services. Add browser evidence only when composition or an actual user journey changes.
7. Invoke `$tear-change-gate` for targeted checks and release validation.

## Rules

- Treat all stored and remote data as untrusted.
- Bump the relevant envelope version for a schema change; keep migrations pure and conflict selection outside migrations.
- Preserve supported unknown extension data and reject unsupported future versions safely.
- Keep portable progress separate from machine/device settings.
- Preserve merge convergence, repeated-operation idempotence, currency conservation, and replay provenance.
- Unsupported or failed services must return explicit unavailable/error results and retain a playable local path.
- Never write to Firebase, CrazyGames, shared cloud, leaderboards, or another live service without explicit user authorization.

## Completion

Report envelope/version changes, adapters affected, fixtures added, invariant coverage, compatibility behavior, fallback behavior, browser evidence, and exact commands run. Identify any migration or provider scenario that remains unproven.
