// =============================================================================
//  TEAR DESIGN SYSTEM
//  One token-driven canvas component library. Every screen + HUD routes through
//  this module — no screen should poke `ctx` font/colour/geometry directly. If
//  you need a new visual, add a COMPONENT here rather than hand-rolling it at the
//  call site. See .claude/skills/ui-design-review for the rule that enforces this.
//
//  Layers:
//    UI.t   — design tokens (type scale, spacing, colour roles, component metrics)
//    UI.*   — components (text, title, button, chip, panel, card, bar, ...)
//  `UI.ink` is the live foreground colour; the game flips it to light on dark
//  biomes, so components read it instead of hard-coding black.
// =============================================================================
const UI = {
  ink: "#000",   // live foreground colour (flipped to light on dark biomes by the game)

  // ---- TOKENS -------------------------------------------------------------
  t: {
    // type scale (px, Courier mono). Names describe ROLE, not size, so screens
    // stay consistent: every screen title is `type.h1`, every tagline `type.caption`.
    type: {
      wordmark: 80,   // the "T E A R" logo only
      display: 52,    // full-screen splash headers (PAUSED, VICTORY, stage banner)
      h1: 40,         // primary screen title (SHOP, ABILITIES, SELECT RUN, ...)
      h2: 30,         // secondary title / dialog heading
      title: 24,      // section / card name
      lead: 20,       // buttons, emphasised values
      body: 16,       // standard copy
      label: 14,      // list rows, secondary copy
      caption: 13,    // taglines, hints
      micro: 11,      // tags, pips, fine print
    },
    // spacing scale (px) — vertical rhythm + paddings
    space: { xs: 6, sm: 10, md: 16, lg: 24, xl: 40 },
    // component metrics
    metric: {
      btnH: 48, btnW: 300, btnGap: 12, btnRound: 0,
      panelPad: 14, chipH: 28, chipW: 96, barH: 14, cardRound: 0,
    },
    // opacity roles for de-emphasised text
    alpha: { full: 1, soft: 0.7, muted: 0.55, faint: 0.4, ghost: 0.25 },
    // colour ROLES (semantic). `ink`/`paper` are the fg/bg pair; the rest pull
    // from the game palette so the system and the game never drift apart.
    color: {
      paper: "#fff",
      muted: "#9a9a9a",     // de-emphasised text / hairlines
      disabled: "#bbb",     // disabled controls
      get accent() { return CONFIG.colors.perfect; },
      get danger() { return CONFIG.colors.charger; },
      get unique() { return CONFIG.colors.perfect; },
    },
  },

  font(size, bold) { return (bold ? "bold " : "") + size + "px 'Courier New', monospace"; },

  // ---- TEXT ---------------------------------------------------------------
  // body / inline copy. size defaults to the `body` token.
  text(ctx, str, x, y, size, align, alpha) {
    ctx.globalAlpha = alpha == null ? this.t.alpha.full : alpha;
    ctx.fillStyle = this.ink;
    ctx.font = this.font(size || this.t.type.body, false);
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(str, x, y);
    ctx.globalAlpha = 1;
  },

  // bold, centred heading. size defaults to the `h1` token.
  title(ctx, str, x, y, size) {
    ctx.fillStyle = this.ink;
    ctx.font = this.font(size || this.t.type.h1, true);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(str, x, y);
  },

  // a coloured caption/tag (category labels, status words). align defaults left.
  tag(ctx, str, x, y, color, align, size) {
    ctx.fillStyle = color || this.t.color.muted;
    ctx.font = this.font(size || this.t.type.micro, true);
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(str, x, y);
  },

  // standard screen header: an h1/h2 title + an optional muted tagline beneath it.
  // Returns the y just below the header so callers can flow content under it.
  screenHeader(ctx, title, subtitle, y, big) {
    const ty = y == null ? 70 : y;
    const cx = CONFIG.view.w / 2;
    this.title(ctx, title, cx, ty, big ? this.t.type.h1 : this.t.type.h2);
    if (subtitle) this.text(ctx, subtitle, cx, ty + 28, this.t.type.caption, "center", this.t.alpha.muted);
    return ty + (subtitle ? 52 : 36);
  },

  pointIn(b, x, y) {
    return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  },

  // ---- BUTTON -------------------------------------------------------------
  // b: {x,y,w,h,label,enabled,size,sel} ; active = hovered | focused | selected
  button(ctx, b, active) {
    if (b.ghost) {
      // main-menu rail button: translucent over the dark sidebar, a soft light edge,
      // and a hot accent bar + label slide driven by the smooth hover progress (b._a).
      // Optional trimmings: b.glyph (left icon), b.dot (status pip), b.sub (subline),
      // b.hero (accent-filled call-to-action).
      const a = b._a == null ? (active ? 1 : 0) : b._a;
      const on = b.enabled !== false, cy = b.y + b.h / 2;
      if (b.hero) {
        // HERO: the primary call-to-action — solid accent body, dark ink label that
        // brightens + slides on hover, a top sheen line, and an optional subline.
        ctx.fillStyle = this.t.color.accent;
        ctx.globalAlpha = on ? 0.88 + 0.12 * a : 0.5; ctx.fillRect(b.x, b.y, b.w, b.h); ctx.globalAlpha = 1;
        ctx.globalAlpha = 0.22 + 0.35 * a; ctx.fillStyle = "#ffffff"; ctx.fillRect(b.x, b.y, b.w, 2); ctx.globalAlpha = 1;
        ctx.fillStyle = "#08131a"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
        if (b.glyph) { ctx.font = this.font(30, true); ctx.fillText(b.glyph, b.x + 22, cy + 1); }
        const hx = b.x + (b.glyph ? 70 : 24) + a * 6;
        ctx.font = this.font(b.size || 34, true);
        ctx.fillText(b.label, hx, cy - (b.sub ? 12 : 0) + 1);
        if (b.sub) { ctx.globalAlpha = 0.72; ctx.font = this.font(this.t.type.caption, true); ctx.fillText(b.sub, hx, cy + 16); ctx.globalAlpha = 1; }
        ctx.textBaseline = "alphabetic";
        return;
      }
      ctx.fillStyle = "rgba(241,239,249," + (0.05 + a * 0.10).toFixed(3) + ")";
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(241,239,249," + (on ? 0.28 + a * 0.5 : 0.15).toFixed(3) + ")";
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.globalAlpha = a; ctx.fillStyle = this.t.color.accent;
      ctx.fillRect(b.x, b.y, 4, b.h);
      ctx.globalAlpha = 1;
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      let labelX = b.x + 18 + a * 8;
      if (b.dot) {                                   // status pip (player card sync state)
        ctx.beginPath(); ctx.arc(b.x + 22, cy, 5, 0, 6.2832); ctx.fillStyle = b.dot; ctx.fill();
        labelX = b.x + 42 + a * 8;
      } else if (b.glyph) {                          // left glyph slot, warms on hover
        ctx.globalAlpha = on ? 0.5 + 0.5 * a : 0.3; ctx.fillStyle = this.t.color.accent;
        ctx.font = this.font(18, true); ctx.fillText(b.glyph, b.x + 16 + a * 8, cy + 1); ctx.globalAlpha = 1;
        labelX = b.x + 50 + a * 8;
      }
      ctx.fillStyle = on ? "#f1eff9" : "rgba(241,239,249,0.4)";
      ctx.font = this.font(b.size || this.t.type.lead, true);
      ctx.fillText(b.label, labelX, (b.sub ? cy - 10 : cy) + 1);
      if (b.sub) { ctx.globalAlpha = 0.6; ctx.font = this.font(this.t.type.caption, false); ctx.fillText(b.sub, labelX, cy + 12); ctx.globalAlpha = 1; }
      ctx.textBaseline = "alphabetic";
      return;
    }
    // default buttons share the menu's ghost language, adapted to light content zones:
    // a frosted body + ink hairline; hover/focus warms the wash and slides in a cyan
    // accent bar (b._a = smooth hover progress); a SELECTED button stays solid ink.
    const on = b.enabled !== false;
    const a = on ? (b._a == null ? (active ? 1 : 0) : b._a) : 0;
    const selected = on && !!b.sel;
    if (selected) {
      ctx.fillStyle = this.ink; ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.lineWidth = 2; ctx.strokeStyle = this.ink; ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = this.t.color.paper;
    } else {
      ctx.globalAlpha = on ? 0.62 : 0.35; ctx.fillStyle = this.t.color.paper;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      if (a > 0.01) { ctx.globalAlpha = 0.08 * a; ctx.fillStyle = this.ink; ctx.fillRect(b.x, b.y, b.w, b.h); }
      ctx.globalAlpha = on ? 0.55 + 0.45 * a : 1;
      ctx.lineWidth = 1.5 + a * 0.8;
      ctx.strokeStyle = on ? this.ink : this.t.color.disabled;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.globalAlpha = 1;
      if (b.accent) { ctx.fillStyle = b.accent; ctx.fillRect(b.x, b.y, 4, b.h); }   // identity bar (e.g. enemy kind colour)
      if (a > 0.01) { ctx.globalAlpha = a; ctx.fillStyle = this.t.color.accent; ctx.fillRect(b.x, b.y, b.accent ? 4 : 3, b.h); ctx.globalAlpha = 1; }
      ctx.fillStyle = on ? this.ink : this.t.color.disabled;
    }
    // optional trimmings (parity with the ghost style): b.glyph = left icon
    // slot, b.sub = caption subline, b.pips = {n, filled, color} right-aligned
    // level/heat meter; with any, text lays out left-aligned.
    const cy2 = b.y + b.h / 2;
    ctx.textBaseline = "middle";
    if (b.pips) this.pips(ctx, b.x + b.w - 14, cy2, b.pips.n, b.pips.filled, selected ? this.t.color.paper : b.pips.color);
    if (b.glyph || b.sub) {
      let lx2 = b.x + 16;
      if (b.glyph) {
        ctx.globalAlpha = selected ? 1 : 0.55 + 0.45 * a;
        ctx.fillStyle = selected ? this.t.color.paper : (b.accent || this.t.color.accent);
        ctx.font = this.font(17, true); ctx.textAlign = "left";
        ctx.fillText(b.glyph, lx2, cy2 + 1);
        ctx.globalAlpha = 1; lx2 += 30;
      }
      ctx.fillStyle = selected ? this.t.color.paper : (on ? this.ink : this.t.color.disabled);
      ctx.font = this.font(b.size || this.t.type.lead, true); ctx.textAlign = "left";
      ctx.fillText(b.label, lx2, (b.sub ? cy2 - 9 : cy2) + 1);
      if (b.sub) {
        ctx.globalAlpha = selected ? 0.75 : 0.55;
        ctx.font = this.font(this.t.type.micro, false);
        ctx.fillText(b.sub, lx2, cy2 + 12);
        ctx.globalAlpha = 1;
      }
      ctx.textBaseline = "alphabetic";
      return;
    }
    ctx.font = this.font(b.size || this.t.type.lead, true);
    ctx.textAlign = "center";
    ctx.fillText(b.label, b.x + b.w / 2, cy2 + 1);
    ctx.textBaseline = "alphabetic";
  },

  // ---- CHIP (compact toggle: filters, segmented controls) -----------------
  chip(ctx, b, on) {
    ctx.lineWidth = on ? 2.5 : 1.5;
    ctx.strokeStyle = on ? this.ink : this.t.color.muted;
    ctx.fillStyle = on ? this.ink : this.t.color.paper;
    ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.fill(); ctx.stroke();
    ctx.fillStyle = on ? this.t.color.paper : this.ink;
    ctx.font = this.font(b.size || this.t.type.micro, true);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
    ctx.textBaseline = "alphabetic";
  },

  // ---- TOGGLE (boolean switch: track + sliding knob) -----------------------
  // b: {x,y,w,h} = the clickable row (registered by the caller as a normal
  // uiButton); `on` = current value. The switch renders right-aligned in the row.
  _togAnim: {},
  toggle(ctx, b, on) {
    const key = (b._k || (b.x + "," + b.y));
    const prev = this._togAnim[key] == null ? (on ? 1 : 0) : this._togAnim[key];
    const a = this._togAnim[key] = prev + ((on ? 1 : 0) - prev) * 0.25;
    const trW = 58, trH = 26, tx = b.x + b.w - trW - 10, ty = b.y + (b.h - trH) / 2;
    // track
    ctx.globalAlpha = 0.25 + a * 0.75;
    ctx.fillStyle = on ? this.t.color.accent : "#9a9aa4";
    ctx.fillRect(tx, ty, trW, trH);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = this.ink; ctx.lineWidth = 1.5; ctx.strokeRect(tx, ty, trW, trH);
    // knob slides
    const kx = tx + 3 + a * (trW - trH);
    ctx.fillStyle = this.t.color.paper; ctx.fillRect(kx, ty + 3, trH - 6, trH - 6);
    ctx.strokeStyle = this.ink; ctx.strokeRect(kx, ty + 3, trH - 6, trH - 6);
    // state word to the left of the track
    ctx.font = this.font(this.t.type.micro, true); ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.fillStyle = this.ink; ctx.globalAlpha = on ? 0.85 : 0.4;
    ctx.fillText(on ? "ON" : "OFF", tx - 10, ty + trH / 2 + 1);
    ctx.globalAlpha = 1; ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
  },

  // ---- TABS (segmented view-switcher for hub screens) ----------------------
  // Deliberately NOT a chip: chips FILTER content, tabs SWITCH whole views.
  // A centred strip of labels over one hairline, with a sliding accent underline
  // marking the active view. `push` receives one hitbox per tab (b._tab = index).
  _tabAnim: {},
  tabs(ctx, id, labels, active, y, push) {
    const t = this.t, cx = CONFIG.view.w / 2, h = 34;
    ctx.font = this.font(t.type.label, true);
    let segW = 150;
    for (const l of labels) segW = Math.max(segW, ctx.measureText(l).width + 48);
    const total = segW * labels.length, x0 = cx - total / 2;
    this.divider(ctx, x0, y + h, total, 0.18);
    // sliding accent underline eases toward the active segment
    const prev = this._tabAnim[id] == null ? active : this._tabAnim[id];
    const cur = this._tabAnim[id] = prev + (active - prev) * 0.25;
    ctx.fillStyle = t.color.accent;
    ctx.fillRect(x0 + cur * segW + segW * 0.18, y + h - 3, segW * 0.64, 3);
    labels.forEach((label, i) => {
      const on = i === active;
      ctx.fillStyle = this.ink;
      ctx.globalAlpha = on ? 1 : t.alpha.muted;
      ctx.font = this.font(t.type.label, true);
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(label, x0 + i * segW + segW / 2, y + h / 2);
      ctx.globalAlpha = 1;
      if (push) push({ x: x0 + i * segW, y, w: segW, h, label: "", _hideBox: true, _tab: i });
    });
    ctx.textBaseline = "alphabetic";
    return y + h + 10;
  },

  // ---- LEDGER KIT (small editorial pieces shared by the sub-screens) --------
  // a bordered key-cap chip ("W", "SHIFT", "RMB") for control listings.
  // Returns the width consumed so callers can lay a row of caps.
  keycap(ctx, key, x, y) {
    ctx.font = this.font(this.t.type.micro, true);
    const w = Math.max(26, ctx.measureText(key).width + 14), h = 22;
    ctx.globalAlpha = 0.9; ctx.fillStyle = this.t.color.paper; ctx.fillRect(x, y - h + 5, w, h);
    ctx.globalAlpha = 1; ctx.strokeStyle = this.ink; ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y - h + 5, w, h);
    ctx.fillStyle = this.ink; ctx.fillRect(x, y + 3, w, 2);           // key-cap "depth" lip
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillText(key, x + w / 2, y);
    ctx.textAlign = "left";
    return w;
  },

  // a section label + hairline that RESERVES its vertical space (returns the y
  // content should start at) — so labels can never collide with what follows.
  sectionLabel(ctx, label, x, y, w, hue) {
    this.tag(ctx, label.toUpperCase(), x, y, hue || this.t.color.accent, "left", this.t.type.micro);
    ctx.font = this.font(this.t.type.micro, true);
    const lw = ctx.measureText(label.toUpperCase()).width;
    this.divider(ctx, x + lw + 12, y - 4, w - lw - 12, 0.14);
    return y + 18;
  },

  // a designed empty state: big ghost glyph + one-liner (+ optional CTA the
  // caller registers as a button and passes for placement). Centred in a zone.
  emptyState(ctx, glyph, line, cx, cy) {
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.globalAlpha = 0.10; ctx.fillStyle = this.ink; ctx.font = this.font(84, true);
    ctx.fillText(glyph, cx, cy);
    ctx.globalAlpha = 1;
    this.text(ctx, line, cx, cy + 42, this.t.type.body, "center", this.t.alpha.soft);
    return cy + 66;   // y for an optional CTA button under the line
  },

  // ---- SURFACES -----------------------------------------------------------
  // THE SHEET: the content surface every sub-screen sits on — a calm paper zone
  // over the live attract scene (soft shadow, wash, hairline frame, and a
  // signature-hue top edge that gives each screen its identity).
  // Standard geometry: UI.sheetRect() so every screen wraps identically.
  sheetRect() {
    const vw = CONFIG.view.w, vh = CONFIG.view.h;
    return { x: vw / 2 - 620, y: 44, w: 1240, h: vh - 80 };
  },
  sheet(ctx, x, y, w, h, hue) {
    ctx.save();
    ctx.globalAlpha = 0.10; ctx.fillStyle = "#0a0b10";               // soft drop shadow
    ctx.fillRect(x + 6, y + 8, w, h);
    ctx.globalAlpha = 0.62; ctx.fillStyle = this.t.color.paper;      // the paper surface
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 0.22; ctx.strokeStyle = this.ink; ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);                  // hairline frame
    ctx.globalAlpha = 1;
    ctx.fillStyle = hue || this.t.color.accent;                      // signature top edge
    ctx.fillRect(x, y, w, 3);
    ctx.restore();
  },

  // a plain bordered panel
  panel(ctx, x, y, w, h) {
    ctx.fillStyle = this.t.color.paper;
    ctx.strokeStyle = this.ink;
    ctx.lineWidth = 2;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
  },

  // an interactive card: panel + hover emphasis (inner wash + thicker border)
  card(ctx, x, y, w, h, hovered) {
    this.panel(ctx, x, y, w, h);
    if (hovered) {
      ctx.globalAlpha = 0.05; ctx.fillStyle = this.ink; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1;
      ctx.lineWidth = 3; ctx.strokeStyle = this.ink; ctx.strokeRect(x, y, w, h);
    }
  },

  // a coloured accent strip along the top of a surface (card category cue)
  accentStrip(ctx, x, y, w, color, thick) {
    ctx.fillStyle = color; ctx.fillRect(x, y, w, thick || 6);
  },

  // a thin divider line
  divider(ctx, x, y, w, alpha) {
    ctx.globalAlpha = alpha == null ? this.t.alpha.faint : alpha;
    ctx.strokeStyle = this.ink; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke();
    ctx.globalAlpha = 1;
  },

  // ---- BAR (progress / HP / meter) ----------------------------------------
  bar(ctx, x, y, w, h, frac, fill, line) {
    ctx.strokeStyle = line || this.ink; ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = fill || this.ink;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(frac, 1)), h);
  },

  // right-anchored row of `n` small squares, `filled` of them coloured (level meters)
  pips(ctx, xRight, y, n, filled, color) {
    const s = 9, g = 5;
    for (let i = 0; i < n; i++) {
      const px = xRight - (n - i) * (s + g) + g;
      if (i < filled) { ctx.fillStyle = color || this.t.color.accent; ctx.fillRect(px, y - s / 2, s, s); }
      else { ctx.strokeStyle = this.t.color.disabled; ctx.lineWidth = 1.5; ctx.strokeRect(px, y - s / 2, s, s); }
    }
  },

  // ---- OVERLAY ------------------------------------------------------------
  // dim the frozen world behind an overlay (fades to PAPER, so overlay text is
  // always inked black regardless of the biome underneath)
  dim(ctx, w, h, a) {
    const ox = (typeof OVERSCAN !== "undefined") ? OVERSCAN.x : 0;
    const oy = (typeof OVERSCAN !== "undefined") ? OVERSCAN.y : 0;
    ctx.globalAlpha = a == null ? 0.78 : a;
    ctx.fillStyle = this.t.color.paper;
    ctx.fillRect(-ox, -oy, w + ox * 2, h + oy * 2);   // reach the true screen edges in fullscreen
    ctx.globalAlpha = 1;
  },

  // scroll affordance ("▲ scroll ▼") for long lists
  scrollHint(ctx, x, y, canUp, canDown) {
    this.text(ctx, (canUp ? "▲ " : "") + "scroll" + (canDown ? " ▼" : ""), x, y, this.t.type.caption, "center", this.t.alpha.faint);
  },

  // ---- MENU AMBIENCE + STRUCTURE -----------------------------------------
  // a faint, slowly drifting "tear-slash" backdrop drawn behind every menu screen.
  // Monochrome with occasional accent so it reads as motion, never as clutter.
  menuBackdrop(ctx, time) {
    ctx.save();
    const vw = CONFIG.view.w, vh = CONFIG.view.h;
    const ox = (typeof OVERSCAN !== "undefined") ? OVERSCAN.x : 0;
    const oy = (typeof OVERSCAN !== "undefined") ? OVERSCAN.y : 0;
    const span = Math.round((vw + ox * 2) * 1.5), n = 6;
    for (let i = 0; i < n; i++) {
      const drift = (i * (span / n) + time * (16 + i * 5)) % span - 400 - ox;
      const accent = i % 3 === 0;
      ctx.globalAlpha = accent ? 0.05 : 0.035;
      ctx.strokeStyle = accent ? this.t.color.accent : this.ink;
      ctx.lineWidth = accent ? 2 : 1;
      ctx.beginPath(); ctx.moveTo(drift, -oy - 60); ctx.lineTo(drift - 620, vh + oy + 80); ctx.stroke();
    }
    // soft edge vignette to focus the eye centre
    const g = ctx.createRadialGradient(vw / 2, vh * 0.52, vh * 0.31, vw / 2, vh * 0.52, vw * 0.55);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.05)");
    ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(-ox, -oy, vw + ox * 2, vh + oy * 2);
    ctx.restore();
  },

  // a standard screen header: centred title + an accent underline that sweeps out
  // on entry + optional muted subtitle. Returns the y to start content below it,
  // so every sub-screen lines up identically. `anim` 0..1 drives the sweep.
  // `hue` = the screen's signature colour (defaults to accent cyan).
  header(ctx, title, subtitle, anim, hue) {
    const cx = CONFIG.view.w / 2;
    const a = anim == null ? 1 : anim;
    this.title(ctx, title, cx, 92, this.t.type.h1);
    const w = 130 * a;
    ctx.globalAlpha = a; ctx.fillStyle = hue || this.t.color.accent;
    ctx.fillRect(cx - w / 2, 108, w, 3); ctx.globalAlpha = 1;
    if (subtitle) this.text(ctx, subtitle, cx, 134, this.t.type.caption, "center", this.t.alpha.muted);
    return subtitle ? 188 : 170;
  },

  // a small accent pointer (focus/hover cue). `a` 0..1 slides + fades it in.
  caret(ctx, x, y, a, color) {
    const s = 7, ox = x - (1 - a) * 10;
    ctx.globalAlpha = 0.45 + a * 0.55; ctx.fillStyle = color || this.t.color.accent;
    ctx.beginPath(); ctx.moveTo(ox, y - s); ctx.lineTo(ox + s, y); ctx.lineTo(ox, y + s); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  },

  cursor(ctx, x, y) {
    ctx.strokeStyle = this.ink;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + 14, y + 4);
    ctx.lineTo(x + 5, y + 6); ctx.lineTo(x + 8, y + 15);
    ctx.lineTo(x + 4, y + 16); ctx.lineTo(x + 1, y + 7);
    ctx.closePath();
    ctx.fillStyle = this.ink;
    ctx.fill();
    ctx.stroke();
  },
};
