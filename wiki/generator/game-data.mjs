// The wiki's facts: the game's own exporter (`pnpm export:wiki`), run on the
// commit the site is built from. Nothing generated is committed; results are
// cached in wiki/.cache keyed by that commit and any uncommitted game changes.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const repo = path.resolve(import.meta.dirname, '..', '..');
export const cacheDir = path.join(repo, 'wiki', '.cache');

function git(...args) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout;
}

/** The game source the site is built from: HEAD, plus any uncommitted change outside wiki/. */
export function sourceState() {
  const head = git('rev-parse', 'HEAD').trim();
  // Only what can change the game's output counts: not the wiki itself, nor workflows, docs, plans or config.
  const outside = ['--', '.', ':(exclude)wiki', ':(exclude).github', ':(exclude)docs', ':(exclude)plans', ':(exclude)config/position'];
  const status = git('status', '--porcelain=v1', '--untracked-files=all', ...outside);
  const treeDirty = git('status', '--porcelain=v1', '--untracked-files=all').trim() !== '';
  const gameDirty = status.trim() !== '';
  const key = createHash('sha256').update(head).update(status).update(gameDirty ? git('diff', 'HEAD', ...outside) : '').digest('hex').slice(0, 16);
  return { head, treeDirty, gameDirty, key };
}

/** The exported game document for the current source, from cache when unchanged. */
export function loadGameData(state = sourceState()) {
  const file = path.join(cacheDir, `game-${state.key}.json`);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(cacheDir, { recursive: true });
    const args = ['scripts/export-game-reference.mjs', '--wiki', '--output', path.relative(repo, file)];
    if (state.treeDirty) args.push('--allow-dirty');
    const result = spawnSync(process.execPath, args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
    if (result.status !== 0) throw new Error('the game exporter failed (see above)');
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  // The exporter marks any dirty tree; only changes outside wiki/ change the game's facts.
  return { ...data, source: { ...data.source, dirty: state.gameDirty } };
}
