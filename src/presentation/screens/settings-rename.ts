import type { RenameScreenView, ScreenRenderContext, SettingsScreenView } from "./contracts";
import { clipBody, page, pageFooter, tabs } from "./screen-primitives";
import { RENAME_FIELD } from "../rename-field";

export const SETTINGS_LIST_TOP = 214;
type SettingsRow = SettingsScreenView["sections"][number]["rows"][number];

export function createSettingsRenameRenderers(context: ScreenRenderContext) {
  const { ui, width, height } = context;

  /** − value + stepper, plus the optional MUTE toggle to its left (volume rows). */
  function stepperControl(row: SettingsRow, controlX: number, controlY: number): void {
    const { canvas } = context;
    const { settingsStepperW: stepper, settingsControlW: controlWidth, settingsControlH: controlHeight } = ui.t.metric;
    context.enqueue({
      x: controlX,
      y: controlY,
      w: stepper,
      h: controlHeight,
      label: "−",
      enabled: row.enabled,
      action: { type: "settings.step", key: row.key, delta: -1 },
    });
    ui.text(
      canvas,
      row.muted ? "MUTED" : row.value,
      controlX + controlWidth / 2,
      controlY + controlHeight / 2 + 6,
      ui.t.type.label,
      "center",
      row.muted ? ui.t.alpha.muted : ui.t.alpha.full,
    );
    context.enqueue({
      x: controlX + controlWidth - stepper,
      y: controlY,
      w: stepper,
      h: controlHeight,
      label: "+",
      enabled: row.enabled,
      action: { type: "settings.step", key: row.key, delta: 1 },
    });
    if (row.muteKey) {
      context.enqueue({
        x: controlX - 116,
        y: controlY,
        w: 104,
        h: controlHeight,
        label: row.muted ? "MUTED" : "MUTE",
        selected: row.muted,
        size: ui.t.type.label,
        action: { type: "settings.toggle", key: row.muteKey },
      });
    }
  }

  function settings(view: SettingsScreenView): void {
    const { canvas } = context;
    const layout = page(context, { title: "SETTINGS", subtitle: "sound, controls, display and accessibility" });
    tabs(context, view.tabs, (id) => ({ type: "settings.selectTab", id }), 150);
    if (view.tab === "audio")
      ui.tag(
        canvas,
        "MASTER controls the final mix; MUSIC and SOUND EFFECTS remain independently adjustable.",
        width / 2,
        206,
        ui.t.color.muted,
        "center",
        ui.t.type.micro,
      );
    const left = 320,
      panelWidth = width - 640;
    const metric = ui.t.metric,
      rowHeight = metric.settingsRowH,
      controlWidth = metric.settingsControlW,
      controlHeight = metric.settingsControlH;
    // Every control starts on one shared left edge, whatever its kind.
    const controlX = left + panelWidth - controlWidth - 12;
    const top = SETTINGS_LIST_TOP,
      bottom = layout.bodyBottom;
    let y = top + 4 - context.scroll;
    clipBody(context, top - 6, bottom, () => {
      view.sections.forEach((section) => {
        y = ui.sectionLabel(canvas, section.label, left, y + 12, panelWidth) + 14;
        section.rows.forEach((row) => {
          const controlY = y + (rowHeight - controlHeight) / 2 - 4;
          const visible = controlY >= top - 2 && controlY + controlHeight <= bottom;
          // A row with nothing to draw in the control column (a credit) gives its text the full width.
          const bare = row.kind === "info" && row.value === "";
          const labelRight = bare ? panelWidth - 24 : controlX - (row.muteKey ? 128 : 20) - (left + 12);
          ui.textBox(canvas, row.label, left + 12, y + (row.note ? 22 : 30), labelRight, {
            size: ui.t.type.body,
            maxLines: 1,
          });
          if (row.note) {
            ui.textBox(canvas, row.note, left + 12, y + 42, labelRight, {
              size: ui.t.type.micro,
              color: ui.t.color.muted,
              bold: true,
              maxLines: 1,
            });
          }
          if (visible) {
            if (row.kind === "stepper") {
              stepperControl(row, controlX, controlY);
            } else if (row.kind === "info") {
              ui.text(
                canvas,
                row.value,
                controlX + controlWidth,
                controlY + controlHeight / 2 + 6,
                ui.t.type.label,
                "right",
                ui.t.alpha.muted,
              );
            } else if (row.kind === "toggle") {
              context.enqueue({
                x: controlX,
                y: controlY,
                w: controlWidth,
                h: controlHeight,
                size: ui.t.type.label,
                label: row.on ? "ON" : "OFF",
                selected: row.on,
                enabled: row.enabled,
                action: { type: "settings.toggle", key: row.key },
              });
            } else {
              context.enqueue({
                x: controlX,
                y: controlY,
                w: controlWidth,
                h: controlHeight,
                size: ui.t.type.label,
                label: row.value,
                enabled: row.enabled,
                action: { type: "settings.activate", key: row.key },
              });
            }
          }
          y += rowHeight;
        });
        y += 4;
      });
    });
    // Enqueued after the rows so keyboard focus starts on the first setting, not on RESET.
    // RESET sits in the header, away from BACK; it keeps the shared minimum target and fits its label.
    if (view.resettable) {
      context.canvas.font = ui.font(ui.t.type.label, true);
      const resetW = Math.max(210, Math.ceil(context.canvas.measureText("RESET DEFAULTS").width) + 32),
        resetH = Math.max(40, ui.t.metric.minTarget);
      context.enqueue({
        x: layout.sheet.x + layout.sheet.w - 48 - resetW,
        y: layout.sheet.y + 14,
        w: resetW,
        h: resetH,
        label: "RESET DEFAULTS",
        size: ui.t.type.label,
        action: { type: "settings.reset" },
      });
    }
    pageFooter(context, {
      back: { type: "navigate.back" },
      canScrollUp: view.canScrollUp,
      canScrollDown: view.canScrollDown,
    });
  }

  function rename(view: RenameScreenView): void {
    const { canvas } = context;
    // The renderer runs with the light modal ink, so UI.dim fades toward the dark scrim:
    // title, copy and field are a guaranteed-contrast pair on every biome.
    ui.dim(canvas, width, height, ui.t.alpha.modalDim ?? 0.9);
    ui.title(canvas, view.firstRun ? "CHOOSE YOUR NAME" : "CHANGE NAME", width / 2, 210, ui.t.type.display);
    ui.text(
      canvas,
      "how you appear on leaderboards & replays",
      width / 2,
      258,
      ui.t.type.body,
      "center",
      ui.t.alpha.soft,
    );
    const field = RENAME_FIELD;
    canvas.save();
    canvas.fillStyle = "#12141c";
    canvas.fillRect(field.x, field.y, field.w, field.h);
    canvas.strokeStyle = ui.t.color.accent;
    canvas.lineWidth = 2;
    canvas.strokeRect(field.x + 1, field.y + 1, field.w - 2, field.h - 2);
    canvas.restore();
    // The typed name is drawn by the DOM input only; the canvas shows just the placeholder.
    if (!view.value) {
      ui.text(
        canvas,
        "TYPE A NAME",
        field.x + field.inset,
        field.y + field.h / 2 + 9,
        ui.t.type.lead,
        "left",
        ui.t.alpha.muted,
      );
    }
    ui.tag(
      canvas,
      `${String(view.length)}/${String(view.maxLength)}`,
      field.x + field.w - field.inset,
      field.y + field.h / 2 + 5,
      view.length > view.maxLength ? ui.t.color.danger : "#b4b8c8",
      "right",
      ui.t.type.caption,
    );
    if (view.message) ui.text(canvas, view.message, width / 2, 404, ui.t.type.body, "center", ui.t.alpha.full);
    else {
      ui.text(
        canvas,
        `${String(view.minLength ?? 3)}–${String(view.maxLength)} characters · letters, numbers, spaces, _ -`,
        width / 2,
        404,
        ui.t.type.caption,
        "center",
        ui.t.alpha.soft,
      );
    }
    const valid = view.length >= (view.minLength ?? 3) && view.length <= view.maxLength;
    context.enqueue({
      x: width / 2 - 180,
      y: 444,
      w: 170,
      h: 48,
      label: view.firstRun ? "SKIP FOR NOW" : "CANCEL",
      ghost: true,
      size: ui.t.type.label,
      action: { type: "rename.cancel" },
    });
    context.enqueue({
      x: width / 2 + 10,
      y: 444,
      w: 170,
      h: 48,
      label: "CONFIRM",
      enabled: valid,
      hero: true,
      ghost: true,
      size: ui.t.type.lead,
      action: { type: "rename.submit" },
    });
  }

  return { settings, rename };
}
