import type { CardView, CodexScreenView, ScreenRenderContext, ShopScreenView } from "./contracts";
import {
  codexShopMetrics,
  DESKTOP,
  type AbilityCard,
  type BestiaryEntry,
  type Guide,
  type GuidePlan,
  type Measure,
  type Metrics,
  type ShopItem,
} from "./codex-shop-metrics";
import { createPageFrame, type PageFrame, type ScrollBlock, type ScrollView } from "./page-frame";
import { createShardShelves } from "./shard-shelves";

const GOLD = "#e0a326",
  SPECIAL_GOLD = "#e8a32e";

/**
 * Blocks side by side in columns: each column stacks its blocks `gap` apart from `inset` below the
 * top. One column stays a list of its own blocks, so a scrolling body can rest on each row's edge;
 * several columns become one block.
 */
function columns(stacks: readonly (readonly ScrollBlock[])[], gap: number, inset: number): readonly ScrollBlock[] {
  const [only, ...others] = stacks;
  if (only && others.length === 0) {
    const [first, ...rest] = only;
    if (!first) return [];
    const lead: ScrollBlock = {
      height: inset + first.height,
      draw: (y, view) => {
        first.draw(y + inset, view);
      },
    };
    return [lead, ...rest];
  }
  const height = (blocks: readonly ScrollBlock[]): number =>
    blocks.reduce((sum, block) => sum + block.height, 0) + Math.max(0, blocks.length - 1) * gap;
  const draw = (y: number, view: ScrollView): void => {
    for (const blocks of stacks) {
      let cursor = y + inset;
      for (const block of blocks) {
        block.draw(cursor, view);
        cursor += block.height + gap;
      }
    }
  };
  return [{ height: inset + Math.max(0, ...stacks.map(height)), draw }];
}

/**
 * THE SHOP and THE CODEX (abilities, bestiary, guide): one definition of each screen that lays
 * out at both densities through the page frame. Desktop draws the design pages (two shop columns,
 * card grids that move by whole rows, a fixed two-column guide); the phone flows one column of
 * shop rows, two of ability cards, one of bestiary entries and a measured guide.
 */
