// Generates the wiki's pictures from the game itself, at build time:
//   - figures: enemies and bosses drawn by the game's own renderers (a vite page, wiki/media/figures.html)
//   - arenas, weapon crops and boss phases: captured from the game's test build (dist/test-standalone)
// Output is WebP in wiki/.cache/media-<key>/, cached by the game source tree hash, plus manifest.json.
// Run only for deploy builds (`pnpm wiki:build --media`); everyday builds use the cache or skip media.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { cacheDir, repo } from './game-data.mjs';

/** Page-weight budget, enforced by wiki/tests and checked again here. */
export const BUDGET = { imageBytes: 40_000, pageMediaBytes: 250_000, totalBytes: 2_000_000 };

const testBuild = path.join(repo, 'dist', 'test-standalone');
const dep = (name) => import(pathToFileURL(path.join(repo, 'node_modules', name)).href);

/** Key: game source (from game-data's key) plus the media scripts themselves. */
export function mediaKey(sourceKey) {
  const own = ['media.mjs', '../media/figures.ts', '../media/figures.html'].map((f) => fs.readFileSync(path.join(import.meta.dirname, f)));
  return createHash('sha256').update(sourceKey).update(Buffer.concat(own)).digest('hex').slice(0, 16);
}
export const mediaDir = (key) => path.join(cacheDir, `media-${key}`);
export function loadManifest(key) {
  const file = path.join(mediaDir(key), 'manifest.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

const save = (dir, name, dataUrl) => {
  const bytes = Buffer.from(dataUrl.split(',')[1], 'base64');
  if (bytes.length > BUDGET.imageBytes) throw new Error(`${name} is ${bytes.length} bytes (budget ${BUDGET.imageBytes})`);
  fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
  fs.writeFileSync(path.join(dir, name), bytes);
  return name;
};

function scenario(start, id, state = {}) {
  return {
    document: { format: 'tearsdl', schemaVersion: 1, id, stateClass: 'reconstructed-reachable', seed: id, start, state, constraints: { legalProgression: true }, tags: ['wiki'], maxTicks: 7200 },
    scenario: { format: 'tear-contract', kind: 'scenario', schemaVersion: 1, id, version: 1, description: id, stateClass: 'reconstructed-reachable', executionClass: 'engineering', seed: id, start: { ...start, wave: 1 }, maxTicks: 7200, assertions: ['runtime.finite-state'], tags: ['wiki'] },
    structural: { valid: true, issues: [] }, reachability: { reachable: true, reasons: [] }, plausibility: { plausible: true, provisional: false, reasons: [] }, resolvedHash: id,
  };
}

async function figures(browser, data, dir, manifest) {
  const { createServer } = await dep('vite/dist/node/index.js');
  const server = await createServer({ root: repo, configFile: false, logLevel: 'error', server: { port: 0, strictPort: false } });
  await server.listen();
  try {
    const port = server.httpServer.address().port;
    const page = await browser.newPage();
    await page.goto(`http://localhost:${port}/wiki/media/figures.html`);
    await page.waitForFunction(() => window.ready, null, { timeout: 120_000 });
    const ids = [...data.enemies.map((e) => ['enemies', e.id]), ...data.bosses.map((b) => ['bosses', b.id])];
    for (const [kind, id] of ids) {
      const url = await page.evaluate((i) => { try { return window.probe(i); } catch { return null; } }, id);
      if (url) manifest.figures[`${kind}/${id}`] = save(dir, `figures/${id}.webp`, url);
      else manifest.skipped.push(`figure ${id} (the game draws no figure for it)`);
    }
    await page.close();
  } finally { await server.close(); }
}

function serveTestBuild() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm' };
  const server = http.createServer((q, r) => {
    const f = path.join(testBuild, decodeURIComponent(new URL(q.url, 'http://x').pathname));
    if (!f.startsWith(testBuild) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' });
    fs.createReadStream(f).pipe(r);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/** Runs a scenario in the test build; returns the crop and what the boss did frame by frame. */
const CAPTURE = `async ({ s, frames, crop, shotAt }) => {
  try { window.__ENV?.terminate(); } catch {} // a finished run can refuse to pause
  const env = window.__TEAR_RUNTIME_ENVIRONMENT__.create('A');
  window.__ENV = env;
  if (!env.forgeResolvedScenario(s).ok) return null;
  const moves = [];
  let tag = null, image = null, player = null;
  const shoot = () => {
    const g = document.querySelector('canvas');
    const k = g.width / 1600;
    const near = crop === 'player';
    const box = near ? { x: Math.max(0, Math.min(1600 - 520, player.x - 260)), y: Math.max(0, Math.min(900 - 300, player.y - 200)), w: 520, h: 300 } : { x: 0, y: 150, w: 1600, h: 680 };
    const out = document.createElement('canvas');
    out.width = near ? 520 : 800; out.height = near ? 300 : 340;
    out.getContext('2d').drawImage(g, box.x * k, box.y * k, box.w * k, box.h * k, 0, 0, out.width, out.height);
    image = out.toDataURL('image/webp', 0.72);
  };
  for (let i = 0; i < frames; i++) {
    try { env.advanceApplicationFrame(1 / 60); } catch { break; } // the run ended (the idle player was hit)
    if (i % 6) continue; // sampling every 0.1 s keeps a capture to seconds
    let snap;
    try { snap = env.captureSnapshot('w' + i).state; } catch { break; }
    player = snap['tear.player.v1'];
    if (i === shotAt || (image === null && i >= frames - 6)) shoot();
    const boss = (snap['tear.boss.v1'] ?? [])[0];
    if (!boss) continue;
    tag = boss.phaseTag ?? tag;
    const key = boss.state ?? boss.mode ?? '';
    if (moves.at(-1)?.state !== key) moves.push({ state: key, from: i, to: i }); else moves.at(-1).to = i;
  }
  if (image === null && player) shoot();
  return image && { tag, moves, image };
}`;

async function captures(browser, data, dir, manifest) {
  if (!fs.existsSync(path.join(testBuild, 'index.html'))) throw new Error('dist/test-standalone is missing: run `pnpm build:test:standalone` first');
  const server = await serveTestBuild();
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, serviceWorkers: 'block' });
    page.on('pageerror', (e) => manifest.skipped.push(`page error: ${e.message.slice(0, 120)}`));
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html?test=1`);
    await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__ && window.__TEAR_DIAGNOSTICS__?.snapshot().frame.samples > 0, undefined, { timeout: 60_000 });
    const run = async (args) => { try { return await runOnce(args); } catch (e) { manifest.skipped.push(args.s.document.id + ': ' + e.message.slice(0, 100)); return null; } };
    const runOnce = (args) => { console.error(new Date().toISOString().slice(11, 19), 'capture', args.s.document.id); return page.evaluate(`(${CAPTURE})(${JSON.stringify(args)})`); };
    for (const stage of data.stages) {
      const r = await run({ s: scenario({ mode: 'endless', difficulty: 'normal', weapon: 'sword', stage: stage.id }, `wiki-stage-${stage.id}`), frames: 240, crop: 'arena', shotAt: 180 });
      if (r) manifest.arenas[stage.id] = save(dir, `arenas/${stage.id}.webp`, r.image);
      else manifest.skipped.push(`arena ${stage.id}`);
    }
    for (const weapon of data.weapons) {
      const r = await run({ s: scenario({ mode: 'endless', difficulty: 'normal', weapon: weapon.id }, `wiki-weapon-${weapon.id}`), frames: 90, crop: 'player', shotAt: 84 });
      if (r) manifest.weapons[weapon.id] = save(dir, `weapons/${weapon.id}.webp`, r.image);
      else manifest.skipped.push(`weapon ${weapon.id}`);
    }
    for (const boss of data.bosses) {
      const phases = [];
      // Phase n begins at the exported mark: phase 2 below marks[0], phase 3 below marks[1].
      const marks = [1, ...boss.phaseMarks, 0];
      for (let phase = 1; phase <= boss.phaseMarks.length + 1; phase++) {
        const hp = Math.max(1, Math.round(boss.stats.hp * (marks[phase - 1] === 1 ? 1 : (marks[phase - 1] + marks[phase]) / 2)));
        const r = await run({ s: scenario({ mode: 'bossonly', difficulty: 'normal', weapon: 'sword', boss: boss.id }, `wiki-boss-${boss.id}-${phase}`, phase === 1 ? {} : { boss: { hp } }), frames: 720, crop: 'arena', shotAt: 150 });
        if (!r) { manifest.skipped.push(`boss ${boss.id} phase ${phase}`); continue; }
        const moves = {};
        for (const m of r.moves) {
          if (!m.state || m.state === 'idle') continue;
          const seconds = (m.to - m.from + 1) / 60;
          const entry = (moves[m.state] ??= { state: m.state, seen: 0, seconds: 0 });
          entry.seen += 1; entry.seconds = Math.max(entry.seconds, Math.round(seconds * 100) / 100);
        }
        phases.push({ phase, tag: r.tag, image: save(dir, `bosses/${boss.id}-${phase}.webp`, r.image), moves: Object.values(moves) });
      }
      manifest.bosses[boss.id] = phases;
    }
    await page.close();
  } finally { server.close(); }
}

/** Builds (or reuses) the media for this source; returns { key, manifest, dir }. */
export async function ensureMedia(data, sourceKey, { force = false } = {}) {
  const key = mediaKey(sourceKey);
  const dir = mediaDir(key);
  const cached = force ? null : loadManifest(key);
  if (cached) return { key, manifest: cached, dir };
  const { chromium } = await dep('@playwright/test/index.mjs');
  const manifest = { key, figures: {}, arenas: {}, weapons: {}, bosses: {}, skipped: [] };
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();
  try {
    await figures(browser, data, dir, manifest);
    await captures(browser, data, dir, manifest);
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 1));
  return { key, manifest, dir };
}

