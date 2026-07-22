import type {
  ContinueScreenView, GameoverScreenView, PausedScreenView, ResultLogView,
  ScreenAction, ScreenRenderContext, WinScreenView,
} from "./contracts";
import { verticalMenu } from "./screen-primitives";

const clampValue = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

export function createPauseResultRenderers(context: ScreenRenderContext) {
  const { ui, width, height } = context;

  // source drawResultsTable (win screen's centred table)
  function resultLog(rows: readonly ResultLogView[], x: number, y: number, panelWidth: number): void {
    const { canvas } = context;
    canvas.fillStyle = ui.ink; canvas.font = ui.font(ui.t.type.label, true);
    canvas.textAlign = "left"; canvas.fillText("WAVE", x, y);
    canvas.textAlign = "right";
    canvas.fillText("TIME", x + 200, y); canvas.fillText("KILLS", x + 330, y); canvas.fillText("BEST TRICK", x + panelWidth, y);
    ui.divider(canvas, x, y + 8, panelWidth, ui.t.alpha.full);
    const visible = 8, maxOffset = Math.max(0, rows.length - visible);
    const offset = clampValue(Math.round(context.scroll / 26), 0, maxOffset);
    let rowY = y + 30;
    for (const row of rows.slice(offset, offset + visible)) {
      canvas.textAlign = "left"; ui.text(canvas, `${row.died ? "✗ " : ""}${row.wave}`, x, rowY, ui.t.type.body);
      canvas.textAlign = "right";
      ui.text(canvas, row.time, x + 200, rowY, ui.t.type.body);
      ui.text(canvas, String(row.kills), x + 330, rowY, ui.t.type.body);
      ui.text(canvas, row.peak, x + panelWidth, rowY, ui.t.type.body);
      rowY += 26;
    }
    canvas.textAlign = "left";
    if (maxOffset > 0) ui.scrollHint(canvas, width / 2, rowY + 6, offset > 0, offset < maxOffset);
  }

  // source drawWaveLogPanel (defeat screen's middle column) — scrollable
  function waveLogPanel(rows: readonly ResultLogView[], px: number, py: number, pw: number, ph: number): void {
    const { canvas } = context;
    ui.tag(canvas, "RUN LOG", px, py - 10, ui.t.color.accent, "left", ui.t.type.micro);
    canvas.textAlign = "left"; canvas.fillStyle = ui.ink; canvas.font = ui.font(ui.t.type.label, true); canvas.globalAlpha = 0.7;
    canvas.fillText("WAVE", px + 4, py + 12);
    canvas.textAlign = "right";
    canvas.fillText("TIME", px + pw - 250, py + 12); canvas.fillText("KILLS", px + pw - 120, py + 12); canvas.fillText("PEAK", px + pw - 4, py + 12);
    canvas.globalAlpha = 1; canvas.textAlign = "left";
    ui.divider(canvas, px, py + 20, pw, 0.4);
    if (rows.length === 0) { ui.text(canvas, "No waves cleared.", px + pw / 2, py + 60, ui.t.type.caption, "center", ui.t.alpha.muted); return; }
    const rowH = 32, top = py + 40, viewH = ph - 44;
    const maxScroll = Math.max(0, rows.length * rowH - viewH);
    const scroll = clampValue(context.scroll, 0, maxScroll);
    canvas.save(); canvas.beginPath(); canvas.rect(px, top - 8, pw, viewH + 16); canvas.clip();
    rows.forEach((row, index) => {
      const y = top + index * rowH - scroll;
      if (y < top - rowH || y > top + viewH) return;
      canvas.textAlign = "left"; canvas.fillStyle = row.died ? ui.t.color.danger : ui.ink; canvas.font = ui.font(ui.t.type.body, true);
      canvas.fillText((row.died ? "✗ " : "") + row.wave, px + 4, y);
      canvas.textAlign = "right"; canvas.fillStyle = ui.ink; canvas.font = ui.font(ui.t.type.body, false);
      canvas.fillText(row.time, px + pw - 250, y);
      canvas.fillText(String(row.kills), px + pw - 120, y);
      canvas.fillStyle = row.peakColor ?? ui.ink; canvas.font = ui.font(ui.t.type.body, true);
      canvas.fillText(row.peak, px + pw - 4, y);
      ui.divider(canvas, px, y + 9, pw, 0.06);
    });
    canvas.restore(); canvas.textAlign = "left";
    if (maxScroll > 0) ui.scrollHint(canvas, px + pw / 2, top + viewH + 16, scroll > 0, scroll < maxScroll);
  }

  // source drawArsenalCard + drawArsenalPanel (pause screen's middle column) — scrollable
  function arsenalCard(x: number, y: number, w: number, h: number, ability: PausedScreenView["abilities"][number]): void {
    const { canvas } = context;
    ui.card(canvas, x, y, w, h, false);
    ui.accentStrip(canvas, x, y, w, ability.accent);
    canvas.textAlign = "left"; canvas.textBaseline = "alphabetic";
    canvas.fillStyle = ui.ink; canvas.font = ui.font(ui.t.type.lead, true);
    const name = ability.label.length > 26 ? ability.label.slice(0, 25) + "…" : ability.label;
    canvas.fillText(name, x + 14, y + 26);
    if (ability.footer) ui.tag(canvas, ability.footer, x + w - 14, y + 24, ability.accent, "right", ui.t.type.micro);
    wrapText(ability.description ?? "", x + 14, y + 44, w - 28, 15, ui.t.type.micro, "rgba(40,42,54,0.85)");
  }

  function wrapText(text: string, x: number, y: number, maxW: number, lineHeight: number, size: number, color: string): void {
    const { canvas } = context;
    canvas.font = ui.font(size, false); canvas.textAlign = "center"; canvas.fillStyle = color;
    const words = text.split(" "); let line = "", yy = y;
    const cx = x + maxW / 2;
    for (const word of words) {
      const test = line ? line + " " + word : word;
      if (canvas.measureText(test).width > maxW && line) { canvas.fillText(line, cx, yy); line = word; yy += lineHeight; }
      else line = test;
    }
    if (line) canvas.fillText(line, cx, yy);
  }

  function arsenalPanel(abilities: PausedScreenView["abilities"], px: number, py: number, pw: number, ph: number): void {
    const { canvas } = context;
    ui.tag(canvas, "YOUR ARSENAL", px, py - 10, ui.t.color.accent, "left", ui.t.type.micro);
    if (abilities.length === 0) {
      ui.text(canvas, "No abilities yet — they drop between waves.", px + pw / 2, py + 46, ui.t.type.caption, "center", ui.t.alpha.muted);
      return;
    }
    const cardH = 64, gap = 8, rowH = cardH + gap;
    const maxScroll = Math.max(0, abilities.length * rowH - ph);
    const scroll = clampValue(context.scroll, 0, maxScroll);
    canvas.save(); canvas.beginPath(); canvas.rect(px, py - 4, pw, ph + 8); canvas.clip();
    abilities.forEach((ability, index) => {
      const y = py + index * rowH - scroll;
      if (y + cardH < py - 4 || y > py + ph) return;
      arsenalCard(px, y, pw, cardH, ability);
    });
    canvas.restore();
    if (maxScroll > 0) ui.scrollHint(canvas, px + pw / 2, py + ph + 16, scroll > 0, scroll < maxScroll);
  }

  // source drawProgressRow + drawRunProgressPanel (pause/defeat right column)
  function progressRow(px: number, y: number, pw: number, row: PausedScreenView["progress"][number]): void {
    const { canvas } = context;
    const barColor = row.barColor ?? ui.t.color.accent;
    canvas.textAlign = "left"; canvas.fillStyle = row.labelColor ?? ui.ink; canvas.font = ui.font(ui.t.type.caption, row.done === true);
    canvas.fillText(row.label.length > 40 ? row.label.slice(0, 39) + "…" : row.label, px, y + 12);
    const bw = pw - 66;
    canvas.globalAlpha = 0.15; canvas.fillStyle = ui.ink; canvas.fillRect(px, y + 20, bw, 4); canvas.globalAlpha = 1;
    canvas.fillStyle = barColor;
    canvas.fillRect(px, y + 20, bw * clampValue(row.goal ? row.current / row.goal : (row.done ? 1 : 0), 0, 1), 4);
    canvas.textAlign = "right"; canvas.fillStyle = barColor; canvas.font = ui.font(10, true);
    canvas.fillText(row.detail ?? "", px + pw, y + 14); canvas.textAlign = "left";
  }

  function runProgressPanel(rows: PausedScreenView["progress"], px: number, py: number, pw: number): void {
    const { canvas } = context;
    let y = py;
    ui.tag(canvas, "DAILY CHALLENGES", px, y - 10, ui.t.color.accent, "left", ui.t.type.micro);
    const dailies = rows.filter((row) => row.kind !== "achievement");
    const achievements = rows.filter((row) => row.kind === "achievement");
    for (const row of dailies) { progressRow(px, y, pw, row); y += 38; }
    y += 16;
    ui.tag(canvas, "ACHIEVEMENTS", px, y - 10, ui.t.color.accent, "left", ui.t.type.micro);
    for (const row of achievements) { progressRow(px, y, pw, row); y += 38; }
    if (achievements.length === 0) ui.text(canvas, "Keep fighting to make progress.", px + pw / 2, y + 20, ui.t.type.caption, "center", ui.t.alpha.muted);
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
    // ---- middle column: the player's arsenal (scrollable) ----
    arsenalPanel(view.abilities, 400, 210, 640, 600);
    // ---- right column: this run's daily + achievement progress ----
    runProgressPanel(view.progress, 1090, 210, 430);
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
    canvas.textAlign = "left"; canvas.fillStyle = "#0f9fb0"; canvas.font = ui.font(ui.t.type.h2, true);
    canvas.fillText(`+${String(view.earned)}`, 80, 236);
    canvas.fillStyle = ui.ink; canvas.font = ui.font(ui.t.type.caption, false); canvas.globalAlpha = 0.7;
    canvas.fillText(`coins  ·  ${String(view.coins)} total`, 80, 258); canvas.globalAlpha = 1;
    const actions: { label: string; action: ScreenAction }[] = [{ label: "RETRY", action: { type: "results.retry" } }];
    if (view.replayAvailable) actions.push({ label: "▶  WATCH REPLAY", action: { type: "results.watchReplay" } });
    actions.push({ label: "MAIN MENU", action: { type: "navigate", to: "menu" } });
    verticalMenu(context, actions, 220, 320);
    // ---- middle column: the per-wave run log (scrollable) ----
    waveLogPanel(view.log, 400, 210, 640, 600);
    // ---- right column: this run's daily + achievement progress ----
    runProgressPanel(view.progress, 1090, 210, 430);
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
