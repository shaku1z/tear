import type { MenuScreenView, ScreenRenderContext, SetupScreenView } from "./contracts";
import { backControl, page, pageLayout } from "./screen-primitives";
import { withAlpha } from "../ui-color";

/** Run-select column grid (logical px), shared by the desktop and compact compositions. */
const SETUP_COLUMNS = Object.freeze({
  modeX: 240,
  modeWidth: 380,
  difficultyX: 640,
  difficultyWidth: 360,
  weaponX: 1020,
  weaponWidth: 340,
});

export function createMenuSetupRenderers(context: ScreenRenderContext) {
  const { ui, width, height } = context;

  /**
   * The rail backing: a soft dark fade from the screen's left edge into the scene
   * (`alpha.rail` at the edge, `alpha.railMid` at `metric.railFadeMid`, clear at
   * `metric.railFadeW`). It starts at the edge the rail is anchored to (the true left
   * edge on an ultrawide window) and stretches by `stretch` when the rail reaches
   * further than one desktop column, so the falloff stays the same relative to the rail.
   * There is no solid slab: each rail control carries its own dark fill (`alpha.railControl`).
   */
  function railFade(stretch: number): void {
    const { canvas } = context,
      viewport = context.screenRectangle,
      t = ui.t;
    const edge = Math.min(0, viewport.x),
      end = edge + t.metric.railFadeW + stretch;
    const gradient = canvas.createLinearGradient(edge, 0, end, 0);
    gradient.addColorStop(0, withAlpha(t.color.rail, t.alpha.rail));
    gradient.addColorStop(t.metric.railFadeMid, withAlpha(t.color.rail, t.alpha.railMid));
    gradient.addColorStop(1, withAlpha(t.color.rail, 0));
    canvas.save();
    canvas.fillStyle = gradient;
    canvas.fillRect(viewport.x, viewport.y, end - viewport.x, viewport.h);
    canvas.restore();
  }

  function menu(view: MenuScreenView): void {
    const { canvas } = context;
    const viewport = context.screenRectangle;
    // The rail anchors to the true left edge of the window (overscan included), so an
    // ultrawide window shows more world to the right instead of an empty band on the
    // left. Touch (tablet and phone) uses touch-sized rows and flows the navigation into columns.
    const compact = ui.density.touch,
      metric = ui.t.metric;
    const railX = Math.round(100 + Math.min(0, viewport.x) + context.safeInsets.l),
      columnWidth = 320;
    const wordmarkY = compact ? 96 : 150;
    const rowH = compact ? metric.btnH : 52,
      pitch = compact ? rowH + metric.btnGap : 61;
    const identityY = compact ? wordmarkY + 34 + ui.t.space.lg : 240,
      identityH = compact ? rowH : 58;
    const playY = compact ? identityY + identityH + metric.btnGap : 318,
      playH = compact ? Math.round(rowH * 1.2) : 86;
    const navTop = compact ? playY + playH + metric.btnGap * 2 : 426;
    // Navigation row `index`: one column on desktop; in compact density the rows flow
    // into as many columns as the remaining height needs.
    const navCount = 5 + (view.practiceAvailable ? 1 : 0) + (view.nowPlaying ? 1 : 0);
    const rowsAvailable = Math.max(1, Math.floor((height - ui.t.space.lg - navTop + metric.btnGap) / pitch));
    const columns = compact ? Math.max(2, Math.ceil(navCount / rowsAvailable)) : 1;
    const railWidth = columns * columnWidth + (columns - 1) * metric.btnGap;
    const navSlot = (index: number) =>
      compact
        ? {
            x: railX + (index % columns) * (columnWidth + metric.btnGap),
            y: navTop + Math.floor(index / columns) * pitch,
            w: columnWidth,
            h: rowH,
          }
        : { x: railX, y: navTop + index * pitch, w: railWidth, h: rowH };
    // The desktop rail ends 420 px from the edge (100 inset + one column); reach past it stretches the fade.
    railFade(Math.max(0, railX + railWidth - Math.min(0, viewport.x) - 100 - columnWidth));
    const solidRight = railX + railWidth + 48;
    ui.wordmark(canvas, railX, wordmarkY, context.time, context.reducedMotion);
    ui.text(
      canvas,
      "a momentum-blade survival game",
      railX,
      wordmarkY + 34,
      ui.t.type.caption,
      "left",
      ui.t.alpha.soft,
    );
    if (view.biome && !compact) {
      ui.tag(
        canvas,
        `◈ NOW SHOWING — ${view.biome.toUpperCase()}`,
        railX,
        wordmarkY + 62,
        ui.t.color.accent,
        "left",
        ui.t.type.micro,
      );
    }

    context.enqueue({
      x: railX,
      y: identityY,
      w: railWidth,
      h: identityH,
      label: view.playerName.toUpperCase(),
      sub: `◆ ${view.coins.toLocaleString("en-US")}    ⬡ ${view.shards.toLocaleString("en-US")}    ★ ${view.unlocked.toLocaleString("en-US")}`,
      dot: view.signedIn ? "#2f9e6b" : "#8a93a6",
      ghost: true,
      action: { type: "navigate", to: "profile", resetScroll: true, tab: "bests" },
    });
    context.enqueue({
      x: railX,
      y: playY,
      w: railWidth,
      h: playH,
      label: "PLAY",
      glyph: "▶",
      hero: true,
      ghost: true,
      sub: (view.playSub ?? `${view.modeLabel} · ${view.difficultyLabel}`).toUpperCase(),
      action: { type: "navigate", to: "setup" },
    });
    const rail = [
      ["◆", "SHOP", "shop"],
      ["★", "ACHIEVEMENTS", "achievements"],
      ["☰", "LEADERBOARDS", "leaderboards"],
      ["▤", "CODEX", "codex"],
      ["⚙", "SETTINGS", "settings"],
    ] as const;
    rail.forEach(([glyph, label, to], index) => {
      context.enqueue({
        ...navSlot(index),
        glyph,
        label,
        ghost: true,
        action: { type: "navigate", to, resetScroll: to !== "settings" },
      });
    });
    // Extra rows continue the same rhythm under SETTINGS: the Practice Lab, then the music row.
    let slot = rail.length;
    if (view.practiceAvailable) {
      context.enqueue({
        ...navSlot(slot++),
        glyph: "◎",
        label: "PRACTICE LAB",
        sub: "LESSONS · NO REWARDS",
        ghost: true,
        action: { type: "tutorial.action", command: "open-practice" },
      });
    }
    if (view.nowPlaying) {
      // The now-playing row is a slimmer status row on desktop.
      context.enqueue({
        ...navSlot(slot++),
        ...(compact ? {} : { h: 46 }),
        glyph: "♪",
        ghost: true,
        label: view.nowPlaying.label,
        sub: view.nowPlaying.detail,
        action: { type: "navigate", to: "music", resetScroll: true },
      });
    }
    const lastSlot = navSlot(Math.max(0, slot - 1)),
      rowY = lastSlot.y + lastSlot.h + metric.btnGap;
    if (!compact && rowY + 34 < height)
      ui.text(
        canvas,
        "cut clean · keep moving · chase the multiplier",
        railX,
        Math.max(rowY + 34, height - 30),
        ui.t.type.micro,
        "left",
        ui.t.alpha.muted,
      );
    if (view.pendingFinale) {
      const x = solidRight + 24;
      ui.tag(canvas, "◇ SAVED ADVENTURE CLEAR", x, height - 146, ui.t.color.accent, "left", ui.t.type.micro);
      ui.text(canvas, "The Final Cut was interrupted.", x, height - 118, ui.t.type.caption, "left", ui.t.alpha.soft);
      context.enqueue({
        x,
        y: height - 102,
        w: 210,
        h: Math.max(44, metric.minTarget),
        label: "RESUME FINAL CUT",
        action: { type: "menu.resumeFinale" },
      });
      context.enqueue({
        x: x + 222,
        y: height - 102,
        w: 184,
        h: Math.max(44, metric.minTarget),
        label: "CLAIM RESULTS",
        action: { type: "menu.claimFinale" },
      });
    }
  }

  function setup(view: SetupScreenView): void {
    const { canvas } = context;
    page(context, { title: "SELECT RUN" });
    const top = 150,
      rowTop = 168;
    const { modeX, modeWidth, difficultyX, difficultyWidth, weaponX, weaponWidth } = SETUP_COLUMNS;
    // Keep the oracle's rich row content on a shared grid so each choice scans
    // cleanly across mode, difficulty, and weapon. Touch keeps the three columns at
    // touch-sized rows and moves START into the footer row.
    const compact = ui.density.touch;
    const rowHeight = compact ? ui.t.metric.btnH : 56,
      rowPitch = rowHeight + (compact ? 6 : 4),
      rowSize = compact ? ui.t.type.label : 17;
    ui.sectionLabel(canvas, "MODE", modeX, top, modeWidth);
    const publicModes = view.modes.filter((choice) => choice.debug !== true);
    publicModes.forEach((choice, index) => {
      context.enqueue({
        x: modeX,
        y: rowTop + index * rowPitch,
        w: modeWidth,
        h: rowHeight,
        size: rowSize,
        label: choice.label.toUpperCase(),
        glyph: choice.glyph,
        sub: choice.sub,
        selected: choice.selected,
        enabled: choice.enabled,
        action: { type: "setup.selectMode", id: choice.id },
      });
    });
    if (compact) {
      compactSetup(view, { top, rowTop, rowHeight, rowPitch, rowSize });
      return;
    }
    const debugModes = view.modes.filter((choice) => choice.debug === true);
    let modeFootY = rowTop + Math.max(5, publicModes.length) * rowPitch + 32;
    if (debugModes.length > 0) {
      const debugY = rowTop + publicModes.length * 60 + 12;
      ui.sectionLabel(canvas, "DEV", modeX, debugY, modeWidth, ui.t.color.muted);
      debugModes.forEach((choice, index) => {
        context.enqueue({
          x: modeX,
          y: debugY + 12 + index * 40,
          w: modeWidth,
          h: 34,
          size: ui.t.type.caption,
          label: choice.label.toUpperCase(),
          selected: choice.selected,
          enabled: choice.enabled,
          action: { type: "setup.selectMode", id: choice.id },
        });
      });
      modeFootY = debugY + 12 + debugModes.length * 40 + 30;
    }

    choiceColumns(view, { top, rowTop, rowHeight, rowPitch, rowSize });

    // Description slots: each column measures its own copy, so wrapped text never
    // runs into the stakes band below.
    const stakesY = 652;
    const selectedMode = view.modes.find((choice) => choice.selected);
    const modeOnly = !view.showDifficulty;
    const foot = (x: number, y: number, w: number, text: string | undefined, maxLines: number): number => {
      if (!text) return y;
      ui.divider(canvas, x, y - 20, w, 0.14);
      return (
        y +
        ui.textBox(canvas, text, x, y, w - 8, {
          size: ui.t.type.caption,
          lineHeight: 20,
          alpha: ui.t.alpha.soft,
          maxLines,
        }).height
      );
    };
    if (!modeOnly)
      foot(
        modeX,
        modeFootY,
        modeWidth,
        selectedMode?.description,
        Math.max(1, Math.floor((stakesY - 24 - modeFootY) / 20)),
      );
    const footY = rowTop + 5 * rowPitch + 32;
    if (view.showDifficulty)
      foot(difficultyX, footY, difficultyWidth, view.difficulties.find((choice) => choice.selected)?.description, 4);
    const selectedWeapon = view.weapons.find((choice) => choice.selected);
    const weaponBottom = foot(weaponX, footY, weaponWidth, selectedWeapon?.description, 3);
    if (selectedWeapon?.detail) {
      ui.textBox(canvas, selectedWeapon.detail, weaponX, weaponBottom + 6, weaponWidth - 8, {
        size: ui.t.type.micro,
        lineHeight: 18,
        alpha: ui.t.alpha.muted,
        maxLines: 6,
      });
    }

    // Stakes band: only what applies to the selected mode.
    ui.divider(canvas, modeX, stakesY - 16, 1120, 0.16);
    if (view.bossChoices && view.bossChoices.length > 0) {
      ui.sectionLabel(canvas, "BOSS TEST", 710, stakesY - 22, 650);
      const gap = 8,
        choiceWidth = (650 - gap * (view.bossChoices.length - 1)) / view.bossChoices.length;
      view.bossChoices.forEach((choice, index) => {
        context.enqueue({
          x: 710 + index * (choiceWidth + gap),
          y: stakesY,
          w: choiceWidth,
          h: 34,
          label: choice.label,
          selected: choice.selected,
          size: ui.t.type.micro,
          chip: true,
          action: { type: "setup.selectBoss", id: choice.id },
        });
      });
    }
    if (modeOnly) {
      // Training modes have no score board or bounties: the band explains the mode instead.
      ui.tag(canvas, "ABOUT THIS MODE", modeX, stakesY + 4, ui.t.color.accent, "left", ui.t.type.micro);
      const about = ui.textBox(canvas, selectedMode?.description ?? "", modeX, stakesY + 28, 1120, {
        size: ui.t.type.body,
        lineHeight: 22,
        alpha: ui.t.alpha.soft,
        maxLines: 2,
      });
      if (view.guidance)
        ui.text(canvas, view.guidance, modeX, stakesY + 30 + about.height, ui.t.type.caption, "left", ui.t.alpha.muted);
    } else {
      if (view.bestSummary) {
        ui.tag(canvas, "YOUR BEST", modeX, stakesY + 4, ui.t.color.accent, "left", ui.t.type.micro);
        ui.textBox(canvas, view.bestSummary.replace(/^YOUR BEST\s*·\s*/u, ""), modeX, stakesY + 28, 440, {
          size: ui.t.type.label,
          lineHeight: 20,
          alpha: ui.t.alpha.soft,
          maxLines: 2,
        });
      }
      if (!view.bossChoices && view.bounties && view.bounties.length > 0) {
        const bountyX = modeX + 470,
          bountyWidth = 210;
        ui.tag(canvas, "TODAY'S BOUNTIES", bountyX, stakesY + 4, ui.readable("#e0a326"), "left", ui.t.type.micro);
        view.bounties.slice(0, 3).forEach((bounty, index) => {
          const x = bountyX + index * (bountyWidth + 12);
          const label = ui.textBox(canvas, bounty.label, x, stakesY + 26, bountyWidth, {
            size: ui.t.type.micro,
            lineHeight: 16,
            alpha: bounty.done ? ui.t.alpha.muted : ui.t.alpha.soft,
            maxLines: 2,
          });
          ui.tag(
            canvas,
            bounty.detail,
            x,
            stakesY + 30 + label.height,
            bounty.done ? ui.readable("#2f9e6b") : ui.t.color.muted,
            "left",
            ui.t.type.micro,
          );
        });
      } else if (!view.bossChoices && view.bountySummary)
        ui.tag(canvas, view.bountySummary, modeX + 1120, stakesY + 30, ui.t.color.muted, "right", ui.t.type.micro);
    }
    canvas.font = ui.font(ui.t.type.caption, true);
    const startWidth = Math.max(300, Math.round(canvas.measureText(view.startSummary).width) + 110);
    const startY = 722;
    context.enqueue({
      x: width / 2 - startWidth / 2,
      y: startY,
      w: startWidth,
      h: 58,
      label: "START",
      glyph: view.startGlyph,
      sub: view.startSummary.toUpperCase(),
      hero: true,
      ghost: true,
      size: 26,
      action: { type: "setup.start" },
    });
    if (view.practiceAvailable)
      context.enqueue({
        x: width / 2 - startWidth / 2 - 274,
        y: startY,
        w: 254,
        h: 58,
        label: "PRACTICE LAB",
        sub: "BASELINE SWORD · NO REWARDS",
        glyph: "◎",
        action: { type: "tutorial.action", command: "open-practice" },
      });
    if (view.raceAvailable === true) {
      context.enqueue({
        x: width / 2 + startWidth / 2 + 20,
        y: startY,
        w: 330,
        h: 58,
        label: "CREATE SEED-LOCKED RACE",
        sub: "SHARED SEED · UNRANKED",
        action: { type: "setup.start", race: true },
      });
    }
    backControl(context);
  }

  /** The difficulty and weapon columns, shared by the desktop and compact compositions. */
  function choiceColumns(
    view: SetupScreenView,
    grid: Readonly<{ top: number; rowTop: number; rowHeight: number; rowPitch: number; rowSize: number }>,
  ): void {
    const { canvas } = context,
      { difficultyX, difficultyWidth, weaponX, weaponWidth } = SETUP_COLUMNS;
    ui.sectionLabel(canvas, "DIFFICULTY", difficultyX, grid.top, difficultyWidth);
    if (view.showDifficulty)
      view.difficulties.forEach((choice, index) => {
        const heat = ["#2f9e6b", "#13c4d6", "#e0a326", ui.t.color.danger, "#b06cff"][index] ?? ui.t.color.accent;
        context.enqueue({
          x: difficultyX,
          y: grid.rowTop + index * grid.rowPitch,
          w: difficultyWidth,
          h: grid.rowHeight,
          size: grid.rowSize,
          label: choice.label.toUpperCase(),
          sub: choice.sub,
          pips: { n: 5, filled: index + 1, color: heat },
          selected: choice.selected,
          enabled: choice.enabled,
          action: { type: "setup.selectDifficulty", id: choice.id },
        });
      });
    else {
      ui.textBox(
        canvas,
        "Set by the mode — training runs tune themselves.",
        difficultyX + difficultyWidth / 2,
        grid.rowTop + 120,
        difficultyWidth - 40,
        { size: ui.t.type.body, align: "center", alpha: ui.t.alpha.muted },
      );
    }
    ui.sectionLabel(canvas, "WEAPON", weaponX, grid.top, weaponWidth);
    view.weapons.forEach((choice, index) => {
      context.enqueue({
        x: weaponX,
        y: grid.rowTop + index * grid.rowPitch,
        w: weaponWidth,
        h: grid.rowHeight,
        size: grid.rowSize,
        label: choice.label.toUpperCase(),
        glyph: choice.glyph,
        sub: choice.sub,
        selected: choice.selected,
        enabled: choice.enabled,
        action: { type: "setup.selectWeapon", id: choice.id },
      });
    });
  }

  /** Phone landscape: the three choice columns at touch size; PRACTICE LAB · BACK · START share the footer row. */
  function compactSetup(
    view: SetupScreenView,
    grid: Readonly<{ top: number; rowTop: number; rowHeight: number; rowPitch: number; rowSize: number }>,
  ): void {
    const layout = pageLayout(context),
      metric = ui.t.metric;
    choiceColumns(view, grid);
    const startX = width / 2 + metric.backW / 2 + metric.btnGap,
      startW = layout.sheet.x + layout.sheet.w - 34 - startX;
    context.enqueue({
      x: startX,
      y: layout.footerY,
      w: startW,
      h: metric.btnH,
      label: "START",
      glyph: view.startGlyph,
      sub: view.startSummary.toUpperCase(),
      hero: true,
      ghost: true,
      action: { type: "setup.start" },
    });
    if (view.practiceAvailable) {
      const practiceX = layout.sheet.x + 34;
      context.enqueue({
        x: practiceX,
        y: layout.footerY,
        w: width / 2 - metric.backW / 2 - metric.btnGap - practiceX,
        h: metric.btnH,
        label: "PRACTICE LAB",
        glyph: "◎",
        action: { type: "tutorial.action", command: "open-practice" },
      });
    }
    backControl(context);
  }

  return { menu, setup };
}
