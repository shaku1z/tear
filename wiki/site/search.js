// Site search: loads /search.json on first use (about 30 KB gzipped) and ranks
// entries by where the words match. Works as an overlay ("/" or Ctrl+K from any
// page) and on /search/?q=… without the overlay.
(() => {
  let index;
  const load = () => (index ??= fetch('/search.json').then((r) => r.json()));
  const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  function rank(entries, query) {
    const words = norm(query).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const scored = [];
    for (const e of entries) {
      const t = norm(e.t), d = norm(e.d), x = norm(e.x);
      let score = 0;
      for (const w of words) {
        if (t === w) score += 100; else if (t.startsWith(w)) score += 40; else if (t.includes(w)) score += 25;
        else if (d.includes(w)) score += 8; else if (x.includes(w)) score += 2; else { score = 0; break; }
      }
      if (score) scored.push([score - e.u.length / 100, e]);
    }
    return scored.sort((a, b) => b[0] - a[0]).slice(0, 30).map(([, e]) => e);
  }

  function attach(input, list, onPick) {
    let selected = 0, results = [];
    const paint = () => {
      list.innerHTML = results.map((e, i) => `<li><a href="${esc(e.u)}"${i === selected ? ' aria-selected="true"' : ''}><span class="kind">${esc(e.k)}</span><b>${esc(e.t)}</b><small>${esc(e.d)}</small></a></li>`).join('')
        || (input.value.trim() ? '<li><small>No matches.</small></li>' : '');
    };
    const run = async () => { results = rank(await load(), input.value); selected = 0; paint(); };
    input.addEventListener('input', run);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        selected = (selected + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % Math.max(results.length, 1);
        paint();
      } else if (event.key === 'Enter' && results[selected]) {
        event.preventDefault(); onPick?.(); location.href = results[selected].u;
      }
    });
    return run;
  }

  function overlay() {
    const panel = document.createElement('div');
    panel.className = 'search-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Search');
    panel.innerHTML = '<div class="box"><form class="hero-search" role="search"><label class="sr" for="overlay-q">Search the wiki</label><input id="overlay-q" type="search" placeholder="Search enemies, upgrades, bosses…" autocomplete="off"><button type="button">Close</button></form><ol class="results" aria-live="polite"></ol></div>';
    const close = () => panel.remove();
    panel.querySelector('button').addEventListener('click', close);
    panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    panel.addEventListener('click', (e) => { if (e.target === panel) close(); });
    panel.querySelector('form').addEventListener('submit', (e) => e.preventDefault());
    document.body.append(panel);
    const input = panel.querySelector('input');
    attach(input, panel.querySelector('.results'), close);
    input.focus();
    load();
  }

  document.addEventListener('DOMContentLoaded', () => {
    const page = document.querySelector('[data-search]');
    if (page) {
      const input = page.querySelector('input');
      const run = attach(input, document.querySelector('.results'));
      page.addEventListener('submit', (e) => e.preventDefault());
      input.value = new URLSearchParams(location.search).get('q') ?? '';
      if (input.value) run();
    }
    document.querySelector('.search-open')?.addEventListener('click', (e) => { if (!page) { e.preventDefault(); overlay(); } else page.querySelector('input').focus(); });
  });
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '');
    if (((e.key === '/' && !typing) || (e.key === 'k' && (e.ctrlKey || e.metaKey))) && !document.querySelector('.search-panel')) {
      e.preventDefault();
      const page = document.querySelector('[data-search] input');
      if (page) page.focus(); else overlay();
    }
  });
})();
