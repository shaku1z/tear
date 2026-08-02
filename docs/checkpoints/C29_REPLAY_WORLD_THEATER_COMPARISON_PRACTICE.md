# C29 - Replay World, Theater, Comparison, and Practice

**Status:** active - the production-runtime replay foundation is proven; the
player product and the remaining exit conditions are not.

## Scope and evidence rule

C29 turns durable V3 capsules into a replay and practice product without
creating a second simulation, mutating its source capsule, or reusing a live
profile. A checklist item clears only when its named evidence proves the
applicable production boundary.

## Proven foundation

- createProductionReplayWorld is now source-owned. It constructs the C27A
  DOM-free world through the real bootstrap, factories, live entity factory,
  world state/services, named RNG, weapon setup, and State Forge-compatible
  mutable state. Its presentation and outward-device ports are explicit no-ops.
- GhostProductionReplayWorld accepts an already composed TearSimulationRuntime;
  it does not create a scheduler or gameplay runtime. It replays every fixed
  tick through that supplied runtime, including empty action ticks, and exposes
  the exact active runtime for identity evidence.
- createProductionCombatPhases and createProductionCombatSimulation are now
  source-owned C29 adapters. They assemble the real opening/collision hosts,
  combat entities, kill runtime, and one fixed-step scheduler over that
  production world; their outward adapter records semantic intent only.
- tests/unit/ghost-production-replay-world.test.ts constructs that complete
  source-owned production replay composition, supplies its actual simulationRuntime,
  and proves the replay reaches tick 80 through that same object. A repeated
  seek creates a fresh production world and reproduces the semantic hash.

## Exit-gate ledger

- [x] Replay executes on the C27A production composition with no replay-owned
  second runtime.
- [ ] A captured durable capsule reproduces its authoritative hashes through
  the production replay composition.
- [ ] Seek, fork, and practice run from an admitted replay without mutating
  source custody or the production profile.
- [ ] Theater is player-visible and passes applicable accessibility/input UI
  evidence.
- [ ] Side-by-side comparison supports the required runs and repeated semantic
  occurrences.

## Deliberately not claimed

This foundation does not turn legacy visual replay into V3 replay, admit an
incompatible capsule, prove a captured-capsule hash, or expose a player Theater
screen. It makes the next C29 hash-parity slice use the production runtime and
combat composition rather than a synthetic replay simulation. The older parity
harness retains its equivalent helper for its existing C27A suites, but the C29
replay proof no longer imports that test helper. State Forge hydration of a
durable V3 capsule remains the missing source-owned adapter.

## Evidence

pnpm check:c29:production-replay is the named foundation gate. It runs the
source-traceability guard, type/lint/architecture gates, and both codec-level
and production-runtime Ghost replay tests.
