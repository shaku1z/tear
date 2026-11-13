// Builds the static wiki into wiki/dist/ from the game at this commit. Usage:
//   pnpm wiki:build   build once
//   pnpm wiki:dev     build, serve on http://localhost:4321, rebuild on change
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { marked } from 'marked';
import { loadGameData, sourceState } from './game-data.mjs';
import { inputsHash, loadPictures, picturesDir } from './pictures.mjs';
import * as page from './render.mjs';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');

/** Old (2025–2026 Starlight) URLs that moved; served as 301s by the Worker. */
const REDIRECTS = {
  '/admin/': '/',
  '/guides/example/': '/guides/',
  '/reference/example/': '/',
  '/builder/': '/upgrades/',
  '/getting-started/overview/': '/guides/how-to-play/',
  '/getting-started/ui-guide/': '/guides/how-to-play/',
  '/getting-started/controls/': '/controls/',
  '/mechanics/combat/': '/combat/',
  '/mechanics/dash/': '/combat/',
  '/mechanics/parry-and-deflect/': '/combat/',
  '/mechanics/slams-and-launches/': '/combat/',
  '/mechanics/status-effects/': '/combat/',
  '/mechanics/style-meter/': '/combat/',
  '/mechanics/the-blade/': '/combat/',
  '/upgrades/mobility/': '/upgrades/#cat-mobility',
  '/upgrades/offense/': '/upgrades/#cat-offense',
  '/upgrades/parry/': '/upgrades/#cat-parry',
  '/upgrades/resilience/': '/upgrades/#cat-resilience',
  '/upgrades/stackable/': '/upgrades/',
  '/upgrades/throw/': '/upgrades/#cat-throw',
  '/enemies/support/': '/enemies/',
  '/bosses/iron-colossus/': '/bosses/colossus/',
  '/bosses/the-echo/': '/bosses/echo/',
  '/bosses/the-source/': '/bosses/source/',
  '/stages/the-grounds/': '/stages/grounds/',
  '/stages/the-undercroft/': '/stages/undercroft/',
  '/stages/the-crimson-fields/': '/stages/crimson-fields/',
  '/stages/the-verdant-sanctum/': '/stages/verdant-sanctum/',
  '/stages/the-voidspire/': '/stages/voidspire/',
  '/stages/the-tear/': '/stages/tear/',
  '/modes/adventure/': '/modes/#campaign',
  '/modes/endless/': '/modes/#endless',
  '/modes/gauntlet/': '/modes/#gauntlet',
  '/modes/playground/': '/modes/#playground',
  '/progression/achievements/': '/achievements/',
  '/progression/meta-shop/': '/shop/',
  '/progression/daily-challenges/': '/modes/',
  '/reference/weapon-roster/': '/weapons/',
  '/reference/stat-glossary/': '/guides/glossary/',
  '/reference/changelog/': '/',
  '/reference/color-palette/': '/',
  '/reference/terminology/': '/',
};

function frontMatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  if (!match) return { meta: {}, body: text };
  const meta = Object.fromEntries(match[1].split(/\r?\n/).map((line) => {
    const at = line.indexOf(':');
    return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
  }));
  return { meta, body: text.slice(match[0].length) };
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
}

/** Hand-written content: guides become pages; notes attach to generated pages by path. */
export function loadContent() {
  const guidesDir = path.join(root, 'content', 'guides');
  const guides = walk(guidesDir).filter((f) => f.endsWith('.md')).map((file) => {
    const { meta, body } = frontMatter(fs.readFileSync(file, 'utf8'));
    const slug = path.basename(file, '.md');
    if (!meta.title || !meta.description) throw new Error(`${path.relative(root, file)} needs title and description front matter`);
    return { slug, title: meta.title, description: meta.description, html: marked.parse(body) };
  }).sort((a, b) => (a.slug === 'how-to-play' ? -1 : b.slug === 'how-to-play' ? 1 : a.title.localeCompare(b.title)));
  const notesDir = path.join(root, 'content', 'notes');
  const notes = new Map(walk(notesDir).filter((f) => f.endsWith('.md')).map((file) => {
    const route = `/${path.relative(notesDir, file).replace(/\\/g, '/').replace(/\.md$/, '')}/`;
    return [route, marked.parse(fs.readFileSync(file, 'utf8'))];
  }));
  return { guides, notes };
}

/** Every page the site has, as [route, page]. Pure: used by the build and the tests. */
export function buildPages(data, { guides, notes }) {
  const note = (route) => notes.get(route);
  const pages = [
    ['/', page.home(data, guides)],
    ['/weapons/', page.weaponsIndex(data)],
    ...data.weapons.map((w) => [page.url.weapon(w.id), page.weaponPage(data, w, note(page.url.weapon(w.id)))]),
    ['/upgrades/', page.upgradesPage(data, note('/upgrades/'))],
    ['/enemies/', page.enemiesIndex(data, note('/enemies/'))],
    ['/enemies/affixes/', page.affixesPage(data)],
    ...data.enemies.map((e) => [page.url.enemy(e.id), page.enemyPage(data, e, note(page.url.enemy(e.id)))]),
    ['/bosses/', page.bossesIndex(data)],
    ...data.bosses.map((b) => [page.url.boss(b.id), page.bossPage(data, b, note(page.url.boss(b.id)))]),
    ['/stages/', page.stagesIndex(data)],
    ...data.stages.map((s) => [page.url.stage(s.id), page.stagePage(data, s, note(page.url.stage(s.id)))]),
    ['/modes/', page.modesPage(data, note('/modes/'))],
    ['/combat/', page.combatPage(data, note('/combat/'))],
    ['/controls/', page.controlsPage(data, note('/controls/'))],
    ['/shop/', page.shopPage(data)],
    ['/achievements/', page.achievementsPage(data)],
    ['/guides/', page.guidesIndex(guides)],
    ...guides.map((g) => [page.url.guide(g.slug), page.guidePage(g)]),
    ['/search/', page.searchPage()],
  ];
  const routes = new Set(pages.map(([route]) => route));
  for (const route of notes.keys()) if (!routes.has(route)) throw new Error(`content/notes${route.slice(0, -1)}.md has no matching page ${route}`);
  return pages;
}

