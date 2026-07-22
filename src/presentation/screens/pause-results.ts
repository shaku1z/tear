import type {
  ContinueScreenView, GameoverScreenView, PausedScreenView, ResultLogView,
  ScreenAction, ScreenRenderContext, WinScreenView,
} from "./contracts";
import { verticalMenu } from "./screen-primitives";

export function createPauseResultRenderers(context: ScreenRenderContext) {
  const { ui, width, height } = context;

  function resultLog(rows: readonly ResultLogView[], x: number, y: number, panelWidth: number): void {
    const { canvas } = context;
    ui.tag(canvas, "WAVE", x, y, undefined, "left", ui.t.type.label);
    ui.tag(canvas, "TIME", x + 200, y, undefined, "right", ui.t.type.label);
    ui.tag(canvas, "KILLS", x + 330, y, undefined, "right", ui.t.type.label);
    ui.tag(canvas, "BEST TRICK", x + panelWidth, y, undefined, "right", ui.t.type.label);
    ui.divider(canvas, x, y + 8, panelWidth, ui.t.alpha.full);
    rows.slice(Math.max(0, Math.round(context.scroll / 26)), Math.max(0, Math.round(context.scroll / 26)) + 8).forEach((row, index) => {
      const rowY = y + 38 + index * 26;
      ui.text(canvas, `${row.died ? "✗ " : ""}${row.wave}`, x, rowY, ui.t.type.body);
      ui.text(canvas, row.time, x + 200, rowY, ui.t.type.body, "right");
      ui.text(canvas, String(row.kills), x + 330, rowY, ui.t.type.body, "right");
      ui.text(canvas, row.peak, x + panelWidth, rowY, ui.t.type.body, "right");
    });
  }

  function paused(view: PausedScreenView): void {
    const { canvas } = context;
    ui.dim(canvas, width, height, 0.86);
    ui.title(canvas, "PAUSED", width / 2, 78, ui.t.type.display);
    if (view.runSummary) ui.text(canvas, view.runSummary, width / 2, 110, ui.t.type.body, "center", ui.t.alpha.soft);
    verticalMenu(context, [
      { label: "RESUME", action: { type: "run.resume" } },
      { label: "RESTART", action: { type: "run.restart" } },
      { label: "SETTINGS", action: { type: "navigate", to: "settings" } },
      { label: "MAIN MENU", action: { type: "navigate", to: "confirmquit" } },
    ], 220, 210);
    ui.sectionLabel(canvas, "ARSENAL", 400, 190, 640);
    if (view.abilities.length === 0) {
      ui.text(canvas, "No abilities yet — upgrades appear between waves.", 720, 286, ui.t.type.caption, "center", ui.t.alpha.muted);
      ui.tag(canvas, "SURVIVE THE WAVE · CHOOSE YOUR BUILD", 720, 318, ui.t.color.accent, "center", ui.t.type.micro);
    }
    view.abilities.slice(0, 7).forEach((ability, index) => {
      const y = 218 + index * 76;
      ui.card(canvas, 400, y, 640, 64, false);
      if (ability.accent) ui.accentStrip(canvas, 400, y, 640, ability.accent, 4);
      ui.displayText(canvas, ability.label, 420, y + 26, ui.t.type.lead);
      if (ability.description) ui.text(canvas, ability.description, 420, y + 48, ui.t.type.micro, "left", ui.t.alpha.soft);
      ui.tag(canvas, ability.footer ?? (ability.tier ? `TIER ${String(ability.tier)}` : (ability.owned ? `×${String(ability.owned)}` : "")), 1020, y + 26, ability.accent, "right", ui.t.type.micro);
    });
    ui.sectionLabel(canvas, "RUN PROGRESS", 1090, 190, 430);
    progressRows(view.progress, 1100, 234, 400);
  }

  function confirmquit(): void {
    const { canvas } = context;
    ui.dim(canvas, width, height, 0.85);
    ui.title(canvas, "QUIT RUN?", width / 2, 250, ui.t.type.display);
    ui.text(canvas, "Your progress (cleared waves & score) is saved to High Scores.", width / 2, 300, ui.t.type.body, "center", ui.t.alpha.soft);
    context.enqueue({ x: width / 2 - 230, y: 350, w: 200, h: 56, label: "QUIT", action: { type: "run.quit" } });
    context.enqueue({ x: width / 2 + 30, y: 350, w: 200, h: 56, label: "CANCEL", action: { type: "navigate", to: "paused" } });
  }

  function continueRun(view: ContinueScreenView): void {
    const { canvas } = context;
    ui.dim(canvas, width, height, 0.85);
    ui.title(canvas, "YOU FELL", width / 2, 220, ui.t.type.display);
    ui.text(canvas, "Watch a short ad to revive with 35% health and keep this run going.", width / 2, 290, ui.t.type.body, "center", ui.t.alpha.soft);
    ui.text(canvas, `Offer lapses in ${String(view.requesting ? 0 : Math.max(0, Math.ceil(view.seconds)))}s`, width / 2, 322, ui.t.type.caption, "center", ui.t.alpha.muted);
    context.enqueue({ x: width / 2 - 250, y: 360, w: 300, h: 60, label: "REVIVE  ▶ WATCH AD", enabled: !view.requesting, action: { type: "continue.revive" } });
    context.enqueue({ x: width / 2 + 80, y: 360, w: 170, h: 60, label: "GIVE UP", enabled: !view.requesting, action: { type: "continue.giveUp" } });
  }

  function gameover(view: GameoverScreenView): void {
    const { canvas } = context;
    ui.dim(canvas, width, height, 0.9);
    ui.title(canvas, "DEFEATED", width / 2, 74, ui.t.type.display);
    ui.text(canvas, view.summary, width / 2, 106, ui.t.type.lead, "center");
    if (view.isNew) ui.tag(canvas, "★ NEW BEST", width / 2, 130, ui.t.color.accent, "center", ui.t.type.caption);
    else if (view.best) ui.text(canvas, view.best, width / 2, 130, ui.t.type.caption, "center", ui.t.alpha.muted);
    ui.tag(canvas, "REWARDS", 80, 200, ui.t.color.accent, "left", ui.t.type.micro);
    ui.displayText(canvas, `+${String(view.earned)}`, 80, 236, ui.t.type.h2);
    ui.text(canvas, `coins  ·  ${String(view.coins)} total`, 80, 258, ui.t.type.caption, "left", ui.t.alpha.soft);
    const actions: { label: string; action: ScreenAction }[] = [{ label: "RETRY", action: { type: "results.retry" } }];
    if (view.replayAvailable) actions.push({ label: "▶  WATCH REPLAY", action: { type: "results.watchReplay" } });
    actions.push({ label: "MAIN MENU", action: { type: "navigate", to: "menu" } });
    verticalMenu(context, actions, 220, 320);
    resultLog(view.log, 430, 230, 540);
    ui.sectionLabel(canvas, "RUN PROGRESS", 1090, 190, 430);
    progressRows(view.progress, 1100, 234, 400);
  }

  function progressRows(rows: readonly { readonly label: string; readonly current: number; readonly goal: number; readonly detail?: string; readonly done?: boolean }[], x: number, startY: number, barWidth: number): void {
    const { canvas } = context;
    rows.slice(0, 7).forEach((progress, index) => {
      const y = startY + index * 72;
      ui.text(canvas, progress.label, x, y, ui.t.type.label);
      ui.bar(canvas, x, y + 12, barWidth, 7, progress.goal > 0 ? progress.current / progress.goal : 0, progress.done ? ui.t.color.accent : undefined);
      if (progress.detail) ui.tag(canvas, progress.detail, x + barWidth, y, ui.t.color.muted, "right", ui.t.type.micro);
    });
  }

  function win(view: WinScreenView): void {
    const { canvas } = context;
    if (view.campaign) {
      ui.finalReward(canvas, {
        amount: context.enterAmount, label: "ADVENTURE COMPLETE", title: "THE WORLD, RESTORED",
        sigil: "◇", color: ui.t.color.accent,
        reward: `${String(view.score)} PTS  ·  ${view.time}${view.isNew ? "  ·  NEW BEST" : ""}`,
        detail: `+${String(view.earned)} COINS  ·  ${String(view.coins)} TOTAL`,
      });
      verticalMenu(context, [
        { label: "DESCEND AGAIN", action: { type: "results.descendAgain" } },
        { label: "MAIN MENU", action: { type: "navigate", to: "menu" } },
      ], width / 2, height / 2 + 155);
      return;
    }
    ui.dim(canvas, width, height, 0.92);
    ui.title(canvas, "VICTORY", width / 2, 110, ui.t.type.display);
    ui.text(canvas, `boss down!   ·   ${String(view.score)} pts   ·   ${view.time}`, width / 2, 152, ui.t.type.lead, "center");
    if (view.isNew) ui.title(canvas, "NEW BEST!", width / 2, 184, ui.t.type.title);
    ui.text(canvas, `+${String(view.earned)} coins  (${String(view.coins)} total)`, width / 2, 210, ui.t.type.body, "center", ui.t.alpha.soft);
    resultLog(view.log, width / 2 - 270, 250, 540);
    verticalMenu(context, [
      { label: "PLAY AGAIN", action: { type: "results.retry" } },
      { label: "MAIN MENU", action: { type: "navigate", to: "menu" } },
    ], width / 2, 560, 260);
  }

  return { paused, confirmquit, continue: continueRun, gameover, win };
}
