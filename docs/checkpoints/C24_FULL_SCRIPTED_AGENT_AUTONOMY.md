# C24 — Full Scripted-Agent Autonomy

## Status

Complete as of 2026-07-26 for the named Class A engineering exit gate.
C24 does not claim Class B physical-input evidence, Class C pixel-only
autonomy, a learned policy, or release certification.

## Exit-gate result

The competent scripted policy completed Easy Adventure from the visible Watch
Agent panel through the actual menu, setup, gameplay, draft, tier-up, victory,
and menu-return flows:

| Field | Result |
|---|---|
| Profile | `competent` |
| Mode / difficulty / weapon | `campaign` / `easy` / `ringblade` |
| Seed | `117` |
| Result | `completed`, final screen `menu` |
| Final campaign state | wave 50, 1 HP, 0 enemies |
| Fixed ticks / decisions | 139,889 / 70,970 |
| Execution / observation | engineering / Class A privileged diagnostic |
| State injection or debug transition | none |
| Certified | false |

`tests/browser-scripted-agent-autonomy.js` is the canonical single-journey
gate. `tests/browser-scripted-agent-repeatability.js` reruns the same scenario
in two fresh browser contexts against one immutable full build tree. Both
repeats produced the same run seed, terminal summary, transitions, drafts,
mechanic summary, sample count, and transcript hash
`abb81bcd43592dd2d098bae495d17b0ac63234662bc3a2623ef39d91834b95d6`.
The immutable test-build SHA-256 was
`d1f6d46cf33163100a04fee94f6a16c3ecfe70b5af6f7feb41358aa1b28871bf`.

The deterministic path required two production-quality input ownership fixes:
physical pointer aim no longer overwrites semantic policy aim while Watch owns
input, and Watch-owned runs do not request pointer lock. Human/device input
behavior remains the default outside that explicit authority scope.

## Implemented hierarchy

The live boundary executes the operational semantic policy through an
action-authoritative hierarchy. Journey, strategy, tactical targeting, blade,
movement/navigation, draft, recovery, invariant, watchdog, critic, and
long-horizon-memory layers all run on live observations. The hierarchy
finalizes and remembers the actual action batch; only fatal invariant or
softlock incidents may replace it with bounded recovery.

Structured intent exposes objective, target, maneuver, confidence, recovery,
critic notes, invariant violations, watchdog incidents, observation class, and
memory. The visible Watch Agent engineering panel supports policy, mode,
difficulty, weapon, boss, seed, and single-run or longitudinal journey
selection.

The retained predictive-survival planner is an explicitly rejected prototype:
its pure tests pass, but its live trial regressed seed 14 from wave 8 to wave 5,
so it is not wired into the production policy.

## Weapons and core mechanics

`tests/browser-scripted-agent-matrix.js` drives all five production weapons in
real simulation and now fails unless the declared collective core set is
observed:

- held slash;
- launch and airborne juggle;
- slam and updraft;
- throw and recall;
- tether contraction;
- projectile parry;
- stolen-blade recovery.

Every weapon must record production held hits and tether behavior. Ringblade
must additionally exercise its throw/return identity. The matrix records raw
weapon events, Ghost engine effects, blade state transitions, tether bounds,
and observed/not-observed mechanic results.

Source Boss Test seed 6 provides the natural stolen-blade proof:

- owned/held at tick 0;
- hostile/stolen flying at tick 4,079;
- hostile/stolen embedded at tick 4,111;
- owned returning at tick 4,113;
- owned held at tick 4,138.

Both the production `stolenBlade` weapon event and semantic Ghost effect are
required. The 59-tick theft-to-held recovery used typed semantic play with no
state mutation or debug transition.

## Journey, mode, difficulty, and progression truth

All seven production modes and all applicable difficulty rows have explicit
completion contracts. The weapon matrix does not mislabel its bounded campaign
starts as completion evidence; Adventure Easy delegates to the canonical
autonomy and repeatability gates. Other unexecuted natural-completion rows
remain explicit and uncertified.

Core Watch profiles execute live. Hardware, performance, behavioral, and
QA-adversary persona families remain static contracts rather than falsely
claimed executions. Difficulty expectations and fairness/identity-failure
metrics also remain contract-defined pending consented population evidence.

The optional `longitudinal-earned-profile` Journey Director proves that
multi-episode improvement is automatic rather than command-driven. On one page
it traverses real result, menu, Shop, purchase, setup, and run flows; purchases
only enabled affordable cards through typed UI actions; records episode,
wallet, purchase, and level ledgers; enforces episode/spend ceilings; and
freezes the final combat vector. Its bounded evidence is deliberately separate
from the clean-profile seed-117 completion.

## Evidence and isolation

Canonical gates:

- `tests/unit/scripted-agent-policy.test.ts`
- `tests/unit/tearbench-scripted-agent-hierarchy.test.ts`
- `tests/unit/hierarchical-policy-adapter.test.ts`
- `tests/unit/agent-static-contracts.test.ts`
- `tests/unit/longitudinal-progression.test.ts`
- `tests/unit/live-frame-runtime.test.ts`
- `tests/unit/enemy-blade-catch-runtime.test.ts`
- live observation and build-choice focused unit tests
- `tests/browser-scripted-agent-matrix.js`
- `tests/browser-scripted-agent-autonomy.js`
- `tests/browser-scripted-agent-repeatability.js`
- `tests/browser-scripted-agent-longitudinal.js`
- `tests/browser-production-runtime-isolation.js`

The Watch host uses privileged live observations by design, so artifacts say
`privilegedHostObservation: true`; `externalBackdoorReads: 0` means the browser
driver does not read or mutate Pantheon debug state. Cinematic skipping is an
engineering bridge and is explicitly not physical-input evidence.
`debugTransitions: 0` is a construction invariant because the Watch API has no
debug transition or state-forge mutation capability.

Production standalone and CrazyGames builds are booted with
`?test=1&watchagent=1` and must expose no Watch global, panel, runtime bridge,
or bundled Watch marker.

## Requirements-ledger boundary

The narrow hierarchical scripted-core family advances to `visible` because it
is action-authoritative, visible in the engineering panel, repeatable, and
proven through the complete real journey. Persona, mode-completion, and
difficulty families remain `contract` where their complete fleets or
population-level claims have not executed. No C24 evidence promotes learned
training, Class B/C autonomy, numeric balance validity, full release
certification, or later C25–C40 capabilities.
