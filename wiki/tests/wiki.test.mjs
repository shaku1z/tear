// The wiki's whole test set: each test guards a failure a player would see.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { build, buildPages, loadContent } from '../scripts/build.mjs';
import { loadGameData, sourceState } from '../scripts/game-data.mjs';
import { BUDGET } from '../scripts/media.mjs';
import { url } from '../scripts/render.mjs';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const data = loadGameData();
const content = loadContent();
const pages = new Map(buildPages(data, content));
await build();

test('the site names the commit it was built from', () => {
  const { head } = sourceState();
  assert.equal(data.format, 'tear-wiki-data');
  assert.equal(data.source.sha, head);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dist, 'version.json'), 'utf8')).game.sha, head);
  assert.ok(fs.readFileSync(path.join(dist, 'index.html'), 'utf8').includes(`<code>${head.slice(0, 7)}</code>`));
});

test('every entity in the game data has a page or an anchor', () => {
  const pageFor = (href) => pages.get(href.split('#')[0]);
  const routed = [
    ...data.weapons.map((e) => url.weapon(e.id)), ...data.enemies.map((e) => url.enemy(e.id)),
    ...data.bosses.map((e) => url.boss(e.id)), ...data.stages.map((e) => url.stage(e.id)),
  ];
  for (const href of routed) assert.ok(pageFor(href), `no page for ${href}`);
  const anchored = [
    ...data.upgrades.map((e) => url.upgrade(e.id)), ...data.affixes.map((e) => url.affix(e.id)),
    ...data.achievements.map((e) => url.achievement(e.id)), ...data.shop.items.map((e) => url.shopItem(e.id)),
    ...data.modes.map((e) => url.mode(e.id)), ...data.difficulties.map((e) => url.difficulty(e.id)),
  ];
  for (const href of anchored) {
    const [route, id] = href.split('#');
    assert.ok(pageFor(route)?.body.includes(`id="${id}"`), `no anchor for ${href}`);
  }
});

test('every hand-written note belongs to a page that exists', () => {
  assert.ok(content.notes.size > 0);
  const orphan = new Map([...content.notes, ['/bosses/someone-removed/', '<p>old</p>']]);
  assert.throws(() => buildPages(data, { ...content, notes: orphan }), /no matching page/);
});

test('the build has no broken internal links or redirects', () => {
  const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(path.join(dir, d.name)) : [path.join(dir, d.name)]));
  const html = new Map(files(dist).filter((f) => f.endsWith('.html')).map((f) => [f, fs.readFileSync(f, 'utf8')]));
  const resolve = (route) => {
    const file = path.join(dist, decodeURIComponent(route));
    return route.endsWith('/') ? path.join(file, 'index.html') : file;
  };
  const broken = [];
  for (const [file, source] of html) {
    for (const [, href] of source.matchAll(/href="(\/[^"]*)"/g)) {
      const [route, anchor] = href.split('#');
      const target = resolve(route || '/');
      if (!fs.existsSync(target)) broken.push(`${path.relative(dist, file)} -> ${href}`);
      else if (anchor && !(html.get(target) ?? '').includes(`id="${anchor}"`)) broken.push(`${path.relative(dist, file)} -> ${href} (no anchor)`);
    }
  }
  for (const line of fs.readFileSync(path.join(dist, '_redirects'), 'utf8').trim().split('\n')) {
    const [from, to] = line.split(' ');
    const [route, anchor] = to.split('#');
    if (from.includes('*')) broken.push(`_redirects ${from} (a wildcard can shadow a page)`);
    if (fs.existsSync(resolve(from))) broken.push(`_redirects ${from} shadows a page`);
    if (!fs.existsSync(resolve(route))) broken.push(`_redirects -> ${to}`);
    else if (anchor && !(html.get(resolve(route)) ?? '').includes(`id="${anchor}"`)) broken.push(`_redirects -> ${to} (no anchor)`);
  }
  assert.deepEqual(broken, []);
});

test('pages show no retired or tooling-only name from the game\'s terminology registry', () => {
  const aliases = data.excludedNames;
  const text = [...pages.values()].map((p) => `${p.title} ${p.description} ${p.body}`).join('\n').replace(/<[^>]+>/g, ' ');
  for (const alias of aliases) assert.doesNotMatch(text, new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`), `excluded name "${alias}" appears`);
});

test('the site stays small', () => {
  const size = (f) => fs.statSync(path.join(dist, f)).size;
  const pagesHtml = [...pages.keys()].map((route) => [route, size(path.join(route, 'index.html'))]);
  for (const [route, bytes] of pagesHtml) assert.ok(bytes < 120_000, `${route} is ${bytes} bytes (budget 120 KB)`);
  assert.ok(size('style.css') + size('search.js') < 30_000, 'CSS + JS over 30 KB');
  assert.ok(size('search.json') < 200_000, 'search index over 200 KB');
  const total = fs.readdirSync(dist, { recursive: true }).map((f) => path.join(dist, f)).filter((f) => fs.statSync(f).isFile()).reduce((sum, f) => sum + fs.statSync(f).size, 0);
  assert.ok(total < 3_000_000, `site is ${total} bytes (budget 3 MB)`);
});

test('pictures stay inside the page-weight budget and every referenced picture exists', () => {
  const media = path.join(dist, 'media');
  const files = fs.existsSync(media) ? fs.readdirSync(media, { recursive: true }).filter((f) => f.endsWith('.webp')) : [];
  for (const file of files) assert.ok(fs.statSync(path.join(media, file)).size <= BUDGET.imageBytes, `${file} is over ${BUDGET.imageBytes} bytes`);
  const total = files.reduce((sum, f) => sum + fs.statSync(path.join(media, f)).size, 0);
  assert.ok(total <= BUDGET.totalBytes, `pictures total ${total} bytes (budget ${BUDGET.totalBytes})`);
  for (const [route] of pages) {
    const html = fs.readFileSync(path.join(dist, route, 'index.html'), 'utf8');
    const used = [...html.matchAll(new RegExp('src="' + '[/]media[/]([^"]+)"', 'g'))].map((m) => m[1]);
    for (const name of used) assert.ok(fs.existsSync(path.join(media, name)), `${route} references missing picture ${name}`);
    assert.ok(used.reduce((sum, n) => sum + fs.statSync(path.join(media, n)).size, 0) <= BUDGET.pageMediaBytes, `${route} pictures over ${BUDGET.pageMediaBytes} bytes`);
  }
});
