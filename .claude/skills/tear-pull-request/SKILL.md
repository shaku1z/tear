---
name: tear-pull-request
description: Take a Tear change from a worktree to main. Use when starting a task that will be pushed, opening or updating a pull request, writing its description and design check, when main has moved or the pull request conflicts, when checking whether it may merge, when merging one or a batch, and when cleaning up the worktree afterwards.
---

# tear-pull-request (Claude Code pointer)

This file exists so Claude Code can discover the repository skill. The skill
itself lives in `.agents/skills/tear-pull-request/SKILL.md`
(`../../../.agents/skills/tear-pull-request/SKILL.md` from this file).

Read that file now and follow it. Resolve its relative links, such as
`references/...`, against `.agents/skills/tear-pull-request/`, not this directory.

Do not change the skill here. Edit the source file; if its `name` or
`description` changes, copy the new value into this file.
`pnpm test:agent-skills` fails until the two match.
