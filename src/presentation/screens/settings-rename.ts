import type { RenameScreenView, ScreenRenderContext, SettingsScreenView } from "./contracts";
import { backControl, scrollHint, tabs } from "./screen-primitives";

export function createSettingsRenameRenderers(context: ScreenRenderContext) {
  const { ui, width, height } = context;

  function settings(view: SettingsScreenView): void {
    const { canvas } = context;
    ui.header(canvas, "SETTINGS", "sound, controls, display, accessibility, and account", context.enterAmount);
    tabs(context, view.tabs, (id) => ({ type: "settings.selectTab", id }));
    const left = 320;
    const panelWidth = width - 640;
    let y = 190 - context.scroll;
    canvas.save(); canvas.beginPath(); canvas.rect(left - 24, 158, panelWidth + 48, height - 260); canvas.clip();
    view.sections.forEach((section) => {
      y = ui.sectionLabel(canvas, section.label, left, y, panelWidth) + 8;
      section.rows.forEach((row) => {
        const visible = y + 54 >= 158 && y <= height - 102;
        if (!visible) { y += 54; return; }
        ui.text(canvas, row.label, left + 12, y + 27, ui.t.type.body);
        if (row.kind === "stepper") {
          context.enqueue({ x: left + panelWidth - 230, y: y + 4, w: 48, h: 40, label: "−", enabled: row.enabled, action: { type: "settings.step", key: row.key, delta: -1 } });
          ui.text(canvas, row.value, left + panelWidth - 132, y + 29, ui.t.type.label, "center");
          context.enqueue({ x: left + panelWidth - 72, y: y + 4, w: 48, h: 40, label: "+", enabled: row.enabled, action: { type: "settings.step", key: row.key, delta: 1 } });
        } else if (row.kind === "toggle") {
          context.enqueue({
            x: left + panelWidth - 190, y: y + 4, w: 166, h: 40,
            label: row.on ? "ON" : "OFF", selected: row.on, enabled: row.enabled,
            action: { type: "settings.toggle", key: row.key },
          });
        } else {
          context.enqueue({ x: left + panelWidth - 276, y: y + 4, w: 252, h: 40,
            label: row.value, enabled: row.enabled, action: { type: "settings.activate", key: row.key } });
        }
        if (row.note) ui.tag(canvas, row.note, left + 12, y + 45, ui.t.color.muted, "left", ui.t.type.micro);
        y += 54;
      });
      y += 16;
    });
    canvas.restore();
    scrollHint(context, view.canScrollUp, view.canScrollDown, height - 98);
    if (view.tab === "audio") {
      ui.tag(canvas, "MASTER controls the final mix; MUSIC and SOUND EFFECTS remain independently adjustable.",
        width / 2, height - 126, ui.t.color.muted, "center", ui.t.type.micro);
    }
    context.enqueue({ x: width / 2 + 130, y: height - 72, w: 220, h: 48, label: "RESET DEFAULTS", action: { type: "settings.reset" } });
    backControl(context, { type: "navigate", to: view.returnTo });
  }

  function rename(view: RenameScreenView): void {
    const { canvas } = context;
    ui.dim(canvas, width, height, 0.88);
    ui.title(canvas, view.firstRun ? "CHOOSE YOUR NAME" : "CHANGE NAME", width / 2, 210, ui.t.type.display);
    ui.text(canvas, "how you appear on leaderboards & replays",
      width / 2, 258, ui.t.type.body, "center", ui.t.alpha.soft);
    ui.panel(canvas, width / 2 - 260, 300, 520, 72);
    ui.text(canvas, view.value || "TYPE A NAME", width / 2 - 230, 345, ui.t.type.lead, "left", view.value ? 1 : ui.t.alpha.muted);
    ui.tag(canvas, `${String(view.length)}/${String(view.maxLength)}`, width / 2 + 230, 345, view.length > view.maxLength ? ui.t.color.danger : ui.t.color.muted, "right", ui.t.type.micro);
    if (view.message) ui.text(canvas, view.message, width / 2, 402, ui.t.type.caption, "center", ui.t.alpha.muted);
    else ui.text(canvas, `${String(view.minLength ?? 3)}–${String(view.maxLength)} chars · letters, numbers, spaces, _ -`, width / 2, 402, ui.t.type.micro, "center", ui.t.alpha.muted);
    const valid = view.length >= (view.minLength ?? 3) && view.length <= view.maxLength;
    context.enqueue({ x: width / 2 - 170, y: 450, w: 160, h: 46, label: view.firstRun ? "SKIP FOR NOW" : "CANCEL", action: { type: "rename.cancel" } });
    context.enqueue({ x: width / 2 + 10, y: 450, w: 160, h: 46, label: "CONFIRM", enabled: valid, selected: true, action: { type: "rename.submit" } });
  }

  return { settings, rename };
}
