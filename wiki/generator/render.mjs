// Page templates. Every fact comes from `data` (data/game.json, exported by the
// game); hand-written guide text comes in as `note` HTML and is always shown in a
// labelled Guide block so readers can tell the two apart.

export const esc = (value) => String(value)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

const num = (value) => Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
const pct = (value) => `${num(Math.round(value * 1000) / 10)}%`;
const signedPct = (multiplier) => `${multiplier >= 1 ? '+' : '−'}${num(Math.round(Math.abs(multiplier - 1) * 1000) / 10)}%`;
const title = (id) => id.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const words = (key) => key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()).toLowerCase().replace(/^./, (c) => c.toUpperCase());
const ordinalStage = (data, stageId) => data.stages.findIndex((stage) => stage.id === stageId) + 1;

export const SECTIONS = [
  ['Weapons', '/weapons/'], ['Upgrades', '/upgrades/'], ['Enemies', '/enemies/'], ['Bosses', '/bosses/'],
  ['Stages', '/stages/'], ['Modes', '/modes/'], ['Combat', '/combat/'], ['Controls', '/controls/'],
  ['Shop', '/shop/'], ['Achievements', '/achievements/'], ['Guides', '/guides/'],
];

/** URLs for every entity: the single place routes are decided. */
export const url = {
  weapon: (id) => `/weapons/${id}/`,
  upgrade: (id) => `/upgrades/#${id}`,
  enemy: (id) => `/enemies/${id}/`,
  affix: (id) => `/enemies/affixes/#${id}`,
  boss: (id) => `/bosses/${id}/`,
  stage: (id) => `/stages/${id}/`,
  mode: (id) => `/modes/#${id}`,
  difficulty: (id) => `/modes/#${id}`,
  achievement: (id) => `/achievements/#${id}`,
  shopItem: (id) => `/shop/#${id}`,
  guide: (slug) => `/guides/${slug}/`,
};

const link = (href, text) => `<a href="${esc(href)}">${esc(text)}</a>`;
const swatch = (color) => `<span class="swatch" style="--c:${esc(color)}" aria-hidden="true"></span>`;
const tile = (label, value) => `<div class="tile"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
const tiles = (items) => `<div class="tiles">${items.map(([label, value]) => tile(label, value)).join('')}</div>`;

/** A generated picture (wiki/generator/media.mjs), or nothing when the build has no media. */
function pic(data, name, alt, cls = 'pic') {
  return name ? `<img class="${cls}" src="/media/${esc(name)}" alt="${esc(alt)}" loading="lazy" decoding="async">` : '';
}

/** The Codex line, with the figure beside it when there is one. A page with no figure is just the text, full width. */
function intro(figure, text) {
  return `<div class="intro${figure ? ' with-figure' : ''}"><p class="codex">${esc(text)}</p>${figure}</div>`;
}

function table(head, rows, caption = '') {
  return `<div class="scroll"><table>${caption ? `<caption>${esc(caption)}</caption>` : ''}<thead><tr>${head.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell, i) => (i === 0 ? `<th scope="row">${cell}</th>` : `<td>${cell}</td>`)).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function guide(note) {
  if (!note) return '';
  return `<section class="guide" aria-labelledby="guide"><h2 id="guide">Tips</h2>${note}</section>`;
}