export function createCodexShopRenderers(context: ScreenRenderContext) {
  const { ui } = context,
    pf = createPageFrame(context),
    shardShelves = createShardShelves(context, pf);
  const measure: Measure = { textWidth: pf.textWidth, lineCount: pf.lineCount, lineHeight: pf.lineHeight };
  const metrics = (frame: PageFrame): Metrics => codexShopMetrics(ui.t, frame, measure, context.width);

  function shop(view: ShopScreenView): void {
    const t = ui.t,
      goldInk = ui.readable(GOLD),
      shards = view.tab === "shards" ? view.shards : undefined;
    // Tabs take the subtitle's place, as on the other tabbed pages; the status line under them says the rest.
    const frame = pf.open({
      title: "SHOP",
      hue: GOLD,
      stat: shards
        ? {
            value: shards.balance.toLocaleString("en-US"),
            label: "SHARDS",
            color: ui.readable(t.color.accent),
            glyph: "⬡",
          }
        : { value: view.coins.toLocaleString("en-US"), label: "COINS", color: goldInk, glyph: "◆" },
      tabs: view.tabs,
      tabAction: (id) => ({ type: "shop.selectTab", id }),
      desktop: {},
    });
    const m = metrics(frame);
    // One status line under the tabs: on UPGRADES the first-run hint replaces the ledger totals.
    const emphasis = shards === undefined && view.onboarding !== undefined;
    const status = pf.prose(
      frame,
      shards
        ? `⬡ ${shards.earned.toLocaleString("en-US")} SHARDS EARNED   ·   LOOKS ONLY — THEY NEVER CHANGE HOW A RUN PLAYS`
        : (view.onboarding ??
            `${String(view.ownedLevels)} / ${String(view.totalLevels)} LEVELS OWNED   ·   LIFETIME EARNED ◆ ${view.lifetimeEarned.toLocaleString("en-US")}`),
      {
        ...(emphasis
          ? { size: t.type.caption, alpha: t.alpha.soft }
          : { size: t.type.micro, alpha: t.alpha.muted, tag: t.color.muted }),
        maxLines: 2,
        align: m.align,
        baseline: DESKTOP.shop.statusBaseline,
        height: DESKTOP.shop.listTop - DESKTOP.shop.statusTop,
      },
    );
    const state = pf.body(frame, {
      head: [status],
      list: shards ? shardShelves.shelves(frame, shards) : upgradeColumns(frame, m, view, goldInk),
      gap: m.gap,
      desktop: {
        top: DESKTOP.shop.statusTop,
        cull: { above: Number.POSITIVE_INFINITY, below: 0 },
        canScrollUp: view.canScrollUp,
        canScrollDown: view.canScrollDown,
      },
    });
    pf.close(frame, state);
  }

  /** The UPGRADES tab: the upgrade sections in the metrics' columns, each a gold rule and its rows. */
  function upgradeColumns(frame: PageFrame, m: Metrics, view: ShopScreenView, goldInk: string): readonly ScrollBlock[] {
    const s = m.shop,
      perColumn = Math.ceil(view.sections.length / s.columns);
    const stacks = Array.from({ length: s.columns }, (_, column) => {
      const x = frame.left + column * s.step;
      return view.sections.slice(column * perColumn, (column + 1) * perColumn).flatMap((section, index) => {
        const lead = index > 0 ? s.section.lead : 0,
          label = `${section.label}  ·  ${String(section.items.length)}`;
        const rule: ScrollBlock = {
          height: lead + s.section.height,
          draw: (y) => {
            ui.sectionLabel(context.canvas, label, x, y + lead + s.section.baseline, s.width, GOLD);
          },
        };
        return [rule, ...section.items.map((item) => shopRow(frame, m, item, x, goldInk))];
      });
    });
    return columns(stacks, m.gap, s.inset);
  }

  /** One upgrade: icon tile, name and level, pips, up to two lines of effect copy, and BUY. */
  function shopRow(frame: PageFrame, m: Metrics, item: ShopItem, x: number, goldInk: string): ScrollBlock {
    const width = m.shop.width,
      p = m.shop.row(item, width),
      t = ui.t;
    const level = item.level ?? 0,
      maximum = item.maxLevel ?? 0,
      maxed = maximum > 0 && level >= maximum;
    const draw = (y: number, view: ScrollView): void => {
      const { canvas } = context;
      ui.card(canvas, x, y, width, p.card, false);
      canvas.globalAlpha = level > 0 ? 0.16 : 0.055;
      canvas.fillStyle = level > 0 ? GOLD : ui.ink;
      canvas.fillRect(x + p.tile.x, y + p.tile.y, p.tile.size, p.tile.size);
      canvas.globalAlpha = 1;
      if (item.flash && item.flash > 0) {
        canvas.globalAlpha = item.flash * 0.3;
        canvas.fillStyle = GOLD;
        canvas.fillRect(x, y, width, p.card);
        canvas.globalAlpha = 1;
      }
      const ink = level > 0 ? goldInk : t.color.muted;
      ui.tag(canvas, item.glyph ?? "◆", x + p.glyph.x, y + p.glyph.y, ink, "center", p.glyph.size);
      const name = ui.fitText(canvas, item.label, p.name.width, { size: t.type.body, floor: p.name.floor, bold: true });
      const label = name.lines[0] ?? item.label,
        nameX = x + p.name.x,
        nameY = y + p.name.y;
      ui.displayText(canvas, label, nameX, nameY, name.size);
      if (maximum > 0) {
        const levelX = nameX + pf.textWidth(label, name.size, true) + p.name.levelGap;
        ui.tag(canvas, `LV ${String(level)}/${String(maximum)}`, levelX, nameY, ink, "left", t.type.micro);
        ui.pips(canvas, x + p.pips.x, y + p.pips.y, maximum, level, GOLD);
      }
      if (item.description)
        ui.textBox(canvas, item.description, nameX, y + p.copy.y, p.copy.width, {
          size: t.type.micro,
          lineHeight: p.copy.lineHeight,
          alpha: t.alpha.soft,
          maxLines: 2,
        });
      const buyY = y + p.buy.y,
        keep = m.shop.keepFrom,
        canBuy = !maxed && item.enabled !== false;
      const visible = keep === undefined || (buyY >= keep && buyY + p.buy.h <= frame.bottom);
      const control = {
        x: x + p.buy.x,
        y: buyY,
        w: p.buy.w,
        h: p.buy.h,
        label: maxed ? "MAX" : (item.cost ?? "BUY"),
        selected: maxed,
        enabled: visible && canBuy,
        accent: canBuy ? GOLD : undefined,
        action: { type: "shop.buy", id: item.id } as const,
        size: t.type.caption,
        ...(keep === undefined ? {} : { hiddenBox: !visible }),
      };
      if (keep === undefined) view.enqueue(control);
      else context.enqueue(control);
    };
    return { height: p.pitch, draw };
  }

  function codex(view: CodexScreenView): void {
    const t = ui.t,
      tab = view.tab;
    // The sort cycles the whole ability list, so it sits with the view controls.
    const sort =
      tab === "abilities"
        ? {
            label: `SORT: ${(view.sort ?? "category").toUpperCase()}`,
            width: DESKTOP.sort,
            action: { type: "codex.cycleSort" } as const,
          }
        : undefined;
    const filters = view.filters && tab !== "guide" ? view.filters : undefined;
    const frame = pf.open({
      title: "CODEX",
      tabs: view.tabs,
      tabAction: (id) => ({ type: "codex.selectTab", id }),
      pickers: filters && [
        {
          items: filters.map((filter) => ({ ...filter, selected: filter.id === view.filter })),
          action: (id) => ({ type: "codex.selectFilter", id }),
          desktop: {
            y: DESKTOP.filters.y,
            height: DESKTOP.filters.height,
            width: DESKTOP.filters[tab === "abilities" ? "abilities" : "bestiary"],
          },
          trailing: sort,
        },
      ],
      desktop: {},
    });
    const m = metrics(frame);
    const guide = tab === "guide" ? view.guide : undefined,
      grid = tab === "bestiary" ? m.bestiary : m.ability;
    const gap = tab === "guide" ? m.gap : grid.rowGap;
    const caption = pf.prose(
      frame,
      tab === "guide"
        ? m.codex.guideCaption
        : tab === "bestiary"
          ? "every foe — what it does, its stats, and the affixes it can roll"
          : `STACKS pile up  ·  ★ UNIQUE are one-time  ·  ✦ SPECIAL evolve a tier with every boss  —  ${m.codex.tierHint}`,
      {
        size: t.type.caption,
        maxLines: tab === "abilities" ? 3 : 2,
        align: m.align,
        baseline: 0,
        height: DESKTOP.listTop - DESKTOP.captionY - gap,
      },
    );
    const cell = (
      card: CardView,
      x: number,
      y: number,
      w: number,
      h: number,
      scroll: ScrollView,
      index: number,
    ): void => {
      if (tab === "bestiary") bestiaryEntry(m, card, x, y, w, h);
      else abilityCard(m, card, x, y, w, h, scroll, index);
    };
    const width = (grid.span.width - grid.gap * (grid.columns - 1)) / grid.columns;
    const list = guide
      ? [guideBlock(m.guide(guide), guide)]
      : pf.grid(
          grid.span,
          view.cards,
          grid.columns,
          (row) => Math.max(...row.map((card) => grid.height(card, width))),
          cell,
          grid.gap,
        );
    const state = pf.body(frame, {
      head: [caption],
      list,
      gap,
      desktop: {
        top: DESKTOP.captionY,
        cull: { above: 0, below: 0 },
        scrolls: false,
        snap: DESKTOP.rows,
        canScrollUp: view.canScrollUp,
        canScrollDown: view.canScrollDown,
      },
    });
    pf.close(frame, state);
  }

  function abilityCard(
    m: Metrics,
    card: CardView,
    x: number,
    y: number,
    w: number,
    h: number,
    view: ScrollView,
    index: number,
  ): void {
    const { canvas } = context,
      t = ui.t,
      a = m.ability,
      pad = a.pad;
    const accent = card.accent ?? t.color.accent,
      accentInk = ui.readable(accent);
    const special = card.badge?.includes("SPECIAL") === true,
      prized = special || card.badge?.includes("UNIQUE") === true;
    ui.card(canvas, x, y, w, h, context.focus === index);
    ui.accentStrip(canvas, x, y, w, accent);
    if (special) specialEdge(x, y, w, a.gleam);
    let badgeW = 0;
    if (card.badge && prized) {
      const color = special ? "#a86a0c" : ui.readable(t.color.unique);
      badgeW = ui.badge(canvas, card.badge, x + pad, y + a.badgeY, color, "left", t.type.micro);
    } else if (card.badge) {
      ui.tag(canvas, card.badge, x + pad, y + a.tagY, t.color.muted, "left", t.type.micro);
      badgeW = pf.textWidth(card.badge, t.type.micro, true);
    }
    const tierCount = card.tierCount ?? 1;
    const pathW = tierPath(card, a, x + pad + (a.tiers.inline ? badgeW + t.space.md : 0), y, accent, accentInk);
    if (card.category) {
      const category = ui.fitText(canvas, card.category, w - pad * 3 - badgeW - (a.tiers.inline ? pathW : 0), {
        size: t.type.micro,
        floor: t.type.micro,
        bold: true,
      });
      if (m.keepTruncated || !category.truncated)
        ui.tag(canvas, category.lines[0] ?? card.category, x + w - pad, y + a.tagY, accentInk, "right", t.type.micro);
    }
    const title = ui.fitText(canvas, card.label, w - pad * 2, { size: t.type.title, floor: a.titleFloor, bold: true });
    ui.displayText(canvas, title.lines[0] ?? card.label, x + pad, y + a.titleY, title.size);
    const copy = a.copy(tierCount > 1, h);
    if (card.description)
      ui.textBox(canvas, card.description, x + pad, y + copy.y, w - pad * 2, {
        size: t.type.micro,
        maxLines: copy.maxLines,
        lineHeight: a.lineHeight,
        alpha: t.alpha.soft,
      });
    view.enqueue({ x, y, w, h, label: "", hiddenBox: true, action: { type: "codex.inspect", id: card.id } });
  }

  /** An evolving ability's tier pips and BASE / TIER n tag from `x`; returns the width they take. */
  function tierPath(card: CardView, a: AbilityCard, x: number, y: number, accent: string, accentInk: string): number {
    const { canvas } = context,
      { r, step } = a.tiers,
      count = card.tierCount ?? 1;
    if (count <= 1) return 0;
    const tier = Math.max(0, Math.min(card.tier ?? 0, count - 1)),
      label = tier === 0 ? "BASE" : `TIER ${String(tier + 1)}`;
    for (let pip = 0; pip < count; pip += 1) {
      canvas.beginPath();
      canvas.arc(x + r + pip * step, y + a.tiers.pipY, r, 0, Math.PI * 2);
      canvas.fillStyle = accent;
      canvas.strokeStyle = accent;
      canvas.lineWidth = 2;
      if (pip !== tier) canvas.stroke();
      else {
        canvas.fill();
        if (!a.tiers.ring) continue;
        canvas.strokeStyle = ui.ink;
        canvas.lineWidth = 1.2;
        canvas.stroke();
      }
    }
    const tagX = x + count * step + a.tiers.tagGap;
    ui.tag(canvas, label, tagX, y + a.tiers.tagY, accentInk, "left", ui.t.type.micro);
    return tagX - x + pf.textWidth(label, ui.t.type.micro, true) + ui.t.space.md;
  }

  /** The gold edge on a SPECIAL card, with a white gleam travelling along it on desktop. */
  function specialEdge(x: number, y: number, cardWidth: number, gleam: boolean): void {
    const { canvas } = context;
    canvas.fillStyle = SPECIAL_GOLD;
    if (!gleam) {
      canvas.fillRect(x, y + 6, cardWidth, 3);
      return;
    }
    canvas.globalAlpha = 0.9;
    canvas.fillRect(x, y + 6, cardWidth, 3);
    const gleamX = x + ((context.time * 80 + (x % 200)) % (cardWidth + 60)) - 30;
    const gradient = canvas.createLinearGradient(gleamX - 30, 0, gleamX + 30, 0);
    gradient.addColorStop(0, "rgba(255,255,255,0)");
    gradient.addColorStop(0.5, "rgba(255,255,255,0.85)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    canvas.fillStyle = gradient;
    canvas.fillRect(x, y + 6, cardWidth, 3);
    canvas.globalAlpha = 1;
  }

  function bestiaryEntry(m: Metrics, card: CardView, x: number, y: number, w: number, h: number): void {
    const { canvas } = context,
      t = ui.t,
      b = m.bestiary;
    const accent = card.accent ?? (card.boss ? t.color.danger : t.color.accent),
      accentInk = ui.readable(accent);
    ui.panel(canvas, x, y, w, h);
    ui.spine(canvas, x, y, h, accent, 6);
    const preview = { x: x + b.preview.x, y: y + b.preview.y, w: b.preview.size, h: b.preview.size };
    canvas.strokeStyle = "rgba(40,42,54,0.3)";
    canvas.lineWidth = 1.5;
    canvas.strokeRect(preview.x, preview.y, preview.w, preview.h);
    if (card.previewId) context.renderPreview?.(card.previewId, preview);
    const textX = preview.x + preview.w + b.textGap,
      right = x + w - b.inset,
      textW = right - textX,
      nameY = y + b.nameY;
    const felled = card.felled,
      felledW = felled
        ? ui.badge(canvas, felled.label, right, nameY, ui.readable(felled.color), "right", t.type.micro) + b.felledGap
        : 0;
    const name = ui.fitText(canvas, card.label, textW - felledW - b.nameReserve, {
      size: t.type.lead,
      floor: b.nameFloor,
      bold: true,
    });
    ui.displayText(canvas, name.lines[0] ?? card.label, textX, nameY, name.size);
    const nameW = pf.textWidth(name.lines[0] ?? card.label, name.size, true);
    if (card.category) {
      const role = ui.fitText(canvas, card.category, textW - felledW - nameW - b.roleGap, {
        size: t.type.micro,
        floor: t.type.micro,
        bold: true,
      });
      if (role.lines[0] && (m.keepTruncated || !role.truncated))
        ui.tag(canvas, role.lines[0], textX + nameW + b.roleGap, nameY, accentInk, "left", t.type.micro);
    }
    stats(card.stats ?? [], textX, y + b.statsY, textW, b.statChips);
    // Description and variants share one block above the footer row.
    const lines = b.lines(card, h),
      copy = { size: t.type.micro, lineHeight: b.lineHeight };
    let cursor = y + b.copyY(card);
    const description = ui.textBox(canvas, card.description ?? "", textX, cursor, textW, {
      ...copy,
      alpha: t.alpha.soft,
      maxLines: lines.description,
    });
    if (card.description || b.fixedBlock) cursor += description.height;
    if (card.variants)
      cursor += ui.textBox(canvas, "Variants: " + card.variants, textX, cursor, textW, {
        ...copy,
        alpha: t.alpha.muted,
        maxLines: lines.variants(cursor - y),
      }).height;
    bestiaryFooter(card, b, textX, y + b.footerY(cursor - y, h), right);
  }

  /** Stats as label / value pairs: bordered chips, or one plain line that stops before the edge. */
  function stats(list: NonNullable<CardView["stats"]>, x: number, y: number, width: number, chips: boolean): void {
    const { canvas } = context,
      t = ui.t;
    let cursor = x;
    for (const stat of list) {
      const labelW = pf.textWidth(stat.label, t.type.micro, true),
        valueW = pf.textWidth(stat.value, t.type.caption, true);
      if (chips) {
        const w = Math.max(92, labelW + valueW + 28);
        canvas.strokeStyle = "rgba(40,42,54,0.35)";
        canvas.lineWidth = 1.5;
        canvas.strokeRect(cursor, y, w, 26);
        ui.tag(canvas, stat.label, cursor + 9, y + 18, t.color.muted, "left", t.type.micro);
        ui.tag(canvas, stat.value, cursor + w - 9, y + 18, ui.ink, "right", t.type.caption);
        cursor += w + 8;
        continue;
      }
      if (cursor + labelW + valueW + t.space.sm > x + width) break;
      ui.tag(canvas, stat.label, cursor, y, t.color.muted, "left", t.type.micro);
      ui.tag(canvas, stat.value, cursor + labelW + t.space.xs, y, ui.ink, "left", t.type.caption);
      cursor += labelW + valueW + t.space.xs + t.space.xl;
    }
  }

  /** The multi-phase note for a boss, or the affixes an enemy can roll. */
  function bestiaryFooter(card: CardView, b: BestiaryEntry, x: number, y: number, right: number): void {
    const { canvas } = context,
      t = ui.t,
      chip = b.affix;
    if (card.boss) {
      const note = "MULTI-PHASE — attacks escalate as its health falls";
      ui.tag(canvas, note, x, y, ui.readable(t.color.danger), "left", t.type.micro);
      return;
    }
    if (!card.affixes || card.affixes.length === 0) return;
    ui.tag(canvas, "CAN ROLL", x, y, t.color.muted, "left", t.type.micro);
    let cursor = x + pf.textWidth("CAN ROLL", t.type.micro, true) + chip.lead;
    for (const affix of card.affixes) {
      const label = affix.id.toUpperCase(),
        w = pf.textWidth(label, t.type.micro, true) + chip.pad;
      if (cursor + w > right) break;
      canvas.fillStyle = affix.color;
      canvas.globalAlpha = 0.16;
      canvas.fillRect(cursor, y - chip.rise, w, chip.height);
      canvas.globalAlpha = 1;
      canvas.strokeStyle = affix.color;
      canvas.lineWidth = 1;
      canvas.strokeRect(cursor, y - chip.rise, w, chip.height);
      ui.tag(canvas, label, cursor + chip.inset, y, ui.readable(affix.color), "left", t.type.micro);
      cursor += w + chip.gap;
    }
  }

  /** The guide: controls and the controller (left), the trick meter, the ladder and the variety rule (right). */
  function guideBlock(g: GuidePlan, view: Guide): ScrollBlock {
    const draw = (y: number): void => {
      guideControls(g, view, y);
      guideTricks(g, view, y);
    };
    return { height: g.height, draw };
  }

  function guideControls(g: GuidePlan, view: Guide, y: number): void {
    const { canvas } = context,
      t = ui.t,
      { left: x, width } = g.left;
    const rows = {
      size: t.type.label,
      maxLines: g.rowLines,
      ...(g.rowLineHeight ? { lineHeight: g.rowLineHeight(t.type.label) } : {}),
    };
    let cursor = ui.sectionLabel(canvas, "CONTROLS", x, y + g.labelY, width) + g.after.rows;
    for (const row of view.controls) {
      const baseline = cursor + g.baseline;
      ui.tag(canvas, row.keys.join(" + "), x, baseline, ui.readable(t.color.accent), "left", t.type.micro);
      ui.textBox(canvas, row.description, x + g.keyWidth, baseline, width - g.keyWidth, {
        ...rows,
        alpha: t.alpha.soft,
      });
      cursor += g.advance.control(row.description);
    }
    let line: number;
    if (g.controller.rule) {
      ui.divider(canvas, x, cursor - 20, width, 0.14);
      ui.tag(canvas, "CONTROLLER", x, cursor + 4, t.color.muted, "left", t.type.micro);
      line = cursor + 4;
    } else
      line =
        ui.sectionLabel(canvas, "CONTROLLER", x, cursor + t.space.md + t.type.micro, width, t.color.muted) +
        t.space.sm +
        t.type.micro;
    for (const text of view.controller)
      line += ui.textBox(canvas, text, x + g.controller.x, line, width - g.controller.x, {
        size: t.type.micro,
        lineHeight: g.controller.lineHeight,
        alpha: t.alpha.soft,
        maxLines: 2,
      }).height;
  }

  function guideTricks(g: GuidePlan, view: Guide, y: number): void {
    const { canvas } = context,
      t = ui.t,
      { left: x, width } = g.right,
      gold = ui.readable(GOLD),
      accent = ui.readable(t.color.accent);
    const lineHeight = (size: number) => (g.rowLineHeight ? { lineHeight: g.rowLineHeight(size) } : {});
    let cursor = ui.sectionLabel(canvas, "THE TRICK METER", x, y + g.labelY, width) + g.after.rows;
    for (const trick of view.tricks) {
      const baseline = cursor + g.baseline;
      ui.tag(canvas, trick.glyph, x, baseline, accent, "left", t.type.label);
      ui.displayText(canvas, trick.name, x + g.trick.nameX, baseline, t.type.label);
      ui.textBox(canvas, trick.description, x + g.trick.copyX, baseline, g.trick.copyWidth, {
        size: t.type.micro,
        alpha: t.alpha.muted,
        maxLines: g.rowLines,
        ...lineHeight(t.type.micro),
      });
      const points = `+${String(trick.points)}`;
      ui.tag(canvas, points, x + width, baseline, trick.points >= 10 ? gold : accent, "right", t.type.label);
      cursor += g.advance.trick(trick.description);
    }
    cursor = ui.sectionLabel(canvas, "THE LADDER", x, cursor + g.ladderBefore, width) + g.after.ladder;
    for (const tier of view.ladder) {
      const baseline = cursor + g.baseline;
      ui.bar(canvas, x, baseline - g.bar.rise, g.bar.width, 8, tier.fraction, t.color.accent);
      ui.text(canvas, tier.name, x + g.bar.width + t.space.md, baseline, t.type.label);
      const multiplier = `×${String(tier.multiplier)}`;
      ui.tag(
        canvas,
        multiplier,
        x + width,
        baseline,
        tier.multiplier >= 4 ? gold : t.color.muted,
        "right",
        t.type.label,
      );
      cursor += g.advance.ladder;
    }
    ui.textBox(canvas, view.variety, x, cursor + g.variety.offset, width, {
      size: t.type.micro,
      alpha: t.alpha.muted,
      maxLines: g.variety.maxLines,
      ...lineHeight(t.type.micro),
    });
  }

  return { codex, shop };
}
