# Claude Code notes

@AGENTS.md

Claude Code specifics, in addition to the guide above:

- **Preview pane:** `.claude/launch.json` defines `tear`, the standalone dev
  server on fixed port 5173 (`--strictPort`, so it fails rather than moving if
  the port is busy), and `tear-preview-build`, which serves an existing
  `dist/standalone` on port 4173. Run `pnpm build:standalone` before using the
  second one.
- **Skills:** the repository skills live in `.agents/skills/`. Each has a
  pointer in `.claude/skills/<name>/SKILL.md` so Claude Code can find it; the
  pointer tells you to read the real file. Keep pointer names and descriptions
  in step with the source (`pnpm test:agent-skills`).
- **Looking at the game:** screenshots of a built `dist/` (production preview or
  test build) are the reliable view. A headless screenshot of the dev server
  can show an empty canvas while modules are still compiling.
