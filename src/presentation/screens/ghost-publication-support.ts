import type { GhostPublicationScreenView, GhostSupportScreenView, ScreenRenderContext } from "./contracts";
import { backControl } from "./screen-primitives";

/** Replay publication and support screens (engineering builds only until the cloud service ships). */
export function createGhostPublicationSupportRenderers(context: ScreenRenderContext) {
  return Object.freeze({
    ghostpublication(view: GhostPublicationScreenView): void {
      const { canvas, ui, width } = context,
        left = 244,
        top = 182,
        panelWidth = 792;
      ui.header(
        canvas,
        "GHOST PUBLICATION",
        "review local custody before any foreground upload",
        context.enterAmount,
        ui.t.color.accent,
      );
      ui.sectionLabel(canvas, "LOCAL REVIEW", left, top - 26, panelWidth);
      ui.card(canvas, left, top, panelWidth, 470);
      ui.text(
        canvas,
        `STATUS / ${view.status.toUpperCase()}`,
        left + 24,
        top + 36,
        ui.t.type.label,
        "left",
        view.status === "ready" ? ui.t.alpha.full : ui.t.alpha.muted,
      );
      ui.wrappedText(
        canvas,
        view.detail,
        left + 24,
        top + 64,
        panelWidth - 48,
        20,
        ui.t.type.caption,
        "left",
        ui.t.alpha.soft,
      );
      const rows = [
        `CAPSULE / ${view.capsuleId ?? "UNAVAILABLE"}`,
        `SOURCE ROOT / ${view.rootIntegrity ?? "UNAVAILABLE"}`,
        `CAPABILITY / ${view.capability}`,
        "PRIVACY / PSEUDONYMOUS    VISIBILITY / PRIVATE",
        "TRAINING / NO-TRAINING (NOT COLLECTED OR GRANTED)",
      ];
      rows.forEach((row, index) => {
        ui.text(canvas, row, left + 24, top + 136 + index * 34, ui.t.type.caption, "left", ui.t.alpha.soft);
      });
      if (view.attempts !== undefined)
        ui.text(
          canvas,
          `ATTEMPTS / ${String(view.attempts)}${view.retryAt === undefined ? "" : `    RETRY AFTER / ${view.retryAt}`}${view.terminal === undefined ? "" : `    TERMINAL / ${view.terminal.toUpperCase()}`}`,
          left + 24,
          top + 306,
          ui.t.type.micro,
          "left",
          ui.t.alpha.soft,
        );
      context.enqueue({
        x: left + 24,
        y: top + 332,
        w: 360,
        h: 46,
        label: view.status === "queued" ? "RUN UPLOAD ONCE" : "GRANT LOCAL PUBLICATION",
        enabled: view.status === "queued" ? view.canRun : view.canGrant,
        action: view.status === "queued" ? { type: "ghostpublication.runOnce" } : { type: "ghostpublication.grant" },
      });
      context.enqueue({
        x: left + 408,
        y: top + 332,
        w: 360,
        h: 46,
        label: "CANCEL PUBLICATION",
        enabled: view.canCancel,
        action: { type: "ghostpublication.cancel" },
      });
      ui.wrappedText(
        canvas,
        "Granting records capsule-bound local consent and queues intent only. RUN UPLOAD ONCE is foreground-only: no timer, reload action, or background scan can upload this capsule.",
        width / 2,
        706,
        760,
        19,
        ui.t.type.caption,
        "center",
        ui.t.alpha.muted,
      );
      backControl(context);
    },
    ghostsupport(view: GhostSupportScreenView): void {
      const { canvas, ui, width } = context,
        left = 244,
        top = 182,
        panelWidth = 792;
      ui.header(canvas, "GHOST SUPPORT", "local sanitized bundle review", context.enterAmount, ui.t.color.accent);
      ui.sectionLabel(canvas, "PLAYER-APPROVED LOCAL SUPPORT", left, top - 26, panelWidth);
      ui.card(canvas, left, top, panelWidth, 470);
      ui.text(
        canvas,
        `STATUS / ${view.status.toUpperCase()}`,
        left + 24,
        top + 36,
        ui.t.type.label,
        "left",
        view.status === "ready" ? ui.t.alpha.full : ui.t.alpha.muted,
      );
      ui.wrappedText(
        canvas,
        view.detail,
        left + 24,
        top + 64,
        panelWidth - 48,
        20,
        ui.t.type.caption,
        "left",
        ui.t.alpha.soft,
      );
      [
        `CAPSULE / ${view.capsuleId ?? "UNAVAILABLE"}`,
        `SOURCE ROOT / ${view.rootIntegrity ?? "UNAVAILABLE"}`,
        `BUILD / ${view.build ?? "UNAVAILABLE"}`,
        `REQUESTED RANGE / ${view.range ?? "UNAVAILABLE"}`,
        `TRACK SCOPE / ${view.segments ?? "UNAVAILABLE"}`,
        `BUNDLE HASH / ${view.bundleHash ?? "NOT CREATED"}`,
      ].forEach((row, index) => {
        ui.text(canvas, row, left + 24, top + 136 + index * 30, ui.t.type.micro, "left", ui.t.alpha.soft);
      });
      context.enqueue({
        x: left + 216,
        y: top + 342,
        w: 360,
        h: 46,
        label: "CREATE LOCAL BUNDLE",
        enabled: view.canCreate,
        action: { type: "ghostsupport.create" },
      });
      ui.wrappedText(
        canvas,
        "EXCLUDED: replay bytes, actions, account identifiers, credentials, publication, consent, training, moderation, and transport state. NO TRAINING. NO CLOUD. NO SUPPORT SUBMISSION. This action creates no saved artifact.",
        width / 2,
        706,
        760,
        19,
        ui.t.type.caption,
        "center",
        ui.t.alpha.muted,
      );
      backControl(context);
    },
  });
}
