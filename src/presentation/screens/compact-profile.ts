import type { AchievementsScreenView, CardView, ProfileScreenView, ReplayView, ScreenRenderContext } from "./contracts";
import {
  createCompactPage,
  type CompactPage,
  type FlowAction,
  type ScrollBlock,
  type ScrollView,
} from "./compact-page";
import { profileListEmptyState } from "./profile-list-empty-state";

const PROFILE_HUE = "#b06cff",
  GOLD = "#e0a326";
// Pure, so a build without the phone layout drops this module (plans/MOBILE_LATER.md).
const ARCHIVE_STATUS: Readonly<Record<string, string>> = /* @__PURE__ */ Object.freeze({
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

/**
 * Phone compositions of PROFILE (passport, bests, replays, vault, stats) and
 * ACHIEVEMENTS (dailies, shard summary, the achievement grid) on the compact page.
 * The passport and every tab body scroll together under the header's tab strip.
 */
export function createCompactProfile(context: ScreenRenderContext) {
  const { ui } = context,
    kit = createCompactPage(context),
    { lineHeight, lineCount } = kit;

  // ---- PROFILE ---------------------------------------------------------------------
  function profile(view: ProfileScreenView): void {
    const page = kit.header({
      title: "PROFILE",
      hue: PROFILE_HUE,
      tabs: view.tabs,
      tabAction: (id) => ({ type: "profile.selectTab", id }),
    });
    const blocks: ScrollBlock[] = [passport(page, view)];
    const listTab = view.tab === "replays" || view.tab === "vault";
    if (view.tab === "vault") blocks.push(...vaultToolbar(page, view));
    if (listTab) blocks.push(...replayBlocks(page, view));
    else if (view.tab === "bests") blocks.push(...bests(page, view));
    else blocks.push(...stats(page, view));
    kit.footer(page, kit.scroll(page, blocks));
  }

  /** The passport: avatar, name, account status, balances and showcase seals, with the account actions. */
  function passport(page: CompactPage, view: ProfileScreenView): ScrollBlock {
    const t = ui.t,
      pad = t.space.md,
      avatar = 96,
      data = view.passport;
    const items: FlowAction[] = [];
    if (data) {
      items.push({ label: `★ ${data.achievements}`, action: { type: "profile.openAchievements" } });
      if (data.renameLabel)
        items.push({ label: data.renameLabel, action: { type: "profile.rename" }, enabled: data.canRename });
      if (data.canSignOut) items.push({ label: "SIGN OUT", action: { type: "profile.signOut" } });
      else if (data.canSignIn) items.push({ label: data.signInLabel ?? "SIGN IN", action: { type: "profile.signIn" } });
    }
    const actionsW = Math.max(0, kit.actionsWidth(items, page.width * 0.5));
    const actionsH = kit.actionsHeight(items, actionsW);
    const textX = page.left + pad * 2 + avatar,
      textW = page.right - actionsW - pad * 2 - textX;
    const statusLines = view.cloudStatus ? lineCount(view.cloudStatus, textW, t.type.caption, 2) : 0;
    const seals = data?.showcases.length ?? 0,
      sealR = Math.ceil(t.type.micro / 0.95) + 2;
    const infoH =
      t.type.h2 +
      statusLines * lineHeight(t.type.caption) +
      (data ? t.space.sm + t.type.micro + 8 : 0) +
      (seals > 0 ? t.space.sm + sealR * 2 : 0);
    const height = pad * 2 + Math.max(avatar, infoH + t.space.sm, actionsH);
    const draw = (y: number, scrollView: ScrollView): void => {
      const { canvas } = context;
      canvas.globalAlpha = 0.05;
      canvas.fillStyle = ui.ink;
      canvas.fillRect(page.left, y, page.width, height);
      canvas.globalAlpha = 1;
      ui.spine(canvas, page.left, y, height, view.signedIn ? PROFILE_HUE : t.color.muted);
      ui.avatar(canvas, page.left + pad, y + pad, avatar);
      const nameY = y + pad + t.type.h2;
      const name = ui.fitText(canvas, view.name.toUpperCase(), textW, {
        size: t.type.h2,
        floor: t.type.micro,
        bold: true,
      });
      ui.displayText(canvas, name.lines[0] ?? view.name, textX, nameY, name.size);
      let cursor = nameY;
      if (view.cloudStatus) {
        const status = ui.textBox(canvas, view.cloudStatus, textX, cursor + t.space.xs + t.type.caption, textW, {
          size: t.type.caption,
          maxLines: 2,
          lineHeight: lineHeight(t.type.caption),
          alpha: t.alpha.muted,
        });
        cursor = status.lastBaseline;
      }
      if (data) {
        const badgeY = cursor + t.space.sm + t.type.micro + 4;
        const coinsW = ui.badge(
          canvas,
          `◆ ${data.coins.toLocaleString("en-US")}`,
          textX,
          badgeY,
          "#a86a0c",
          "left",
          t.type.micro,
        );
        ui.badge(
          canvas,
          `⬡ ${data.shards.toLocaleString("en-US")}`,
          textX + coinsW + t.space.sm,
          badgeY,
          "#7d3fc8",
          "left",
          t.type.micro,
        );
        data.showcases.forEach((seal, index) => {
          ui.seal(
            canvas,
            textX + sealR + index * (sealR * 2 + t.space.md),
            badgeY + t.space.sm + sealR + 4,
            sealR,
            seal.color,
            seal.glyph,
            false,
          );
        });
      }
      kit.actions(items, page.right - pad - actionsW, y + (height - actionsH) / 2, actionsW, scrollView);
    };
    return { height, draw };
  }

  /** Vault import controls with their status line. */
  function vaultToolbar(page: CompactPage, view: ProfileScreenView): readonly ScrollBlock[] {
    const archive = view.archive,
      items: FlowAction[] = [];
    if (archive === undefined) return [];
    items.push({
      label: "IMPORT A REPLAY FILE",
      action: { type: "profile.pickGhostArchive" },
      enabled: archive.canPick,
    });
    if (archive.jobId !== undefined && archive.revision !== undefined) {
      if (archive.canReselect)
        items.push({ label: "CHOOSE AGAIN", action: { type: "profile.reselectGhostArchive", id: archive.jobId } });
      if (archive.canRestore)
        items.push({
          label: archive.pairedCapsuleIds ? "RESTORE BOTH" : "RESTORE",
          action: { type: "profile.restoreGhostArchive", id: archive.jobId, revision: archive.revision },
        });
      if (archive.canCancel)
        items.push({
          label: "CANCEL",
          action: { type: "profile.cancelGhostRestore", id: archive.jobId, revision: archive.revision },
        });
    }
    if (archive.canCancelSelection)
      items.push({ label: "CANCEL", action: { type: "profile.cancelGhostArchiveSelection" } });
    const height = kit.actionsHeight(items, page.width);
    const blocks: ScrollBlock[] = [
      { height, draw: (y, scrollView) => kit.actions(items, page.left, y, page.width, scrollView) },
    ];
    const status = [
      ARCHIVE_STATUS[archive.status] ?? "",
      archive.pairedCapsuleIds ? "Includes the scored run and its finale." : "",
    ]
      .filter(Boolean)
      .join(" ");
    if (status) blocks.push(kit.prose(page, status, { alpha: ui.t.alpha.soft, maxLines: 2 }));
    return blocks;
  }

  function replayBlocks(page: CompactPage, view: ProfileScreenView): readonly ScrollBlock[] {
    const replays = view.replays ?? [],
      vault = view.tab === "vault";
    if (replays.length === 0) {
      const empty = profileListEmptyState(view);
      return [
        kit.empty(
          page,
          empty.glyph,
          empty.line,
          empty.detail,
          vault ? undefined : { label: "PLAY A RUN", action: { type: "profile.play" } },
        ),
      ];
    }
    const blocks: ScrollBlock[] = view.message ? [kit.prose(page, view.message, { maxLines: 2 })] : [];
    for (const replay of replays) {
      blocks.push(
        kit.replayRow(
          page,
          replay,
          vault ? vaultActions(replay) : replayActions(replay),
          replay.pinned ? GOLD : undefined,
        ),
      );
    }
    return blocks;
  }

  /** A local replay's actions: watch, then pin, share and delete for this device's recordings. */
  function replayActions(replay: ReplayView): readonly FlowAction[] {
    const items: FlowAction[] = [
      { label: "▶  WATCH", action: { type: "profile.watchReplay", id: replay.id }, enabled: replay.available },
    ];
    if (replay.local) {
      items.push({
        label: replay.pinned ? "★ PINNED" : "PIN",
        selected: replay.pinned,
        action: { type: "profile.pinReplay", id: replay.id, pinned: !replay.pinned },
      });
      items.push({
        label: replay.shared ? "SHARED" : "SHARE",
        selected: replay.shared,
        enabled: !replay.shared,
        action: { type: "profile.publishReplay", id: replay.id },
      });
      items.push({ label: "✕ DELETE", action: { type: "profile.deleteReplay", id: replay.id } });
    }
    return items;
  }

  /** A saved replay's vault actions, in the desktop row's order. */
  function vaultActions(replay: ReplayView): readonly FlowAction[] {
    const items: FlowAction[] = [
      {
        label: replay.theaterUnavailable ? "CAN'T PLAY" : "◆ THEATER",
        enabled: replay.available,
        action: { type: "profile.watchGhostCapsule", id: replay.id },
      },
    ];
    if (replay.canDownloadArchive)
      items.push({ label: "DOWNLOAD", action: { type: "profile.downloadGhostArchive", id: replay.id } });
    return items;
  }

  /** BESTS: the finest run, then one row per mode and difficulty record. */
  function bests(page: CompactPage, view: ProfileScreenView): readonly ScrollBlock[] {
    const t = ui.t,
      blocks: ScrollBlock[] = [];
    if (view.finest) {
      const finest = view.finest;
      blocks.push({
        height: t.type.h2 + t.space.sm + t.type.micro,
        draw: (y) => {
          ui.title(context.canvas, finest.headline, page.centerX, y + t.type.h2, t.type.h2);
          ui.tag(
            context.canvas,
            finest.detail,
            page.centerX,
            y + t.type.h2 + t.space.sm + t.type.micro,
            ui.readable(PROFILE_HUE),
            "center",
            t.type.micro,
          );
        },
      });
    }
    const records = view.records ?? [];
    if (records.length === 0) {
      const play = { label: "PLAY A RUN", action: { type: "profile.play" } } as const;
      if (view.emptyMessage) blocks.push(kit.empty(page, "▲", "No records yet", view.emptyMessage, play));
      return blocks;
    }
    const columns = { wave: page.right - 520, time: page.right - 260, score: page.right };
    const rowH = lineHeight(t.type.label) + t.space.md;
    blocks.push({
      height: t.type.micro + t.space.sm,
      draw: (y) => {
        const baseline = y + t.type.micro;
        ui.tag(context.canvas, "MODE", page.left, baseline, t.color.muted, "left", t.type.micro);
        ui.tag(context.canvas, "WAVE", columns.wave, baseline, t.color.muted, "right", t.type.micro);
        ui.tag(context.canvas, "TIME", columns.time, baseline, t.color.muted, "right", t.type.micro);
        ui.tag(context.canvas, "SCORE", columns.score, baseline, t.color.muted, "right", t.type.micro);
        ui.divider(context.canvas, page.left, baseline + t.space.xs, page.width, 0.16);
      },
    });
    for (const record of records) {
      blocks.push({
        height: rowH,
        draw: (y) => {
          const baseline = y + t.type.label;
          ui.text(context.canvas, record.mode, page.left, baseline, t.type.label);
          ui.tag(
            context.canvas,
            record.difficulty.toUpperCase(),
            page.left + kit.textWidth(record.mode, t.type.label, false) + t.space.md,
            baseline,
            ui.readable(record.accent ?? t.color.muted),
            "left",
            t.type.micro,
          );
          ui.text(context.canvas, record.wave, columns.wave, baseline, t.type.label, "right");
          ui.text(context.canvas, record.time, columns.time, baseline, t.type.label, "right", t.alpha.soft);
          ui.text(context.canvas, record.score, columns.score, baseline, t.type.label, "right");
          ui.divider(context.canvas, page.left, baseline + t.space.sm, page.width, 0.08);
        },
      });
    }
    return blocks;
  }

  /** STATS: stat cards in four columns, then the journey through biomes and bosses. */
  function stats(page: CompactPage, view: ProfileScreenView): readonly ScrollBlock[] {
    const t = ui.t,
      pad = t.space.md,
      cardH = pad * 2 + t.type.h2 + t.space.sm + t.type.micro;
    const blocks: ScrollBlock[] = [
      ...kit.grid(
        page,
        view.stats,
        4,
        () => cardH,
        (stat, x, y, w, h) => {
          const { canvas } = context;
          ui.card(canvas, x, y, w, h, false);
          if (stat.accent) {
            canvas.fillStyle = stat.accent;
            canvas.fillRect(x, y, w, 4);
          }
          const glyphInk = stat.accent === undefined ? undefined : ui.readable(stat.accent);
          if (stat.glyph) ui.tag(canvas, stat.glyph, x + pad, y + pad + t.type.h2, glyphInk, "left", t.type.title);
          const value = ui.fitText(canvas, stat.value, w - pad * 2 - t.type.title * 2, {
            size: t.type.h2,
            floor: t.type.micro,
            bold: true,
          });
          ui.title(canvas, value.lines[0] ?? stat.value, x + w / 2 + t.type.title / 2, y + pad + t.type.h2, value.size);
          const label = ui.fitText(canvas, stat.label.toUpperCase(), w - pad * 2, {
            size: t.type.micro,
            floor: t.type.micro,
            bold: true,
          });
          ui.tag(
            canvas,
            label.lines[0] ?? stat.label,
            x + w / 2,
            y + pad + t.type.h2 + t.space.sm + t.type.micro,
            t.color.muted,
            "center",
            t.type.micro,
          );
        },
      ),
    ];
    if (view.journey) {
      blocks.push(kit.section(page, "THE JOURNEY", PROFILE_HUE));
      blocks.push(
        kit.prose(
          page,
          view.journey.biomes.map((item) => `${item.selected ? "◆" : "◇"} ${item.label.toUpperCase()}`).join("    "),
          { size: t.type.micro, alpha: t.alpha.full, maxLines: 3 },
        ),
      );
      blocks.push(
        kit.prose(
          page,
          view.journey.bosses.map((item) => `${item.selected ? "☠" : "◇"} ${item.label.toUpperCase()}`).join("    "),
          { size: t.type.micro, alpha: t.alpha.full, maxLines: 3 },
        ),
      );
    }
    return blocks;
  }

  // ---- ACHIEVEMENTS ----------------------------------------------------------------
  function achievements(view: AchievementsScreenView): void {
    const page = kit.header({
      title: "ACHIEVEMENTS",
      hue: GOLD,
      tabs: view.categories,
      tabAction: (id) => ({ type: "achievements.selectCategory", id }),
    });
    const blocks: ScrollBlock[] = view.dailies ? [...dailies(page, view), summary(page, view)] : [];
    const width = (page.width - ui.t.space.md) / 2;
    blocks.push(
      ...kit.grid(
        page,
        view.cards,
        2,
        (row) => Math.max(...row.map((card) => achievementHeight(card, width))),
        achievementCard,
      ),
    );
    kit.footer(page, kit.scroll(page, blocks));
  }

  /** Today's challenges: a heading with the reset time, then one card per challenge. */
  function dailies(page: CompactPage, view: AchievementsScreenView): readonly ScrollBlock[] {
    const t = ui.t,
      pad = t.space.md,
      list = (view.dailies ?? []).slice(0, 3),
      width = (page.width - pad * (list.length - 1)) / Math.max(1, list.length);
    const labelW = (daily: (typeof list)[number]): number =>
      width - pad * 3 - kit.textWidth(daily.done === true ? "✓ DONE" : daily.reward, t.type.label, true);
    const labelLines = Math.max(1, ...list.map((daily) => lineCount(daily.label, labelW(daily), t.type.body, 2)));
    const cardH = pad + labelLines * lineHeight(t.type.body) + t.space.sm + 8 + t.space.sm + t.type.micro + pad;
    const heading: ScrollBlock = {
      height: t.type.micro + t.space.xs,
      draw: (y) => {
        ui.tag(
          context.canvas,
          "DAILY CHALLENGES",
          page.left,
          y + t.type.micro,
          ui.readable(t.color.accent),
          "left",
          t.type.micro,
        );
        if (view.resetsIn)
          ui.tag(
            context.canvas,
            `RESETS IN ${view.resetsIn}`,
            page.right,
            y + t.type.micro,
            t.color.muted,
            "right",
            t.type.micro,
          );
      },
    };
    return [
      heading,
      ...kit.grid(
        page,
        list,
        Math.max(1, list.length),
        () => cardH,
        (daily, x, y, w, h) => {
          const { canvas } = context,
            done = daily.done === true,
            hue = done ? "#2f9e6b" : t.color.accent;
          ui.card(canvas, x, y, w, h, false);
          ui.accentStrip(canvas, x, y, w, hue);
          const reward = done ? "✓ DONE" : daily.reward,
            baseline = y + pad + t.type.body;
          ui.textBox(canvas, daily.label, x + pad, baseline, labelW(daily), {
            size: t.type.body,
            maxLines: 2,
            lineHeight: lineHeight(t.type.body),
          });
          ui.tag(canvas, reward, x + w - pad, baseline, ui.readable(hue), "right", t.type.label);
          const barY = y + pad + labelLines * lineHeight(t.type.body) + t.space.sm;
          ui.bar(canvas, x + pad, barY, w - pad * 2, 8, daily.goal > 0 ? daily.current / daily.goal : 0, hue);
          ui.text(
            canvas,
            `${daily.current.toLocaleString("en-US")} / ${daily.goal.toLocaleString("en-US")}`,
            x + pad,
            barY + 8 + t.space.sm + t.type.micro,
            t.type.micro,
            "left",
            t.alpha.soft,
          );
        },
      ),
    ];
  }

  /** Shards, overall progress and the next achievements within reach. */
  function summary(page: CompactPage, view: AchievementsScreenView): ScrollBlock {
    const t = ui.t,
      pad = t.space.md,
      nextLines = view.nextUp ? lineCount(`NEXT UP ▸  ${view.nextUp}`, page.width - pad * 2, t.type.micro, 2) : 0;
    const height = pad + t.type.lead + (nextLines > 0 ? t.space.sm + nextLines * lineHeight(t.type.micro) : 0) + pad;
    const draw = (y: number): void => {
      const { canvas } = context,
        baseline = y + pad + t.type.lead;
      canvas.globalAlpha = 0.06;
      canvas.fillStyle = ui.ink;
      canvas.fillRect(page.left, y, page.width, height);
      canvas.globalAlpha = 1;
      canvas.fillStyle = t.color.accent;
      canvas.fillRect(page.left, y, 4, height);
      const shards = `◆ ${(view.shards ?? 0).toLocaleString("en-US")} SHARDS`,
        shardsW = kit.textWidth(shards, t.type.lead, true);
      ui.tag(canvas, shards, page.left + pad + 4, baseline, ui.readable("#0f9fb0"), "left", t.type.lead);
      const count = `${String(view.unlocked)} / ${String(view.total)}`,
        countW = kit.textWidth(count, t.type.caption, true);
      const barX = page.left + pad * 3 + shardsW,
        barW = Math.max(0, page.right - pad * 3 - countW - barX);
      ui.bar(
        canvas,
        barX,
        baseline - t.type.lead / 3,
        barW,
        8,
        view.total > 0 ? view.unlocked / view.total : 0,
        t.color.accent,
      );
      ui.tag(canvas, count, page.right - pad, baseline, ui.ink, "right", t.type.caption);
      if (view.nextUp)
        ui.textBox(
          canvas,
          `NEXT UP ▸  ${view.nextUp}`,
          page.left + pad + 4,
          baseline + t.space.sm + t.type.micro,
          page.width - pad * 2,
          {
            size: t.type.micro,
            bold: true,
            maxLines: 2,
            lineHeight: lineHeight(t.type.micro),
            color: ui.readable(t.color.accent),
          },
        );
    };
    return { height, draw };
  }

  function achievementHeight(card: CardView, width: number): number {
    const t = ui.t,
      pad = t.space.md,
      copy = card.description ? lineCount(card.description, width - pad * 2 - 84, t.type.micro, 2) : 0;
    return (
      pad +
      t.type.lead +
      t.space.sm +
      t.type.micro +
      t.space.sm +
      copy * lineHeight(t.type.micro) +
      t.space.sm +
      6 +
      t.space.sm +
      t.type.micro +
      pad
    );
  }

  function achievementCard(card: CardView, x: number, y: number, w: number, h: number, view: ScrollView): void {
    const { canvas } = context,
      t = ui.t,
      pad = t.space.md,
      unlocked = card.locked !== true;
    const rarity = card.accent ?? t.color.muted,
      rarityInk = unlocked ? ui.readable(rarity) : t.color.muted;
    ui.card(
      canvas,
      x,
      y,
      w,
      h,
      false,
      unlocked ? { edge: rarity, ...(card.shimmer === undefined ? {} : { shimmer: card.shimmer }) } : { dashed: true },
    );
    if (unlocked) {
      canvas.globalAlpha = 0.07;
      canvas.fillStyle = rarity;
      canvas.fillRect(x, y, w, h);
      canvas.globalAlpha = 1;
      ui.spine(canvas, x, y, h, rarity);
    }
    const sealR = Math.ceil(t.type.micro / 0.95) + 2,
      textX = x + pad * 2 + sealR * 2,
      textW = x + w - pad - textX;
    ui.seal(canvas, x + pad + sealR, y + pad + sealR + 4, sealR, rarity, card.glyph ?? "★", !unlocked);
    const titleY = y + pad + t.type.lead;
    const title = ui.fitText(canvas, card.label, textW, { size: t.type.lead, floor: t.type.micro, bold: true });
    canvas.save();
    canvas.globalAlpha = unlocked ? 1 : 0.72;
    ui.displayText(canvas, title.lines[0] ?? card.label, textX, titleY, title.size);
    canvas.restore();
    // Rarity (and EARNED) under the name; progress on the left of the last line, the rewards on its right.
    const badgeY = titleY + t.space.sm + t.type.micro;
    const badge = [card.badge, card.footer].filter(Boolean).join("  ·  ");
    if (badge) ui.tag(canvas, badge, textX, badgeY, rarityInk, "left", t.type.micro);
    const copy = card.description
      ? ui.textBox(canvas, card.description, textX, badgeY + t.space.sm + t.type.micro, textW, {
          size: t.type.micro,
          maxLines: 2,
          lineHeight: lineHeight(t.type.micro),
          alpha: unlocked ? t.alpha.soft : t.alpha.muted,
        }).height
      : 0;
    const barY = badgeY + t.space.sm + copy + t.space.sm;
    ui.bar(canvas, textX, barY, textW, 6, card.progress ?? 0, unlocked ? rarity : t.color.accent);
    const footY = barY + 6 + t.space.sm + t.type.micro,
      progressW = card.progressLabel ? kit.textWidth(card.progressLabel, t.type.micro, true) + t.space.lg : 0;
    if (card.progressLabel) ui.tag(canvas, card.progressLabel, textX, footY, rarityInk, "left", t.type.micro);
    const rewards = ui.fitText(
      canvas,
      [card.rewardPrimary, card.rewardSecondary].filter(Boolean).join("   "),
      textW - progressW,
      { size: t.type.micro, floor: t.type.micro, bold: true },
    );
    if (rewards.lines[0])
      ui.tag(
        canvas,
        rewards.lines[0],
        x + w - pad,
        footY,
        unlocked ? ui.readable("#13c4d6") : t.color.muted,
        "right",
        t.type.micro,
      );
    view.enqueue({ x, y, w, h, label: "", hiddenBox: true, action: { type: "achievements.inspect", id: card.id } });
  }

  return Object.freeze({ profile, achievements });
}
