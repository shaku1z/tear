// The wiki's pictures are generated from the game by `pnpm wiki:media` (generator/media.mjs) and committed in
// wiki/pictures/. A deploy therefore needs no browser and no test build. What keeps them honest is a source hash:
// manifest.json records the hash of every file that can change how the pictures look or what the boss
// captures measure, and `pnpm wiki:test` fails when the current hash differs, until the pictures are regenerated.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { repo } from './game-data.mjs';

/** Page-weight budget, enforced by wiki/tests. */
export const BUDGET = { imageBytes: 40_000, pageMediaBytes: 250_000, totalBytes: 2_000_000 };

export const picturesDir = path.join(repo, 'wiki', 'pictures');

/** Everything that can change a picture: how things are drawn, arena data, boss behaviour, the capture code. */
export const INPUTS = [
  'src/presentation',
  'src/gameplay/entities',
  'src/gameplay/stages.ts',
  'src/gameplay/weapons.ts',
  'src/gameplay/run/boss-definitions.ts',
  'src/app/world',
  'src/config',
  'wiki/media',
  'wiki/generator/media.mjs',
];

/** Hash of the tracked input files' contents (line endings normalised, so every checkout agrees). */
export function inputsHash() {
  const listed = spawnSync('git', ['ls-files', '-z', '--', ...INPUTS], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (listed.status !== 0) throw new Error(`git ls-files failed: ${listed.stderr}`);
  const hash = createHash('sha256');
  for (const file of listed.stdout.split('\0').filter(Boolean).sort()) {
    const bytes = fs.readFileSync(path.join(repo, file));
    const text = bytes.includes(0) ? bytes : Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
    hash.update(file).update('\0').update(text).update('\0');
  }
  return hash.digest('hex').slice(0, 20);
}

export function loadPictures() {
  const file = path.join(picturesDir, 'manifest.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}
