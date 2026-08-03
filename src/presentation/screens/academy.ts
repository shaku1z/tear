import type { AcademyScreenView, ScreenRenderContext } from "./contracts";
import { backControl } from "./screen-primitives";

export function createAcademyRenderers(context: ScreenRenderContext) {
  return Object.freeze({
    academy(view: AcademyScreenView): void {
      const { ui, canvas, width } = context;
      let y = 120;
      ui.header(canvas, "ACADEMY", view.subtitle, context.enterAmount);
      ui.panel(canvas, width / 2 - 320, y, 640, Math.max(160, 56 + view.rows.length * 34));
      y += 38;
      if (view.status === "loading") ui.text(canvas, "Reading Academy custody...", width / 2, y, ui.t.type.body, "center", ui.t.alpha.muted);
      else if (view.status === "unavailable") ui.text(canvas, view.subtitle, width / 2, y, ui.t.type.body, "center", ui.t.alpha.muted);
      else view.rows.forEach((row) => { ui.text(canvas, row.label, width / 2 - 288, y, ui.t.type.body, "left"); ui.displayText(canvas, row.value, width / 2 + 288, y, ui.t.type.body, "right"); y += 34; });
      backControl(context);
    },
  });
}
