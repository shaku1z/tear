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
    // Chapter typography roles (Pantheon VI). Bundled families with deterministic
    // Courier/Arial fallbacks; never hardcode these strings at call sites.
    font: {
      display: "'Barlow Condensed', 'Arial Narrow', system-ui, sans-serif",  // condensed display titles
      body: "'IBM Plex Mono', 'Courier New', monospace",                     // readable mono lore
      displayWeight: 600, bodyWeight: 400, bodyMediumWeight: 500,
    },
    // letter-spacing roles (px, applied by manual tracking since canvas has no
    // letter-spacing before recent specs) and line-height roles (multipliers).
    track: { label: 3.2, title: 0.5, body: 0.2 },
    lineH: { title: 1.02, body: 1.5 },
    // Living-biome chapter layout (authored at 1600×900, scaled by the caller).
    chapter: {
      safeMargin: 48, safeVW: 0.06,          // max(48, 6vw)
      bodyColW: 580, cpl: [45, 68],          // body column + target chars/line
      washDim: 0.26,                          // world loses ~26% (not 72%) — biome stays legible
      washSpan: 0.52,                         // fraction of width the ink-wash covers on its side
      washDark: "rgba(6,7,12,0.82)", washLight: "rgba(248,247,244,0.90)",
      labelGap: 34, titleGap: 30, loreGap: 42, progressGap: 22, promptGap: 30,
      fragStagger: 0.05, fragStaggerCap: 0.18,
    },
    // component metrics
    metric: {
      btnH: 48, btnW: 300, btnGap: 12, btnRound: 0,
      panelPad: 14, chipH: 28, chipW: 96, barH: 14, cardRound: 0,
      // boss theater: shared HUD + cinematic proportions. Ratios remain tokens so
      // callers can resize the surfaces without rebuilding their internal layout.
      bossHudH: 16, bossSegments: 10, bossNotchH: 6, bossBorderW: 2, bossGlow: 8,
      bossGuardH: 6, bossGuardGap: 10, bossGuardScale: 0.60,
      bossShimmerW: 112, bossCrackJut: 10,
      bossIntroBarH: 96, bossIntroAccentHalfW: 150, bossIntroAccentH: 3,
      bossIntroTitleBottom: 34, bossIntroAccentBottom: 22, bossIntroEpithetBottom: 2,
      bossVignetteFocusY: 0.46, bossVignetteInner: 0.18, bossVignetteOuter: 0.72,
      bossPhaseBannerW: 760, bossPhaseBannerH: 72, bossPhaseBannerY: 0.24,
      bossPhaseAccentH: 3,
      cinemaBarH: 74, cinemaDialogueW: 780, cinemaDialogueH: 104,
      cinemaDialogueBottom: 96, cinemaDialoguePad: 18, cinemaProgressH: 3,
      cinematicPromptBottom: 54,
      finalRewardW: 760, finalRewardH: 390, finalRewardSigilR: 54,
      finalRewardRuleW: 310, finalRewardPromptBottom: 34, finalFractureW: 680, finalFractureH: 12,
      rallyInset: 2,
      settingsTop: 182, settingsContentInset: 40, settingsColumnGap: 40,
      settingsRowH: 58, settingsControlW: 252, settingsControlH: 42, settingsStepperW: 54,
    },
    // opacity roles for de-emphasised text
    alpha: {
      full: 1, soft: 0.7, muted: 0.55, faint: 0.4, ghost: 0.25,
      bossTrack: 0.20, bossGuardTrack: 0.16, bossNotch: 0.90, bossFlash: 0.85,
      cinemaBar: 0.88, cinemaVignette: 0.30, cinemaSubtitle: 0.75,
      bossPhasePanel: 0.82,
      cinemaPanel: 0.90, cinemaHint: 0.58,
      finalRewardDim: 0.78, finalRewardPanel: 0.96, finalRewardGhost: 0.18,
      rallyBase: 0.72, rallyPulse: 0.18,
    },
    // colour ROLES (semantic). `ink`/`paper` are the fg/bg pair; the rest pull
    // from the game palette so the system and the game never drift apart.
    color: {
      paper: "#fff",
      muted: "#9a9a9a",     // de-emphasised text / hairlines
      disabled: "#bbb",     // disabled controls
      cinema: "#06070c",    // fixed dark field for cinematic boss chrome
      cinemaInk: "#f1eff9", // title ink on the cinematic field
      cinemaMuted: "#c9ccd6",
      guard: "#e0a326",     // posture / guard-break meter
      get rally() { return CONFIG.colors.bomber; },
      get accent() { return CONFIG.colors.perfect; },
      get danger() { return CONFIG.colors.charger; },
      get unique() { return CONFIG.colors.perfect; },
    },
    motion: {
      bossPhaseFlash: 0.7,
      bossShimmerCycle: 2.4,
      bossGuardPulse: 14,
      bossIntroIn: 0.25,
      bossIntroOutAt: 0.82,
      bossIntroOutSpan: 0.18,
      bossIntroAccentDelay: 0.15,
      bossIntroAccentGrow: 0.5,
      cinemaFrameIn: 0.45, cinemaDialogueIn: 0.22,
      chapterIn: 0.22,
      // Living-biome chapter timings (Pantheon VI P3)
      chapterPageCross: 0.26, loreReveal: 0.32, loreExit: 0.36,
      biomeRevealFull: 1.6, biomeRevealBrief: 1.0, readyFull: 0.9, readyBrief: 0.65,
      finalRewardIn: 0.34,
      rallyPulse: 9,
    },
  },

  font(size, bold) { return (bold ? "bold " : "") + size + "px 'Courier New', monospace"; },

  // ---- CHAPTER TYPE ROLES (Pantheon VI) -----------------------------------
  // Never hardcode the family strings at a call site; go through these.
  displayFont(size, weight) { return (weight || this.t.font.displayWeight) + " " + size + "px " + this.t.font.display; },
  bodyFont(size, weight) { return (weight || this.t.font.bodyWeight) + " " + size + "px " + this.t.font.body; },

  // draw a single line with manual per-glyph tracking (canvas letter-spacing is
  // not yet universal). Returns the advanced x. Honors the current textAlign for
  // "left"/"right"/"center" by pre-measuring the tracked width.
  trackedText(ctx, str, x, y, track, align) {
    const s = String(str); if (!s) return x;
    let total = 0; for (let i = 0; i < s.length; i++) total += ctx.measureText(s[i]).width + (i < s.length - 1 ? track : 0);
    let cx = align === "center" ? x - total / 2 : align === "right" ? x - total : x;
    const savedAlign = ctx.textAlign; ctx.textAlign = "left";
    for (let i = 0; i < s.length; i++) { ctx.fillText(s[i], cx, y); cx += ctx.measureText(s[i]).width + track; }
    ctx.textAlign = savedAlign; return cx;
  },

  // A directional ink-wash: an opaque-toward-the-edge → transparent gradient on
  // one side of the screen, replacing the old full-screen dim. `side` is where
  // the text lives (and where the wash is densest).
  chapterWash(ctx, side, washKind, amount) {
    const t = this.t, vw = CONFIG.view.w, vh = CONFIG.view.h, k = Math.max(0, Math.min(amount, 1));
    const dense = washKind === "light" ? t.chapter.washLight : t.chapter.washDark;
    const span = vw * t.chapter.washSpan;
    ctx.save();
    // a whole-screen breath of dim first (only ~26%, biome stays legible)
    ctx.globalAlpha = k * t.chapter.washDim; ctx.fillStyle = washKind === "light" ? "#f8f7f4" : "#06070c";
    ctx.fillRect(0, 0, vw, vh); ctx.globalAlpha = k;
    const g = side === "right"
      ? ctx.createLinearGradient(vw, 0, vw - span, 0)
      : ctx.createLinearGradient(0, 0, span, 0);
    g.addColorStop(0, dense);
    g.addColorStop(1, washKind === "light" ? "rgba(248,247,244,0)" : "rgba(6,7,12,0)");
    ctx.fillStyle = g;
    if (side === "right") ctx.fillRect(vw - span, 0, span, vh); else ctx.fillRect(0, 0, span, vh);
    ctx.restore();
    return washKind === "light" ? "#12131a" : "#f1eff9";   // the ink color that reads on this wash
  },

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

  // centred card title that steps down through the type scale until it fits.
  fitTitle(ctx, str, x, y, maxW, startSize, minSize) {
    let size = startSize || this.t.type.title;
    const floor = minSize || this.t.type.label;
    ctx.font = this.font(size, true);
    while (ctx.measureText(str).width > maxW && size > floor) { size--; ctx.font = this.font(size, true); }
    this.title(ctx, str, x, y, size);
  },

  wrappedText(ctx, str, x, y, maxW, lineH, size, align, alpha) {
    ctx.save();
    ctx.globalAlpha *= alpha == null ? this.t.alpha.full : alpha;
    ctx.fillStyle = this.ink;
    ctx.font = this.font(size || this.t.type.body, false);
    ctx.textAlign = align || "center"; ctx.textBaseline = "alphabetic";
    const words = String(str || "").split(" "), lines = [];
    let line = "";
    for (const word of words) {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; }
      else line = test;
    }
    if (line) lines.push(line);
    for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], x, y + i * lineH);
    ctx.restore();
    return y + Math.max(0, lines.length - 1) * lineH;
  },

  keyBadge(ctx, x, y, size, label, color) {
    ctx.fillStyle = color || this.t.color.accent;
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = this.t.color.paper;
    ctx.font = this.font(this.t.type.label, true);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(label), x + size / 2, y + size / 2 + 1);
    ctx.textBaseline = "alphabetic";
  },

  tierPips(ctx, cx, y, count, next, color) {
    const gap = 26, start = cx - ((count - 1) * gap) / 2;
    for (let i = 0; i < count; i++) {
      ctx.beginPath(); ctx.arc(start + i * gap, y, 6, 0, Math.PI * 2);
      if (i < next - 1) { ctx.fillStyle = color; ctx.fill(); }
      else { ctx.strokeStyle = i === next - 1 ? color : this.t.color.disabled; ctx.lineWidth = i === next - 1 ? 2.5 : 1.5; ctx.stroke(); }
    }
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

  pointIn(b, x, y, pad) {
    const p = pad || 0;
    return x >= b.x - p && x <= b.x + b.w + p && y >= b.y - p && y <= b.y + b.h + p;
  },

  // ---- DENSITY (responsive profile) ----------------------------------------
  // "touch" bumps the type scale + interactive metrics so menus stay readable
  // and tappable on small screens; "desktop" restores the design defaults.
  // Token-driven screens inherit automatically; layouts keep their geometry.
  _baseTokens: null,
  setDensity(mode) {
    if (!this._baseTokens) this._baseTokens = { type: Object.assign({}, this.t.type), metric: Object.assign({}, this.t.metric) };
    const b = this._baseTokens;
    if (mode === "touch") {
      const bump = { micro: 3, caption: 3, label: 3, body: 3, lead: 3, title: 2, h2: 2, h1: 2 };
      for (const k in b.type) this.t.type[k] = b.type[k] + (bump[k] || 0);
      Object.assign(this.t.metric, { btnH: 60, btnW: 320, chipH: 38, chipW: 116,
        settingsRowH: 66, settingsControlW: 272, settingsControlH: 54, settingsStepperW: 60 });
    } else {
      Object.assign(this.t.type, b.type);
      Object.assign(this.t.metric, b.metric);
    }
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
    // controller affordance: L1 ‹ … › R1 flanks the strip while a pad owns the UI
    if (typeof Input !== "undefined" && Input.mode === "gamepad") {
      ctx.globalAlpha = t.alpha.muted; ctx.fillStyle = t.color.accent;
      ctx.font = this.font(t.type.micro, true); ctx.textBaseline = "middle";
      ctx.textAlign = "right"; ctx.fillText("L1 ‹", x0 - 12, y + h / 2);
      ctx.textAlign = "left"; ctx.fillText("› R1", x0 + total + 12, y + h / 2);
      ctx.globalAlpha = 1;
    }
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

  // a BADGE: small filled pill with paper text ("✦ SPECIAL", "FELLED ×214").
  // align "left"|"right"|"center" anchors it; returns the pill width.
  badge(ctx, text, x, y, color, align, size) {
    ctx.font = this.font(size || this.t.type.micro, true);
    const w = ctx.measureText(text).width + 14, h = (size || this.t.type.micro) + 8;
    const bx = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
    ctx.fillStyle = color || this.t.color.accent;
    ctx.fillRect(bx, y - h + 4, w, h);
    ctx.fillStyle = this.t.color.paper;
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillText(text, bx + w / 2, y);
    ctx.textAlign = "left";
    return w;
  },

  // the ROTATE GATE: full-screen block shown on touch devices in portrait —
  // the arena is wide, so gameplay pauses and this asks for landscape. Drawn in
  // its own upscaled space (sr.w/460) because in portrait the logical view is
  // scaled tiny; without the upscale the gate itself would be microscopic.
  rotateGate(ctx, sr, t) {
    ctx.save();
    ctx.fillStyle = "#06070c"; ctx.globalAlpha = 0.97;
    ctx.fillRect(sr.x, sr.y, sr.w, sr.h);
    ctx.globalAlpha = 1;
    const k = sr.w / 460;
    ctx.translate(sr.x + sr.w / 2, sr.y + sr.h / 2);
    ctx.scale(k, k);
    // the phone glyph, easing portrait -> landscape and holding, on a loop
    const ph = (t % 2.6) / 2.6;
    const rot = ph < 0.35 ? 0 : ph < 0.6 ? ((ph - 0.35) / 0.25) * (Math.PI / 2) : Math.PI / 2;
    ctx.save();
    ctx.translate(0, -46); ctx.rotate(-rot);
    ctx.strokeStyle = "#f1eff9"; ctx.lineWidth = 4;
    ctx.strokeRect(-26, -46, 52, 92);
    ctx.fillStyle = this.t.color.accent; ctx.fillRect(-8, 34, 16, 4);   // home bar
    ctx.restore();
    ctx.fillStyle = "#f1eff9"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.font = this.font(26, true);
    ctx.fillText("ROTATE YOUR DEVICE", 0, 46);
    ctx.globalAlpha = 0.65; ctx.font = this.font(13, false);
    ctx.fillText("the blade needs the wide view — TEAR plays in landscape", 0, 72);
    ctx.globalAlpha = 1;
    ctx.restore();
    ctx.textAlign = "left";
  },

  // the player AVATAR: a framed portrait of the fighter — ink silhouette with
  // its blade mid-slash. Procedural; scales with s (box side).
  avatar(ctx, x, y, s) {
    ctx.save();
    ctx.globalAlpha = 0.9; ctx.fillStyle = this.t.color.paper; ctx.fillRect(x, y, s, s);
    ctx.globalAlpha = 1; ctx.strokeStyle = this.ink; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, s, s);
    const px = x + s * 0.34, py = y + s * 0.30, pw = s * 0.26, ph = s * 0.44;
    ctx.fillStyle = this.ink; ctx.fillRect(px, py, pw, ph);                 // the fighter
    ctx.fillStyle = this.t.color.accent; ctx.fillRect(px + pw * 0.55, py + ph * 0.26, pw * 0.24, ph * 0.13);   // the eye
    ctx.strokeStyle = this.ink; ctx.lineWidth = Math.max(2, s * 0.05); ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(px + pw + s * 0.05, py + ph * 0.55);        // the blade, mid-slash
    ctx.lineTo(x + s * 0.88, y + s * 0.14); ctx.stroke();
    ctx.strokeStyle = this.t.color.accent; ctx.lineWidth = 2; ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.moveTo(px + pw + s * 0.02, py + ph * 0.62); ctx.lineTo(x + s * 0.82, y + s * 0.22); ctx.stroke();
    ctx.restore();
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
    ctx.globalAlpha = 0.09; ctx.fillStyle = this.ink; ctx.font = this.font(56, true);
    ctx.fillText(glyph, cx, cy);
    ctx.globalAlpha = 1;
    this.text(ctx, line, cx, cy + 36, this.t.type.body, "center", this.t.alpha.soft);
    return cy + 60;   // y for an optional CTA button under the line
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

  // an interactive card: panel + hover emphasis (inner wash + thicker border).
  // opts: { dashed } = an "unfilled socket" (greyed paper + dashed hairline, for
  // locked content); { edge } = coloured identity border (e.g. rarity);
  // { shimmer } = 0..1 phase for a slow highlight sweep along the top edge.
  card(ctx, x, y, w, h, hovered, opts) {
    if (opts && opts.dashed) {
      ctx.globalAlpha = 0.45; ctx.fillStyle = this.t.color.paper; ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 0.04; ctx.fillStyle = this.ink; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1;
      ctx.setLineDash([5, 4]); ctx.strokeStyle = "rgba(90,92,108,0.5)"; ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, w, h); ctx.setLineDash([]);
    } else {
      this.panel(ctx, x, y, w, h);
      if (opts && opts.edge) { ctx.lineWidth = 2; ctx.strokeStyle = opts.edge; ctx.strokeRect(x, y, w, h); }
    }
    if (opts && opts.shimmer != null) {   // a bright segment sweeping the top edge
      const sw = w * 0.22, sx = x + (w + sw) * opts.shimmer - sw;
      const g = ctx.createLinearGradient(sx, 0, sx + sw, 0);
      g.addColorStop(0, "rgba(255,240,190,0)"); g.addColorStop(0.5, "rgba(255,240,190,0.9)"); g.addColorStop(1, "rgba(255,240,190,0)");
      ctx.save(); ctx.beginPath(); ctx.rect(x, y - 1, w, 4); ctx.clip();
      ctx.fillStyle = g; ctx.fillRect(x, y - 1, w, 4); ctx.restore();
    }
    if (hovered) {
      ctx.globalAlpha = 0.05; ctx.fillStyle = this.ink; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1;
      ctx.lineWidth = 3; ctx.strokeStyle = this.ink; ctx.strokeRect(x, y, w, h);
    }
  },

  // a SEAL: filled diamond badge with a glyph (rarity/category marks). muted =
  // the locked look (outline + grey glyph).
  seal(ctx, cx, cy, r, color, glyph, muted) {
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(Math.PI / 4);
    if (muted) { ctx.strokeStyle = "rgba(140,142,156,0.5)"; ctx.lineWidth = 1.5; ctx.strokeRect(-r, -r, r * 2, r * 2); }
    else { ctx.fillStyle = color; ctx.fillRect(-r, -r, r * 2, r * 2); }
    ctx.restore();
    ctx.fillStyle = muted ? "rgba(140,142,156,0.55)" : this.t.color.paper;
    ctx.font = this.font(Math.round(r * 0.95), true);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(glyph, cx, cy + 1);
    ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
  },

  // a vertical identity bar down a card's left edge (rarity ribbon, mode spine)
  spine(ctx, x, y, h, color, w) {
    ctx.fillStyle = color; ctx.fillRect(x, y, w || 4, h);
  },

  // a rotated ink stamp ("✓ DONE") — the ledger's approval mark
  stamp(ctx, text, x, y, color) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(-0.10);
    ctx.font = this.font(this.t.type.body, true);
    const w = ctx.measureText(text).width + 20;
    ctx.globalAlpha = 0.9; ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.strokeRect(-w / 2, -15, w, 30);
    ctx.fillStyle = color; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, 0, 1);
    ctx.restore();
    ctx.globalAlpha = 1; ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
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

  // Recoverable-health segment for Aldric's rally window. Call after the base
  // health fill so the orange wound sits between current and recoverable HP.
  // `hpFrac` and `rallyFrac` are independently expressed against max health.
  rallyOverlay(ctx, opts) {
    const o = opts || {}, t = this.t, m = t.metric, a = t.alpha;
    const x = Number(o.x) || 0, y = Number(o.y) || 0;
    const w = Math.max(0, Number(o.w) || 0), h = Math.max(0, Number(o.h) || 0);
    const hp = Math.max(0, Math.min(Number(o.hpFrac) || 0, 1));
    const end = Math.max(hp, Math.min(hp + Math.max(0, Number(o.rallyFrac) || 0), 1));
    const segmentW = w * (end - hp);
    if (segmentW <= 0 || h <= 0) return 0;

    const now = Number.isFinite(Number(o.time)) ? Number(o.time) : 0;
    const wave = 0.5 + 0.5 * Math.sin(now * t.motion.rallyPulse);
    const inset = Math.min(m.rallyInset, h / 2);
    ctx.save();
    ctx.globalAlpha = a.rallyBase + a.rallyPulse * wave;
    ctx.fillStyle = o.color || t.color.rally;
    ctx.fillRect(x + w * hp, y + inset, segmentW, h - inset * 2);
    ctx.restore();
    return segmentW;
  },

  // ---- BOSS THEATER -------------------------------------------------------
  // The complete boss health surface: segmented HP, phase thresholds, a quiet
  // moving sheen, the phase-turn crack, and an optional posture/guard meter.
  bossHud(ctx, opts) {
    const o = opts || {}, t = this.t, m = t.metric, a = t.alpha;
    const x = Number(o.x) || 0, y = Number(o.y) || 0;
    const w = Math.max(0, Number(o.w) || 0), h = Math.max(1, Number(o.h) || m.bossHudH);
    const frac = Math.max(0, Math.min(Number(o.frac) || 0, 1));
    const fill = o.fill || t.color.danger, fillW = w * frac;
    const now = Number.isFinite(Number(o.time)) ? Number(o.time) : 0;
    const low = !!o.lowGraphics;

    ctx.save();
    // Track + identity fill.
    ctx.globalAlpha = a.bossTrack; ctx.fillStyle = this.ink; ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = a.full;
    if (!low) { ctx.shadowColor = fill; ctx.shadowBlur = m.bossGlow; }
    ctx.fillStyle = fill; ctx.fillRect(x, y, fillW, h); ctx.shadowBlur = 0;

    // A restrained light sweep keeps the bar alive without competing with combat.
    if (!low && fillW > 0 && m.bossShimmerW > 0) {
      const cycle = t.motion.bossShimmerCycle;
      const phase = cycle > 0 ? ((now % cycle) + cycle) % cycle / cycle : 0;
      const sw = Math.min(m.bossShimmerW, Math.max(fillW, 1));
      const sx = x - sw + (fillW + sw * 2) * phase;
      const sheen = ctx.createLinearGradient(sx, 0, sx + sw, 0);
      sheen.addColorStop(0, "transparent");
      sheen.addColorStop(0.5, t.color.paper);
      sheen.addColorStop(1, "transparent");
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, fillW, h); ctx.clip();
      ctx.globalAlpha = a.ghost; ctx.fillStyle = sheen; ctx.fillRect(sx, y, sw, h);
      ctx.restore();
    }

    // Phase change: a brief white strike through the remaining health edge.
    const flash = Math.max(0, Number(o.phaseFlash) || 0);
    const flashK = Math.min(flash / t.motion.bossPhaseFlash, 1);
    if (flashK > 0) {
      ctx.globalAlpha = flashK * a.bossFlash; ctx.fillStyle = t.color.paper;
      ctx.fillRect(x, y, fillW, h);
      const j = m.bossCrackJut;
      const crackX = Math.max(x + j, Math.min(x + w - j, x + fillW));
      ctx.globalAlpha = flashK; ctx.strokeStyle = t.color.paper; ctx.lineWidth = m.bossBorderW;
      ctx.beginPath();
      ctx.moveTo(crackX - j * 0.20, y - m.bossBorderW);
      ctx.lineTo(crackX + j * 0.35, y + h * 0.34);
      ctx.lineTo(crackX - j * 0.25, y + h * 0.64);
      ctx.lineTo(crackX + j * 0.20, y + h + m.bossBorderW);
      ctx.stroke();
    }

    // Segments and future phase thresholds remain readable over every boss colour.
    ctx.globalAlpha = a.faint; ctx.strokeStyle = this.ink; ctx.lineWidth = 1;
    for (let i = 1; i < m.bossSegments; i++) {
      const sx = x + w * i / m.bossSegments;
      ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(sx, y + h); ctx.stroke();
    }
    const marks = Array.isArray(o.phaseMarks) ? o.phaseMarks : [];
    ctx.globalAlpha = a.bossNotch; ctx.lineWidth = m.bossBorderW;
    for (const mark of marks) {
      const f = Number(mark);
      if (!Number.isFinite(f) || f <= 0 || f >= 1) continue;
      const mx = x + w * f;
      ctx.beginPath(); ctx.moveTo(mx, y + h); ctx.lineTo(mx, y + h + m.bossNotchH); ctx.stroke();
    }
    ctx.globalAlpha = a.full; ctx.strokeStyle = this.ink; ctx.lineWidth = m.bossBorderW;
    ctx.strokeRect(x, y, w, h);

    // Guard may be a plain 0..1 number or {frac,color}; the object form leaves
    // room for a future boss-specific posture colour without another API.
    let guard = null, guardColor = t.color.guard;
    if (typeof o.guard === "number") guard = o.guard;
    else if (o.guard && typeof o.guard === "object") {
      guard = Number(o.guard.frac);
      guardColor = o.guard.color || guardColor;
    }
    let bottom = y + h + m.bossNotchH;
    if (Number.isFinite(guard)) {
      const gf = Math.max(0, Math.min(guard, 1));
      const gw = w * m.bossGuardScale, gx = x + (w - gw) / 2, gy = y + h + m.bossGuardGap;
      ctx.globalAlpha = a.bossGuardTrack; ctx.fillStyle = this.ink; ctx.fillRect(gx, gy, gw, m.bossGuardH);
      ctx.globalAlpha = a.full; ctx.fillStyle = guardColor; ctx.fillRect(gx, gy, gw * gf, m.bossGuardH);
      if (guard >= 1) {
        const pulse = 0.5 + 0.5 * Math.sin(now * t.motion.bossGuardPulse);
        ctx.globalAlpha = a.faint + a.faint * pulse;
        ctx.fillRect(gx, gy, gw, m.bossGuardH);
      }
      ctx.globalAlpha = a.faint; ctx.strokeStyle = this.ink; ctx.lineWidth = 1;
      ctx.strokeRect(gx, gy, gw, m.bossGuardH);
      bottom = gy + m.bossGuardH;
    }
    ctx.restore();
    return bottom;
  },

  // Arrival ceremony: overscan-safe letterbox, radial vignette, name, identity
  // stroke, and lore epithet. `t` is elapsed real time, not simulation time.
  bossIntro(ctx, opts) {
    const o = opts || {}, t = this.t, m = t.metric, a = t.alpha, motion = t.motion;
    const fallbackW = (typeof CONFIG !== "undefined" && CONFIG.view) ? CONFIG.view.w : 1600;
    const fallbackH = (typeof CONFIG !== "undefined" && CONFIG.view) ? CONFIG.view.h : 900;
    const sr = o.screen || { x: 0, y: 0, w: fallbackW, h: fallbackH };
    const vw = fallbackW, vh = fallbackH, cx = vw / 2;
    const elapsed = Math.max(0, Number(o.t) || 0), dur = Math.max(Number(o.dur) || 1.4, 0.001);
    const clamp01 = (n) => Math.max(0, Math.min(n, 1));
    const easeOut = (n) => { const k = clamp01(n); return 1 - (1 - k) * (1 - k); };
    const k = clamp01(elapsed / dur);
    const aIn = easeOut(elapsed / motion.bossIntroIn);
    const aOut = 1 - easeOut((k - motion.bossIntroOutAt) / motion.bossIntroOutSpan);
    const alpha = aIn * aOut;
    const barH = m.bossIntroBarH * aIn;
    const color = o.color || t.color.danger;

    ctx.save();
    // Vignette first, bars second: the bars retain a clean cinematic black.
    const inner = Math.min(vw, vh) * m.bossVignetteInner;
    const outer = Math.max(vw, vh) * m.bossVignetteOuter;
    const vignette = ctx.createRadialGradient(cx, vh * m.bossVignetteFocusY, inner,
      cx, vh * m.bossVignetteFocusY, outer);
    vignette.addColorStop(0, "transparent"); vignette.addColorStop(1, t.color.cinema);
    ctx.globalAlpha = a.cinemaVignette * alpha; ctx.fillStyle = vignette;
    ctx.fillRect(sr.x, sr.y, sr.w, sr.h);

    ctx.globalAlpha = a.cinemaBar * aOut; ctx.fillStyle = t.color.cinema;
    ctx.fillRect(sr.x, sr.y, sr.w, Math.max(0, barH - sr.y));
    const bottomY = vh - barH, screenBottom = sr.y + sr.h;
    ctx.fillRect(sr.x, bottomY, sr.w, Math.max(0, screenBottom - bottomY));

    // Card typography is intentionally fixed light-on-cinema, independent of biome ink.
    ctx.globalAlpha = alpha; ctx.fillStyle = t.color.cinemaInk;
    ctx.font = this.font(t.type.display, true); ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillText(o.bossName || "BOSS", cx, vh - m.bossIntroTitleBottom);
    const accentK = easeOut((elapsed - motion.bossIntroAccentDelay) / motion.bossIntroAccentGrow);
    const accentW = m.bossIntroAccentHalfW * accentK;
    ctx.fillStyle = color;
    ctx.fillRect(cx - accentW, vh - m.bossIntroAccentBottom, accentW * 2, m.bossIntroAccentH);
    if (o.epithet) {
      ctx.globalAlpha = alpha * a.cinemaSubtitle; ctx.fillStyle = t.color.cinemaMuted;
      ctx.font = this.font(t.type.body, true);
      ctx.fillText(o.epithet, cx, vh - m.bossIntroEpithetBottom);
    }
    ctx.restore();
    return alpha;
  },

  // Screen-space phase title. The caller owns its clock and supplies a 0..1 alpha;
  // this component owns every visual detail so phase beats stay consistent.
  bossPhaseBanner(ctx, opts) {
    const o = opts || {}, text = o.text || "";
    if (!text) return;
    const t = this.t, m = t.metric;
    const a = o.alpha == null ? 1 : Math.max(0, Math.min(Number(o.alpha) || 0, 1));
    const vw = (typeof CONFIG !== "undefined" && CONFIG.view) ? CONFIG.view.w : 1600;
    const vh = (typeof CONFIG !== "undefined" && CONFIG.view) ? CONFIG.view.h : 900;
    const w = Math.min(m.bossPhaseBannerW, vw - t.space.xl * 2);
    const h = m.bossPhaseBannerH, x = (vw - w) / 2, y = vh * m.bossPhaseBannerY - h / 2;
    const color = o.color || t.color.danger;

    ctx.save();
    ctx.globalAlpha = a * t.alpha.bossPhasePanel; ctx.fillStyle = t.color.cinema;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = a; ctx.fillStyle = color;
    ctx.fillRect(x, y, w, m.bossPhaseAccentH);
    ctx.fillRect(x, y + h - m.bossPhaseAccentH, w, m.bossPhaseAccentH);
    ctx.fillStyle = t.color.cinemaInk; ctx.font = this.font(t.type.h2, true);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, vw / 2, y + h / 2);
    ctx.restore();
  },

  // Shared cinematic chrome. Game code supplies only state; the design system
  // owns bars, vignette, accent seam and every screen-space measurement.
  cinematicFrame(ctx, opts) {
    const o = opts || {}, t = this.t, m = t.metric, a = t.alpha;
    const fallbackW = (typeof CONFIG !== "undefined" && CONFIG.view) ? CONFIG.view.w : 1600;
    const fallbackH = (typeof CONFIG !== "undefined" && CONFIG.view) ? CONFIG.view.h : 900;
    const sr = o.screen || { x: 0, y: 0, w: fallbackW, h: fallbackH };
    const k = Math.max(0, Math.min(Number(o.amount) || 0, 1));
    const reduced = !!o.reducedMotion, barH = m.cinemaBarH * (reduced ? 1 : (1 - (1 - k) * (1 - k)));
    const color = o.color || t.color.accent;
    ctx.save();
    const vg = ctx.createRadialGradient(fallbackW / 2, fallbackH * 0.48, fallbackH * 0.20,
      fallbackW / 2, fallbackH * 0.48, fallbackW * 0.68);
    vg.addColorStop(0, "transparent"); vg.addColorStop(1, t.color.cinema);
    ctx.globalAlpha = a.cinemaVignette * k; ctx.fillStyle = vg; ctx.fillRect(sr.x, sr.y, sr.w, sr.h);
    ctx.globalAlpha = a.cinemaBar * k; ctx.fillStyle = t.color.cinema;
    ctx.fillRect(sr.x, sr.y, sr.w, Math.max(0, barH - sr.y));
    ctx.fillRect(sr.x, fallbackH - barH, sr.w, Math.max(0, sr.y + sr.h - (fallbackH - barH)));
    ctx.globalAlpha = k * a.soft; ctx.fillStyle = color;
    ctx.fillRect(sr.x, barH - m.bossPhaseAccentH, sr.w, m.bossPhaseAccentH);
    ctx.restore();
  },

  // Dialogue card for authored boss speech. Lines are intentionally concise;
  // wrapping lives here so no cinematic caller reaches into the canvas API.
  dialogueCard(ctx, opts) {
    const o = opts || {}, t = this.t, m = t.metric, a = t.alpha;
    const vw = (typeof CONFIG !== "undefined" && CONFIG.view) ? CONFIG.view.w : 1600;
    const vh = (typeof CONFIG !== "undefined" && CONFIG.view) ? CONFIG.view.h : 900;
    const k0 = Math.max(0, Math.min(Number(o.amount) || 0, 1));
    const k = 1 - (1 - k0) * (1 - k0), w = Math.min(m.cinemaDialogueW, vw - t.space.xl * 2);
    const h = m.cinemaDialogueH, x = (vw - w) / 2, y = vh - m.cinemaDialogueBottom - h + (1 - k) * t.space.lg;
    const color = o.color || t.color.accent, savedInk = this.ink;
    ctx.save(); ctx.globalAlpha = k * a.cinemaPanel; ctx.fillStyle = t.color.cinema; ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = k; ctx.fillStyle = color; ctx.fillRect(x, y, m.bossPhaseAccentH, h);
    this.ink = t.color.cinemaInk;
    this.tag(ctx, o.speaker || "", x + m.cinemaDialoguePad, y + t.space.lg, color, "left", t.type.caption);
    const allWords = String(o.line || "").split(/\s+/), reveal = o.reveal == null ? 1 : Math.max(0, Math.min(Number(o.reveal) || 0, 1));
    const words = allWords.slice(0, Math.max(1, Math.ceil(allWords.length * reveal))), maxW = w - m.cinemaDialoguePad * 2;
    ctx.font = this.font(t.type.lead, true); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    let line = "", yy = y + t.space.lg + t.type.lead + t.space.sm;
    for (const word of words) {
      const next = line ? line + " " + word : word;
      if (line && ctx.measureText(next).width > maxW) { ctx.fillText(line, x + m.cinemaDialoguePad, yy); line = word; yy += t.type.lead + t.space.xs; }
      else line = next;
    }
    if (line) ctx.fillText(line, x + m.cinemaDialoguePad, yy);
    // No countdown bar (it made every line read as disappearing). Instead: a small
    // continue chevron once the line is readable, a hold ring while a skip charges,
    // and an AUTO glyph only as a timed boss beat approaches its fallback.
    const cx = x + w - m.cinemaDialoguePad, cy = y + h - t.space.md;
    const hold = Math.max(0, Math.min(Number(o.holdRing) || 0, 1));
    if (hold > 0.01) {
      ctx.globalAlpha = k; ctx.strokeStyle = color; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(cx - 6, cy - 4, 9, -Math.PI / 2, -Math.PI / 2 + hold * Math.PI * 2); ctx.stroke();
    } else if (o.canAdvance) {
      const pulse = 0.55 + 0.45 * Math.sin((typeof CLOCK !== "undefined" ? CLOCK.sim : 0) * 6);
      ctx.globalAlpha = k * pulse; ctx.fillStyle = color; ctx.textAlign = "right"; ctx.textBaseline = "middle";
      ctx.font = this.font(t.type.body, true); ctx.fillText("›", cx, cy - 4);
    }
    if (o.auto) { ctx.globalAlpha = k * a.soft; this.tag(ctx, "AUTO", x + m.cinemaDialoguePad, y + h - t.space.sm, color, "left", t.type.micro); }
    if (o.hint) this.text(ctx, o.hint, x + w, y - t.space.sm, t.type.micro, "right", k * a.cinemaHint);
    this.ink = savedInk; ctx.restore();
  },

  // Boss transformation declaration (Pantheon VI P4): a spoken line anchored to a
  // corner of the frame instead of the universal bottom card, so each ritual's
  // world choreography owns the center. No full opaque panel — a soft local scrim
  // holds contrast. Same reading affordances (chevron / hold ring / AUTO) as the
  // dialogue card. `anchor`: lower-left | lower-right | upper-left | depth-center.
  bossDeclaration(ctx, o) {
    o = o || {}; const t = this.t, vw = CONFIG.view.w, vh = CONFIG.view.h;
    const k = clamp(Number(o.amount) == null ? 1 : o.amount, 0, 1), color = o.color || t.color.accent;
    const scale = clamp(vh / 900, 0.8, 1.4), SM = Math.max(t.chapter.safeMargin, vw * t.chapter.safeVW);
    const anchor = vw < 720 ? "lower-center" : (o.anchor || "lower-left");   // narrow screens fall back to a lower third
    const blockW = Math.min((o.maxWidth || 620) * scale, vw - SM * 2);
    const speakerSize = Math.round(13 * scale), lineSize = Math.round(30 * scale), lineH = lineSize * 1.14;
    ctx.save(); ctx.font = this.displayFont(lineSize); ctx.textBaseline = "alphabetic";
    const allWords = String(o.line || "").split(/\s+/).filter(Boolean);
    const reveal = o.reveal == null ? 1 : clamp(o.reveal, 0, 1);
    const words = allWords.slice(0, Math.max(1, Math.ceil(allWords.length * reveal)));
    const lines = []; let line = "";
    for (const wd of words) { const next = line ? line + " " + wd : wd; if (line && ctx.measureText(next).width > blockW) { lines.push(line); line = wd; } else line = next; }
    if (line) lines.push(line);
    const blockH = speakerSize + t.space.md + lines.length * lineH;
    let x, y, align;
    if (anchor === "lower-right") { x = vw - SM - blockW; align = "right"; y = vh - SM - blockH; }
    else if (anchor === "upper-left") { x = SM; align = "left"; y = SM * 1.4; }
    else if (anchor === "depth-center") { x = (vw - blockW) / 2; align = "left"; y = vh * 0.28; }
    else if (anchor === "lower-center") { x = (vw - blockW) / 2; align = "left"; y = vh - SM - blockH - vh * 0.06; }
    else { x = SM; align = "left"; y = vh - SM - blockH; }   // lower-left (default)
    const anchorX = align === "right" ? x + blockW : x;
    ctx.globalAlpha = k;
    const g = ctx.createLinearGradient(0, y - t.space.lg, 0, y + blockH + t.space.lg);
    g.addColorStop(0, "rgba(6,7,12,0)"); g.addColorStop(0.5, "rgba(6,7,12,0.52)"); g.addColorStop(1, "rgba(6,7,12,0)");
    ctx.fillStyle = g; ctx.fillRect(x - t.space.md, y - t.space.lg, blockW + t.space.lg, blockH + t.space.xl);
    ctx.fillStyle = color; ctx.fillRect(align === "right" ? anchorX - Math.min(blockW, 46 * scale) : anchorX, y - 3 * scale, Math.min(blockW, 46 * scale), 2 * scale);
    ctx.fillStyle = color; ctx.font = this.bodyFont(speakerSize, t.font.bodyMediumWeight);
    this.trackedText(ctx, o.speaker || "", anchorX, y + speakerSize, t.track.label, align);
    ctx.fillStyle = "#f1eff9"; ctx.font = this.displayFont(lineSize); ctx.textAlign = align;
    let yy = y + speakerSize + t.space.md + lineSize;
    for (const ln of lines) { ctx.fillText(ln, anchorX, yy); yy += lineH; }
    const cx = align === "right" ? anchorX - 10 : anchorX + 10, cy = yy - lineH + t.space.sm;
    const hold = clamp(Number(o.holdRing) || 0, 0, 1);
    if (hold > 0.01) { ctx.globalAlpha = k; ctx.strokeStyle = color; ctx.lineWidth = 2.5 * scale;
      ctx.beginPath(); ctx.arc(cx, cy, 9 * scale, -Math.PI / 2, -Math.PI / 2 + hold * Math.PI * 2); ctx.stroke(); }
    else if (o.canAdvance) { const pulse = 0.55 + 0.45 * Math.sin((typeof CLOCK !== "undefined" ? CLOCK.sim : 0) * 6);
      ctx.globalAlpha = k * pulse; ctx.fillStyle = color; ctx.textAlign = align; ctx.font = this.displayFont(Math.round(22 * scale));
      ctx.fillText("›", anchorX, yy + t.space.xs); }
    if (o.auto) { ctx.globalAlpha = k * t.alpha.soft; this.tag(ctx, "AUTO", anchorX, y - t.space.sm, color, align, t.type.micro); }
    ctx.restore();
  },

  // ---- LIVING BIOME CHAPTER (Pantheon VI) ---------------------------------
  // The world writes the chapter. No modal: a directional ink-wash on one side
  // makes negative space for a tracked label, a condensed display title, and a
  // readable mono lore column. Every component shares this one layout so the
  // header, lore, progress and prompt stay aligned, and the biome reveal is the
  // same composition breathing open.
  _chapterLayout(o) {
    const t = this.t, vw = CONFIG.view.w, vh = CONFIG.view.h;
    const scale = clamp(vh / 900, 0.78, 1.4);
    const SM = Math.max(t.chapter.safeMargin, vw * t.chapter.safeVW);
    const colW = Math.min(t.chapter.bodyColW * scale, vw - SM * 2);
    const side = o && o.composition === "right" ? "right" : "left";
    const x = side === "right" ? vw - SM - colW : SM;         // left edge of the text column
    const anchorX = side === "right" ? x + colW : x;          // the text's alignment edge
    return { scale, SM, colW, side, x, anchorX, vw, vh,
      align: side === "right" ? "right" : "left",
      labelSize: Math.round(15 * scale), titleSize: Math.round(60 * scale), loreSize: Math.round(19 * scale),
      topY: vh * 0.30, loreY: vh * 0.52 };
  },

  _bladeMark(ctx, x, y, scale, color, dir) {
    ctx.save(); ctx.globalAlpha = 1; ctx.strokeStyle = color; ctx.lineWidth = 2 * scale; ctx.lineCap = "round";
    const len = 30 * scale;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dir * len, y - len * 0.36); ctx.stroke();       // the blade
    ctx.beginPath(); ctx.moveTo(x + dir * 7 * scale, y - 4 * scale); ctx.lineTo(x + dir * 7 * scale, y + 6 * scale); ctx.stroke(); // guard
    ctx.restore();
  },

  // chapter label + condensed display title over the ink-wash. `morphTo`/`morphK`
  // crossfade the title into the biome name in place (used by biomeReveal).
  chapterHeader(ctx, o) {
    o = o || {}; const t = this.t, L = this._chapterLayout(o);
    const k = clamp(Number(o.amount) == null ? 1 : o.amount, 0, 1), color = o.color || t.color.accent;
    const ink = this.chapterWash(ctx, L.side, o.wash || "dark", k);
    ctx.save(); ctx.globalAlpha = k; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = color; ctx.font = this.bodyFont(L.labelSize, t.font.bodyMediumWeight);
    this.trackedText(ctx, o.label || "", L.anchorX, L.topY, t.track.label, L.align);
    const titleY = L.topY + t.chapter.titleGap + L.titleSize * 0.5;
    ctx.font = this.displayFont(L.titleSize); ctx.textAlign = L.align;
    const mk = clamp(Number(o.morphK) || 0, 0, 1);
    if (o.morphTo && mk > 0) {
      ctx.globalAlpha = k * (1 - mk); ctx.fillStyle = ink; ctx.fillText(o.title || "", L.anchorX, titleY);
      ctx.globalAlpha = k * mk; ctx.fillText(o.morphTo, L.anchorX, titleY); ctx.globalAlpha = k;
    } else { ctx.fillStyle = ink; ctx.fillText(o.title || "", L.anchorX, titleY); }
    const ruleW = (o.ruleW == null ? Math.min(L.colW * 0.42, 240 * L.scale) : o.ruleW);
    ctx.fillStyle = color; ctx.fillRect(L.side === "right" ? L.anchorX - ruleW : L.anchorX, titleY + t.space.sm, ruleW, 2 * L.scale);
    ctx.restore();
  },

  // one lore fragment as a mono column with phrase/line reveal (never per-char).
  loreFragment(ctx, o) {
    o = o || {}; const t = this.t, L = this._chapterLayout(o);
    const k = clamp(Number(o.amount) == null ? 1 : o.amount, 0, 1), reveal = clamp(Number(o.reveal) || 0, 0, 1);
    const ink = (o.wash === "light") ? "#12131a" : "#f1eff9";
    ctx.save(); ctx.globalAlpha = k; ctx.fillStyle = ink;
    ctx.font = this.bodyFont(L.loreSize); ctx.textAlign = L.align; ctx.textBaseline = "alphabetic";
    const words = String(o.text || "").split(/\s+/).filter(Boolean);
    const shown = words.slice(0, Math.ceil(words.length * reveal));
    const lineH = L.loreSize * t.lineH.body; let line = "", yy = L.loreY;
    const advance = (s) => ctx.measureText(s).width + t.track.body * s.length;
    for (const w of shown) {
      const next = line ? line + " " + w : w;
      if (line && advance(next) > L.colW) { this.trackedText(ctx, line, L.anchorX, yy, t.track.body, L.align); yy += lineH; line = w; }
      else line = next;
    }
    if (line) this.trackedText(ctx, line, L.anchorX, yy, t.track.body, L.align);
    ctx.restore();
  },

  // small fracture ticks: a discreet "which page" marker, never an animated bar.
  chapterProgress(ctx, o) {
    o = o || {}; const t = this.t, L = this._chapterLayout(o);
    const k = clamp(Number(o.amount) == null ? 1 : o.amount, 0, 1), color = o.color || t.color.accent;
    const count = Math.max(1, o.count || 1), idx = clamp(o.index || 0, 0, count - 1);
    const y = L.loreY - t.chapter.progressGap * L.scale, gap = 14 * L.scale, tickH = 2 * L.scale;
    ctx.save(); ctx.textBaseline = "alphabetic";
    for (let i = 0; i < count; i++) {
      const w = (i === idx ? 16 : 7) * L.scale;
      const cx = L.side === "right" ? L.anchorX - (count - 1 - i) * gap - w : L.anchorX + i * gap;
      ctx.globalAlpha = k * (i === idx ? 1 : t.alpha.faint); ctx.fillStyle = color;
      ctx.fillRect(cx, y, w, tickH);
    }
    ctx.restore();
  },

  chapterPrompt(ctx, o) {
    o = o || {}; if (!o.text) return; const t = this.t, L = this._chapterLayout(o);
    const k = clamp(Number(o.amount) == null ? 1 : o.amount, 0, 1), color = o.color || t.color.accent;
    ctx.save(); ctx.globalAlpha = k * t.alpha.cinemaHint; ctx.fillStyle = color;
    ctx.font = this.bodyFont(Math.round(12 * L.scale), t.font.bodyMediumWeight); ctx.textBaseline = "alphabetic";
    const y = L.vh - Math.max(t.chapter.safeMargin, L.vh * 0.06);
    this.trackedText(ctx, o.text, L.anchorX, y, t.track.body, L.align);
    ctx.restore();
  },

  // The biome reveal is the same composition breathing open: the wash retreats as
  // the world reaches full color, the title morphs to the biome name, the rule
  // contracts into the name underline, and READY is a small blade mark.
  biomeReveal(ctx, o) {
    o = o || {}; const t = this.t, L = this._chapterLayout(o);
    const k = clamp(Number(o.amount) || 0, 0, 1), color = o.color || t.color.accent;
    const washK = (1 - k) * 0.9 + (o.ready ? 0 : 0.06);      // wash fades out as color returns
    const ink = this.chapterWash(ctx, L.side, o.wash || "dark", washK);
    ctx.save(); ctx.textBaseline = "alphabetic";
    ctx.globalAlpha = 1; ctx.fillStyle = color; ctx.font = this.bodyFont(L.labelSize, t.font.bodyMediumWeight);
    this.trackedText(ctx, "CHAPTER " + (o.number || ""), L.anchorX, L.topY, t.track.label, L.align);
    const titleY = L.topY + t.chapter.titleGap + L.titleSize * 0.5;
    ctx.fillStyle = ink; ctx.font = this.displayFont(L.titleSize); ctx.textAlign = L.align;
    ctx.fillText(o.name || "", L.anchorX, titleY);
    const ruleW = Math.min(L.colW * 0.42, 240 * L.scale) * (1 - 0.42 * k);
    ctx.fillStyle = color; ctx.fillRect(L.side === "right" ? L.anchorX - ruleW : L.anchorX, titleY + t.space.sm, ruleW, 2 * L.scale);
    if (o.line) { ctx.globalAlpha = 0.82 * (1 - k * 0.4); ctx.fillStyle = ink; ctx.font = this.bodyFont(Math.round(15 * L.scale));
      this.trackedText(ctx, o.line, L.anchorX, titleY + t.chapter.loreGap, t.track.body, L.align); ctx.globalAlpha = 1; }
    if (o.ready) this._bladeMark(ctx, L.anchorX, titleY + t.chapter.loreGap * 1.9, L.scale, color, L.side === "right" ? -1 : 1);
    ctx.restore();
  },

  cinematicPrompt(ctx, opts) {
    const o = opts || {}, t = this.t, k = o.amount == null ? 1 : o.amount;
    if (!o.text) return;
    ctx.save(); ctx.fillStyle = o.color || t.color.cinemaMuted; ctx.globalAlpha = k * t.alpha.cinemaHint;
    ctx.font = this.font(t.type.micro, true); ctx.textBaseline = "middle"; ctx.textAlign = o.align || "center";
    const x = o.x == null ? CONFIG.view.w / 2 : o.x, y = o.y == null ? CONFIG.view.h - t.metric.cinematicPromptBottom : o.y;
    ctx.fillText(o.text, x, y); ctx.restore();
  },

  // The reward is deliberately its own celebration, after the world and lore
  // have resolved. Callers provide copy and values; this component owns all
  // screen-space geometry, type, color and hierarchy.
  finalReward(ctx, opts) {
    const o = opts || {}, t = this.t, m = t.metric, a = t.alpha, vw = CONFIG.view.w, vh = CONFIG.view.h;
    const k0 = Math.max(0, Math.min(Number(o.amount) || 0, 1)), k = 1 - (1 - k0) * (1 - k0);
    const w = Math.min(m.finalRewardW, vw - t.space.xl * 2), h = Math.min(m.finalRewardH, vh - t.space.xl * 2);
    const x = (vw - w) / 2, y = (vh - h) / 2 + (1 - k) * t.space.lg, color = o.color || t.color.accent;
    const savedInk = this.ink; ctx.save();
    ctx.globalAlpha = k * a.finalRewardDim; ctx.fillStyle = t.color.cinema; ctx.fillRect(0, 0, vw, vh);
    ctx.globalAlpha = k * a.finalRewardPanel; ctx.fillStyle = t.color.cinema; ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = k; ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
    this.ink = t.color.cinemaInk;
    ctx.globalAlpha = k * a.finalRewardGhost; ctx.strokeStyle = color; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.arc(vw / 2, y + 94, m.finalRewardSigilR, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = k; this.title(ctx, o.sigil || "◇", vw / 2, y + 108, t.type.display);
    this.tag(ctx, o.label || "ADVENTURE COMPLETE", vw / 2, y + 160, color, "center", t.type.caption);
    this.title(ctx, o.title || "THE WORLD REMEMBERS", vw / 2, y + 210, t.type.h2);
    ctx.fillStyle = color; ctx.fillRect(vw / 2 - m.finalRewardRuleW / 2, y + 230, m.finalRewardRuleW, 3);
    this.text(ctx, o.reward || "RESTORED BLADE TRAIL", vw / 2, y + 278, t.type.lead, "center", k * a.soft);
    if (o.detail) this.text(ctx, o.detail, vw / 2, y + 312, t.type.caption, "center", k * a.cinemaHint);
    this.cinematicPrompt(ctx, { text: o.hint, x: vw / 2, y: y + h - m.finalRewardPromptBottom,
      align: "center", amount: k, color });
    this.ink = savedInk; ctx.restore();
  },

  finaleFracture(ctx, opts) {
    const o = opts || {}, t = this.t, m = t.metric, vw = CONFIG.view.w;
    const k = Math.max(0, Math.min(Number(o.amount) || 0, 1)), w = Math.min(m.finalFractureW, vw - t.space.xl * 2);
    const x = (vw - w) / 2, y = t.space.lg + 18, color = o.color || t.color.accent;
    ctx.save(); ctx.globalAlpha = (1 - k) * t.alpha.soft; ctx.fillStyle = t.color.cinemaMuted; ctx.fillRect(x, y, w, m.finalFractureH);
    ctx.globalAlpha = 0.9 * (1 - k * 0.7); ctx.fillStyle = color;
    for (let i = 0; i < 9; i++) {
      const sw = w / 9 - t.space.xs, dx = (i - 4) * k * t.space.lg, dy = (i % 2 ? -1 : 1) * k * t.space.md;
      ctx.save(); ctx.translate(dx, dy); ctx.rotate((i - 4) * k * 0.018); ctx.fillRect(x + i * w / 9, y, sw, m.finalFractureH); ctx.restore();
    }
    ctx.restore();
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
