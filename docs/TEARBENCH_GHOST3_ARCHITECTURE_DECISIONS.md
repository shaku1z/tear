# TearBench and Ghost 3.0 Architecture Decisions

**Status:** Accepted for Checkpoint C0
**Date:** 2026-07-23

## D1 — Extend the typed runtime

TearBench and Ghost 3.0 extend the current `src/` architecture. They do not
recreate the pre-redesign monolith or introduce gameplay globals.

Dependency direction remains:

```text
entrypoints -> app composition -> gameplay use cases -> simulation/domain
entrypoints -> platform adapters
app -> input, presentation, audio, persistence ports
presentation -> immutable render state
```

Test and replay adapters depend on inward-facing contracts. Gameplay does not
depend on the browser runner, Vault, Theater, cloud, or ML runtime.

## D2 — Authoritative time

The fixed simulation tick is the only gameplay-causality clock.

Ghost may additionally record run, session, presentation, wall-monotonic, and
server chronology. None of those clocks may recreate collision, damage, RNG,
drafts, progression, or score.

Every causal record will eventually include:

```text
simulation tick
within-tick phase
monotonic sequence
stable type
typed payload
```

## D3 — Canonical action ownership

`GameAction` is the existing device-independent action contract and becomes the
foundation of Tear Action V1. Raw key codes, pointer coordinates, touch IDs, and
gamepad indices remain adapter data.

The authoritative capture boundary is after device mapping and before gameplay
consumption. The existing command envelope supplies monotonic action identity.

## D4 — Deterministic randomness

`RandomSource` remains the inward-facing randomness contract. The existing
single `GAME_RANDOM` compatibility service is transitional.

Named streams will be derived deterministically and injected by domain:

```text
combat
enemy-ai
spawn
draft
boss
world
cosmetic
```

Cosmetic consumption cannot advance a gameplay stream.

## D5 — Test composition, not production debug globals

TearBench will use a typed runner port and a development-only composition root.
If a browser bridge is required, it is conditionally exposed only in test builds
and a production-artifact gate proves it absent.

The test composition supplies disposable persistence and unavailable or fake
cloud, advertisements, analytics, achievements, and leaderboards.

## D6 — Shared state codecs

State Forge and Ghost share one versioned codec registry. A codec owns capture,
validation, construction, reference resolution, migration, hash projection, and
presentation fallback for a stable type.

Restore occurs in a temporary world and is committed atomically only after
constructors, references, configuration, RNG, invariants, and hashes validate.
Replay data never chooses a constructor by executable name.

## D7 — Replay evolution

`ReplayEnvelopeV2` is preserved as existing canonical Command-truth evidence. A
Ghost 3.0 manifest composes or references it rather than silently changing its
meaning.

`VisualReplayPacket` and `LegacyGhostEngine` remain compatibility surfaces.
Ghost 3.0 adds new tracks, integrity, state, events, and lineage through new
versioned contracts.

## D8 — Stable identity

Stable IDs are namespaced registry values. They are never inferred from array
position, localized labels, constructor names, or mutable display names.

Registries are required for events, entity kinds, bosses, phases, stages,
weapons, abilities, statuses, codecs, cameras, invariants, and verification
rules.

## D9 — Truth and status

Ghost declares Command, State, and Visual truth capabilities independently.
Fidelity, integrity, compatibility, completeness, seekability, resumability,
eligibility, coaching richness, creator richness, and privacy are separate
quality dimensions.

Summary metadata cannot override a verified causal ledger.

## D10 — Evidence and lineage

Original runs, failures, and capsules are immutable evidence. Migration, repair,
practice, challenge, clip, minimization, and scenario compilation create child
artifacts with explicit lineage.

Canon, Graveyard, Frontier, and Corpus have separate governance:

- Canon: reviewed reference truth.
- Graveyard: failures that must not return.
- Frontier: novel states awaiting triage.
- Corpus: consent-aware learning and evaluation data.

## D11 — Agent boundaries

Language models and the Codex Skill orchestrate tools and interpret evidence.
They do not perform the frame-rate motor loop.

The gameplay agent is hierarchical. Human-like Levels 1-9 receive a
mechanically enforced visible-information observation class. Level Omega may be
privileged but must be labeled.

Agent Foundry may train and select policies. It may not modify production game
rules, invariant definitions, reward definitions, hidden exams, or release
gates.

## D12 — Local-first delivery

Deterministic scenarios, state restoration, causal recording, Vault, Theater,
practice, comparison, Doctor, and evidence work locally before cloud
publication. Cloud outages never block gameplay or local recording.

## D13 — Preservation and certification

Historical runtime identities, aliases, tombstones, migration fixtures, and
golden replays are versioned release inputs. Unsupported or retired playback is
reported honestly rather than upgraded by metadata.

Diff-aware checks are an early disproving layer, not release certification.
Certification requires the canonical full gate, affected arbitrary states,
complete journeys, Graveyard and base evidence, interaction matrices, and the
cross-version preservation corpus from one intended worktree state.

## Ownership

Ownership here means the authoritative module boundary, not a particular person.

| Concern | Owning boundary |
|---|---|
| Time and RNG | `src/simulation`, `src/domain` |
| Semantic actions | `src/input` |
| Gameplay events and state | `src/gameplay` |
| App journeys and screens | `src/app` |
| Rendering and Theater UI | `src/presentation` |
| Replay and Ghost truth | `src/replay` |
| State Forge and TearBench orchestration | new typed packages/modules consuming inward ports |
| Persistence and local Vault adapters | `src/persistence` |
| Cloud publication and verification adapters | `src/platform` and trusted server package |
| ML training and policy artifacts | separate tooling; no runtime ownership of game rules |

## Change Process

An architecture decision may be revised only with:

1. The superseded decision retained.
2. The reason and affected requirements recorded.
3. Migration and compatibility impact documented.
4. Checkpoint gates updated before relying on the revision.
