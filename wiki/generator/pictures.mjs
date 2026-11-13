// The wiki's pictures are generated from the game by `pnpm wiki:media` (generator/media.mjs) and committed in
// wiki/pictures/. A deploy therefore needs no browser and no test build.
//
// manifest.json records `inputsHash`: a hash of what decides how the pictures look. Staleness is information,
// never a test failure: `pnpm wiki:test` only checks that the pictures exist and fit the budget. The deploy
// workflow reports staleness (and can regenerate on request), and `pnpm wiki:pictures-status` prints it.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loadGameData, repo } from './game-data.mjs';

/** Page-weight budget, enforced by wiki/tests. */
export const BUDGET = { imageBytes: 40_000, pageMediaBytes: 250_000, totalBytes: 2_000_000 };

export const picturesDir = path.join(repo, 'wiki', 'pictures');

/**
 * The files that draw or measure what the pictures show. Found from the import graph of the capture code:
 * the whole closure of the figure page and the game entry is about 900 modules (the entire simulation), so
 * this list keeps only the modules that decide the look: the enemy, boss, blade and echo renderers, the
 * arena backdrops, materials and environment drawing, the stage layouts and themes, and the code of the
 * bosses whose phases are captured, plus the capture code itself. HUD, menus and balance are not here.
 */
export const INPUTS = [
  'src/presentation/enemies',
  'src/presentation/entities',
  'src/presentation/environment',
  'src/presentation/platform-materials',
  'src/presentation/backdrop.ts',
  'src/presentation/backdrop-biomes.ts',
  'src/presentation/stage-presentation-definitions.ts',
  'src/gameplay/stages.ts',
  'src/gameplay/entities/enemy-types/warden.ts',
  'src/gameplay/entities/enemy-types/colossus.ts',
  'src/gameplay/entities/enemy-types/aldric.ts',
  'src/gameplay/entities/enemy-types/echo-enemies.ts',
  'src/gameplay/entities/enemy-types/source.ts',
  'src/gameplay/entities/enemy-types/source-core.ts',
  'src/gameplay/entities/enemy-types/rootbound.ts',
  'wiki/media',
  'wiki/generator/media.mjs',
];

/** Visual facts the exporter already reads from the game: colours and arena data. Config palette changes land here. */
export function visualFacts(data) {
  return {
    enemies: data.enemies.map((e) => [e.id, e.color]),
    bosses: data.bosses.map((b) => [b.id, b.color]),
    stages: data.stages.map((s) => [s.id, s.theme, s.layout]),
    weapons: data.weapons.map((w) => w.id),
  };
}

/** Hash of the tracked input files' contents (line endings normalised, so every checkout agrees) and the visual facts. */
export function inputsHash(data = loadGameData()) {
  const listed = spawnSync('git', ['ls-files', '-z', '--', ...INPUTS], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (listed.status !== 0) throw new Error(`git ls-files failed: ${listed.stderr}`);
  const hash = createHash('sha256');
  for (const file of listed.stdout.split('\0').filter(Boolean).sort()) {
    const bytes = fs.readFileSync(path.join(repo, file));
    const text = bytes.includes(0) ? bytes : Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
    hash.update(file).update('\0').update(text).update('\0');
  }
  hash.update(JSON.stringify(visualFacts(data)));
  return hash.digest('hex').slice(0, 20);
}

export function loadPictures() {
  const file = path.join(picturesDir, 'manifest.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

/** { stale, message } for the committed pictures against the current game source. */
export function picturesStatus(data = loadGameData()) {
  const pictures = loadPictures();
  if (!pictures) return { stale: true, message: 'wiki/pictures is missing: run pnpm build:test:standalone && pnpm wiki:media.' };
  if (pictures.inputsHash === inputsHash(data)) return { stale: false, message: 'wiki/pictures matches the game source that draws it.' };
  return {
    stale: true,
    message: 'wiki/pictures is stale: the game source that draws the pictures changed since they were generated. Enemy, boss, weapon, stage and boss-phase pages may show an out-of-date picture or wind-up time. Regenerate with pnpm build:test:standalone && pnpm wiki:media (about 30 minutes).',
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const status = picturesStatus();
  console.log(status.message);
  if (status.stale && process.argv.includes('--strict')) process.exitCode = 1;
}
