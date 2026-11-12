import type { MenuScreenView, ScreenRenderContext, SetupScreenView } from "./contracts";
import { backControl, page } from "./screen-primitives";

export function createMenuSetupRenderers(context: ScreenRenderContext) {
  const { ui, width, height } = context;

  function menu(view: MenuScreenView): void {
    const { canvas } = context;
    const viewport = context.screenRectangle;
    // The rail anchors to the true left edge of the window (overscan included), so an
    // ultrawide window shows more world to the right instead of an empty band on the
    // left. Touch keeps the authored anchor: its overlay zoom scales around the centre.
    const railX = context.touch ? 100 : Math.round(100 + Math.min(0, viewport.x) + context.safeInsets.l);
    const railWidth = 320;
    const wordmarkY = 150;
    const pitch = 61;
    // Rail backing: one solid dark field behind every rail control (contrast does not
    // depend on the biome), feathering out to the open scene on the right.
    // One gradient fill (no seam): solid to the rail's right edge, then a soft feather.
    const solidRight = railX + railWidth + 48, feather = 260, span = solidRight + feather - viewport.x;
    canvas.save();
    canvas.globalAlpha = ui.t.alpha.rail;
    const gradient = canvas.createLinearGradient(viewport.x, 0, solidRight + feather, 0);
    gradient.addColorStop(0, ui.t.color.rail);
    gradient.addColorStop((solidRight - viewport.x) / span, ui.t.color.rail);
    gradient.addColorStop(1, "rgba(8,10,16,0)");
    canvas.fillStyle = gradient;
    canvas.fillRect(viewport.x, viewport.y, span, viewport.h);
    canvas.restore();
    ui.wordmark(canvas, railX, wordmarkY, context.time, context.reducedMotion);
    ui.text(canvas, "a momentum-blade survival game", railX, wordmarkY + 34, ui.t.type.caption, "left", ui.t.alpha.soft);
    if (view.biome) ui.tag(canvas, `◈ NOW SHOWING — ${view.biome.toUpperCase()}`, railX, wordmarkY + 62, ui.t.color.accent, "left", ui.t.type.micro);

    context.enqueue({
      x: railX, y: 240, w: railWidth, h: 58, label: view.playerName.toUpperCase(),
      sub: `◆ ${view.coins.toLocaleString("en-US")}    ⬡ ${view.shards.toLocaleString("en-US")}    ★ ${view.unlocked.toLocaleString("en-US")}`,
      dot: view.signedIn ? "#2f9e6b" : "#8a93a6", ghost: true,
      action: { type: "navigate", to: "profile", resetScroll: true, tab: "bests" },
    });
    context.enqueue({
      x: railX, y: 318, w: railWidth, h: 86, label: "PLAY", glyph: "▶", hero: true, ghost: true,
      sub: (view.playSub ?? `${view.modeLabel} · ${view.difficultyLabel}`).toUpperCase(), action: { type: "navigate", to: "setup" },
    });
    const rail = [
      ["◆", "SHOP", "shop"], ["★", "ACHIEVEMENTS", "achievements"],
      ["☰", "LEADERBOARDS", "leaderboards"], ["▤", "CODEX", "codex"], ["⚙", "SETTINGS", "settings"],
    ] as const;
    rail.forEach(([glyph, label, to], index) => { context.enqueue({
      x: railX, y: 426 + index * pitch, w: railWidth, h: 52, glyph, label, ghost: true,
      action: { type: "navigate", to, resetScroll: to !== "settings" },
    }); });
    // Extra rows continue the same rhythm under SETTINGS: engineering routes, the
    // Practice Lab (after the tutorial), then the music row.
    let rowY = 426 + rail.length * pitch;
    if (view.engineeringRoutes === true) {
      context.enqueue({ x: railX, y: rowY, w: railWidth, h: 52, glyph: "◇", label: "TRAINING ARCHIVE", ghost: true,
        action: { type: "training-archive.open" } });
      context.enqueue({ x: railX + railWidth + 18, y: rowY, w: 220, h: 52, glyph: "T", label: "TRAINING OPERATIONS", ghost: true,
        action: { type: "training-operations.open" } });
      context.enqueue({ x: railX + railWidth + 250, y: rowY, w: 220, h: 52, glyph: "◇", label: "REPLAY HUB", ghost: true,
        sub: "LOCAL ROUTES", action: { type: "navigate", to: "ghostlab", resetScroll: true } });
      rowY += pitch;
    }
    if (view.practiceAvailable) {
      context.enqueue({ x: railX, y: rowY, w: railWidth, h: 52, glyph: "◎", label: "PRACTICE LAB", sub: "LESSONS · NO REWARDS", ghost: true,
        action: { type: "tutorial.action", command: "open-practice" } });
      rowY += pitch;
    }
    if (view.nowPlaying) {
      context.enqueue({
        x: railX, y: rowY, w: railWidth, h: 46, glyph: "♪", ghost: true,
        label: view.nowPlaying.label, sub: view.nowPlaying.detail,
        action: { type: "navigate", to: "settings", tab: "music" },
      });
      rowY += 46;
    }
    if (rowY + 34 < height) ui.text(canvas, "cut clean · keep moving · chase the multiplier", railX, Math.max(rowY + 34, height - 30), ui.t.type.micro, "left", ui.t.alpha.muted);
    if (view.pendingFinale) {
      const x = solidRight + 24;
      ui.tag(canvas, "◇ SAVED ADVENTURE CLEAR", x, height - 146, ui.t.color.accent, "left", ui.t.type.micro);
      ui.text(canvas, "The Final Cut was interrupted.", x, height - 118, ui.t.type.caption, "left", ui.t.alpha.soft);
      context.enqueue({ x, y: height - 102, w: 210, h: 44, label: "RESUME FINAL CUT", action: { type: "menu.resumeFinale" } });
      context.enqueue({ x: x + 222, y: height - 102, w: 184, h: 44, label: "CLAIM RESULTS", action: { type: "menu.claimFinale" } });
    }
  }

  function setup(view: SetupScreenView): void {
    const { canvas } = context;
    page(context, { title: "SELECT RUN" });
    const top = 150, rowTop = 168;
    const modeX = 240, modeWidth = 380, difficultyX = 640, difficultyWidth = 360, weaponX = 1020, weaponWidth = 340;
    // Keep the oracle's rich row content on a shared grid so each choice scans
    // cleanly across mode, difficulty, and weapon.
    const rowHeight = 56, rowPitch = 60;
    ui.sectionLabel(canvas, "MODE", modeX, top, modeWidth);
    const publicModes = view.modes.filter((choice) => choice.debug !== true);
    publicModes.forEach((choice, index) => { context.enqueue({
      x: modeX, y: rowTop + index * rowPitch, w: modeWidth, h: rowHeight, size: 17,
      label: choice.label.toUpperCase(), glyph: choice.glyph, sub: choice.sub,
      selected: choice.selected, enabled: choice.enabled,
      action: { type: "setup.selectMode", id: choice.id },
    }); });
    const debugModes = view.modes.filter((choice) => choice.debug === true);
    let modeFootY = rowTop + Math.max(5, publicModes.length) * rowPitch + 32;
    if (debugModes.length > 0) {
      const debugY = rowTop + publicModes.length * 60 + 12;
      ui.sectionLabel(canvas, "DEV", modeX, debugY, modeWidth, ui.t.color.muted);
      debugModes.forEach((choice, index) => { context.enqueue({
        x: modeX, y: debugY + 12 + index * 40, w: modeWidth, h: 34, size: ui.t.type.caption,
        label: choice.label.toUpperCase(), selected: choice.selected, enabled: choice.enabled,
        action: { type: "setup.selectMode", id: choice.id },
      }); });
      modeFootY = debugY + 12 + debugModes.length * 40 + 30;
    }

    ui.sectionLabel(canvas, "DIFFICULTY", difficultyX, top, difficultyWidth);
    if (view.showDifficulty) view.difficulties.forEach((choice, index) => {
      const heat = ["#2f9e6b", "#13c4d6", "#e0a326", ui.t.color.danger, "#b06cff"][index] ?? ui.t.color.accent;
      context.enqueue({
        x: difficultyX, y: rowTop + index * rowPitch, w: difficultyWidth, h: rowHeight, size: 17,
        label: choice.label.toUpperCase(), sub: choice.sub,
        pips: { n: 5, filled: index + 1, color: heat },
        selected: choice.selected, enabled: choice.enabled,
        action: { type: "setup.selectDifficulty", id: choice.id },
      });
    });
    else {
      ui.textBox(canvas, "Set by the mode — training runs tune themselves.", difficultyX + difficultyWidth / 2, rowTop + 120,
        difficultyWidth - 40, { size: ui.t.type.body, align: "center", alpha: ui.t.alpha.muted });
    }

    ui.sectionLabel(canvas, "WEAPON", weaponX, top, weaponWidth);
    view.weapons.forEach((choice, index) => { context.enqueue({
      x: weaponX, y: rowTop + index * rowPitch, w: weaponWidth, h: rowHeight, size: 17,
      label: choice.label.toUpperCase(), glyph: choice.glyph, sub: choice.sub,
      selected: choice.selected, enabled: choice.enabled,
      action: { type: "setup.selectWeapon", id: choice.id },
    }); });

    // Description slots: each column measures its own copy, so wrapped text never
    // runs into the stakes band below.
    const stakesY = 652;
    const selectedMode = view.modes.find((choice) => choice.selected);
    const modeOnly = !view.showDifficulty;
    const foot = (x: number, y: number, w: number, text: string | undefined, maxLines: number): number => {
      if (!text) return y;
      ui.divider(canvas, x, y - 20, w, 0.14);
      return y + ui.textBox(canvas, text, x, y, w - 8, { size: ui.t.type.caption, lineHeight: 20, alpha: ui.t.alpha.soft, maxLines }).height;
    };
    if (!modeOnly) foot(modeX, modeFootY, modeWidth, selectedMode?.description, Math.max(1, Math.floor((stakesY - 24 - modeFootY) / 20)));
    const footY = rowTop + 5 * rowPitch + 32;
    if (view.showDifficulty) foot(difficultyX, footY, difficultyWidth, view.difficulties.find((choice) => choice.selected)?.description, 4);
    const selectedWeapon = view.weapons.find((choice) => choice.selected);
    const weaponBottom = foot(weaponX, footY, weaponWidth, selectedWeapon?.description, 3);
    if (selectedWeapon?.detail) {
      ui.textBox(canvas, selectedWeapon.detail, weaponX, weaponBottom + 6, weaponWidth - 8,
        { size: ui.t.type.micro, lineHeight: 18, alpha: ui.t.alpha.muted, maxLines: 6 });
    }

    // Stakes band: only what applies to the selected mode.
    ui.divider(canvas, modeX, stakesY - 16, 1120, 0.16);
    if (view.bossChoices && view.bossChoices.length > 0) {
      ui.sectionLabel(canvas, "BOSS TEST", 710, stakesY - 22, 650);
      const gap = 8, choiceWidth = (650 - gap * (view.bossChoices.length - 1)) / view.bossChoices.length;
      view.bossChoices.forEach((choice, index) => {
        context.enqueue({
          x: 710 + index * (choiceWidth + gap), y: stakesY, w: choiceWidth, h: 34,
          label: choice.label, selected: choice.selected, size: ui.t.type.micro, chip: true,
          action: { type: "setup.selectBoss", id: choice.id },
        });
      });
    }
    if (modeOnly) {
      // Training modes have no score board or bounties: the band explains the mode instead.
      ui.tag(canvas, "ABOUT THIS MODE", modeX, stakesY + 4, ui.t.color.accent, "left", ui.t.type.micro);
      const about = ui.textBox(canvas, selectedMode?.description ?? "", modeX, stakesY + 28, 1120,
        { size: ui.t.type.body, lineHeight: 22, alpha: ui.t.alpha.soft, maxLines: 2 });
      if (view.guidance) ui.text(canvas, view.guidance, modeX, stakesY + 30 + about.height, ui.t.type.caption, "left", ui.t.alpha.muted);
    } else {
      if (view.bestSummary) {
        ui.tag(canvas, "YOUR BEST", modeX, stakesY + 4, ui.t.color.accent, "left", ui.t.type.micro);
        ui.textBox(canvas, view.bestSummary.replace(/^YOUR BEST\s*·\s*/u, ""), modeX, stakesY + 28, 440,
          { size: ui.t.type.label, lineHeight: 20, alpha: ui.t.alpha.soft, maxLines: 2 });
      }
      if (!view.bossChoices && view.bounties && view.bounties.length > 0) {
        const bountyX = modeX + 470, bountyWidth = 210;
        ui.tag(canvas, "TODAY'S BOUNTIES", bountyX, stakesY + 4, ui.readable("#e0a326"), "left", ui.t.type.micro);
        view.bounties.slice(0, 3).forEach((bounty, index) => {
          const x = bountyX + index * (bountyWidth + 12);
          const label = ui.textBox(canvas, bounty.label, x, stakesY + 26, bountyWidth,
            { size: ui.t.type.micro, lineHeight: 16, alpha: bounty.done ? ui.t.alpha.muted : ui.t.alpha.soft, maxLines: 2 });
          ui.tag(canvas, bounty.detail, x, stakesY + 30 + label.height, bounty.done ? ui.readable("#2f9e6b") : ui.t.color.muted, "left", ui.t.type.micro);
        });
      } else if (!view.bossChoices && view.bountySummary) ui.tag(canvas, view.bountySummary, modeX + 1120, stakesY + 30, ui.t.color.muted, "right", ui.t.type.micro);
    }
    canvas.font = ui.font(ui.t.type.caption, true);
    const startWidth = Math.max(300, Math.round(canvas.measureText(view.startSummary).width) + 110);
    const startY = 722;
    context.enqueue({
      x: width / 2 - startWidth / 2, y: startY, w: startWidth, h: 58,
      label: "START", glyph: view.startGlyph, sub: view.startSummary.toUpperCase(), hero: true, ghost: true, size: 26,
      action: { type: "setup.start" },
    });
    if (view.practiceAvailable) context.enqueue({ x: width / 2 - startWidth / 2 - 274, y: startY, w: 254, h: 58,
      label: "PRACTICE LAB", sub: "BASELINE SWORD · NO REWARDS", glyph: "◎",
      action: { type: "tutorial.action", command: "open-practice" } });
    if (view.raceAvailable === true) {
      context.enqueue({ x: width / 2 + startWidth / 2 + 20, y: startY, w: 330, h: 58, label: "CREATE SEED-LOCKED RACE", sub: "SHARED SEED · UNRANKED", action: { type: "setup.start", race: true } });
    }
    backControl(context);
  }

  return { menu, setup };
}
