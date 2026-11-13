---
name: tear-change-gate
description: Select, run, and explain the smallest relevant canonical Tear repository gates. Use after changing Tear source, tests, content, UI, persistence, audio, platform adapters, packaging, PWA, Cloudflare, or release configuration; when diagnosing a failing Tear gate; and before making a release-readiness claim.
---

# tear-change-gate (Claude Code pointer)

This file exists so Claude Code can discover the repository skill. The skill
itself lives in `.agents/skills/tear-change-gate/SKILL.md`
(`../../../.agents/skills/tear-change-gate/SKILL.md` from this file).

Read that file now and follow it. Resolve its relative links, such as
`references/...`, against `.agents/skills/tear-change-gate/`, not this directory.

Do not change the skill here. Edit the source file; if its `name` or
`description` changes, copy the new value into this file.
`pnpm test:agent-skills` fails until the two match.