/** Search entries: one per page plus one per anchored entity (upgrades, affixes, shop…). */
function searchIndex(data, pages) {
  const strip = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
  const entries = pages.filter(([route]) => route !== '/search/').map(([route, p]) => ({ t: p.title, u: route, k: route.split('/')[1] || 'home', d: p.description, x: strip(p.body).slice(0, 600) }));
  const add = (k, list, toUrl, name, text) => list.forEach((item) => entries.push({ t: name(item), u: toUrl(item.id), k, d: text(item), x: '' }));
  add('upgrade', data.upgrades, page.url.upgrade, (u) => u.name, (u) => u.description);
  add('affix', data.affixes, page.url.affix, (a) => `${a.id[0].toUpperCase()}${a.id.slice(1)} (affix)`, (a) => a.effects.map(page.effectText).join(', '));
  add('shop', data.shop.items, page.url.shopItem, (i) => i.name, (i) => i.desc);
  add('achievement', data.achievements.filter((a) => !a.hidden), page.url.achievement, (a) => a.name, (a) => a.description);
  add('mode', data.modes, page.url.mode, (m) => m.label, (m) => m.blurb);
  data.enemies.forEach((e) => e.variants.filter((v) => v.minWave !== null).forEach((v) => entries.push({ t: v.name, u: `${page.url.enemy(e.id)}#variant-${v.id}`, k: 'variant', d: `${e.name} variant from wave ${v.minWave}`, x: '' })));
  return entries;
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

/** Builds the site into wiki/dist from the game at this commit and the committed pictures. */
export async function build() {
  const started = performance.now();
  const state = sourceState();
  const data = loadGameData(state);
  const pictures = loadPictures();
  if (pictures) data.media = pictures;
  if (pictures && pictures.inputsHash !== inputsHash()) console.warn('wiki/pictures is stale: run pnpm build:test:standalone && pnpm wiki:media (wiki:test fails until then)');
  const content = loadContent();
  const pages = buildPages(data, content);
  fs.rmSync(dist, { recursive: true, force: true, maxRetries: 5 });
  fs.cpSync(path.join(root, 'site'), dist, { recursive: true });
  if (pictures) fs.cpSync(picturesDir, path.join(dist, 'media'), { recursive: true, filter: (f) => !f.endsWith('manifest.json') });
  // The game's own font files, so the wiki and the game cannot drift apart.
  for (const font of ['BarlowCondensed-SemiBold.woff2', 'IBMPlexMono-Medium.woff2', 'IBMPlexMono-Regular.woff2', 'OFL.txt']) fs.cpSync(path.join(root, '..', 'public', 'fonts', font), path.join(dist, 'fonts', font));
  for (const [route, p] of [...pages, ['/404', page.notFoundPage()]]) {
    const html = page.layout({ data, path: route, pageTitle: p.title, description: p.description, body: p.body });
    write(path.join(dist, route === '/404' ? '404.html' : path.join(route, 'index.html')), html);
  }
  write(path.join(dist, 'search.json'), JSON.stringify(searchIndex(data, pages)));
  write(path.join(dist, '_redirects'), Object.entries(REDIRECTS).map(([from, to]) => `${from} ${to} 301`).join('\n') + '\n');
  write(path.join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map(([route]) => `<url><loc>https://wiki.tearblade.com${route}</loc></url>`).join('\n')}\n</urlset>\n`);
  write(path.join(dist, 'robots.txt'), 'User-agent: *\nAllow: /\nSitemap: https://wiki.tearblade.com/sitemap.xml\n');
  write(path.join(dist, 'version.json'), JSON.stringify({ game: data.source }) + '\n');
  return { pages: pages.length, media: pictures ? Object.keys(pictures.figures).length : 0, ms: Math.round(performance.now() - started) };
}

function serve(port = 4321) {
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml' };
  http.createServer((request, response) => {
    let file = path.join(dist, decodeURIComponent(new URL(request.url, 'http://x').pathname));
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    const found = fs.existsSync(file);
    response.writeHead(found ? 200 : 404, { 'content-type': types[path.extname(found ? file : '.html')] ?? 'application/octet-stream' });
    fs.createReadStream(found ? file : path.join(dist, '404.html')).pipe(response);
  }).listen(port, () => console.log(`Serving dist/ on http://localhost:${port}`));
  let timer;
  for (const dir of ['content', 'scripts', 'site']) {
    fs.watch(path.join(root, dir), { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(async () => { try { console.log('rebuilt', await build()); } catch (error) { console.error(error.message); } }, 100);
    });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const result = await build();
  console.log(`Built ${result.pages} pages into dist/ in ${result.ms} ms${result.media ? ` with ${result.media} game figures` : ' without game pictures'}`);
  if (process.argv.includes('--serve')) serve(Number(process.env.PORT) || 4321);
}
