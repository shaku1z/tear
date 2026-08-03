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
        const recordPageSize = 4;
        const recordOffset = Math.max(0, Math.min(Math.max(0, view.records.length - recordPageSize), Math.floor(context.scroll / 52)));
        const visibleRecords = view.records.slice(recordOffset, recordOffset + recordPageSize);
        const recordHeight = Math.max(84, 46 + visibleRecords.length * 52);
        ui.panel(canvas, panelX, recordY, 640, recordHeight);
        ui.sectionLabel(canvas, `DURABLE RECORDS ${String(recordOffset + 1)}-${String(recordOffset + visibleRecords.length)} / ${String(view.records.length)}`, panelX + 24, recordY + 30, 592);
        if (view.records.length === 0) ui.text(canvas, "No governed records are stored in this Academy.", panelX + 24, recordY + 64, ui.t.type.caption, "left", ui.t.alpha.muted);
        else visibleRecords.forEach((record, index) => {
          const recordTop = recordY + 52 + index * 52;
          ui.displayText(canvas, record.id, panelX + 24, recordTop, ui.t.type.label, "left");
          ui.text(canvas, record.state.toUpperCase(), panelX + 592, recordTop, ui.t.type.caption, "right", ui.t.alpha.soft);
          ui.text(canvas, record.detail, panelX + 24, recordTop + 20, ui.t.type.caption, "left", ui.t.alpha.muted);
        });
        const manifestY = recordY + recordHeight + 20;
        const manifestPageSize = 3;
        const manifestOffset = Math.max(0, Math.min(Math.max(0, view.manifests.length - manifestPageSize), Math.floor(context.scroll / 52)));
        const visibleManifests = view.manifests.slice(manifestOffset, manifestOffset + manifestPageSize);
        ui.panel(canvas, panelX, manifestY, 640, Math.max(84, 46 + visibleManifests.length * 36));
        ui.sectionLabel(canvas, `MANIFEST REVISIONS ${String(manifestOffset + 1)}-${String(manifestOffset + visibleManifests.length)} / ${String(view.manifests.length)}`, panelX + 24, manifestY + 30, 592);
        if (view.manifests.length === 0) ui.text(canvas, "No durable manifest revisions are stored.", panelX + 24, manifestY + 64, ui.t.type.caption, "left", ui.t.alpha.muted);
        else visibleManifests.forEach((manifest, index) => {
          const manifestTop = manifestY + 52 + index * 36;
          ui.displayText(canvas, manifest.id, panelX + 24, manifestTop, ui.t.type.label, "left");
          ui.text(canvas, manifest.detail, panelX + 592, manifestTop, ui.t.type.caption, "right", ui.t.alpha.muted);
        });
        const lessonY = manifestY + Math.max(84, 46 + visibleManifests.length * 36) + 20;
        const lessons = view.lessons ?? [];
        ui.panel(canvas, panelX, lessonY, 640, Math.max(84, 46 + lessons.length * 34));
        ui.sectionLabel(canvas, "GOVERNED LESSON STATUS", panelX + 24, lessonY + 30, 592);
        lessons.forEach((lesson, index) => {
          const lessonTop = lessonY + 52 + index * 34;
          ui.displayText(canvas, lesson.id, panelX + 24, lessonTop, ui.t.type.label, "left");
          ui.text(canvas, lesson.state, panelX + 592, lessonTop, ui.t.type.caption, "right", ui.t.alpha.soft);
          ui.text(canvas, lesson.detail, panelX + 24, lessonTop + 16, ui.t.type.micro, "left", ui.t.alpha.muted);
        });
        const canScrollDown = recordOffset < Math.max(0, view.records.length - recordPageSize)
          || manifestOffset < Math.max(0, view.manifests.length - manifestPageSize);
        if (recordOffset > 0 || manifestOffset > 0 || canScrollDown) {
          ui.scrollHint(canvas, width / 2, lessonY + Math.max(84, 46 + lessons.length * 34) + 16,
            recordOffset > 0 || manifestOffset > 0, canScrollDown);
        }
      }
      backControl(context);
    },
  });
}
