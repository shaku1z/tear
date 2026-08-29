# Verdant production + Pale preview integration task contract

## Exact provenance

- Protected foundation: `origin/main` at
  `91706363b80fb56a18df4d973b424bbce94a279e`.
- Immutable Verdant freeze:
  `25c589844ec2cfe85a8a6deead881ebb3d699198`.
- Immutable Pale freeze:
  `4ec0ea52642c4c1830a2403a0910ebb3000a72d1`.
- Integration branch: `codex/verdant-production-pale-preview`.
- Integration method: one two-parent merge of the Pale freeze into protected
  main. Pale already contains the complete Verdant ancestry; Verdant is not
  merged separately.

The linear Verdant-to-Pale history is retained as immutable provenance.
Acceptance requires architectural siblinghood, not sibling Git histories.

## Desired product behavior

The published Adventure has exactly six stages and 60 waves:

1. Grounds / Warden / waves 1–10
2. Undercroft / Iron Colossus / waves 11–20
3. Crimson Fields / Aldric / waves 21–30
4. Verdant Sanctum / Rootbound / waves 31–40
5. Voidspire / Echo / waves 41–50
6. The Tear / Source / waves 51–60

Pale Traverse remains complete engineering content but is unpublished and
selectable only from Playground. State Forge and TearBench may explicitly
materialize it as engineering evidence without making it ordinary progression.

| Surface | Pale available |
| --- | --- |
| Adventure | no |
| Endless | no |
| Gauntlet | no |
| Boss Test | no |
| Enemy Test | no |
| Tutorial | no |
| Playground | yes |
| Published/reference progression | no |

## Owning architecture

- One source-owned content-availability policy determines published and
  preview admission across modes, progression, achievements, and references.
- One biome-neutral environment foundation owns fields, combat objects,
  routes, events, codecs, observations, cleanup, restore, and State Forge
  boundaries.
- Verdant and Pale modules consume that foundation independently and may not
  import one another's biome-specific implementation.
- Bloom Wells and Aurora Tracks remain independent field implementations;
  Grafts/root links and Pale routes remain independent consumers of generic
  combat-object/route contracts; Rootbound and White Hart consume generic
  runtime ports rather than each other.

## Compatibility risks

- stage/boss/enemy availability leaking into ordinary modes;
- stale five- or seven-stage indices and handwritten counts;
- Echo/Source scaling, economy, healing, concurrency, and run-duration drift;
- environment ownership surviving Crimson-to-Verdant,
  Verdant-to-Voidspire, or Voidspire-to-Tear transitions;
- persisted/replay ruleset and reference projections diverging from the
  published six-stage set;
- State Forge or TearBench losing explicit unpublished Pale construction;
- accidental weakening of universal weapon abilities or performance budgets.

## Required evidence

- permanent dependency-boundary and fresh-world construction tests;
- deterministic six-stage wave/scaling/progression tests;
- transition cleanup and Pale anti-leak tests;
- explicit Playground, State Forge, replay, and TearBench Pale evidence;
- source-derived TearBench selection and browser journeys;
- exact attributed standalone/CrazyGames/PWA builds, unchanged performance
  budgets, and the final clean `pnpm check`;
- one integration implementation commit followed by one evidence-freeze
  commit and manifest.

## Explicit non-goals

No deployment, protected-main merge, push/PR, game-reference or wiki dispatch,
soundtrack re-vendoring, C40 certification, frozen-history rewrite, or frozen
worktree deletion is authorized.
