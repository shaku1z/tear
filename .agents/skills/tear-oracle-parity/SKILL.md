---
name: tear-oracle-parity
description: Restore or verify Tear behavior, feel, and look against the pre-redesign oracle commit ee5e931 (the js/ monolith source of truth). Use when a redesign screen, input, timing, physics, UI, or reward flow "doesn't match the source", when porting legacy js/ behavior into the typed src/ architecture, when investigating feel regressions, or when producing parity evidence.
---

# Tear Oracle Parity

The user considers oracle commit `ee5e93141d67cc02505b2227b3be0b10d1819e1c` ("fix(weapons): align throw range and handling", the last pre-redesign `js/` monolith) the canonical feel and look. Any redesign divergence is a bug unless the user explicitly blessed it. Parity is a measurable property, not a vibe: reduce every "feels off" to a first-divergence frame, field, token, or pixel.

## Workflow

1. Read `plans/PARITY_RESTORATION_PLAN.md` and the phase status in the latest parity commits (`git log --grep="restore source"`). Do not re-restore what already shipped.
2. Open the oracle via [references/oracle-workbench.md](references/oracle-workbench.md): the `../Tear-oracle` worktree (recreate with `git worktree add ../Tear-oracle ee5e931` if missing), `git show ee5e931:js/<file>.js` for point reads, and twin-serve for A/B.
3. Locate the authoritative oracle implementation FIRST — the exact function, constants, frame order, and state transitions in `js/game.js`, `js/ui.js`, `js/enemy.js`, `js/player.js`, `js/config.js`, etc. Quote line numbers in your findings and commit messages ("Parity with ee5e931: …").
4. Diff behavior, not just text. Classify the divergence using [references/divergence-triage.md](references/divergence-triage.md): systemic (dt model, frame order, state/cursor ownership, adapter plumbing, double-sampling) vs line-level (constant, token, string, layout).
5. Port the oracle behavior into the redesign through the typed architecture per [references/porting-contract.md](references/porting-contract.md) — verbatim behavior, redesigned plumbing. Never resurrect classic-script globals, load-order coupling, or direct DOM/SDK reads in domain code.
6. Prove parity: side-by-side twin-serve check, trace/screenshot comparison, or an oracle-conformance fixture whose expected values were generated from the oracle build. Route test placement through `$tear-combat-scenarios` (behavior) or `$tear-ui-regression` (screens), then `$tear-change-gate`.
7. Update the parity plan / `docs/FEATURE_INVENTORY.md` status, commit per phase with an "ee5e931" reference, and push.

## Rules

- The oracle wins ties. If new-architecture code and oracle behavior disagree and no user decision says otherwise, restore the oracle behavior — including quirks that look like bugs; flag suspected oracle bugs to the user instead of silently "fixing" them.
- One known blessed divergence class exists: deliberate architecture (typed ports, fixed-tick option, build pipeline). Feel-critical timing is NOT blessed — sim runs at the oracle's 120 Hz regime; do not reintroduce 60 Hz or quantized authoritative input into live play.
- Never copy oracle code paths that the redesign forbids (writable globals, `?v=` cache strings, manual SW shell lists, DOM reads in gameplay). Port the behavior, not the mechanism.
- Never trust prose descriptions of the oracle (plans, memories, this skill) over the oracle itself — read `ee5e931` directly.
- Sweep siblings: a divergence found on one screen or entity usually exists in every screen built from the same machinery; check the family before closing.
- Preserve the shipped weapons-overhaul (WA1+) layer when correcting physics/dt — rerun its conformance tests after any timing change.

## Completion

Report: oracle evidence (file:line at ee5e931), divergence classification, what was restored vs already-matching, parity proof gathered, and remaining unverified surfaces (e.g. user-owed feel playtests). Never claim "matches the source" from a text diff alone when feel or rendering is implicated.
