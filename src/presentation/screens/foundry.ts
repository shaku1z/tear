import type { FoundryScreenView, ScreenRenderContext } from "./contracts";
import { backControl } from "./screen-primitives";

/** C36 status is intentionally read-only: the only screen command is refresh. */
export function createFoundryRenderers(context: ScreenRenderContext) {
  return Object.freeze({
    foundry(view: FoundryScreenView): void {
      const { canvas, ui, width } = context;
      const panelX = width / 2 - 320;
      ui.header(canvas, "FOUNDRY", view.subtitle, context.enterAmount);
      ui.panel(canvas, panelX, 120, 640, 112);
      ui.sectionLabel(canvas, "AUTOMATION", panelX + 24, 150, 592);
      ui.displayText(canvas, "UNAVAILABLE / NOT RUNNING", panelX + 24, 178, ui.t.type.label, "left");
      ui.text(canvas, "Foundry jobs require an explicit authorized manual phase. This screen never starts, schedules, evaluates, activates, or promotes work.", panelX + 24, 202, ui.t.type.caption, "left", ui.t.alpha.muted);
      if (view.status !== "ready") {
        ui.panel(canvas, panelX, 252, 640, 116);
        ui.text(canvas, view.status === "loading" ? "Reading local Foundry recovery projections..." : view.subtitle, width / 2, 286, ui.t.type.body, "center", ui.t.alpha.muted);
        if (view.status === "unavailable") ui.text(canvas, "Check browser storage permissions, then refresh.", width / 2, 316, ui.t.type.caption, "center", ui.t.alpha.muted);
        context.enqueue({ x: width / 2 - 110, y: 328, w: 220, h: 40, label: "REFRESH", action: { type: "foundry.refresh" } });
      } else {
        const pageSize = 4;
        const offset = Math.max(0, Math.min(Math.max(0, view.jobs.length - pageSize), Math.floor(context.scroll / 100)));
        const jobs = view.jobs.slice(offset, offset + pageSize);
        const height = Math.max(108, 50 + jobs.length * 100);
        ui.panel(canvas, panelX, 252, 640, height);
        ui.sectionLabel(canvas, `LOCAL HASH-ONLY JOBS ${String(offset + 1)}-${String(offset + jobs.length)} / ${String(view.jobs.length)}`, panelX + 24, 282, 592);
        if (jobs.length === 0) ui.text(canvas, "No validated local Foundry jobs are stored.", panelX + 24, 316, ui.t.type.caption, "left", ui.t.alpha.muted);
        jobs.forEach((job, index) => {
          const y = 304 + index * 100;
          ui.displayText(canvas, `JOB ${job.jobHash.slice(0, 12).toUpperCase()}`, panelX + 24, y, ui.t.type.label, "left");
          ui.text(canvas, job.phase.toUpperCase(), panelX + 592, y, ui.t.type.caption, "right", ui.t.alpha.soft);
          ui.text(canvas, `NEXT MANUAL: ${job.nextManualPhase?.toUpperCase() ?? "NONE"} / ${job.resumable ? "RESUMABLE" : "TERMINAL"} / ${String(job.eventCount)} EVENTS`, panelX + 24, y + 22, ui.t.type.caption, "left", ui.t.alpha.muted);
          ui.text(canvas, `EVENT ${job.lastEventHash.slice(0, 12).toUpperCase()} / PROJECTION ${job.projectionHash.slice(0, 12).toUpperCase()}`, panelX + 24, y + 44, ui.t.type.micro, "left", ui.t.alpha.faint);
        });
        context.enqueue({ x: width / 2 - 110, y: 272 + height, w: 220, h: 40, label: "REFRESH", action: { type: "foundry.refresh" } });
        if (offset > 0 || offset + pageSize < view.jobs.length) ui.scrollHint(canvas, width / 2, 326 + height, offset > 0, offset + pageSize < view.jobs.length);
      }
      backControl(context);
    },
  });
}
