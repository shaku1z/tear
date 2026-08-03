import type { AcademyScreenView, ScreenRenderContext } from "./contracts";
import { backControl } from "./screen-primitives";

export function createAcademyRenderers(context: ScreenRenderContext) {
  return Object.freeze({
    academy(view: AcademyScreenView): void {
      const { ui, canvas, width } = context;
      const panelX = width / 2 - 320;
      let y = 120;
      ui.header(canvas, "ACADEMY", view.subtitle, context.enterAmount);
      ui.panel(canvas, panelX, y, 640, Math.max(160, 56 + view.rows.length * 34));
      y += 38;
      if (view.status === "loading") ui.text(canvas, "Reading Academy custody...", width / 2, y, ui.t.type.body, "center", ui.t.alpha.muted);
      else if (view.status === "unavailable") ui.text(canvas, view.subtitle, width / 2, y, ui.t.type.body, "center", ui.t.alpha.muted);
      else {
        view.rows.forEach((row) => { ui.text(canvas, row.label, width / 2 - 288, y, ui.t.type.body, "left"); ui.displayText(canvas, row.value, width / 2 + 288, y, ui.t.type.body, "right"); y += 34; });
        const recordY = 332;
        const recordHeight = Math.max(84, 46 + view.records.length * 52);
        ui.panel(canvas, panelX, recordY, 640, recordHeight);
        ui.sectionLabel(canvas, "DURABLE RECORDS", panelX + 24, recordY + 30, 592);
        if (view.records.length === 0) ui.text(canvas, "No governed records are stored in this Academy.", panelX + 24, recordY + 64, ui.t.type.caption, "left", ui.t.alpha.muted);
        else view.records.forEach((record, index) => {
          const recordTop = recordY + 52 + index * 52;
          ui.displayText(canvas, record.id, panelX + 24, recordTop, ui.t.type.label, "left");
          ui.text(canvas, record.state.toUpperCase(), panelX + 592, recordTop, ui.t.type.caption, "right", ui.t.alpha.soft);
          ui.text(canvas, record.detail, panelX + 24, recordTop + 20, ui.t.type.caption, "left", ui.t.alpha.muted);
        });
        const manifestY = recordY + recordHeight + 20;
        ui.panel(canvas, panelX, manifestY, 640, Math.max(84, 46 + view.manifests.length * 36));
        ui.sectionLabel(canvas, "MANIFEST REVISIONS", panelX + 24, manifestY + 30, 592);
        if (view.manifests.length === 0) ui.text(canvas, "No durable manifest revisions are stored.", panelX + 24, manifestY + 64, ui.t.type.caption, "left", ui.t.alpha.muted);
        else view.manifests.forEach((manifest, index) => {
          const manifestTop = manifestY + 52 + index * 36;
          ui.displayText(canvas, manifest.id, panelX + 24, manifestTop, ui.t.type.label, "left");
          ui.text(canvas, manifest.detail, panelX + 592, manifestTop, ui.t.type.caption, "right", ui.t.alpha.muted);
        });
      }
      backControl(context);
    },
  });
}
