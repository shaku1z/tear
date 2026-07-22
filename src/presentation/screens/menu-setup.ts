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
    const gradient = canvas.createLinearGradient(viewport.x, 0, 800, 0);
    gradient.addColorStop(0, "rgba(6,7,12,0.90)");
    gradient.addColorStop(0.56, "rgba(6,7,12,0.60)");
    gradient.addColorStop(1, "rgba(6,7,12,0)");
    canvas.fillStyle = gradient; canvas.fillRect(viewport.x, viewport.y, 800 - viewport.x, viewport.h);
    canvas.globalAlpha = 0.34; canvas.strokeStyle = "#f1eff9"; canvas.lineWidth = 1;
    canvas.beginPath(); canvas.moveTo(railX - 18, viewport.y); canvas.lineTo(railX - 18, viewport.y + viewport.h); canvas.stroke(); canvas.globalAlpha = 1;
    canvas.fillStyle = "#f1eff9"; canvas.font = `${String(ui.t.type.wordmark)}px ${ui.t.font.display}`;
    canvas.textAlign = "left"; canvas.textBaseline = "alphabetic"; canvas.fillText("T E A R", railX, wordmarkY);
    const slash = context.reducedMotion ? 1 : Math.min(1, Math.max(0, context.enterAmount * 1.3));
    canvas.save(); canvas.globalAlpha = 0.45 + slash * 0.45; canvas.strokeStyle = ui.t.color.accent; canvas.lineWidth = 3;
    canvas.beginPath(); canvas.moveTo(railX + 28, wordmarkY + 14); canvas.lineTo(railX + 250 * slash, wordmarkY - 70 * slash); canvas.stroke();
    canvas.globalAlpha = 0.22; canvas.lineWidth = 1;
    canvas.beginPath(); canvas.moveTo(railX + 18, wordmarkY + 20); canvas.lineTo(railX + 272 * slash, wordmarkY - 66 * slash); canvas.stroke(); canvas.restore();
    ui.text(canvas, "a momentum-blade survival game", railX, wordmarkY + 34, ui.t.type.caption, "left", ui.t.alpha.muted);
    if (view.biome) ui.tag(canvas, `◈ NOW SHOWING — ${view.biome.toUpperCase()}`, railX, wordmarkY + 62, ui.t.color.accent, "left", ui.t.type.micro);
    ui.text(canvas, "cut clean · keep moving · chase the multiplier", railX, height - 46, ui.t.type.micro, "left", ui.t.alpha.faint);

    // A quiet run dossier balances the rail without turning the live attract scene
    // into a dashboard. It makes the current selection legible before PLAY and gives
    // wide canvases an intentional second anchor.
    const dossierX = width - 318, dossierY = 102, dossierWidth = 238, dossierHeight = 142;
    canvas.fillStyle = "rgba(6,7,12,0.46)"; canvas.fillRect(dossierX, dossierY, dossierWidth, dossierHeight);
    canvas.strokeStyle = "rgba(241,239,249,0.28)"; canvas.lineWidth = 1; canvas.strokeRect(dossierX, dossierY, dossierWidth, dossierHeight);
    canvas.fillStyle = ui.t.color.accent; canvas.fillRect(dossierX, dossierY, 3, dossierHeight);
    canvas.font = `${String(ui.t.font.displayWeight)} 13px ${ui.t.font.display}`;
    canvas.fillStyle = ui.t.color.accent; canvas.textAlign = "left"; canvas.fillText("NEXT CUT // RUN DOSSIER", dossierX + 18, dossierY + 25);
    canvas.font = `${String(ui.t.font.displayWeight)} 24px ${ui.t.font.display}`;
    canvas.fillStyle = "#f1eff9"; canvas.fillText(view.modeLabel.toUpperCase(), dossierX + 18, dossierY + 61);
    canvas.font = `${String(ui.t.font.bodyWeight)} 11px ${ui.t.font.body}`;
    canvas.fillStyle = "rgba(241,239,249,0.66)";
    canvas.fillText(`DIFFICULTY  ${view.difficultyLabel.toUpperCase()}`, dossierX + 18, dossierY + 88);
    canvas.fillText(`FIELD       ${(view.biome ?? "UNCHARTED").toUpperCase()}`, dossierX + 18, dossierY + 110);
    canvas.fillStyle = "rgba(241,239,249,0.22)"; canvas.fillRect(dossierX + 18, dossierY + 124, dossierWidth - 36, 1);

    context.enqueue({
      x: railX, y: 240, w: railWidth, h: 58, label: view.playerName.toUpperCase(),
      sub: `◆ ${String(view.coins)}    ⬡ ${String(view.shards)}    ★ ${String(view.unlocked)}`,
      glyph: view.signedIn ? "●" : "○", ghost: true,
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
    const columns = [
      { title: "MODE", x: 240, width: 380, choices: view.modes, action: "setup.selectMode" as const, rowHeight: 66, cardHeight: 58 },
      { title: "DIFFICULTY", x: 640, width: 360, choices: view.showDifficulty ? view.difficulties : [], action: "setup.selectDifficulty" as const, rowHeight: 66, cardHeight: 58 },
      { title: "WEAPON", x: 1020, width: 340, choices: view.weapons, action: "setup.selectWeapon" as const, rowHeight: 78, cardHeight: 70 },
    ];
    columns.forEach((column) => {
      ui.sectionLabel(canvas, column.title, column.x, 150, column.width);
      column.choices.forEach((choice, index) => { context.enqueue({
        x: column.x, y: 168 + index * column.rowHeight, w: column.width, h: column.cardHeight,
        label: choice.label.toUpperCase(), glyph: choice.glyph, sub: choice.sub ?? choice.description,
        selected: choice.selected, enabled: choice.enabled,
        action: { type: column.action, id: choice.id },
      }); });
    });
    if (!view.showDifficulty) ui.text(canvas, "difficulty fixed for this training mode", 820, 250, ui.t.type.body, "center", ui.t.alpha.muted);
    if (view.bestSummary) ui.tag(canvas, view.bestSummary, 240, height - 210, ui.t.color.muted, "left", ui.t.type.micro);
    if (view.bossChoices && view.bossChoices.length > 0) {
      ui.sectionLabel(canvas, "BOSS TEST", 710, height - 234, 650);
      const gap = 8, choiceWidth = (650 - gap * (view.bossChoices.length - 1)) / view.bossChoices.length;
      view.bossChoices.forEach((choice, index) => {
        context.enqueue({
          x: 710 + index * (choiceWidth + gap), y: height - 210, w: choiceWidth, h: 34,
          label: choice.label, selected: choice.selected, size: ui.t.type.micro,
          action: { type: "setup.selectBoss", id: choice.id },
        });
      });
    } else if (view.bounties && view.bounties.length > 0) {
      ui.sectionLabel(canvas, "TODAY'S BOUNTIES", 710, height - 234, 650);
      view.bounties.slice(0, 3).forEach((bounty, index) => {
        const x = 710 + index * 218;
        ui.text(canvas, bounty.label, x, height - 202, ui.t.type.micro, "left", bounty.done ? ui.t.alpha.faint : ui.t.alpha.soft);
        ui.tag(canvas, bounty.detail, x, height - 180, bounty.done ? ui.t.color.muted : ui.t.color.accent, "left", ui.t.type.micro);
      });
    } else if (view.bountySummary) ui.tag(canvas, view.bountySummary, width - 240, height - 210, ui.t.color.muted, "right", ui.t.type.micro);
    context.enqueue({
      x: width / 2 - 210, y: height - 174, w: 420, h: 66,
      label: "BEGIN RUN", sub: view.startSummary.toUpperCase(), hero: true,
      action: { type: "setup.start" },
    });
    backControl(context);
  }

  return { menu, setup };
}
