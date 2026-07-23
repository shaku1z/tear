import type { MenuScreenView, ScreenRenderContext, SetupScreenView } from "./contracts";
import { backControl } from "./screen-primitives";

export function createMenuSetupRenderers(context: ScreenRenderContext) {
  const { ui, width, height } = context;

  function menu(view: MenuScreenView): void {
    const { canvas } = context;
    const railX = 100;
    const railWidth = 320;
    const wordmarkY = 150;
    const viewport = context.screenRectangle;
    const gradient = canvas.createLinearGradient(0, 0, 800, 0);
    gradient.addColorStop(0, "rgba(6,7,12,0.90)");
    gradient.addColorStop(0.56, "rgba(6,7,12,0.60)");
    gradient.addColorStop(1, "rgba(6,7,12,0)");
    canvas.fillStyle = gradient; canvas.fillRect(viewport.x, viewport.y, 800 - viewport.x, viewport.h);
    ui.wordmark(canvas, railX, wordmarkY, context.time, context.reducedMotion);
    ui.text(canvas, "a momentum-blade survival game", railX, wordmarkY + 34, ui.t.type.caption, "left", ui.t.alpha.muted);
    if (view.biome) ui.tag(canvas, `◈ NOW SHOWING — ${view.biome.toUpperCase()}`, railX, wordmarkY + 62, ui.t.color.accent, "left", ui.t.type.micro);
    ui.text(canvas, "cut clean · keep moving · chase the multiplier", railX, height - 46, ui.t.type.micro, "left", ui.t.alpha.faint);

    context.enqueue({
      x: railX, y: 240, w: railWidth, h: 58, label: view.playerName.toUpperCase(),
      sub: `◆ ${String(view.coins)}    ⬡ ${String(view.shards)}    ★ ${String(view.unlocked)}`,
      dot: view.signedIn ? "#2f9e6b" : "#8a93a6", ghost: true,
      action: { type: "navigate", to: "profile", resetScroll: true, tab: "bests" },
    });
    context.enqueue({
      x: railX, y: 318, w: railWidth, h: 86, label: "PLAY", glyph: "▶", hero: true, ghost: true,
      sub: `${view.modeLabel} · ${view.difficultyLabel}`.toUpperCase(), action: { type: "navigate", to: "setup" },
    });
    const rail = [
      ["◆", "SHOP", "shop"], ["★", "ACHIEVEMENTS", "achievements"],
      ["☰", "LEADERBOARDS", "leaderboards"], ["▤", "CODEX", "codex"], ["⚙", "SETTINGS", "settings"],
    ] as const;
    rail.forEach(([glyph, label, to], index) => { context.enqueue({
      x: railX, y: 426 + index * 61, w: railWidth, h: 52, glyph, label, ghost: true,
      action: { type: "navigate", to, resetScroll: to !== "settings" },
    }); });
    if (view.pendingFinale) {
      ui.tag(canvas, "◇ SAVED ADVENTURE CLEAR", railX + railWidth + 34, height - 146, ui.t.color.accent, "left", ui.t.type.micro);
      ui.text(canvas, "The Final Cut was interrupted.", railX + railWidth + 34, height - 118, ui.t.type.caption, "left", ui.t.alpha.soft);
      context.enqueue({ x: railX + railWidth + 34, y: height - 102, w: 196, h: 44, label: "RESUME FINAL CUT", action: { type: "menu.resumeFinale" } });
      context.enqueue({ x: railX + railWidth + 242, y: height - 102, w: 174, h: 44, label: "CLAIM RESULTS", action: { type: "menu.claimFinale" } });
    }
  }

  function setup(view: SetupScreenView): void {
    const { canvas } = context;
    ui.header(canvas, "SELECT RUN", undefined, context.enterAmount);
    const top = 150, rowTop = 168;
    const modeX = 240, modeWidth = 380, difficultyX = 640, difficultyWidth = 360, weaponX = 1020, weaponWidth = 340;
    ui.sectionLabel(canvas, "MODE", modeX, top, modeWidth);
    const publicModes = view.modes.filter((choice) => choice.debug !== true);
    publicModes.forEach((choice, index) => { context.enqueue({
      x: modeX, y: rowTop + index * 60, w: modeWidth, h: 54, size: 17,
      label: choice.label.toUpperCase(), glyph: choice.glyph, sub: choice.sub,
      selected: choice.selected, enabled: choice.enabled,
      action: { type: "setup.selectMode", id: choice.id },
    }); });
    const debugModes = view.modes.filter((choice) => choice.debug === true);
    if (debugModes.length > 0) {
      const debugY = rowTop + publicModes.length * 60 + 12;
      ui.sectionLabel(canvas, "DEV", modeX, debugY, modeWidth, ui.t.color.muted);
      debugModes.forEach((choice, index) => { context.enqueue({
        x: modeX, y: debugY + 12 + index * 40, w: modeWidth, h: 34, size: 12,
        label: choice.label.toUpperCase(), selected: choice.selected, enabled: choice.enabled,
        action: { type: "setup.selectMode", id: choice.id },
      }); });
    }

    ui.sectionLabel(canvas, "DIFFICULTY", difficultyX, top, difficultyWidth);
    if (view.showDifficulty) view.difficulties.forEach((choice, index) => {
      const heat = ["#2f9e6b", "#13c4d6", "#e0a326", ui.t.color.danger, "#b06cff"][index] ?? ui.t.color.accent;
      context.enqueue({
        x: difficultyX, y: rowTop + index * 66, w: difficultyWidth, h: 58, size: 17,
        label: choice.label.toUpperCase(), sub: choice.sub,
        pips: { n: 5, filled: index + 1, color: heat },
        selected: choice.selected, enabled: choice.enabled,
        action: { type: "setup.selectDifficulty", id: choice.id },
      });
    });
    else {
      ui.text(canvas, "set by the mode —", difficultyX + difficultyWidth / 2, rowTop + 120, ui.t.type.caption, "center", ui.t.alpha.muted);
      ui.text(canvas, "training runs tune themselves", difficultyX + difficultyWidth / 2, rowTop + 144, ui.t.type.caption, "center", ui.t.alpha.muted);
    }

    ui.sectionLabel(canvas, "WEAPON", weaponX, top, weaponWidth);
    view.weapons.forEach((choice, index) => { context.enqueue({
      x: weaponX, y: rowTop + index * 78, w: weaponWidth, h: 70, size: 16,
      label: choice.label.toUpperCase(), glyph: choice.glyph, sub: choice.sub,
      selected: choice.selected, enabled: choice.enabled,
      action: { type: "setup.selectWeapon", id: choice.id },
    }); });

    const blurbY = 588;
    const foot = (x: number, w: number, text?: string): void => {
      if (!text) return;
      ui.divider(canvas, x, blurbY - 16, w, 0.1);
      ui.wrappedText(canvas, text, x, blurbY, w - 8, 20, ui.t.type.caption, "left", ui.t.alpha.soft);
    };
    foot(modeX, modeWidth, view.modes.find((choice) => choice.selected)?.description);
    foot(difficultyX, difficultyWidth, view.showDifficulty ? view.difficulties.find((choice) => choice.selected)?.description : undefined);
    foot(weaponX, weaponWidth, view.weapons.find((choice) => choice.selected)?.description);

    const stakesY = 668;
    ui.divider(canvas, modeX, stakesY - 12, 1120, 0.14);
    if (view.bestSummary) {
      ui.tag(canvas, "YOUR BEST", modeX, stakesY + 6, ui.t.color.accent, "left", ui.t.type.micro);
      ui.text(canvas, view.bestSummary.replace(/^YOUR BEST\s*·\s*/u, ""), modeX, stakesY + 30, ui.t.type.label, "left", ui.t.alpha.soft);
    }
    if (view.bossChoices && view.bossChoices.length > 0) {
      ui.sectionLabel(canvas, "BOSS TEST", 710, stakesY - 18, 650);
      const gap = 8, choiceWidth = (650 - gap * (view.bossChoices.length - 1)) / view.bossChoices.length;
      view.bossChoices.forEach((choice, index) => {
        context.enqueue({
          x: 710 + index * (choiceWidth + gap), y: stakesY - 2, w: choiceWidth, h: 34,
          label: choice.label, selected: choice.selected, size: ui.t.type.micro,
          action: { type: "setup.selectBoss", id: choice.id },
        });
      });
    } else if (view.bounties && view.bounties.length > 0) {
      ui.tag(canvas, "TODAY'S BOUNTIES", modeX + 470, stakesY + 6, "#e0a326", "left", ui.t.type.micro);
      view.bounties.slice(0, 3).forEach((bounty, index) => {
        const x = modeX + 470 + index * 224;
        ui.text(canvas, bounty.label, x, stakesY + 30, ui.t.type.micro, "left", bounty.done ? ui.t.alpha.faint : ui.t.alpha.soft);
        ui.tag(canvas, bounty.detail, x, stakesY + 48, bounty.done ? "#2f9e6b" : ui.t.color.muted, "left", ui.t.type.micro);
      });
    } else if (view.bountySummary) ui.tag(canvas, view.bountySummary, width - 240, stakesY + 30, ui.t.color.muted, "right", ui.t.type.micro);
    canvas.font = ui.font(ui.t.type.caption, true);
    const startWidth = Math.max(300, Math.round(canvas.measureText(view.startSummary).width) + 100);
    context.enqueue({
      x: width / 2 - startWidth / 2, y: 726, w: startWidth, h: 62,
      label: "START", glyph: "▶", sub: view.startSummary.toUpperCase(), hero: true, ghost: true, size: 26,
      action: { type: "setup.start" },
    });
    backControl(context);
  }

  return { menu, setup };
}
