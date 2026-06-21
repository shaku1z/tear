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
    this.title(ctx, title, 800, ty, big ? this.t.type.h1 : this.t.type.h2);
    if (subtitle) this.text(ctx, subtitle, 800, ty + 28, this.t.type.caption, "center", this.t.alpha.muted);
    return ty + (subtitle ? 52 : 36);
  },

  pointIn(b, x, y) {
    return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  },

  // ---- BUTTON -------------------------------------------------------------
  // b: {x,y,w,h,label,enabled,size,sel} ; active = hovered | focused | selected
  button(ctx, b, active) {
    const on = b.enabled !== false;
    const fill = on && active;
    const line = on ? this.ink : this.t.color.disabled;
    ctx.lineWidth = 2;
    ctx.strokeStyle = line;
    ctx.fillStyle = fill ? this.ink : this.t.color.paper;
    ctx.beginPath();
    ctx.rect(b.x, b.y, b.w, b.h);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = fill ? this.t.color.paper : line;
    ctx.font = this.font(b.size || this.t.type.lead, true);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
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

  // ---- SURFACES -----------------------------------------------------------
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

  // ---- OVERLAY ------------------------------------------------------------
  // dim the frozen world behind an overlay (fades to PAPER, so overlay text is
  // always inked black regardless of the biome underneath)
  dim(ctx, w, h, a) {
    ctx.globalAlpha = a == null ? 0.78 : a;
    ctx.fillStyle = this.t.color.paper;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  },

  // scroll affordance ("▲ scroll ▼") for long lists
  scrollHint(ctx, x, y, canUp, canDown) {
    this.text(ctx, (canUp ? "▲ " : "") + "scroll" + (canDown ? " ▼" : ""), x, y, this.t.type.caption, "center", this.t.alpha.faint);
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
