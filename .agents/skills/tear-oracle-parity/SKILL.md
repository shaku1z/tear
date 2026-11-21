---
name: tear-oracle-parity
description: Compare Tear with the pre-redesign oracle commit ee5e931 and restore behaviour, feel or look that drifted from it. Use when something "doesn't match the old game", when porting an old js/ behaviour into src/, when a feel regression needs a first-divergence measurement, and when producing parity evidence. Not for content rebuilt on purpose since the redesign.
---

# Tear oracle parity

The oracle is commit `ee5e93141d67cc02505b2227b3be0b10d1819e1c`, the last version before the typed
redesign. [docs/PARITY.md](../../../docs/PARITY.md) is the contract: what must stay equivalent, the
intentional differences, and the verification policy. Parity is measured, not judged by eye: reduce "feels
off" to the first frame, field, token or pixel that differs.

## Scope first

The oracle is the reference for what the redesign was meant to preserve. It is not the reference for work
the owner has since had rebuilt, such as the Verdant and Pale rebuilds, the cinematics overhaul, the
Gauntlet as trials and the Shards work. Check [docs/POSITION.md](../../../docs/POSITION.md),
[docs/DECISIONS.md](../../../docs/DECISIONS.md) and the plan under `plans/active/` before calling a
difference a bug. When neither the parity contract nor a plan covers it, ask the lead.

## Workflow

1. Read `plans/active/PARITY_RESTORATION_PLAN.md` ("Confirmed parity repairs" lists what is done) so you do
   not restore something twice.
2. Open the oracle: [references/oracle-workbench.md](references/oracle-workbench.md). Read it; never edit,
   commit in or build from it.
3. Find the oracle's implementation first: the function, constants, frame order and state changes. Quote
   file and line at `ee5e931` in findings and in the commit message.
4. Compare behaviour, not text, and classify the difference with
   [references/divergence-triage.md](references/divergence-triage.md): a structural cause or a single line.
5. Port the behaviour through the typed architecture:
   [references/porting-contract.md](references/porting-contract.md). The behaviour is kept exactly; the
   plumbing is the redesign's.
6. Prove it with the parity commands in the workbench, a paired trace or screenshot, or a test whose
   expected values came from the oracle. Place the test with `tear-combat-scenarios` (behaviour) or
   `tear-ui-regression` (screens).
7. Record an approved difference in [docs/PARITY.md](../../../docs/PARITY.md), and a repair in the plan.

## Rules

- Inside the contract's scope the oracle wins ties, including quirks that look like bugs. Report a
  suspected oracle bug to the lead instead of fixing it silently.
- The simulation stays at 120 ticks a second. Do not reintroduce 60 Hz or quantized input into live play.
- Port behaviour, not mechanism: no writable globals, load-order coupling, `?v=` cache strings, hand-kept
  service-worker lists, or DOM and SDK reads in rules code.
- Trust the oracle over any description of it, including this skill.
- A difference found on one screen or entity usually exists in everything built from the same machinery.
  Check the family before closing.
- After any timing change, rerun `pnpm test:weapons` and `pnpm test:determinism`.

## Report

The oracle evidence (file and line at `ee5e931`), the classification, what was restored and what already
matched, the proof gathered, and what is still unverified, such as a feel check only a person can do. Do
not write "matches the source" from a text comparison when feel or rendering is involved.
