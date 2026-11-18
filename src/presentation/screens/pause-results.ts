import type {
  ConfirmQuitScreenView,
  ContinueScreenView,
  GameoverScreenView,
  PausedScreenView,
  ScreenAction,
  ScreenRenderContext,
  WinScreenView,
} from "./contracts";
import { wrapSpaceSeparated } from "../ui-text-fit";
import { actionRow, overlayHeader, overlayLayout, tabs, verticalMenu, type OverlayLayout } from "./screen-primitives";
import { arsenalPanel, panelTag, runProgressPanel, waveLogPanel } from "./run-overlay-panels";
import { LESSON_TEACHING, countedLessons } from "../../gameplay/training/training-exercises";
import { PRACTICE_TABS, practiceTabDefinition, type PracticeTab } from "../../gameplay/training/practice-tabs";

const clampValue = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

export function createPauseResultRenderers(context: ScreenRenderContext) {
  const { ui, width, height } = context;

  function wrapText(
    text: string,
    x: number,
    y: number,
    maxW: number,
    lineHeight: number,
    size: number,
    color: string,
  ): void {
    const { canvas } = context;
    canvas.font = ui.font(size, false);
    canvas.textAlign = "center";
    canvas.fillStyle = color;
    const lines = wrapSpaceSeparated((value) => canvas.measureText(value).width, text, maxW);
    const cx = x + maxW / 2;
    let lineY = y;
    lines.forEach((line, index) => {
      if (index > 0) lineY += lineHeight;
      canvas.fillText(line, cx, lineY);
    });
  }

  function tutorialPaused(session: NonNullable<PausedScreenView["tutorial"]>): void {
    const { canvas } = context;
    ui.dim(canvas, width, height, 0.9);
    const unfinished = session.unfinished === true && session.phase === "free-practice";
    const lab = session.practiceOnly === true,
      tab = lab ? practiceTabDefinition(session.practiceTab ?? "lessons") : undefined,
      annexes = tab?.id === "weapons",
      catalog = tab?.id === "enemies",
      bosses = tab?.id === "bosses",
      complete = (session.courseCompleted || lab) && session.phase === "free-practice",
      current = session.lessons.find((lesson) => lesson.current);
    // Geometry comes from the shared overlay pattern; compact density (phone) tightens gaps.
    const compact = ui.density.compact,
      header = overlayLayout(context, { subtitleLines: 1 }),
      titleY = header.titleY,
      top = header.bodyTop;
    ui.title(
      canvas,
      lab ? "DRILLS" : complete || unfinished ? "TRAINING COMPLETE" : "TUTORIAL",
      width / 2,
      titleY,
      ui.t.type.display,
    );
    const activeTitle = session.bossPractice
      ? `${session.bossPractice.bossId.toUpperCase()} · PHASE ${String(session.bossPractice.phase)}`
      : session.enemyPractice
        ? `${session.enemyPractice.id.toUpperCase()} ENCOUNTER`
        : session.annex
          ? `${session.annex.id.toUpperCase()} ANNEX`
          : (current?.title ?? "");
    ui.text(
      canvas,
      unfinished
        ? "Some lessons were skipped. Replay them below to finish the course."
        : complete
          ? (tab?.subtitle ?? "Every technique learned. Pick your next step.")
          : `${activeTitle} · ${String(session.progress[0])} of ${String(session.progress[1])}`,
      width / 2,
      header.subtitleY,
      ui.t.type.caption,
      "center",
      ui.t.alpha.soft,
    );
    const learned = session.lessons.filter((lesson) => lesson.completed && lesson.id !== "ready").length;
    const drill =
      session.annex !== undefined || session.enemyPractice !== undefined || session.bossPractice !== undefined;
    const exercise = current?.canPractice === true || drill;
    // The finished course leads into a real run; a course in progress can skip a lesson
    // (it stays unfinished and is listed for replay), never earn it.
    const courseEnd = (complete || unfinished) && !lab;
    const menu: { label: string; action: ScreenAction }[] = [
      ...(courseEnd ? [{ label: "START A RUN", action: { type: "run.quit", next: "setup" } as const }] : []),
      {
        label: complete || unfinished ? "KEEP PRACTICING" : "RESUME",
        action: { type: "run.resume" },
      },
      ...(exercise
        ? [{ label: "RESTART LESSON", action: { type: "tutorial.action", command: "restart" } as const }]
        : []),
      ...(session.coach?.available && current?.canPractice && !drill
        ? [{ label: "SHOW DEMO", action: { type: "tutorial.action", command: "demo" } as const }]
        : []),
      ...(current?.canPractice && session.phase !== "free-practice" && !drill
        ? [
            {
              label: "SKIP LESSON",
              action: {
                type: "tutorial.action",
                command: session.coach?.adaptive?.assistOffered ? "assist" : "skip",
              } as const,
            },
          ]
        : []),
      { label: "SETTINGS", action: { type: "navigate", to: "settings" } },
      { label: "MAIN MENU", action: { type: "navigate", to: "confirmquit" } },
    ];
    const menuGap = compact ? 4 : 8,
      menuH = Math.max(
        ui.t.type.micro + 12,
        Math.min(ui.t.metric.btnH, (header.bodyBottom - top) / menu.length - menuGap),
      );
    menu.forEach((item, index) => {
      context.enqueue({
        x: width * 0.06,
        y: top + index * (menuH + menuGap),
        w: width * 0.29,
        h: menuH,
        label: item.label,
        action: item.action,
        size: ui.t.type.caption,
      });
    });
    const panelX = width * 0.39,
      panelW = width * 0.54,
      rowTop = top + (compact ? 38 : 45),
      helpH = compact ? (catalog ? 70 : 90) : 130;
    if (tab) drillTabs(tab.id, panelX, top, panelW, rowTop - top - (compact ? 6 : 10));
    else {
      ui.tag(
        canvas,
        complete ? "PRACTICE A TECHNIQUE" : "LESSONS",
        panelX,
        top,
        ui.t.color.accent,
        "left",
        ui.t.type.micro,
      );
      ui.text(
        canvas,
        `${String(learned)} of ${String(countedLessons(session))} learned · replay any lesson you have reached`,
        panelX,
        top + 21,
        ui.t.type.micro,
        "left",
        ui.t.alpha.soft,
      );
    }
    const exercises = bosses
      ? (session.bossCatalog ?? []).map((boss) => ({
          ...boss,
          current: session.bossPractice?.bossId === boss.bossId && session.bossPractice.phase === boss.phase,
          completed: false,
          reached: true,
        }))
      : catalog
        ? (session.enemyCatalog ?? []).map((enemy) => ({
            ...enemy,
            current: session.enemyPractice?.id === enemy.id,
            completed: false,
            reached: true,
          }))
        : annexes
          ? (session.annexes ?? []).map((annex) => ({ ...annex, completed: false, reached: true, canPractice: true }))
          : session.lessons.filter((lesson) => lesson.id !== "ready" && (lab || complete || lesson.reached));
    const rows = bosses ? (compact ? 3 : 6) : catalog ? Math.max(1, Math.ceil(exercises.length / 2)) : 7,
      rowH = Math.min(bosses ? (compact ? 42 : 62) : catalog ? 62 : 46, (height - rowTop - helpH - 16) / rows);
    const bossOffset = bosses && compact ? clampValue(Math.floor(context.scroll / 48), 0, 3) * 3 : 0;
    exercises.forEach((lesson, originalIndex) => {
      const index = originalIndex - bossOffset;
      if (bosses && compact && (index < 0 || index >= 9)) return;
      const columns = tab?.columns ?? 2,
        column = index % columns,
        row = Math.floor(index / columns);
      context.enqueue({
        x: panelX + column * (panelW / columns + 4),
        y: rowTop + row * rowH,
        w: panelW / columns - 8,
        h: rowH - 4,
        label: `${lesson.completed && !lab ? "✓ " : ""}${lesson.title}${session.skipped?.some((id) => id === lesson.id) ? " · SKIPPED" : ""}${lesson.reached ? "" : " · LOCKED"}`,
        ...("knowledge" in lesson && typeof lesson.knowledge === "string"
          ? {
              sub: (
                {
                  "defeated-identity": "DEFEATED",
                  "encountered-phase": "PHASE REACHED",
                  "confirmed-defeated": "DEFEATED",
                  encountered: "MET",
                  "save-unconfirmed": "NOT SAVED YET",
                  unknown: "NOT MET YET",
                } as Readonly<Record<string, string>>
              )[lesson.knowledge],
            }
          : {}),
        enabled: lesson.canPractice,
        selected: lesson.current,
        action: {
          type: "tutorial.action",
          command: tab?.select ?? "select",
          lessonId: lesson.id,
        },
        size: compact ? ui.t.type.micro : ui.t.type.caption,
      });
    });
    if (bosses && compact)
      ui.scrollHint(canvas, panelX + panelW / 2, rowTop + rows * rowH + 10, bossOffset > 0, bossOffset < 9);
    // On the drill's own tab, the drill under way says what to do now; any other tab explains its list.
    const drillTab = session.annex
        ? "weapons"
        : session.enemyPractice
          ? "enemies"
          : session.bossPractice
            ? "bosses"
            : undefined,
      tabHelp = tab?.help === undefined ? undefined : compact ? (tab.compactHelp ?? tab.help) : tab.help;
    const help =
      session.helpVisible || (drillTab !== undefined && drillTab === tab?.id)
        ? session.instruction
        : (tabHelp ??
          (complete
            ? "Move, jump and dash. Cut, launch and juggle. Slam and updraft. Throw, recall, parry, then dodge and punish. Choose any lesson above to practice it again."
            : current
              ? `${LESSON_TEACHING[current.id].goal} ${LESSON_TEACHING[current.id].why}`
              : ""));
    if (session.coach?.available && !bosses && !catalog && !annexes) {
      const coach = session.coach,
        controls: { label: string; command: "coach-rate" | "coach-compare" }[] = [
          { label: `DEMO SPEED ${String(coach.rate)}×`, command: "coach-rate" },
          ...(coach.canCompare ? [{ label: "COMPARE WITH DEMO", command: "coach-compare" as const }] : []),
        ];
      controls.forEach((control, index) => {
        context.enqueue({
          x: panelX + (index * panelW) / controls.length,
          y: header.footerY,
          w: panelW / controls.length - 8,
          h: ui.t.metric.btnH,
          label: control.label,
          action: { type: "tutorial.action", command: control.command },
          size: ui.t.type.micro,
        });
      });
      wrapText(
        coach.adaptive?.assistOffered
          ? `${help} Stuck? SKIP LESSON moves on; you can come back to it.`
          : (coach.adaptive?.nudge ?? (session.helpVisible ? session.instruction : `${help} ${coach.diagnosis}`)),
        panelX,
        header.footerY - ui.t.space.md - ui.t.type.micro * 2,
        panelW,
        Math.round(ui.t.type.micro * 1.3),
        ui.t.type.micro,
        ui.ink,
      );
      return;
    }
    canvas.textBaseline = "alphabetic";
    wrapText(
      help,
      panelX,
      rowTop + rows * rowH + (catalog ? 28 : 18),
      panelW,
      Math.round(ui.t.type.caption * 1.35),
      ui.t.type.caption,
      ui.ink,
    );
  }

  /** The Drills tabs over the list panel: the hubs' tab strip, framed to the panel. */
  function drillTabs(open: PracticeTab, x: number, y: number, w: number, h: number): void {
    tabs(
      context,
      PRACTICE_TABS.map(({ id, label }) => ({ id, label, selected: id === open })),
      (id) => ({ type: "tutorial.action", command: "tab", tab: id }),
      y,
      { x, w, h },
    );
  }

  /**
   * Body columns shared by pause and defeat: the action rail (left), a primary panel
   * (arsenal or run log) and the run's progress. Compact density stacks the progress
   * under the primary panel instead of squeezing a third column.
   */
  function bodyColumns(layout: OverlayLayout) {
    const t = ui.t,
      gap = t.space.xl,
      railW = t.metric.btnW;
    const x = layout.left + railW + gap,
      rest = layout.right - x,
      compact = ui.density.compact;
    const primaryW = compact ? rest : Math.round(rest * 0.58 - gap / 2);
    const primaryTop = panelTagTop(layout);
    const primaryH = compact ? Math.round((layout.bodyBottom - primaryTop) * 0.55) : layout.bodyBottom - primaryTop;
    return {
      railX: layout.left + railW / 2,
      railW,
      primary: { x, y: primaryTop, w: primaryW, h: primaryH },
      progress: compact
        ? { x, y: primaryTop + primaryH + t.space.lg, w: rest }
        : { x: x + primaryW + gap, y: layout.bodyTop, w: layout.right - (x + primaryW + gap) },
    };
  }

  function panelTagTop(layout: OverlayLayout): number {
    return layout.bodyTop + ui.t.type.micro + ui.t.space.sm;
  }

  function pauseActions(view: PausedScreenView): { label: string; action: ScreenAction }[] {
    const actions: { label: string; action: ScreenAction }[] = [
      { label: "RESUME", action: { type: "run.resume" } },
      ...(view.playground === true
        ? [{ label: "PLAYGROUND MENU", action: { type: "playground.action", id: "menu" } as const }]
        : [{ label: "RESTART", action: { type: "run.restart" } as const }]),
      { label: "SETTINGS", action: { type: "navigate", to: "settings" } },
      { label: "MAIN MENU", action: { type: "navigate", to: "confirmquit" } },
    ];
    if (view.ghostChase) {
      actions.push(
        {
          label: view.ghostChase.visible ? "HIDE GHOST" : "SHOW GHOST",
          action: { type: "chase.control", command: "toggle" },
        },
        { label: "STOP CHASE", action: { type: "chase.control", command: "stop" } },
      );
    }
    return actions;
  }

  function paused(view: PausedScreenView): void {
    const { canvas } = context;
    if (view.tutorial !== undefined) {
      tutorialPaused(view.tutorial);
      return;
    }
    ui.dim(canvas, width, height, 0.86);
    const layout = overlayHeader(context, { title: "PAUSED", subtitle: view.runSummary ? [view.runSummary] : [] });
    const actions = pauseActions(view),
      columns = bodyColumns(layout);
    verticalMenu(context, actions, columns.railX, layout.bodyTop, columns.railW);
    panelTag(context, "YOUR ARSENAL", columns.primary.x, layout.bodyTop);
    arsenalPanel(context, view.abilities, columns.primary);
    runProgressPanel(
      context,
      view.progress,
      columns.progress.x,
      columns.progress.y,
      columns.progress.w,
      layout.bodyBottom,
    );
  }

  function confirmquit(view: ConfirmQuitScreenView): void {
    const { canvas } = context;
    ui.dim(canvas, width, height, 0.85);
    const layout = overlayHeader(context, {
      title: "QUIT RUN?",
      subtitle: [
        view.practice
          ? "Local practice ends without saved progression or High Scores."
          : "Your progress (cleared waves & score) is saved to High Scores.",
      ],
    });
    actionRow(
      context,
      [
        { label: "QUIT", action: { type: "run.quit" } },
        { label: "CANCEL", action: { type: "navigate", to: "paused" } },
      ],
      layout.bodyTop + ui.t.space.lg,
      layout.width,
    );
  }

  function continueRun(view: ContinueScreenView): void {
    const { canvas } = context;
    ui.dim(canvas, width, height, 0.85);
    const seconds = view.requesting ? 0 : Math.max(0, Math.ceil(view.seconds));
    const layout = overlayHeader(context, {
      title: "YOU FELL",
      subtitle: [
        "Watch a short ad to revive with 35% health and keep this run going.",
        `Offer lapses in ${String(seconds)}s`,
      ],
    });
    actionRow(
      context,
      [
        { label: "REVIVE  ▶ WATCH AD", action: { type: "continue.revive" }, enabled: !view.requesting },
        { label: "GIVE UP", action: { type: "continue.giveUp" }, enabled: !view.requesting },
      ],
      layout.bodyTop + ui.t.space.lg,
      layout.width,
    );
  }

  /** Coins earned: a celebration only when the run scored; a 0-point run keeps the coins quietly. */
  function rewards(view: GameoverScreenView, x: number, y: number): number {
    const t = ui.t,
      total = `coins  ·  ${String(view.coins)} total`;
    let cursor = panelTag(context, "REWARDS", x, y);
    if (view.celebrate) {
      cursor += t.type.h2;
      ui.tag(context.canvas, `+${String(view.earned)}`, x, cursor, ui.readable(t.color.accent), "left", t.type.h2);
      cursor += t.space.xs + t.type.caption;
      ui.text(context.canvas, total, x, cursor, t.type.caption, "left", t.alpha.soft);
    } else {
      cursor += t.type.caption;
      ui.text(context.canvas, `+${String(view.earned)} ${total}`, x, cursor, t.type.caption, "left", t.alpha.soft);
    }
    return cursor + t.space.lg;
  }

  function gameover(view: GameoverScreenView): void {
    const { canvas } = context;
    ui.dim(canvas, width, height, 0.9);
    const standing = view.isNew ? "★ NEW BEST" : view.best;
    const layout = overlayHeader(context, {
      title: "DEFEATED",
      subtitle: [view.summary, ...(standing ? [standing] : [])],
    });
    const actions: { label: string; action: ScreenAction }[] = [{ label: "RETRY", action: { type: "results.retry" } }];
    if (view.replayAvailable) actions.push({ label: "▶  WATCH REPLAY", action: { type: "results.watchReplay" } });
    actions.push({ label: "MAIN MENU", action: { type: "navigate", to: "menu" } });
    const columns = bodyColumns(layout);
    verticalMenu(context, actions, columns.railX, rewards(view, layout.left, layout.bodyTop), columns.railW);
    panelTag(context, "RUN LOG", columns.primary.x, layout.bodyTop);
    waveLogPanel(context, view.log, columns.primary);
    runProgressPanel(
      context,
      view.progress,
      columns.progress.x,
      columns.progress.y,
      columns.progress.w,
      layout.bodyBottom,
    );
  }

  function win(view: WinScreenView): void {
    const { canvas } = context;
    const again: { label: string; action: ScreenAction } = view.campaign
      ? { label: "DESCEND AGAIN", action: { type: "results.descendAgain" } }
      : { label: "PLAY AGAIN", action: { type: "results.retry" } };
    const actions = [again, { label: "MAIN MENU", action: { type: "navigate", to: "menu" } as const }];
    if (view.campaign) {
      const panel = ui.finalReward(canvas, {
        amount: context.enterAmount,
        label: "ADVENTURE COMPLETE",
        title: "THE WORLD, RESTORED",
        sigil: "◇",
        color: ui.t.color.accent,
        actions: true,
        reward: `${String(view.score)} PTS  ·  ${view.time}${view.isNew ? "  ·  NEW BEST" : ""}`,
        detail: `+${String(view.earned)} COINS  ·  ${String(view.coins)} TOTAL`,
      });
      actionRow(context, actions, panel.actionsY, panel.w - ui.t.space.xl * 2);
      return;
    }
    ui.dim(canvas, width, height, 0.92);
    const layout = overlayHeader(context, {
      title: "VICTORY",
      subtitle: [
        `boss down   ·   ${String(view.score)} pts   ·   ${view.time}${view.isNew ? "   ·   NEW BEST" : ""}`,
        `+${String(view.earned)} coins  (${String(view.coins)} total)`,
      ],
    });
    const logW = Math.min(720, layout.width),
      logX = layout.centerX - logW / 2;
    panelTag(context, "RUN LOG", logX, layout.bodyTop);
    waveLogPanel(context, view.log, {
      x: logX,
      y: panelTagTop(layout),
      w: logW,
      h: layout.bodyBottom - panelTagTop(layout),
    });
    actionRow(context, actions, layout.footerY, layout.width);
  }

  return { paused, confirmquit, continue: continueRun, gameover, win };
}
