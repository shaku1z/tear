# PT3-C9 — Modes, lifecycle, and persistence

## Claim

Every current run mode and durable boundary now handles the Pale Traverse
truthfully through existing production authorities. The seven-stage branch has
its own deterministic engineering ruleset identity, while historical envelopes
remain readable and deterministic admission still rejects incompatible
playback. No profile schema, parallel registry, public migration, or bespoke
White Hart achievement was invented.

## Mode and lifecycle result

- Campaign resolves Pale waves 41–50 and White Hart through stage index 4.
- Endless and Gauntlet use the authored Pale pool when their existing biome
  rotation reaches Pale.
- Boss Test selects White Hart from the canonical boss roster.
- Playground and Enemy Test derive Rimehound and every other enemy identity
  from the existing canonical identity authority.
- Tutorial remains isolated to its Charger/Ranged teaching surface.
- Pale Aurora fields, White Hart Ghost Tracks, and White Hart encounter state
  clear on reset, retry, quit, defeat, victory, stage transition, mode change,
  restore failure, and disposal.

## Durable-data result

- `tear-rules-verdant-pale-r3-engineering-v1` is the exact current seven-stage
  deterministic identity.
- The prior six-stage engineering identity and pre-Verdant baseline remain
  parseable as historical envelopes, but deterministic admission under the
  current identity rejects both.
- Stable Pale stage facts carry stage index `4`, stable ID `pale-traverse`, and
  entered/exited semantics. Legacy Ghost 2 packets continue to retain numeric
  stage events without taking ownership of the stable event contract.
- Profile schema v2 remains sufficient. Pale statistics and unrelated unknown
  current/legacy data round-trip without a schema bump or public migration.
- Authoritative stage entry and Aurora activation facts update `paleEntered`
  and `auroraTracksActivated` through the existing gameplay-event telemetry
  path. Presentation state contributes nothing.
- White Hart defeat already feeds the existing generic `bossKills`,
  `bossNoHit`, boss-specific kill fact, and boss achievement evaluation path.
  Bespoke White Hart achievement design remains deferred to the separately
  authorized joint C22 decision.

## Exact evidence

- Completion identity: `11e7f88b9002f76314a2b433808831825c582abc`
- Clean source fingerprint:
  `dd28492386a1bc69ff1759f3a83f6237b91e214b0cc1f1f32bee7fc7ddf457a2`
- Standalone artifact hash:
  `d75548cef1ba564ce72098eaeb0f25de71d208e881022d1b5b14315452e5bb4b`
- Primary permanent regression:
  `tests/unit/pale-mode-lifecycle.test.ts`

## Verification

```text
pnpm typecheck
pnpm lint
pnpm exec vitest run <17 focused/adjacent mode, lifecycle, kill, wave, profile, replay, event, boss, and environment files>
pnpm check:architecture
pnpm check:active-roster
pnpm check:terminology
pnpm check:docs
pnpm check:game-reference
pnpm build:test:standalone
pnpm check:publication-boundary
pnpm test:game-reference-artifact
pnpm test:browser:pale-presentation
pnpm test:browser:pale-white-hart-phases
git diff --check
```

Result: 17 focused/adjacent files / 92 tests passed. Typecheck, full lint,
architecture, active roster, terminology, documentation, clean game-reference,
clean attributed test build, publication/reference boundaries, both existing
Pale browser journeys, and whitespace validation are green.

## Boundary

The feature branch remains `engineering-only`; publication preflight rejects
it even though both joint stage identities exist. This checkpoint performs no
joint integration, protected merge, reference/wiki dispatch, publication,
deployment, final music selection, public profile/ruleset migration, or C40
certification. PT3-C10 owns full source-derived reference and TearBench closure;
PT3-C11 owns the final cross-target validation and frozen handoff.
