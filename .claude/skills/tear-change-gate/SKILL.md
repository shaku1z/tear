---
name: tear-change-gate
description: Choose, run and read the checks a Tear change needs. Use after changing source, tests, content, UI, saves, audio, platform adapters, builds, tooling or docs; when a check fails locally or in CI; before opening or updating a pull request; and before saying a change or a release is ready.
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
