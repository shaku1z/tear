import { createCareerArchiveRenderer } from "./career-archive";
import type { AchievementsScreenView, ProfileScreenView, ScreenRenderContext } from "./contracts";
import { clipBody, page, pageFooter, replayRow, tabs } from "./screen-primitives";
import { createCompactProfile } from "./compact-profile";
import { profileListEmptyState } from "./profile-list-empty-state";

const PROFILE_HUE = "#b06cff";
/** First y under the profile tab strip; the snapshot's scroll bounds use the same value. */
export const PROFILE_CONTENT_TOP = 306;

const ARCHIVE_STATUS: Readonly<Record<string, string>> = Object.freeze({
  idle: "",
  unavailable: "Importing replay files isn't available in this browser.",
  picking: "Choosing a file…",
  validating: "Checking the file…",
  ready: "Ready to restore.",
  restoring: "Restoring…",
  "reselect-required": "Choose the file again to continue.",
  complete: "Restored to this device.",
  cancelled: "Import cancelled.",
  failed: "That file couldn't be restored.",
  "download-requested": "Download started.",
});

export function createProfileAchievementRenderers(context: ScreenRenderContext) {
  const { ui } = context;
  const career = createCareerArchiveRenderer(context);
  // Phone landscape (compact density) composes these screens as compact pages. Only touch reaches
  // compact density, so production builds (no touch while mobile is paused) leave the layout out.
  const compact = __TEAR_MOBILE__ ? createCompactProfile(context) : null;

  function profile(view: ProfileScreenView): void {
    if (view.career) {
      career(view.career);
      return;
    }
    if (compact !== null && ui.density.compact) {
      compact.profile(view);
      return;
    }
    const { canvas } = context;
    const layout = page(context, { title: "PROFILE", hue: PROFILE_HUE });
    passport(view);
    tabs(context, view.tabs, (id) => ({ type: "profile.selectTab", id }), 252);
    const left = layout.left,
      listWidth = layout.contentWidth,
      bottom = layout.bodyBottom;
    let top = PROFILE_CONTENT_TOP;

    if (view.tab === "vault") top = vaultToolbar(view, top);
    const listEmpty = (view.tab === "replays" || view.tab === "vault") && (view.replays?.length ?? 0) === 0;
    if (view.message && !listEmpty) {
      ui.textBox(canvas, view.message, context.width / 2, top + 4, listWidth, {
        size: ui.t.type.caption,
        align: "center",
        alpha: ui.t.alpha.muted,
        maxLines: 1,
      });
      top += 24;
    }

    if ((view.tab === "replays" || view.tab === "vault") && view.replays) {
      const rowHeight = 96;
      if (listEmpty) {
        const empty = profileListEmptyState(view);
        const ctaY = ui.emptyState(canvas, empty.glyph, empty.line, context.width / 2, top + 110, empty.detail, 720);
        if (view.tab === "replays")
          context.enqueue({
            x: context.width / 2 - 130,
            y: ctaY,
            w: 260,
            h: 46,
            label: "PLAY A RUN",
            action: { type: "profile.play" },
          });
      }
      const enqueueRow = (control: Parameters<ScreenRenderContext["enqueue"]>[0]): void => {
        if (control.y >= top && control.y + control.h <= bottom) context.enqueue(control);
      };
      clipBody(context, top - 8, bottom, () => {
        view.replays?.forEach((replay, index) => {
          const y = top + index * rowHeight - context.scroll;
          if (y + rowHeight < top - 8 || y > bottom + 8) return;
          replayRow(context, replay, left, y, listWidth, replay.pinned ? "#e0a326" : undefined, 410);
          const actionsX = left + listWidth - 392;
          if (view.tab === "vault" && replay.canDownloadArchive)
            enqueueRow({
              x: actionsX,
              y: y + 62,
              w: 116,
              h: 28,
              label: "DOWNLOAD",
              size: ui.t.type.micro,
              action: { type: "profile.downloadGhostArchive", id: replay.id },
            });
          if (view.tab === "vault" && replay.repairable) {
            enqueueRow({
              x: actionsX,
              y: y + 18,
              w: 110,
              h: 40,
              label: "REPAIR",
              action: { type: "profile.repairGhostCapsule", id: replay.id },
            });
          } else {
            enqueueRow({
              x: actionsX,
              y: y + 18,
              w: 110,
              h: 40,
              size: ui.t.type.label,
              label: view.tab === "vault" ? "◆ THEATER" : "▶  WATCH",
              enabled: replay.available,
              ...(view.tab === "vault" && replay.theaterUnavailable ? { label: "CAN'T PLAY" } : {}),
              action:
                view.tab === "vault"
                  ? { type: "profile.watchGhostCapsule", id: replay.id }
                  : { type: "profile.watchReplay", id: replay.id },
            });
          }
          if (view.tab === "vault" && !replay.repairable) {
            enqueueRow({
              x: actionsX + 118,
              y: y + 18,
              w: 126,
              h: 40,
              size: ui.t.type.label,
              label: replay.comparisonSelected ? "SELECTED" : "SELECT",
              enabled: replay.available,
              selected: replay.comparisonSelected,
              action: { type: "profile.compareGhostCapsule", id: replay.id },
            });
            if ((replay.comparisonSourceCount ?? 0) >= 2) {
              enqueueRow({
                x: actionsX + 252,
                y: y + 18,
                w: 132,
                h: 40,
                size: ui.t.type.label,
                label: `COMPARE ${String(replay.comparisonSourceCount)}`,
                action: { type: "profile.openGhostComparison" },
              });
            }
          }
          if (replay.local) {
            enqueueRow({
              x: actionsX + 118,
              y: y + 18,
              w: 78,
              h: 40,
              label: replay.pinned ? "★" : "PIN",
              selected: replay.pinned,
              size: ui.t.type.label,
              action: { type: "profile.pinReplay", id: replay.id, pinned: !replay.pinned },
            });
            enqueueRow({
              x: actionsX + 204,
              y: y + 18,
              w: 104,
              h: 40,
              label: replay.shared ? "SHARED" : "SHARE",
              selected: replay.shared,
              size: ui.t.type.label,
              enabled: !replay.shared,
              action: { type: "profile.publishReplay", id: replay.id },
            });
            enqueueRow({
              x: actionsX + 316,
              y: y + 18,
              w: 64,
              h: 40,
              label: "✕",
              action: { type: "profile.deleteReplay", id: replay.id },
            });
          }
        });
      });
    } else if (view.tab === "bests") {
      if (view.finest) {
        ui.title(canvas, view.finest.headline, context.width / 2, top + 40, ui.t.type.h2);
        ui.tag(
          canvas,
          view.finest.detail,
          context.width / 2,
          top + 64,
          ui.readable(PROFILE_HUE),
          "center",
          ui.t.type.micro,
        );
      }
      if (view.records && view.records.length > 0) {
        const x = context.width / 2 - 460,
          right = x + 920,
          headerY = top + 104;
        ui.tag(canvas, "MODE", x, headerY, ui.t.color.muted, "left", ui.t.type.micro);
        ui.tag(canvas, "WAVE", right - 320, headerY, ui.t.color.muted, "right", ui.t.type.micro);
        ui.tag(canvas, "TIME", right - 180, headerY, ui.t.color.muted, "right", ui.t.type.micro);
        ui.tag(canvas, "SCORE", right - 20, headerY, ui.t.color.muted, "right", ui.t.type.micro);
        ui.divider(canvas, x, headerY + 8, 920, 0.16);
        const rows = Math.max(1, Math.floor((bottom - (headerY + 34)) / 34) + 1);
        view.records.slice(0, rows).forEach((record, index) => {
          const y = headerY + 34 + index * 34;
          ui.text(canvas, record.mode, x, y, ui.t.type.label);
          ui.tag(
            canvas,
            record.difficulty.toUpperCase(),
            x + 170,
            y,
            ui.readable(record.accent ?? ui.t.color.muted),
            "left",
            ui.t.type.micro,
          );
          ui.text(canvas, record.wave, right - 320, y, ui.t.type.label, "right");
          ui.text(canvas, record.time, right - 180, y, ui.t.type.label, "right", ui.t.alpha.soft);
          ui.text(canvas, record.score, right - 20, y, ui.t.type.label, "right");
          ui.divider(canvas, x, y + 11, 920, 0.08);
        });
      } else if (view.emptyMessage) {
        const ctaY = ui.emptyState(canvas, "▲", "No records yet", context.width / 2, top + 120, view.emptyMessage, 640);
        context.enqueue({
          x: context.width / 2 - 130,
          y: ctaY,
          w: 260,
          h: 46,
          label: "PLAY A RUN",
          action: { type: "profile.play" },
        });
      }
    } else {
      const cardWidth = (listWidth - 3 * 18) / 4;
      view.stats.forEach((stat, index) => {
        const column = index % 4,
          row = Math.floor(index / 4);
        const x = left + column * (cardWidth + 18);
        const y = top + row * 110;
        ui.card(canvas, x, y, cardWidth, 96, false);
        if (stat.accent) {
          canvas.fillStyle = stat.accent;
          canvas.fillRect(x, y, cardWidth, 4);
        }
        if (stat.glyph)
          ui.tag(
            canvas,
            stat.glyph,
            x + 20,
            y + 42,
            stat.accent === undefined ? undefined : ui.readable(stat.accent),
            "left",
            20,
          );
        ui.title(canvas, stat.value, x + cardWidth / 2 + 8, y + 50, ui.t.type.h2);
        ui.tag(
          canvas,
          stat.label.toUpperCase(),
          x + cardWidth / 2,
          y + 80,
          ui.t.color.muted,
          "center",
          ui.t.type.micro,
        );
      });
      if (view.journey) {
        const y = top + Math.ceil(view.stats.length / 4) * 110 + 26;
        ui.sectionLabel(canvas, "THE JOURNEY", left, y, listWidth, PROFILE_HUE);
        const biomes = ui.textBox(
          canvas,
          view.journey.biomes.map((item) => `${item.selected ? "◆" : "◇"} ${item.label.toUpperCase()}`).join("    "),
          left,
          y + 30,
          listWidth,
          { size: ui.t.type.micro, lineHeight: 20, maxLines: 2 },
        );
        ui.textBox(
          canvas,
          view.journey.bosses.map((item) => `${item.selected ? "☠" : "◇"} ${item.label.toUpperCase()}`).join("    "),
          left,
          y + 30 + biomes.height + 4,
          listWidth,
          { size: ui.t.type.micro, lineHeight: 20, maxLines: 2 },
        );
      }
    }
    pageFooter(context, { canScrollUp: view.canScrollUp, canScrollDown: view.canScrollDown });
  }

  /** Vault import controls as one toolbar under the tabs; returns the next free y. */
  function vaultToolbar(view: ProfileScreenView, top: number): number {
    const { canvas } = context,
      left = context.width / 2 - 560;
    const archive = view.archive;
    if (archive === undefined) return top;
    let x = left;
    const button = (
      label: string,
      w: number,
      action: Parameters<ScreenRenderContext["enqueue"]>[0]["action"],
      enabled = true,
    ): void => {
      context.enqueue({ x, y: top, w, h: 36, label, size: ui.t.type.label, enabled, action });
      x += w + 10;
    };
    button("IMPORT A REPLAY FILE", 250, { type: "profile.pickGhostArchive" }, archive.canPick);
    if (archive.jobId !== undefined && archive.revision !== undefined) {
      if (archive.canReselect) button("CHOOSE AGAIN", 170, { type: "profile.reselectGhostArchive", id: archive.jobId });
      if (archive.canRestore)
        button(archive.pairedCapsuleIds ? "RESTORE BOTH" : "RESTORE", 150, {
          type: "profile.restoreGhostArchive",
          id: archive.jobId,
          revision: archive.revision,
        });
      if (archive.canCancel)
        button("CANCEL", 120, { type: "profile.cancelGhostRestore", id: archive.jobId, revision: archive.revision });
    }
    if (archive.canCancelSelection) button("CANCEL", 120, { type: "profile.cancelGhostArchiveSelection" });
    const status = [
      ARCHIVE_STATUS[archive.status] ?? "",
      archive.pairedCapsuleIds ? "Includes the scored run and its finale." : "",
    ]
      .filter(Boolean)
      .join(" ");
    if (status)
      ui.textBox(canvas, status, left, top + 56, 1120, {
        size: ui.t.type.caption,
        alpha: ui.t.alpha.soft,
        maxLines: 1,
      });
    ui.divider(canvas, left, top + (status ? 70 : 48), 1120, 0.14);
    return top + (status ? 84 : 62);
  }

  function passport(view: ProfileScreenView): void {
    const { canvas } = context;
    const x = context.width / 2 - 560,
      right = context.width / 2 + 560,
      y = 130,
      height = 100;
    canvas.globalAlpha = 0.05;
    canvas.fillStyle = ui.ink;
    canvas.fillRect(x, y, right - x, height);
    canvas.globalAlpha = 1;
    ui.spine(canvas, x, y, height, view.signedIn ? PROFILE_HUE : ui.t.color.muted);
    ui.avatar(canvas, x + 16, y + 14, 72);
    canvas.beginPath();
    canvas.arc(x + 84, y + 22, 6, 0, Math.PI * 2);
    canvas.fillStyle = view.signedIn ? PROFILE_HUE : "#8a93a6";
    canvas.fill();
    canvas.strokeStyle = ui.ink;
    canvas.lineWidth = 1.5;
    canvas.stroke();
    // Right zone, from the edge inwards: account actions, achievements, showcase seals.
    const actionX = right - 256,
      achievementsX = actionX - 150,
      sealsRight = achievementsX - 24;
    const passportData = view.passport,
      seals = passportData?.showcases.length ?? 0;
    const textRight = (seals > 0 ? sealsRight - seals * 46 : achievementsX) - 20,
      textWidth = textRight - (x + 106);
    const name = ui.fitText(canvas, view.name.toUpperCase(), textWidth, {
      size: ui.t.type.h2,
      floor: ui.t.type.lead,
      bold: true,
    });
    ui.displayText(canvas, name.lines[0] ?? view.name, x + 106, y + 42, name.size);
    if (view.cloudStatus)
      ui.textBox(canvas, view.cloudStatus, x + 106, y + 66, textWidth, {
        size: ui.t.type.caption,
        alpha: ui.t.alpha.muted,
        maxLines: 1,
      });
    if (!passportData) return;
    const coinWidth = ui.badge(
      canvas,
      `◆ ${passportData.coins.toLocaleString("en-US")}`,
      x + 106,
      y + 90,
      "#a86a0c",
      "left",
    );
    ui.badge(
      canvas,
      `⬡ ${passportData.shards.toLocaleString("en-US")}`,
      x + 116 + coinWidth,
      y + 90,
      "#7d3fc8",
      "left",
    );
    passportData.showcases.forEach((seal, index) => {
      ui.seal(canvas, sealsRight - (seals - index) * 46 + 23, y + 50, 16, seal.color, seal.glyph, false);
    });
    context.enqueue({
      x: achievementsX,
      y: y + 30,
      w: 130,
      h: 40,
      label: `★ ${passportData.achievements}`,
      size: ui.t.type.label,
      action: { type: "profile.openAchievements" },
    });
    if (passportData.renameLabel)
      context.enqueue({
        x: actionX,
        y: y + 10,
        w: 242,
        h: 36,
        label: passportData.renameLabel,
        size: ui.t.type.label,
        enabled: passportData.canRename,
        action: { type: "profile.rename" },
      });
    if (passportData.canSignOut)
      context.enqueue({
        x: actionX,
        y: y + 54,
        w: 242,
        h: 36,
        label: "SIGN OUT",
        size: ui.t.type.label,
        action: { type: "profile.signOut" },
      });
    else if (passportData.canSignIn)
      context.enqueue({
        x: actionX,
        y: y + 28,
        w: 242,
        h: 44,
        label: passportData.signInLabel ?? "SIGN IN",
        size: ui.t.type.label,
        action: { type: "profile.signIn" },
      });
  }

  function achievements(view: AchievementsScreenView): void {
    if (compact !== null && ui.density.compact) {
      compact.achievements(view);
      return;
    }
    const { canvas } = context;
    const gold = "#e0a326";
    const layout = page(context, { title: "ACHIEVEMENTS", subtitle: "master the blade · earn shards", hue: gold });
    const x = layout.left,
      width = layout.contentWidth;
    if (view.dailies) {
      ui.tag(canvas, "DAILY CHALLENGES", x, 172, ui.readable(ui.t.color.accent), "left", ui.t.type.micro);
      if (view.resetsIn)
        ui.tag(canvas, `RESETS IN ${view.resetsIn}`, x + width, 172, ui.t.color.muted, "right", ui.t.type.micro);
      view.dailies.slice(0, 3).forEach((daily, index) => {
        const cardWidth = (width - 32) / 3,
          cardX = x + index * (cardWidth + 16),
          y = 182;
        const done = daily.done === true,
          hue = done ? "#2f9e6b" : ui.t.color.accent;
        ui.card(canvas, cardX, y, cardWidth, 84, false);
        ui.accentStrip(canvas, cardX, y, cardWidth, hue);
        canvas.font = ui.font(ui.t.type.label, true);
        const reward = done ? "✓ DONE" : daily.reward,
          rewardWidth = canvas.measureText(reward).width;
        ui.textBox(canvas, daily.label, cardX + 16, y + 30, cardWidth - 48 - rewardWidth, {
          size: ui.t.type.body,
          floor: ui.t.type.caption,
          maxLines: 1,
        });
        ui.tag(canvas, reward, cardX + cardWidth - 16, y + 30, ui.readable(hue), "right", ui.t.type.label);
        ui.bar(canvas, cardX + 16, y + 46, cardWidth - 32, 6, daily.goal > 0 ? daily.current / daily.goal : 0, hue);
        ui.text(
          canvas,
          `${daily.current.toLocaleString("en-US")} / ${daily.goal.toLocaleString("en-US")}`,
          cardX + 16,
          y + 72,
          ui.t.type.micro,
          "left",
          ui.t.alpha.soft,
        );
      });
      canvas.globalAlpha = 0.06;
      canvas.fillStyle = ui.ink;
      canvas.fillRect(x, 278, width, 44);
      canvas.globalAlpha = 1;
      canvas.fillStyle = ui.t.color.accent;
      canvas.fillRect(x, 278, 4, 44);
      ui.tag(
        canvas,
        `◆ ${(view.shards ?? 0).toLocaleString("en-US")} SHARDS`,
        x + 22,
        307,
        ui.readable("#0f9fb0"),
        "left",
        22,
      );
      ui.bar(canvas, x + 270, 297, 180, 6, view.total > 0 ? view.unlocked / view.total : 0, ui.t.color.accent);
      ui.tag(
        canvas,
        `${String(view.unlocked)} / ${String(view.total)}`,
        x + 462,
        305,
        ui.ink,
        "left",
        ui.t.type.caption,
      );
      if (view.nextUp)
        ui.textBox(canvas, `NEXT UP ▸  ${view.nextUp}`, x + width - 22, 305, width - 600, {
          size: ui.t.type.micro,
          bold: true,
          align: "right",
          color: ui.readable(ui.t.color.accent),
          maxLines: 1,
        });
    }
    tabs(context, view.categories, (id) => ({ type: "achievements.selectCategory", id }), view.dailies ? 332 : 160);
    achievementGrid(view, view.dailies ? 386 : 214, layout.bodyBottom);
    pageFooter(context, { canScrollUp: view.canScrollUp, canScrollDown: view.canScrollDown });
  }

  function achievementGrid(view: AchievementsScreenView, top: number, bottom: number): void {
    const { canvas } = context;
    const cardWidth = 548,
      rowHeight = 124,
      cardHeight = 110;
    const left = context.width / 2 - cardWidth - 12;
    const offsetRows = Math.max(0, Math.floor(context.scroll / rowHeight));
    const offsetWithinRow = context.scroll - offsetRows * rowHeight;
    clipBody(context, top - 6, bottom, () => {
      view.cards.slice(offsetRows * 2).forEach((card, localIndex) => {
        const column = localIndex % 2,
          row = Math.floor(localIndex / 2);
        const x = left + column * (cardWidth + 24),
          y = top + row * rowHeight - offsetWithinRow;
        if (y < top - rowHeight || y > bottom) return;
        const unlocked = card.locked !== true,
          rarityColor = card.accent ?? ui.t.color.muted;
        const rarityInk = unlocked ? ui.readable(rarityColor) : ui.t.color.muted;
        ui.card(
          canvas,
          x,
          y,
          cardWidth,
          cardHeight,
          false,
          unlocked
            ? { edge: rarityColor, ...(card.shimmer === undefined ? {} : { shimmer: card.shimmer }) }
            : { dashed: true },
        );
        if (unlocked) {
          canvas.globalAlpha = 0.07;
          canvas.fillStyle = rarityColor;
          canvas.fillRect(x, y, cardWidth, cardHeight);
          canvas.globalAlpha = 1;
          ui.spine(canvas, x, y, cardHeight, rarityColor);
        }
        const textX = x + 90,
          rewardsWidth = 150,
          textWidth = cardWidth - (textX - x) - rewardsWidth - 12;
        ui.seal(canvas, x + 45, y + 51, 24, rarityColor, card.glyph ?? "★", !unlocked);
        const title = ui.fitText(canvas, card.label, textWidth, {
          size: ui.t.type.lead,
          floor: ui.t.type.label,
          bold: true,
        });
        canvas.save();
        canvas.globalAlpha = unlocked ? 1 : 0.72;
        ui.displayText(canvas, title.lines[0] ?? card.label, textX, y + 32, title.size);
        canvas.restore();
        if (card.badge) ui.tag(canvas, card.badge, textX, y + 51, rarityInk, "left", ui.t.type.micro);
        if (card.description)
          ui.textBox(canvas, card.description, textX, y + 69, cardWidth - (textX - x) - 16, {
            size: ui.t.type.micro,
            maxLines: 1,
            alpha: unlocked ? ui.t.alpha.soft : ui.t.alpha.muted,
          });
        const barWidth = cardWidth - (textX - x) - 110;
        ui.bar(canvas, textX, y + 82, barWidth, 5, card.progress ?? 0, unlocked ? rarityColor : ui.t.color.accent);
        if (card.progressLabel) ui.tag(canvas, card.progressLabel, textX, y + 101, rarityInk, "left", ui.t.type.micro);
        if (card.rewardPrimary)
          ui.tag(
            canvas,
            card.rewardPrimary,
            x + cardWidth - 16,
            y + 32,
            unlocked ? ui.readable("#13c4d6") : ui.t.color.muted,
            "right",
            ui.t.type.micro,
          );
        if (card.rewardSecondary)
          ui.tag(
            canvas,
            card.rewardSecondary,
            x + cardWidth - 16,
            y + 50,
            unlocked ? ui.readable(ui.t.color.accent) : ui.t.color.muted,
            "right",
            ui.t.type.micro,
          );
        if (card.footer) ui.tag(canvas, card.footer, x + cardWidth - 16, y + 101, rarityInk, "right", ui.t.type.micro);
        if (y >= top - 6 && y + cardHeight <= bottom)
          context.enqueue({
            x,
            y,
            w: cardWidth,
            h: cardHeight,
            label: "",
            hiddenBox: true,
            action: { type: "achievements.inspect", id: card.id },
          });
      });
    });
  }

  return { profile, achievements };
}