export function layout({ data, path, pageTitle, description, body, wide = false }) {
  const sha = data.source.sha;
  const full = pageTitle === 'TEAR: BLADE Wiki' ? pageTitle : `${pageTitle} · TEAR: BLADE Wiki`;
  const nav = SECTIONS.map(([label, href]) => `<a href="${href}"${path.startsWith(href) ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(full)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="https://wiki.tearblade.com${esc(path)}">
<meta property="og:title" content="${esc(full)}">
<meta property="og:description" content="${esc(description)}">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0d0d10" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/fonts/IBMPlexMono-Regular.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/style.css">
<script src="/search.js" defer></script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="top">
<div class="bar"><a class="brand" href="/">TEAR: BLADE <span>Wiki</span></a>
<a class="search-open" href="/search/" role="button" aria-keyshortcuts="/ Control+K">Search<kbd>/</kbd></a></div>
<nav aria-label="Sections">${nav}</nav>
</header>
<main id="main"${wide ? ' class="wide"' : ''}>
${body}
</main>
<footer><p>Built from game build <code>${sha.slice(0, 7)}</code>${data.source.dirty ? ' with local changes' : ''}. Stats, names and media come from that build. ${link('https://tearblade.com/', 'Play TEAR: BLADE')}</p></footer>
</body>
</html>
`;
}

const header = (eyebrow, heading, lede, color) => `<header class="page-head"${color ? ` style="--accent:${esc(color)}"` : ''}><p class="eyebrow">${eyebrow}</p><h1>${esc(heading)}</h1>${lede ? `<p class="lede">${esc(lede)}</p>` : ''}</header>`;

function cards(items) {
  return `<ul class="cards">${items.map(({ href, name, meta, text, color }) => `<li${color ? ` style="--accent:${esc(color)}"` : ''}><a href="${esc(href)}"><b>${esc(name)}</b>${meta ? `<span class="meta">${esc(meta)}</span>` : ''}${text ? `<span>${esc(text)}</span>` : ''}</a></li>`).join('')}</ul>`;
}

// ---------- pages ----------

export function home(data, guides) {
  const count = (n, label) => `${n} ${label}`;
  const sections = [
    { href: '/weapons/', name: 'Weapons', meta: count(data.weapons.length, 'weapons'), text: data.weapons.map((w) => w.name).join(' · ') },
    { href: '/upgrades/', name: 'Upgrades', meta: count(data.upgrades.length, 'upgrades'), text: 'Every draftable upgrade and ability tier.' },
    { href: '/enemies/', name: 'Enemies', meta: count(data.enemies.length, 'enemies'), text: 'Stats, variants, affixes and counterplay.' },
    { href: '/bosses/', name: 'Bosses', meta: count(data.bosses.length, 'bosses'), text: data.bosses.map((b) => b.name).join(' · ') },
    { href: '/stages/', name: 'Stages', meta: count(data.stages.length, 'biomes'), text: 'Enemy pools, arenas and lore.' },
    { href: '/modes/', name: 'Modes', meta: count(data.modes.length, 'modes'), text: 'Modes and difficulty modifiers.' },
    { href: '/combat/', name: 'Combat', meta: 'Style, dash, status', text: 'Trick points, style ranks and status effects.' },
    { href: '/controls/', name: 'Controls', meta: 'Keyboard · controller · touch', text: 'Every binding, per device.' },
    { href: '/shop/', name: 'Shop', meta: count(data.shop.items.length, 'items'), text: 'Permanent upgrades and every level cost.' },
    { href: '/achievements/', name: 'Achievements', meta: count(data.achievements.length, 'achievements'), text: 'Every goal, by category.' },
  ];
  const start = guides.find((g) => g.slug === 'how-to-play');
  const body = `<header class="hero"><h1>TEAR: BLADE</h1><p class="lede">A spring-physics blade, waves of coloured enemies, a boss at the end of every biome. Everything here comes from the game itself.</p>
<form class="hero-search" action="/search/" role="search"><label for="q" class="sr">Search the wiki</label><input id="q" name="q" type="search" placeholder="Search enemies, upgrades, bosses…" autocomplete="off"><button>Search</button></form>
${start ? `<p>New here? Start with ${link(url.guide(start.slug), start.title)}.</p>` : ''}</header>
${cards(sections)}`;
  return { title: 'TEAR: BLADE Wiki', description: 'The player wiki for TEAR: BLADE: weapons, upgrades, enemies, bosses, stages, modes and controls, generated from the game.', body };
}

export function weaponsIndex(data) {
  return {
    title: 'Weapons', description: 'Every weapon in TEAR: BLADE.',
    body: header('Roster', 'Weapons', `${data.weapons.length} weapons share movement, health and jumping; they differ in handling, an exclusive mechanic and a unique throw.`) +
      cards(data.weapons.map((w) => ({ href: url.weapon(w.id), name: w.name, meta: w.tags.join(' · '), text: w.description }))),
  };
}

export function weaponPage(data, weapon, note) {
  const ratings = Object.entries(weapon.ratings).map(([key, value]) => `<div class="rating"><span>${esc(words(key))}</span><meter min="0" max="5" value="${value}">${value}/5</meter><b>${value}/5</b></div>`).join('');
  const channels = table(['Throw channel', 'Multiplier'], Object.entries(weapon.channels).map(([key, value]) => [esc(words(key)), `×${num(value)}`]));
  const tuning = table(['Value', 'Base'], Object.entries(weapon.tuning).map(([key, value]) => [esc(words(key)), esc(num(value))]));
  const body = `${header('Weapon', weapon.name, weapon.blurb)}
${pic(data, data.media?.weapons[weapon.id], `${weapon.name} in the game, with its blade`, 'pic wide')}
<p>${esc(weapon.description)}</p>
<p><b>Playstyle.</b> ${esc(weapon.playstyle)}</p>
<div class="ratings">${ratings}</div>
<div class="cols">
<section><h2>Mechanics</h2><ul>${weapon.mechanics.map((m) => `<li>${esc(m)}</li>`).join('')}</ul><p><b>Throw:</b> ${esc(weapon.throwIdentity)}</p></section>
<section><h2>Weaknesses</h2><ul>${weapon.weaknesses.map((m) => `<li>${esc(m)}</li>`).join('')}</ul></section>
</div>
<h2>Throw channels</h2>${channels}
<details><summary>Exact tuning values</summary>${tuning}</details>
${guide(note)}`;
  return { title: weapon.name, description: `${weapon.name}: ${weapon.blurb}.`, body };
}

export function upgradesPage(data, note) {
  const categories = [...new Set(data.upgrades.map((u) => u.category))];
  const card = (u) => {
    const badges = [u.rare && 'Rare', u.unique && 'Unique', u.tiers.length > 0 && `${u.tiers.length} tiers`, u.maxStacks !== null && `Max ${u.maxStacks}`]
      .filter(Boolean).map((b) => `<span class="badge">${esc(b)}</span>`).join('');
    const tiers = u.tiers.length > 0 ? `<ol class="tiers">${u.tiers.map((t) => `<li>${esc(t.description)}</li>`).join('')}</ol>` : '';
    return `<article class="entry" id="${esc(u.id)}"><h3><a href="#${esc(u.id)}">${esc(u.name)}</a>${badges}</h3><p>${esc(u.description)}</p>${tiers}</article>`;
  };
  const toc = categories.map((c) => link(`#cat-${c}`, title(c))).join(' · ');
  const body = `${header('Draft', 'Upgrades', `${data.upgrades.length} upgrades. After each wave you pick one; tiered abilities can be raised after a boss.`)}
<p class="toc">${toc}</p>
${categories.map((c) => `<section><h2 id="cat-${esc(c)}">${esc(title(c))}</h2>${data.upgrades.filter((u) => u.category === c).map(card).join('')}</section>`).join('')}
${guide(note)}`;
  return { title: 'Upgrades', description: 'Every upgrade and ability tier in TEAR: BLADE.', body };
}

const statTiles = (s, boss) => tiles([['HP', num(s.hp)], [boss ? 'Touch damage' : 'Contact damage', num(s.contactDamage)], ['Speed', num(s.speed)]]);

export function enemiesIndex(data, note) {
  const rows = data.enemies.map((e) => [
    `${swatch(e.color)}${link(url.enemy(e.id), e.name)}`, esc(title(e.role.toLowerCase())), num(e.stats.hp), num(e.stats.contactDamage), num(e.stats.speed),
    e.stageIds.map((id) => link(url.stage(id), data.stages.find((s) => s.id === id).name)).join(', ') || '—',
  ]);
  const body = `${header('Bestiary', 'Enemies', 'Base stats on Normal. Difficulty, affixes and elite rolls change them in a run.')}
${table(['Enemy', 'Role', 'HP', 'Damage', 'Speed', 'Found in'], rows)}
<p>${link('/enemies/affixes/', 'Affixes and elites')}: the modifiers any enemy can roll.</p>
${guide(note)}`;
  return { title: 'Enemies', description: 'Every enemy in TEAR: BLADE with base stats.', body };
}

export function enemyPage(data, enemy, note) {
  const stagesWith = data.stages.filter((s) => s.pool.some((p) => p.kind === enemy.id));
  const found = stagesWith.length ? table(['Stage', 'From wave'], stagesWith.map((s) => [link(url.stage(s.id), s.name), String(s.pool.find((p) => p.kind === enemy.id).unlockWave)])) : '<p>Not part of a campaign stage pool.</p>';
  const variants = enemy.variants.length ? table(['Variant', 'Appears from'], [...enemy.variants].sort((a, b) => (a.minWave ?? 0) - (b.minWave ?? 0)).map((v) => [`<span id="variant-${esc(v.id)}">${esc(v.name)}</span>`, v.minWave === null ? 'Base form' : `Wave ${v.minWave}`])) : '<p>No variants.</p>';
  const affixes = enemy.affixIds.map((id) => link(url.affix(id), title(id))).join(', ') || 'none';
  const body = `${header(esc(title(enemy.role.toLowerCase())), enemy.name, null, enemy.color)}
${intro(pic(data, data.media?.figures[`enemies/${enemy.id}`], `${enemy.name} as it looks in the game`, 'pic fig'), enemy.desc)}
${statTiles(enemy.stats)}
<h2>Variants</h2>${variants}
<h2>Where it appears</h2>${found}
<p><b>Affixes it can roll:</b> ${affixes}.</p>
${guide(note)}`;
  return { title: enemy.name, description: `${enemy.name} (${enemy.role.toLowerCase()}): ${enemy.desc}`, body };
}

const EFFECT_TEXT = {
  maxHp: (e) => `${signedPct(e.value)} max HP`,
  weight: (e) => `${signedPct(e.value)} weight (harder to knock back)`,
  speedMult: (e) => `${signedPct(e.value)} move speed`,
  fireRateMult: (e) => (e.value < 1 ? `fires ${num(1 / e.value)}× as often` : `fires ${num(e.value)}× slower`),
  volley: (e) => `fires ${num(e.value)}-shot volleys`,
  contactReach: (e) => `contact reach ${num(e.value)} px`,
  contactDmg: (e) => `${signedPct(e.value)} contact damage`,
  hw: (e) => `${signedPct(e.value)} body width`,
  shield: (e) => `shield worth ${pct(e.value)} of max HP`,
};

export function effectText(effect) {
  const render = EFFECT_TEXT[effect.stat];
  if (!render) throw new Error(`No wording for affix effect "${effect.stat}"; add it to EFFECT_TEXT in wiki/generator/render.mjs`);
  return render(effect);
}

export function affixesPage(data) {
  const enemyName = (id) => data.enemies.find((e) => e.id === id)?.name ?? title(id);
  const affixes = data.affixes.map((a) => `<article class="entry" id="${esc(a.id)}" style="--accent:${esc(a.color)}"><h3>${swatch(a.color)}<a href="#${esc(a.id)}">${esc(title(a.id))}</a></h3><ul>${a.effects.map((e) => `<li>${esc(effectText(e))}</li>`).join('')}</ul><p class="meta">Can roll on: ${a.appliesTo.length === data.enemies.length ? 'every enemy' : a.appliesTo.map((id) => link(url.enemy(id), enemyName(id))).join(', ')}</p></article>`).join('');
  const combos = table(['Enemy', 'Fixed affixes'], data.affixCombos.map((c) => [link(url.enemy(c.enemyId), enemyName(c.enemyId)), c.affixIds.map((id) => link(url.affix(id), title(id))).join(' + ')]));
  const e = data.elite;
  const body = `${header('Modifiers', 'Affixes and elites', 'From wave 2, enemies can roll up to three affixes; each tints the enemy toward the affix colour so you can read the threat.')}
${affixes}
<h2>Authored combinations</h2><p>Some spawns always carry a fixed pair of affixes.</p>${combos}
<h2 id="elites">Elites</h2>
${tiles([['HP', `×${num(e.hpMult)}`], ['Speed', `×${num(e.speedMult)}`], ['Damage', `×${num(e.dmgMult)}`], ['Size', `×${num(e.sizeMult)}`]])}
<p>Elite chance grows by ${pct(e.chancePerWave)} per wave, up to ${pct(e.chanceMax)}.</p>`;
  return { title: 'Affixes and elites', description: 'Enemy affixes, their exact effects, and elite rolls.', body };
}

export function bossesIndex(data) {
  return {
    title: 'Bosses', description: 'Every boss in TEAR: BLADE.',
    body: header('Encounters', 'Bosses', 'One boss ends each biome.') +
      cards(data.bosses.map((b) => ({ href: url.boss(b.id), name: b.name, meta: `Stage ${ordinalStage(data, b.stageId)} · ${data.stages.find((s) => s.id === b.stageId).name} · ${num(b.stats.hp)} HP`, text: b.desc, color: b.color }))),
  };
}

/** The warnings each boss phase gives, measured by playing the phase in the game's test build. */
function phaseDetails(data, boss) {
  const measured = data.media?.bosses[boss.id];
  if (!measured?.length) return '';
  const declared = boss.moves ?? [];
  const isWindup = (m) => /wind(up)?$/.test(m.state);
  const label = (state) => words(state.replace(/wind(up)?$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').trim() || 'attack');
  const items = measured.map((p) => {
    // A boss that declares its moves as data gets the game's own warning times; the others are read from play.
    const warnings = declared.length
      ? declared.filter((m) => m.phases.includes(p.phase)).map((m) => `<li><b>${esc(title(m.id))}</b> ${m.strikes ? `warns for ${num(m.tellSeconds)} s before it lands.` : `takes ${num(m.tellSeconds)} s to set up and places something on the stage.`}</li>`).join('')
      : p.moves.filter(isWindup).map((m) => `<li><b>${esc(label(m.state))}</b> shows a wind-up of about ${num(m.seconds)} s before it lands.</li>`).join('');
    return `<section class="phase">${pic(data, p.image, `${boss.name}, phase ${p.phase}${p.tag ? `: ${p.tag}` : ''}`, 'pic wide')}<h3>Phase ${p.phase}${p.tag ? ` · ${esc(title(p.tag.toLowerCase()))}` : ''}</h3>${warnings ? `<ul>${warnings}</ul>` : '<p class="muted">No wind-up was seen in the timed play of this phase.</p>'}</section>`;
  }).join('');
  const source = declared.length ? 'Pictures come from playing each phase in the game. The warning times are the game's own, from the boss's move list.' : 'Pictures and wind-up times come from playing each phase in the game. The wind-up is the warning before the hit. A phase that lists none had no wind-up state in the timed play.';
  return `<p class="muted">${source}</p>${items}`;
}

export function bossPage(data, boss, note) {
  const stage = data.stages.find((s) => s.id === boss.stageId);
  const marks = boss.phaseMarks;
  const bar = `<div class="phasebar" role="img" aria-label="Health bar with phase changes at ${marks.map(pct).join(' and ')} HP">${marks.map((m) => `<i style="left:${m * 100}%"></i>`).join('')}</div>`;
  const phases = table(['Phase', 'Starts at'], [['Phase 1', '100% HP'], ...marks.map((m, i) => [`Phase ${i + 2}`, `${pct(m)} HP (${num(Math.round(boss.stats.hp * m))})`])]);
  const body = `${header(`Stage ${ordinalStage(data, boss.stageId)} boss · ${link(url.stage(stage.id), stage.name)}`, boss.name, null, stage.theme.accent)}
${intro(pic(data, data.media?.figures[`bosses/${boss.id}`], `${boss.name} as it looks in the game`, 'pic fig'), boss.desc)}
${statTiles(boss.stats, true)}
<h2>Phases</h2>${bar}${phases}${phaseDetails(data, boss)}
${guide(note)}`;
  return { title: boss.name, description: `${boss.name}, the boss of ${stage.name}: ${boss.desc}`, body };
}

function arena(stage) {
  const t = stage.theme;
  const rects = stage.layout.map((p) => `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}"${p.oneway ? ' class="oneway"' : ''}/>`).join('');
  return `<figure class="arena"><svg viewBox="0 0 1600 900" role="img" aria-label="Arena layout of ${esc(stage.name)}" style="--bg:${esc(t.background)};--fg:${esc(t.platform)};--ac:${esc(t.accent)}"><rect class="sky" width="1600" height="900"/>${rects}<rect class="floor" y="860" width="1600" height="40"/></svg><figcaption>Arena platforms (dashed: one-way).</figcaption></figure>`;
}

export function stagesIndex(data) {
  return {
    title: 'Stages', description: 'The biomes of the TEAR: BLADE campaign.',
    body: header('Campaign', 'Stages', `${data.stages.length} biomes, each ending in a boss.`) +
      cards(data.stages.map((s, i) => ({ href: url.stage(s.id), name: s.name, meta: `Chapter ${s.narrative.chapter.number} · Stage ${i + 1}`, text: s.blurb, color: s.theme.accent }))),
  };
}

export function stagePage(data, stage, note) {
  const boss = data.bosses.find((b) => b.id === stage.boss);
  const enemyName = (id) => data.enemies.find((e) => e.id === id).name;
  const pool = table(['Enemy', 'From wave'], [...stage.pool].sort((a, b) => a.unlockWave - b.unlockWave).map((p) => [link(url.enemy(p.kind), enemyName(p.kind)), String(p.unlockWave)]));
  const ch = stage.narrative.chapter;
  const lore = `<section class="lore"><h2>Lore</h2><p class="eyebrow">Chapter ${esc(ch.number)}${ch.title ? ` · ${esc(ch.title)}` : ''}</p><p class="intro">${esc(ch.intro)}</p>${ch.pages.map((p) => `<h3>${esc(p.label)}</h3><p>${esc(p.text)}</p>`).join('')}<details><summary>After the boss (spoiler): ${esc(ch.bossOutro.label)}</summary><p>${esc(ch.bossOutro.text)}</p></details></section>`;
  const body = `${header(`Stage ${ordinalStage(data, stage.id)}`, stage.name, stage.blurb, stage.theme.accent)}
<p><b>Boss:</b> ${link(url.boss(boss.id), boss.name)}</p>
<h2>Enemies</h2>${pool}
<h2>Arena</h2>${pic(data, data.media?.arenas[stage.id], `${stage.name} arena as it looks in the game`, 'pic wide')}${arena(stage)}
${lore}
${guide(note)}`;
  return { title: stage.name, description: `${stage.name}: ${stage.blurb} Enemies, boss, arena and lore.`, body };
}

const MODIFIER_LABELS = { enemyHealth: 'Enemy HP', playerDamageTaken: 'Damage you take', enemyCount: 'Enemy count', coinReward: 'Coins', scoreReward: 'Score' };

export function modesPage(data, note) {
  const modes = data.modes.map((m) => `<article class="entry" id="${esc(m.id)}"><h3><a href="#${esc(m.id)}">${esc(m.label)}</a></h3><p>${esc(m.blurb)}</p></article>`).join('');
  const keys = Object.keys(data.difficulties[0].modifiers);
  keys.forEach((k) => { if (!MODIFIER_LABELS[k]) throw new Error(`No label for difficulty modifier "${k}" in wiki/generator/render.mjs`); });
  const rows = data.difficulties.map((d) => [`<span id="${esc(d.id)}">${esc(d.label)}</span>`, esc(d.description), ...keys.map((k) => `×${num(d.modifiers[k])}`)]);
  const body = `${header('Play', 'Modes and difficulty', null)}
${modes}
<h2>Difficulty</h2>${table(['Difficulty', '', ...keys.map((k) => MODIFIER_LABELS[k])], rows)}
${data.difficulties.some((d) => d.oneHit) ? `<p>${esc(data.difficulties.find((d) => d.oneHit).label)}: any damaging hit ends the run.</p>` : ''}
${guide(note)}`;
  return { title: 'Modes and difficulty', description: 'Game modes and difficulty modifiers in TEAR: BLADE.', body };
}

export function combatPage(data, note) {
  const s = data.style, st = data.status, d = data.dash;
  const tricks = table(['Trick', 'Points', 'How'], s.tricks.map((t) => [esc(t.name), num(t.points), esc(t.description)]));
  const ranks = table(['Rank', 'Gauge', 'Score ×'], s.ranks.map((r) => [esc(r.name), num(r.gauge), `×${num(r.multiplier)}`]));
  const body = `${header('Systems', 'Combat', 'Style scoring, dash and status effects, straight from the game.')}
<h2>Style</h2>
<p>Every trick adds points to the Style gauge. A trick different from the last one scores ×${num(s.varietyMultiplier)}. After ${num(s.decaySeconds)} s without a trick the gauge starts draining, and taking a hit loses ${pct(s.hitLoss)} of it.</p>
${tricks}<h3>Ranks</h3>${ranks}
<h2>Dash</h2>${tiles([['Speed', `${num(d.speed)} px/s`], ['Duration', `${num(d.duration)} s`], ['Cooldown', `${num(d.cooldown)} s`], ['Invulnerable', `${num(d.iframe)} s`]])}
<h2>Status effects</h2>
${table(['Effect', 'What it does'], [
    ['Bleed', `${num(st.bleedDps)} damage per second per stack, up to ${num(st.bleedMax)} stacks, for ${num(st.bleedDur)} s (re-applying refreshes it).`],
    ['Burn', `${num(st.burnDps)} damage per second for ${num(st.burnDur)} s.`],
    ['Mark', `The target takes ${signedPct(st.markMult)} damage from everything for ${num(st.markDur)} s.`],
  ].map(([a, b]) => [a, esc(b)]))}
${guide(note)}`;
  return { title: 'Combat', description: 'Style points and ranks, dash, and status effects in TEAR: BLADE.', body };
}

const KEY_TEXT = { MOUSE: 'Mouse', RMB: 'Right mouse button', SPACE: 'Space', SHIFT: 'Shift', ESC: 'Esc' };

export function controlsPage(data, note) {
  const c = data.controls;
  const keys = table(['Keys', 'Action'], c.keyboard.map((k) => [k.keys.map((key) => `<kbd>${esc(KEY_TEXT[key] ?? key)}</kbd>`).join(' '), esc(k.description)]));
  const pad = table(['Action', 'Xbox', 'PlayStation'], c.gamepad.map((g) => [esc(title(g.action)), g.buttons.map((b) => `<kbd>${esc(b)}</kbd>`).join(' '), g.playstation.map((b) => `<kbd>${esc(b)}</kbd>`).join(' ')]));
  const body = `${header('Input', 'Controls', null)}
<h2>Keyboard and mouse</h2>${keys}
<h2>Controller</h2><p>${c.gamepadSticks.map(esc).join('. ')}. The default layout is below; other presets can be picked in Settings.</p>${pad}
${guide(note)}`;
  return { title: 'Controls', description: 'Keyboard, mouse, controller and touch controls for TEAR: BLADE.', body };
}

export function shopPage(data) {
  const section = (cat) => data.shop.items.filter((i) => i.category === cat.id).map((item) => {
    const total = item.levels.reduce((sum, l) => sum + l.cost, 0);
    const rows = item.levels.map((l, i) => [String(i + 1), esc(l.effect), num(l.cost)]);
    return `<article class="entry" id="${esc(item.id)}"><h3><span aria-hidden="true">${esc(item.glyph)}</span> <a href="#${esc(item.id)}">${esc(item.name)}</a> <span class="badge">${item.levels.length} level${item.levels.length > 1 ? 's' : ''}</span></h3><p>${esc(item.desc)}</p><details><summary>Costs (${num(total)} coins in total)</summary>${table(['Level', 'Total effect', 'Cost'], rows)}</details></article>`;
  }).join('');
  const body = `${header('Progression', 'Shop', 'Permanent upgrades bought with coins earned in runs.')}
${data.shop.categories.map((c) => `<section><h2 id="cat-${esc(c.id)}">${esc(title(c.label.toLowerCase()))}</h2>${section(c)}</section>`).join('')}`;
  return { title: 'Shop', description: 'Every permanent shop upgrade in TEAR: BLADE with all level costs.', body };
}

export function achievementsPage(data) {
  const categories = [...new Set(data.achievements.map((a) => a.category))];
  const entry = (a) => `<li id="${esc(a.id)}"><b>${esc(a.name)}</b> <span class="badge r-${esc(a.rarity)}">${esc(a.rarity)}</span><br>${a.hidden ? `<details><summary>Hidden achievement</summary>${esc(a.description)}</details>` : esc(a.description)}</li>`;
  const body = `${header('Progression', 'Achievements', `${data.achievements.length} achievements in ${categories.length} categories.`)}
<p class="toc">${categories.map((c) => link(`#cat-${c}`, title(c))).join(' · ')}</p>
${categories.map((c) => `<section><h2 id="cat-${esc(c)}">${esc(title(c))}</h2><ul class="achievements">${data.achievements.filter((a) => a.category === c).map(entry).join('')}</ul></section>`).join('')}`;
  return { title: 'Achievements', description: 'Every achievement in TEAR: BLADE.', body };
}

export function guidesIndex(guides) {
  return {
    title: 'Guides', description: 'Player-written guides for TEAR: BLADE.',
    body: header('Help', 'Guides', 'How to play, and the words the game uses. For exact numbers, see the other pages.') +
      cards(guides.map((g) => ({ href: url.guide(g.slug), name: g.title, text: g.description }))),
  };
}

export function guidePage(entry) {
  return { title: entry.title, description: entry.description, body: `${header('Guide', entry.title, entry.description)}<div class="prose">${entry.html}</div>` };
}

export function searchPage() {
  return {
    title: 'Search', description: 'Search the TEAR: BLADE wiki.',
    body: `${header('Find', 'Search', null)}<form class="hero-search" role="search" data-search><label for="search-q" class="sr">Search the wiki</label><input id="search-q" name="q" type="search" placeholder="Search…" autocomplete="off" autofocus></form><ol class="results" aria-live="polite"></ol><noscript><p>Search needs JavaScript. Every page is also reachable from the section links above.</p></noscript>`,
  };
}

export function notFoundPage() {
  return { title: 'Not found', description: 'Page not found.', body: `${header('404', 'Not found', 'That page does not exist (or moved in the 2026 rebuild).')}<p>${link('/search/', 'Search the wiki')} or go ${link('/', 'home')}.</p>` };
}
