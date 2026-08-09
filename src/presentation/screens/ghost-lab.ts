import type { BotEvidenceScreenView, GhostLabScreenView, ScreenRenderContext } from "./contracts";
import { backControl } from "./screen-primitives";

/** Presentation-only normal Ghost Lab home. No diagnostic/test-only state crosses this boundary. */
export function createGhostLabRenderers(context: ScreenRenderContext) {
  return Object.freeze({
    ghostlab(view: GhostLabScreenView): void {
      const { canvas, ui, width } = context;
      ui.header(canvas, "GHOST LAB", view.subtitle, context.enterAmount, ui.t.color.accent);
      const left = 260, top = 178, cardWidth = 430;
      ui.sectionLabel(canvas, "AVAILABLE LOCALLY", left, top - 28, cardWidth);
      view.routes.forEach((route, index) => {
        const y = top + index * 100;
        ui.card(canvas, left, y, cardWidth, 82);
        ui.text(canvas, route.label, left + 24, y + 33, ui.t.type.label, "left", ui.t.alpha.full);
        ui.wrappedText(canvas, route.detail, left + 24, y + 55, cardWidth - 44, 17, ui.t.type.caption, "left", ui.t.alpha.soft);
        context.enqueue({ x: left, y, w: cardWidth, h: 82, label: route.label,
          sub: route.detail, action: { type: "ghostlab.open", destination: route.id } });
      });
      const watch = view.watch;
      ui.sectionLabel(canvas, "LOCAL WATCH", left, 620, cardWidth);
      // Status and controls are separate bands so the canvas hit target remains
      // visibly and physically distinct from descriptive copy.
      ui.text(canvas, `STATUS / ${watch.status.toUpperCase()} / ${String(watch.decisions)} DECISIONS`, left + 20, 656, ui.t.type.caption, "left", ui.t.alpha.soft);
      ui.wrappedText(canvas, watch.detail, left + 20, 678, 390, 15, ui.t.type.micro, "left", ui.t.alpha.muted);
      const command = watch.status === "ready" ? "start" : watch.status === "running" ? "pause" : watch.status === "paused" ? "resume" : "stop";
      const label = command === "start" ? "START WATCH" : command === "pause" ? "PAUSE WATCH" : command === "resume" ? "RESUME WATCH" : "STOP WATCH";
      context.enqueue({ x: left, y: 728, w: 200, h: 44, label, enabled: command !== "stop" || watch.status === "running" || watch.status === "paused", action: { type: "ghostlab.watch", command } });
      if (watch.status === "running" || watch.status === "paused") context.enqueue({ x: left + 214, y: 728, w: 200, h: 44, label: "STOP WATCH", action: { type: "ghostlab.watch", command: "stop" } });
      const right = 760;
      ui.sectionLabel(canvas, "NOT YET PLAYER-SAFE", right, top - 28, 430, ui.t.color.muted);
      view.unavailable.forEach((entry, index) => {
        const y = top + index * 82;
        ui.card(canvas, right, y, 430, 64, false, { dashed: true, edge: ui.t.color.muted });
        ui.text(canvas, `UNAVAILABLE / ${entry.label}`, right + 20, y + 25, ui.t.type.caption, "left", ui.t.alpha.muted);
        ui.wrappedText(canvas, entry.detail, right + 20, y + 44, 390, 15, ui.t.type.micro, "left", ui.t.alpha.faint);
      });
      ui.wrappedText(canvas, "This local home does not expose traffic, promotion, cloud operations, or test-only diagnostic controls.", width / 2, 795, 800, 19, ui.t.type.caption, "center", ui.t.alpha.muted);
      backControl(context);
    },
    botevidence(view: BotEvidenceScreenView): void {
      const { canvas, ui, width } = context;
      ui.header(canvas, "BOT EVIDENCE", view.subtitle, context.enterAmount, ui.t.color.accent);
      const left = 244, top = 182, panelWidth = 792;
      ui.sectionLabel(canvas, "CANONICAL LOCAL REPORT", left, top - 26, panelWidth);
      ui.card(canvas, left, top, panelWidth, 526);
      ui.text(canvas, `STATUS / ${view.status.toUpperCase()}`, left + 24, top + 34, ui.t.type.label, "left", view.status === "ready" ? ui.t.alpha.full : ui.t.alpha.muted);
      ui.wrappedText(canvas, view.detail, left + 24, top + 58, panelWidth - 48, 19, ui.t.type.caption, "left", ui.t.alpha.soft);
      if (view.report === undefined) {
        ui.tag(canvas, "UNAVAILABLE", left + 24, top + 118, ui.t.color.muted, "left");
        ui.wrappedText(canvas, "A report must be retained under its exact immutable hash. Missing, stale, or integrity-invalid evidence is not projected.", left + 24, top + 144, panelWidth - 48, 20, ui.t.type.body, "left", ui.t.alpha.muted);
      } else {
        const report = view.report;
        const rows = [
          `REPORT HASH / ${report.reportHash}`, `PLAN HASH / ${report.planHash}`,
          `ARTIFACT / ${report.artifactId}`, `ARTIFACT HASH / ${report.artifactHash}`,
          `APPROVAL / ${report.approvalHash}`, `PROMOTION RECEIPT / ${report.promotionReceiptHash}`,
          `ACTIVATION / ${report.activationHash}`, `CANDIDATE PAYLOAD / ${report.candidatePayloadHash}`,
          `EPISODES / ${String(report.episodes)}    COMPLETION / ${(report.completionRate * 100).toFixed(1)}%`,
          `MEAN TICKS / ${report.meanTicks.toFixed(1)}    CAP / ${String(report.maxTicksPerCase)}`,
          "PLACEMENT / UNASSIGNED    HUMAN CALIBRATION / NOT COMPARED    CERTIFICATION / NOT CERTIFIED",
        ];
        rows.forEach((row, index) => ui.text(canvas, row, left + 24, top + 114 + index * 31, index < 8 ? ui.t.type.micro : ui.t.type.caption, "left", index === 10 ? ui.t.alpha.full : ui.t.alpha.soft));
      }
      ui.wrappedText(canvas, "Read-only evidence projection. It does not evaluate, score, level, activate, promote, route traffic, or compare human data.", width / 2, 742, 790, 20, ui.t.type.caption, "center", ui.t.alpha.muted);
      backControl(context);
    },
  });
}
