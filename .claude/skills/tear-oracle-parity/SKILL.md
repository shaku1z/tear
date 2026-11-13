---
name: tear-oracle-parity
description: Restore or verify Tear behavior, feel, and look against the pre-redesign oracle commit ee5e931 (the js/ monolith source of truth). Use when a redesign screen, input, timing, physics, UI, or reward flow "doesn't match the source", when porting legacy js/ behavior into the typed src/ architecture, when investigating feel regressions, or when producing parity evidence.
---

# tear-oracle-parity (Claude Code pointer)

This file exists so Claude Code can discover the repository skill. The skill
itself lives in `.agents/skills/tear-oracle-parity/SKILL.md`
(`../../../.agents/skills/tear-oracle-parity/SKILL.md` from this file).

Read that file now and follow it. Resolve its relative links, such as
`references/...`, against `.agents/skills/tear-oracle-parity/`, not this directory.

Do not change the skill here. Edit the source file; if its `name` or
`description` changes, copy the new value into this file.
`pnpm test:agent-skills` fails until the two match.
